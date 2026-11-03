import {
  type Connector,
  ConnectorError,
  type ConnectorErrorCode,
  filterOffers,
  type NormalizedQuery,
  normalizeQuery,
  type Offer,
  type StoreId,
} from "@buskativa/core";
import { FETCH_TIMEOUT_MS } from "@buskativa/connectors";
import { createRun, type Db, finishRun, saveOffers, updateRunStoreStatus, upsertQuery } from "@buskativa/db";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ConnectorError("TIMEOUT", `sem resposta em ${ms} ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Outer backstop for one connector attempt. Browser connectors enforce their own per-fetch cap
 * (FETCH_TIMEOUT_MS) inside two queues: the store's limiter (1 at a time, 5 s apart) and the global
 * browser-context semaphore (maxContexts shared by all browser stores). Waiting in either queue does not
 * count against the per-fetch cap, so the backstop must cover the longest wait or it would fire on
 * waiting alone: behind the store's other searches (concurrency) or behind every browser fetch of every
 * running search (concurrency × browserStores / maxContexts). It still catches connectors that hang
 * without their own timeout. browserStores may be an upper bound (e.g. all connectors).
 */
export function attemptTimeoutMs(concurrency: number, browserStores: number, maxContexts: number): number {
  const queued = Math.max(concurrency, Math.ceil((concurrency * browserStores) / maxContexts));
  return queued * (FETCH_TIMEOUT_MS + 5000) + 15000;
}

const asConnectorError = (e: unknown) => (e instanceof ConnectorError ? e : new ConnectorError("NETWORK", String(e)));

export async function runConnector(
  c: Connector,
  q: NormalizedQuery,
  limit: number,
  opts: { retries?: number; baseDelayMs?: number; timeoutMs?: number } = {},
): Promise<Offer[]> {
  const retries = opts.retries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const timeoutMs = opts.timeoutMs ?? attemptTimeoutMs(1, 1, 1);
  for (let attempt = 1; ; attempt++) {
    try {
      return await withTimeout(c.search(q, { limit }), timeoutMs);
    } catch (e) {
      const err = asConnectorError(e);
      if (err.code === "BLOCKED" || err.code === "PARSE" || attempt >= retries) throw err;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
}

export interface RunSummary {
  runId: number;
  ok: number;
  failed: number;
  failures: Partial<Record<StoreId, ConnectorErrorCode>>;
}

export async function runSearch(
  deps: { db: Db; connectors: Connector[]; limit?: number; retryDelayMs?: number; attemptTimeoutMs?: number },
  text: string,
  runId?: number,
): Promise<RunSummary> {
  const nq = normalizeQuery(text);
  const query = await upsertQuery(deps.db, nq);
  const id = runId ?? (await createRun(deps.db, query.id));
  const failures: RunSummary["failures"] = {};
  let ok = 0;

  await Promise.allSettled(
    deps.connectors.map(async (c) => {
      try {
        const raw = await runConnector(c, nq, deps.limit ?? 20, {
          baseDelayMs: deps.retryDelayMs,
          timeoutMs: deps.attemptTimeoutMs,
        });
        const offers = filterOffers(raw, nq);
        await saveOffers(deps.db, id, offers);
        await updateRunStoreStatus(deps.db, id, c.id, { ok: true, count: offers.length });
        ok++;
      } catch (e) {
        const err = asConnectorError(e);
        failures[c.id] = err.code;
        await updateRunStoreStatus(deps.db, id, c.id, { ok: false, error: err.code, message: err.message.slice(0, 200) });
      }
    }),
  );

  await finishRun(deps.db, id);
  return { runId: id, ok, failed: Object.keys(failures).length, failures };
}
