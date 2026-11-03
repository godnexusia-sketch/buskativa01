import { normalizeQuery } from "@buskativa/core";
import { type ConnectionOptions, Queue } from "bullmq";

export const QUEUE_NAME = "search";

export interface SearchJob {
  text: string;
  runId?: number;
}

export function redisConnection(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    tls: u.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

export function createSearchQueue(connection: ConnectionOptions): Queue<SearchJob> {
  return new Queue<SearchJob>(QUEUE_NAME, {
    connection,
    defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 1000 },
  });
}

/** O jobId evita enfileirar a mesma consulta mais de uma vez na mesma janela de 10 min. */
export async function enqueueSearch(queue: Queue<SearchJob>, job: SearchJob): Promise<void> {
  const jobId = job.runId
    ? `run-${job.runId}`
    : `q-${normalizeQuery(job.text).hash}-${Math.floor(Date.now() / 600_000)}`;
  await queue.add("search", job, { jobId });
}
