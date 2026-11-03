import { readFileSync } from "node:fs";
import { closeBrowser, createConnectors } from "@buskativa/connectors";
import { createDb, listWatchedQueries, migrateDb } from "@buskativa/db";
import { createSearchQueue, enqueueSearch, QUEUE_NAME, redisConnection, type SearchJob } from "@buskativa/queue";
import { Worker } from "bullmq";
import pino from "pino";
import { positiveNumber } from "./env";
import { createHealthServer } from "./health";
import { attemptTimeoutMs, runSearch } from "./run-search";
import { dueQueries, pickStartupQueries } from "./scheduler";

const log = pino({ name: "buskativa-worker" });
const env = process.env;
if (!env.DATABASE_URL || !env.REDIS_URL) throw new Error("DATABASE_URL e REDIS_URL são obrigatórias");

const { db, pool } = createDb(env.DATABASE_URL);
await migrateDb(db);

const connection = redisConnection(env.REDIS_URL);
const connectors = createConnectors(env);
const queue = createSearchQueue(connection);
const warn = (msg: string) => log.warn(msg);
const baseMin = positiveNumber("SEARCH_INTERVAL_MIN", env.SEARCH_INTERVAL_MIN, 60, warn);
const fastMin = positiveNumber("SEARCH_FAST_INTERVAL_MIN", env.SEARCH_FAST_INTERVAL_MIN, 30, warn);
const concurrency = positiveNumber("WORKER_CONCURRENCY", env.WORKER_CONCURRENCY, 3, warn, { integer: true });
const searchDeps = { db, connectors, attemptTimeoutMs: attemptTimeoutMs(concurrency) };

let lastRunAt: Date | undefined;
const worker = new Worker<SearchJob>(
  QUEUE_NAME,
  async (job) => {
    const { runId, ok, failed, failures } = await runSearch(searchDeps, job.data.text, job.data.runId);
    lastRunAt = new Date();
    log.info({ runId, text: job.data.text, ok, failed, failures }, "busca concluída");
  },
  { connection, concurrency },
);
worker.on("failed", (job, err) => log.error({ err, text: job?.data.text }, "job falhou"));
// sem listener de "error", um erro de conexão com o Redis vira exceção não tratada
worker.on("error", (err) => log.error({ err }, "erro no worker"));
queue.on("error", (err) => log.error({ err }, "erro na fila"));

// PORT definido (Render Web Service): abre o health check; sem PORT (local) não abre nada
// consulta real ao Redis; durante uma reconexão a chamada fica pendente e o limite de 2 s marca "disconnected"
async function queueStatus(): Promise<"connected" | "disconnected"> {
  const timeout = new Promise<"disconnected">((resolve) => setTimeout(resolve, 2000, "disconnected"));
  const ping = queue.getJobCounts().then((): "connected" => "connected", (): "disconnected" => "disconnected");
  return Promise.race([ping, timeout]);
}
let healthServer: ReturnType<typeof createHealthServer> | undefined;
if (env.PORT) {
  healthServer = createHealthServer(async () => ({ queue: await queueStatus(), lastRunAt }));
  healthServer.on("error", (err) => log.error({ err }, "erro no servidor de health check"));
  healthServer.listen(Number(env.PORT), "0.0.0.0", () => log.info({ port: env.PORT }, "health check ativo"));
}

const trending: string[] = JSON.parse(readFileSync(new URL("../seed/trending.json", import.meta.url), "utf8"));
const watched = (await listWatchedQueries(db, 20)).map((q) => q.original);
const startup = pickStartupQueries(watched, trending, 20);
for (const text of startup) await enqueueSearch(queue, { text });
log.info({ count: startup.length, stores: connectors.map((c) => c.id) }, "worker ativo: buscas iniciais enfileiradas");

async function tick() {
  const due = await dueQueries(db, new Date(), { baseMin, fastMin });
  for (const text of due) await enqueueSearch(queue, { text });
  if (due.length) log.info({ count: due.length }, "buscas recorrentes enfileiradas");
}
const timer = setInterval(() => tick().catch((err) => log.error({ err }, "falha no agendador")), 5 * 60e3);

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(timer);
  let code = 0;
  // each step runs even if a previous one failed; the pool is always released
  const step = (name: string, fn: () => Promise<unknown>) =>
    fn().catch((err) => {
      code = 1;
      log.error({ err }, `falha ao encerrar: ${name}`);
    });
  try {
    await step("health check", () => new Promise<void>((resolve) => (healthServer ? healthServer.close(() => resolve()) : resolve())));
    await step("worker", () => worker.close());
    await step("fila", () => queue.close());
    await step("navegador", () => closeBrowser());
  } finally {
    await step("banco", () => pool.end());
    process.exit(code);
  }
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
