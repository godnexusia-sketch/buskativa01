import { type Connector, ConnectorError, type Offer, withOriginalPrice } from "@buskativa/core";

interface MlResult {
  id: string;
  title: string;
  permalink: string;
  price: number;
  original_price?: number | null;
  thumbnail?: string;
  shipping?: { free_shipping?: boolean };
  seller?: { nickname?: string };
  attributes?: { id: string; value_name: string | null }[];
}

export function mercadoLivreConnector(
  opts: { fetch?: typeof fetch; accessToken?: string; timeoutMs?: number } = {},
): Connector {
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 20000;
  return {
    id: "mercadolivre",
    async search(q, { limit }) {
      const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(q.termo)}&limit=${Math.min(limit, 50)}`;
      const headers: Record<string, string> = opts.accessToken ? { Authorization: `Bearer ${opts.accessToken}` } : {};
      // also bounds reading the body below
      const signal = AbortSignal.timeout(timeoutMs);
      const timedOut = () => new ConnectorError("TIMEOUT", `sem resposta em ${timeoutMs} ms`);
      let res: Response;
      try {
        res = await doFetch(url, { headers, signal });
      } catch (e) {
        throw signal.aborted ? timedOut() : new ConnectorError("NETWORK", String(e));
      }
      if ([401, 403, 429].includes(res.status)) throw new ConnectorError("BLOCKED", `HTTP ${res.status}`);
      if (!res.ok) throw new ConnectorError("NETWORK", `HTTP ${res.status}`);
      let body: { results?: MlResult[] };
      try {
        body = (await res.json()) as { results?: MlResult[] };
      } catch (e) {
        throw signal.aborted ? timedOut() : new ConnectorError("PARSE", String(e));
      }
      return (body.results ?? []).map(
        (r): Offer => ({
          store: "mercadolivre",
          externalId: r.id,
          title: r.title,
          url: r.permalink,
          price: r.price,
          ...withOriginalPrice(r.price, r.original_price),
          shipping: r.shipping?.free_shipping ? 0 : null,
          currency: "BRL",
          imageUrl: r.thumbnail?.replace(/^http:/, "https:"),
          sellerName: r.seller?.nickname,
          attributes: Object.fromEntries(
            (r.attributes ?? [])
              .filter((a) => a.value_name)
              .map((a) => [a.id.toLowerCase(), a.value_name as string]),
          ),
        }),
      );
    },
  };
}
