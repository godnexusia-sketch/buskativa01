import { readFileSync } from "node:fs";
import { closeBrowser, createConnectors } from "@buskativa/connectors";
import { createDb, listWatchedQueries, migrateDb } from "@buskativa/db";
import { createSearchQueue, enqueueSearch, QUEUE_NAME, redisConnection, type SearchJob } from "@buskativa/queue";
import { Worker } from "bullmq";
import pino from "pino";
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
const baseMin = Number(env.SEARCH_INTERVAL_MIN ?? 60);
const fastMin = Number(env.SEARCH_FAST_INTERVAL_MIN ?? 30);
const concurrency = Number(env.WORKER_CONCURRENCY ?? 3);
const searchDeps = { db, connectors, attemptTimeoutMs: attemptTimeoutMs(concurrency) };

const worker = new Worker<SearchJob>(
  QUEUE_NAME,
  async (job) => {
    const runId = await runSearch(searchDeps, job.data.text, job.data.runId);
    log.info({ runId, text: job.data.text }, "busca concluída");
  },
  { connection, concurrency },
);
worker.on("failed", (job, err) => log.error({ err, text: job?.data.text }, "job falhou"));

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

async function shutdown() {
  clearInterval(timer);
  await worker.close();
  await queue.close();
  await closeBrowser();
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
