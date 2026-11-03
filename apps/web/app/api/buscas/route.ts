import { enqueueSearch } from "@buskativa/queue";
import { NextResponse } from "next/server";
import { startSearch } from "../../../lib/search-service";
import { allowSearch, clientIp, getDb, getQueue, logClientIpHeadersOnce } from "../../../lib/server";

export async function POST(req: Request) {
  logClientIpHeadersOnce(req);
  if (!allowSearch(clientIp(req))) {
    return NextResponse.json({ error: "Muitas buscas seguidas. Tente de novo em 1 minuto." }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { q?: unknown } | null;
  const q = typeof body?.q === "string" ? body.q.trim() : "";
  if (q.length < 2 || q.length > 120) {
    return NextResponse.json({ error: "Digite entre 2 e 120 caracteres." }, { status: 400 });
  }
  const result = await startSearch({ db: getDb(), enqueue: (job) => enqueueSearch(getQueue(), job) }, q);
  return NextResponse.json(result);
}
