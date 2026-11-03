import { computeStats } from "@buskativa/core";
import { getPriceHistory, getProduct } from "@buskativa/db";
import { NextResponse } from "next/server";
import { getDb } from "../../../../../lib/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const db = getDb();
  const product = Number.isInteger(id) ? await getProduct(db, id) : null;
  if (!product) return NextResponse.json({ error: "produto não encontrado" }, { status: 404 });
  const points = await getPriceHistory(db, id);
  // the raw store URL would bypass the affiliate redirect; clients link through /ir/<id>
  const { url: _url, ...publicProduct } = product;
  return NextResponse.json({
    product: { ...publicProduct, goUrl: `/ir/${product.id}` },
    points: points.map((p) => ({ price: p.price, observedAt: p.observedAt.toISOString() })),
    stats: computeStats(points, new Date()),
  });
}
