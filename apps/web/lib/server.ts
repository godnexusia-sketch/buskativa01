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

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}
