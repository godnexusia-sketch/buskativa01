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

const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

export interface MlToken {
  get(): Promise<string>;
  invalidate(): void;
}

/**
 * App token via client_credentials, cached until shortly before it expires (ML tokens last 6 h).
 * `invalidate` drops the cache after a 401 so the next call fetches a fresh one.
 */
export function mlAppToken(opts: {
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}): MlToken {
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  let cached: { token: string; expiresAt: number } | null = null;
  let pending: Promise<string> | null = null;
  const refresh = async () => {
    let res: Response;
    try {
      res = await doFetch(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: opts.clientId,
          client_secret: opts.clientSecret,
        }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 20000),
      });
    } catch (e) {
      throw new ConnectorError("NETWORK", `token do Mercado Livre: ${String(e)}`);
    }
    if (!res.ok) throw new ConnectorError("BLOCKED", `token do Mercado Livre: HTTP ${res.status}`);
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new ConnectorError("PARSE", "token do Mercado Livre sem access_token");
    // renews 5 min early
    const ttlMs = Math.max((body.expires_in ?? 21600) - 300, 60) * 1000;
    cached = { token: body.access_token, expiresAt: now() + ttlMs };
    return body.access_token;
  };
  return {
    async get() {
      if (cached && now() < cached.expiresAt) return cached.token;
      pending ??= refresh().finally(() => {
        pending = null;
      });
      return pending;
    },
    invalidate() {
      cached = null;
    },
  };
}

export function mercadoLivreConnector(
  opts: { fetch?: typeof fetch; accessToken?: string; token?: MlToken; timeoutMs?: number } = {},
): Connector {
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 20000;
  return {
    id: "mercadolivre",
    async search(q, { limit }) {
      const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(q.termo)}&limit=${Math.min(limit, 50)}`;
      // also bounds reading the body below
      const signal = AbortSignal.timeout(timeoutMs);
      const timedOut = () => new ConnectorError("TIMEOUT", `sem resposta em ${timeoutMs} ms`);
      const request = async () => {
        const token = opts.token ? await opts.token.get() : opts.accessToken;
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        try {
          return await doFetch(url, { headers, signal });
        } catch (e) {
          throw signal.aborted ? timedOut() : new ConnectorError("NETWORK", String(e));
        }
      };
      let res = await request();
      // token revoked before its expiry: fetch a new one and try once more
      if (res.status === 401 && opts.token) {
        opts.token.invalidate();
        res = await request();
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
