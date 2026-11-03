const LOMADEE_API = "https://api.lomadee.com.br";

/** Affiliate short link for a product page (type Custom); null when the API gives none. */
export async function lomadeeShortUrl(
  opts: { apiKey: string; fetch?: typeof fetch; timeoutMs?: number },
  organizationId: string,
  url: string,
): Promise<string | null> {
  const res = await (opts.fetch ?? fetch)(`${LOMADEE_API}/affiliate/shortener/url`, {
    method: "POST",
    headers: { "x-api-key": opts.apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ organizationId, type: "Custom", url }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { shortUrls?: string[] }[] | null;
  const short = Array.isArray(body) ? body.flatMap((c) => c.shortUrls ?? []).find((u) => u.startsWith("https://")) : undefined;
  return short ?? null;
}
