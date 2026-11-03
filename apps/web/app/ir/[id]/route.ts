import { NextResponse } from "next/server";
import { RedirectNotAllowedError, resolveRedirect } from "../../../lib/redirect";
import { getDb } from "../../../lib/server";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  try {
    const url = Number.isInteger(id) ? await resolveRedirect(getDb(), id, process.env, req.headers.get("referer")) : null;
    if (!url) return NextResponse.json({ error: "produto não encontrado" }, { status: 404 });
    return NextResponse.redirect(url, 302);
  } catch (err) {
    if (!(err instanceof RedirectNotAllowedError)) {
      console.error("falha no redirecionamento", err);
      throw err;
    }
    return NextResponse.json({ error: "link de loja não permitido" }, { status: 400 });
  }
}
