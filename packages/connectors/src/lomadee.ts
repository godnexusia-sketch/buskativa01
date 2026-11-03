import { type Connector, ConnectorError, type Offer, withOriginalPrice } from "@buskativa/core";

export const LOMADEE_API = "https://api.lomadee.com.br";

interface LomadeeOption {
  available?: boolean;
  pricing?: { price?: number; listPrice?: number }[];
  images?: { url?: string }[];
}
interface LomadeeProduct {
  organizationId: string;
  id: string;
  available?: boolean;
  name?: string;
  url?: string;
  images?: { url?: string }[];
  options?: LomadeeOption[];
}
interface LomadeeBrand {
  id: string;
  name?: string;
  site?: string;
}

const hostOf = (site: string | undefined) => {
  if (!site) return undefined;
  try {
    return new URL(site.startsWith("http") ? site : `https://${site}`).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
};

/**
 * Lomadee affiliate network (130+ Brazilian stores) through its official REST API. Prices come in reais.
 * Brand names are cached for 6 h so a search costs one request (the API allows 60 per minute).
 */
export function lomadeeConnector(opts: { apiKey: string; fetch?: typeof fetch; timeoutMs?: number; now?: () => number }): Connector {
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 20000;
  const now = opts.now ?? Date.now;
  let brands: { at: number; byId: Map<string, LomadeeBrand> } | null = null;

  const get = async <T>(path: string): Promise<T> => {
    const signal = AbortSignal.timeout(timeoutMs);
    let res: Response;
    try {
      res = await doFetch(`${LOMADEE_API}${path}`, { headers: { "x-api-key": opts.apiKey, accept: "application/json" }, signal });
    } catch (e) {
      throw signal.aborted ? new ConnectorError("TIMEOUT", `sem resposta em ${timeoutMs} ms`) : new ConnectorError("NETWORK", String(e));
    }
    if ([401, 403, 429].includes(res.status)) throw new ConnectorError("BLOCKED", `HTTP ${res.status}`);
    if (!res.ok) throw new ConnectorError("NETWORK", `HTTP ${res.status}`);
    try {
      return (await res.json()) as T;
    } catch (e) {
      throw new ConnectorError("PARSE", String(e));
    }
  };

  const brandMap = async () => {
    if (brands && now() - brands.at < 6 * 3600e3) return brands.byId;
    const byId = new Map<string, LomadeeBrand>();
    for (let page = 1; page <= 20; page++) {
      const body = await get<{ data?: LomadeeBrand[] }>(`/affiliate/brands?page=${page}&limit=100`);
      for (const b of body.data ?? []) byId.set(b.id, b);
      if ((body.data ?? []).length < 100) break;
    }
    brands = { at: now(), byId };
    return byId;
  };

  return {
    id: "lomadee",
    async search(q, { limit }) {
      const [body, byId] = await Promise.all([
        get<{ data?: LomadeeProduct[] }>(
          `/affiliate/products?search=${encodeURIComponent(q.termo)}&limit=${Math.min(Math.max(limit, 50), 100)}&isAvailable=true`,
        ),
        // a failed brand lookup only costs the store name, not the search
        brandMap().catch(() => new Map<string, LomadeeBrand>()),
      ]);
      const offers: Offer[] = [];
      for (const p of body.data ?? []) {
        if (p.available === false || !p.name || !p.url?.startsWith("https://")) continue;
        const option = p.options?.find((o) => o.available !== false && (o.pricing?.[0]?.price ?? 0) > 0);
        const price = option?.pricing?.[0]?.price;
        if (!option || !price || price <= 0) continue;
        const brand = byId.get(p.organizationId);
        const site = hostOf(brand?.site);
        const image = p.images?.[0]?.url ?? option.images?.[0]?.url;
        offers.push({
          store: "lomadee",
          externalId: `${p.organizationId}:${p.id}`,
          title: p.name.trim(),
          url: p.url,
          price,
          ...withOriginalPrice(price, option.pricing?.[0]?.listPrice),
          shipping: null,
          currency: "BRL",
          sellerName: brand?.name?.trim(),
          imageUrl: image?.startsWith("https://") ? image : undefined,
          attributes: { organizationId: p.organizationId, ...(site ? { site } : {}) },
        });
      }
      return offers;
    },
  };
}
