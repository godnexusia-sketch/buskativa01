import { adsTxtLine } from "../../lib/site";

export const dynamic = "force-dynamic";

export function GET() {
  const line = adsTxtLine(process.env.NEXT_PUBLIC_ADSENSE_CLIENT);
  if (!line) return new Response("Not found", { status: 404 });
  return new Response(line, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
