import { NextResponse } from "next/server";
import { loadRadar } from "../../../lib/radar";
import { getDb } from "../../../lib/server";

export const dynamic = "force-dynamic";

/** Current best deals for the home radar; the page polls it every 30 s. */
export async function GET() {
  try {
    const items = await loadRadar(getDb(), new Date());
    return NextResponse.json({ at: new Date().toISOString(), items }, { headers: { "cache-control": "public, max-age=15, s-maxage=15" } });
  } catch (err) {
    console.error("falha no radar", err);
    return NextResponse.json({ error: "radar indisponível" }, { status: 503 });
  }
}
