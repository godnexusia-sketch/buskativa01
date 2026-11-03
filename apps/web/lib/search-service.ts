import { groupSimilar, normalizeQuery, type StoreId, type StoreStatus } from "@buskativa/core";
import { createRun, type Db, getRecentRunForHash, getRunWithResults, upsertQuery } from "@buskativa/db";
import type { SearchJob } from "@buskativa/queue";

export interface SearchResultItem {
  productId: number;
  store: StoreId;
  title: string;
  imageUrl: string | null;
  priceCents: number;
  originalPriceCents: number | null;
  pagamento: "app" | "pix" | null;
  shippingCents: number | null;
  totalCents: number;
  groupId: number;
}

export interface SearchResponse {
  status: "running" | "done";
  tipo: "generica" | "especifica";
  original: string;
  storeStatus: Partial<Record<StoreId, StoreStatus>>;
  results: SearchResultItem[];
}

export async function startSearch(
  deps: { db: Db; enqueue: (job: SearchJob) => Promise<void>; now?: Date },
  text: string,
): Promise<{ runId: number; cached: boolean }> {
  const now = deps.now ?? new Date();
  const nq = normalizeQuery(text);
  const recent = await getRecentRunForHash(deps.db, nq.hash, now);
  if (recent) return { runId: recent, cached: true };
  const q = await upsertQuery(deps.db, nq);
  const runId = await createRun(deps.db, q.id, now);
  await deps.enqueue({ text: nq.original, runId });
  return { runId, cached: false };
}

export async function searchResults(db: Db, runId: number): Promise<SearchResponse | null> {
  const run = await getRunWithResults(db, runId);
  if (!run) return null;
  const items = run.results.map((r) => ({ ...r, totalCents: r.priceCents + (r.shippingCents ?? 0), groupId: 0 }));
  if (run.query.tipo === "generica") {
    groupSimilar(items).forEach((group, gi) => group.forEach((it) => (it.groupId = gi)));
  } else {
    items.forEach((it, i) => (it.groupId = i));
  }
  return {
    status: run.status,
    tipo: run.query.tipo,
    original: run.query.original,
    storeStatus: run.storeStatus,
    results: items,
  };
}
