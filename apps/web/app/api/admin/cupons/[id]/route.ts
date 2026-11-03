import { NextResponse } from "next/server";
import { adminAuth, deactivateCouponAdmin } from "../../../../../lib/coupon-service";
import { getDb } from "../../../../../lib/server";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = adminAuth(req.headers.get("authorization"), process.env.ADMIN_TOKEN);
  if (denied) return NextResponse.json(denied.body, { status: denied.status });
  const r = await deactivateCouponAdmin(getDb(), (await params).id);
  return NextResponse.json(r.body, { status: r.status });
}
