import { createDb, type Db } from "@buskativa/db";
import { createSearchQueue, redisConnection, type SearchJob } from "@buskativa/queue";
import type { Queue } from "bullmq";
import { createRateLimiter } from "./rate-limit";

const g = globalThis as unknown as { __db?: Db; __queue?: Queue<SearchJob>; __limiter?: ReturnType<typeof createRateLimiter> };

export function getDb(): Db {
  g.__db ??= createDb(process.env.DATABASE_URL!).db;
  return g.__db;
}

export function getQueue(): Queue<SearchJob> {
  g.__queue ??= createSearchQueue(redisConnection(process.env.REDIS_URL!));
  return g.__queue;
}

export function allowSearch(ip: string): boolean {
  g.__limiter ??= createRateLimiter(30, 60e3);
  return g.__limiter(ip);
}

/**
 * Client IP for rate limiting. Headers set by a CDN/proxy win; otherwise the RIGHT-most
 * x-forwarded-for hop (the one our proxy appended) since the left-most is client-controlled.
 */
export function clientIp(req: Request): string {
  for (const name of ["cf-connecting-ip", "true-client-ip", "x-real-ip"]) {
    const v = req.headers.get(name)?.trim();
    if (v) return v;
  }
  const hops = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  return hops.at(-1) ?? "local";
}
