import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { voteOnCoupon, voterHash, voterIdFromCookie } from "../../../../../lib/coupon-service";
import { allowVote, clientIp, getDb, voteSalt } from "../../../../../lib/server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ip = clientIp(req);
  if (!allowVote(ip)) {
    return NextResponse.json({ error: "Muitos votos seguidos. Tente de novo em 1 minuto." }, { status: 429 });
  }
  const salt = voteSalt();
  if (!salt) return NextResponse.json({ error: "Votação indisponível: VOTE_SALT não configurado." }, { status: 503 });
  const body = await req.json().catch(() => null);
  const existing = voterIdFromCookie(req.headers.get("cookie"));
  const cookieId = existing ?? randomUUID();
  const r = await voteOnCoupon(getDb(), (await params).id, body, voterHash(salt, cookieId, ip));
  const res = NextResponse.json(r.body, { status: r.status });
  if (!existing && r.status === 200) {
    // functional cookie: only lets one person keep one vote per coupon
    res.cookies.set("bk_voter", cookieId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
}
