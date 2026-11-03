import { NextResponse } from "next/server";
import { voteOnCoupon } from "../../../../../lib/coupon-service";
import { allowVote, clientIp, getDb, voteSalt } from "../../../../../lib/server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ip = clientIp(req);
  if (!allowVote(ip)) {
    return NextResponse.json({ error: "Muitos votos seguidos. Tente de novo em 1 minuto." }, { status: 429 });
  }
  const salt = voteSalt();
  if (!salt) return NextResponse.json({ error: "Votação indisponível: VOTE_SALT não configurado." }, { status: 503 });
  const body = await req.json().catch(() => null);
  const r = await voteOnCoupon(getDb(), (await params).id, body, ip, salt);
  return NextResponse.json(r.body, { status: r.status });
}
