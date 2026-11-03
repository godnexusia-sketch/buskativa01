import { type Connector, ConnectorError, filterOffers, type NormalizedQuery, normalizeQuery, type Offer } from "@buskativa/core";
import { createRun, type Db, finishRun, saveOffers, updateRunStoreStatus, upsertQuery } from "@buskativa/db";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ConnectorError("TIMEOUT", `sem resposta em ${ms} ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
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
  const timeoutMs = opts.timeoutMs ?? 45000;
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

export async function runSearch(
  deps: { db: Db; connectors: Connector[]; limit?: number; retryDelayMs?: number },
  text: string,
  runId?: number,
): Promise<number> {
  const nq = normalizeQuery(text);
  const query = await upsertQuery(deps.db, nq);
  const id = runId ?? (await createRun(deps.db, query.id));

  await Promise.allSettled(
    deps.connectors.map(async (c) => {
      try {
        const raw = await runConnector(c, nq, deps.limit ?? 20, { baseDelayMs: deps.retryDelayMs });
        const offers = filterOffers(raw, nq);
        await saveOffers(deps.db, id, offers);
        await updateRunStoreStatus(deps.db, id, c.id, { ok: true, count: offers.length });
      } catch (e) {
        const err = asConnectorError(e);
        await updateRunStoreStatus(deps.db, id, c.id, { ok: false, error: err.code, message: err.message.slice(0, 200) });
      }
    }),
  );

  await finishRun(deps.db, id);
  return id;
}
