import { NextResponse } from "next/server";
import { listCouponsPublic } from "../../../lib/coupon-service";
import { getDb } from "../../../lib/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const loja = new URL(req.url).searchParams.get("loja");
  const r = await listCouponsPublic(getDb(), loja, new Date());
  return NextResponse.json(r.body, { status: r.status });
}
