import { readFileSync } from "node:fs";
import { ConnectorError, normalizeQuery } from "@buskativa/core";
import { describe, expect, it } from "vitest";
import { mercadoLivreConnector, mlAppToken } from "../src/mercadolivre";

const fixture = readFileSync(new URL("../fixtures/mercadolivre-search.json", import.meta.url), "utf8");
const q = normalizeQuery("fone bluetooth");

describe("mercadoLivreConnector", () => {
  it("mapeia a resposta da API para Offer", async () => {
    let calledUrl = "";
    let auth: string | null = null;
    const c = mercadoLivreConnector({
      accessToken: "tok",
      fetch: async (url, init) => {
        calledUrl = String(url);
        auth = new Headers(init?.headers).get("authorization");
        return new Response(fixture, { status: 200 });
      },
    });
    const offers = await c.search(q, { limit: 10 });
    expect(calledUrl).toBe("https://api.mercadolibre.com/sites/MLB/search?q=fone%20bluetooth&limit=10");
    expect(auth).toBe("Bearer tok");
    expect(offers).toHaveLength(2);
    expect(offers[0]).toEqual({
      store: "mercadolivre",
      externalId: "MLB111",
      title: "Fone De Ouvido Bluetooth Jbl Tune 520bt Preto",
      url: "https://produto.mercadolivre.com.br/MLB-111-fone-jbl",
      price: 249.9,
      shipping: 0,
      currency: "BRL",
      imageUrl: "https://http2.mlstatic.com/D_111-I.jpg",
      sellerName: "LOJAOFICIALJBL",
      attributes: { brand: "JBL", color: "Preto" },
    });
    expect(offers[1].shipping).toBeNull();
  });

  it("original_price vira originalPrice só quando é maior que o preço", async () => {
    const body = JSON.stringify({
      results: [
        { id: "MLB1", title: "A", permalink: "https://x/1", price: 100, original_price: 150 },
        { id: "MLB2", title: "B", permalink: "https://x/2", price: 100, original_price: 100 },
        { id: "MLB3", title: "C", permalink: "https://x/3", price: 100, original_price: null },
        { id: "MLB4", title: "D", permalink: "https://x/4", price: 100 },
      ],
    });
    const c = mercadoLivreConnector({ fetch: async () => new Response(body, { status: 200 }) });
    const offers = await c.search(q, { limit: 10 });
    expect(offers.map((o) => o.originalPrice)).toEqual([150, undefined, undefined, undefined]);
    expect("originalPrice" in offers[1]).toBe(false);
  });

  it("403 vira BLOCKED e 500 vira NETWORK", async () => {
    const blocked = mercadoLivreConnector({ fetch: async () => new Response("", { status: 403 }) });
    await expect(blocked.search(q, { limit: 5 })).rejects.toMatchObject({ code: "BLOCKED" });
    const down = mercadoLivreConnector({ fetch: async () => new Response("", { status: 500 }) });
    await expect(down.search(q, { limit: 5 })).rejects.toBeInstanceOf(ConnectorError);
    await expect(down.search(q, { limit: 5 })).rejects.toMatchObject({ code: "NETWORK" });
  });

  it("requisição que não responde vira TIMEOUT", async () => {
    let signal: AbortSignal | undefined;
    const c = mercadoLivreConnector({
      timeoutMs: 20,
      fetch: (_url, init) => {
        signal = init?.signal ?? undefined;
        // like fetch: rejects only when the signal aborts
        return new Promise((_, reject) => signal?.addEventListener("abort", () => reject(signal?.reason)));
      },
    });
    await expect(c.search(q, { limit: 10 })).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(signal?.aborted).toBe(true);
  });

  it("com token renovável, troca o token e repete uma vez após 401", async () => {
    const tokens = ["velho", "novo"];
    let invalidated = 0;
    const seen: (string | null)[] = [];
    const c = mercadoLivreConnector({
      token: { get: async () => tokens[invalidated], invalidate: () => invalidated++ },
      fetch: async (_url, init) => {
        const auth = new Headers(init?.headers).get("authorization");
        seen.push(auth);
        return auth === "Bearer novo" ? new Response(fixture, { status: 200 }) : new Response("", { status: 401 });
      },
    });
    expect(await c.search(q, { limit: 10 })).toHaveLength(2);
    expect(seen).toEqual(["Bearer velho", "Bearer novo"]);
  });
});

describe("mlAppToken", () => {
  it("pede por client_credentials, guarda até perto de expirar e renova depois", async () => {
    let t = 0;
    const bodies: string[] = [];
    const tok = mlAppToken({
      clientId: "app",
      clientSecret: "seg",
      now: () => t,
      fetch: async (url, init) => {
        expect(String(url)).toBe("https://api.mercadolibre.com/oauth/token");
        bodies.push(String(init?.body));
        return new Response(JSON.stringify({ access_token: `t${bodies.length}`, expires_in: 21600 }));
      },
    });
    const [a, b] = await Promise.all([tok.get(), tok.get()]);
    expect([a, b]).toEqual(["t1", "t1"]);
    expect(bodies).toEqual(["grant_type=client_credentials&client_id=app&client_secret=seg"]);
    t = (21600 - 301) * 1000;
    expect(await tok.get()).toBe("t1");
    t = (21600 - 299) * 1000;
    expect(await tok.get()).toBe("t2");
    tok.invalidate();
    expect(await tok.get()).toBe("t3");
  });

  it("credencial recusada vira BLOCKED", async () => {
    const tok = mlAppToken({ clientId: "a", clientSecret: "b", fetch: async () => new Response("", { status: 400 }) });
    await expect(tok.get()).rejects.toMatchObject({ code: "BLOCKED" });
  });
});
