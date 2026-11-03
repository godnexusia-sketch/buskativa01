import { normalizeQuery } from "@buskativa/core";
import { type ConnectionOptions, type JobsOptions, Queue } from "bullmq";

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

/**
 * Busca do usuário (com runId): jobId único do run e sem prioridade; no BullMQ jobs sem prioridade
 * saem antes dos priorizados, então ela passa à frente do backlog agendado.
 * Busca agendada: deduplicação simples (sem ttl) pela consulta, válida enquanto o job espera ou roda,
 * então um backlog longo não acumula cópias da mesma consulta; prioridade 10 fica atrás do usuário.
 */
export function searchJobOptions(job: SearchJob): JobsOptions {
  if (job.runId) return { jobId: `run-${job.runId}` };
  return { deduplication: { id: `q-${normalizeQuery(job.text).hash}` }, priority: 10 };
}

export async function enqueueSearch(queue: Queue<SearchJob>, job: SearchJob): Promise<void> {
  await queue.add("search", job, searchJobOptions(job));
}
