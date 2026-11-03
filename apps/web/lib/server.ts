import { createDb, type Db } from "@buskativa/db";
import { createSearchQueue, redisConnection, type SearchJob } from "@buskativa/queue";
import type { Queue } from "bullmq";
import { createRateLimiter } from "./rate-limit";

const g = globalThis as unknown as { __db?: Db; __queue?: Queue<SearchJob>; __limiter?: ReturnType<typeof createRateLimiter>; __voteLimiter?: ReturnType<typeof createRateLimiter> };

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

export function allowVote(ip: string): boolean {
  g.__voteLimiter ??= createRateLimiter(10, 60e3);
  return g.__voteLimiter(ip);
}

/** Salt for hashing voter IPs; without it votes are refused (503) instead of storing weak hashes. */
export function voteSalt(): string | null {
  return process.env.VOTE_SALT || null;
}

/**
 * Client IP for rate limiting. Client-settable headers (cf-connecting-ip, x-real-ip...) are NOT
 * trusted by default: only the RIGHT-most x-forwarded-for hop (appended by our proxy) is used.
 * Set TRUSTED_IP_HEADER (e.g. "cf-connecting-ip") when a CDN you control sets that header and the
 * app is only reachable through it; that header then becomes the only alternative trusted.
 */
export function clientIp(req: Request): string {
  const trusted = process.env.TRUSTED_IP_HEADER?.trim().toLowerCase();
  if (trusted) {
    const v = req.headers.get(trusted)?.trim();
    if (v) return v;
  }
  const hops = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  return hops.at(-1) ?? "local";
}
