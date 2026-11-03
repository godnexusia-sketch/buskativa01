import { NextResponse } from "next/server";
import { searchResults } from "../../../../lib/search-service";
import { getDb } from "../../../../lib/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const res = await searchResults(getDb(), id);
  if (!res) return NextResponse.json({ error: "busca não encontrada" }, { status: 404 });
  return NextResponse.json(res);
}
