import { NextResponse } from "next/server";

// health check do Render: só confirma que o processo responde, sem depender do banco
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true });
}
