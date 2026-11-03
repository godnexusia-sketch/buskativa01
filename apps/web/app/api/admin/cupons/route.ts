import { NextResponse } from "next/server";
import { adminAuth, createCouponAdmin } from "../../../../lib/coupon-service";
import { getDb } from "../../../../lib/server";

export async function POST(req: Request) {
  const denied = adminAuth(req.headers.get("authorization"), process.env.ADMIN_TOKEN);
  if (denied) return NextResponse.json(denied.body, { status: denied.status });
  const body = await req.json().catch(() => null);
  const r = await createCouponAdmin(getDb(), body, new Date());
  return NextResponse.json(r.body, { status: r.status });
}
