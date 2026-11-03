import { normalizeQuery } from "@buskativa/core";
import { createRun, getProduct, saveOffers, upsertQuery } from "@buskativa/db";
import { createTestDb } from "@buskativa/db/testing";
import { describe, expect, it, vi } from "vitest";

const shortener = vi.fn();
vi.mock("../lib/lomadee-link", () => ({ lomadeeShortUrl: (...a: unknown[]) => shortener(...a) }));
import { RedirectNotAllowedError, resolveRedirect } from "../lib/redirect";

describe("resolveRedirect", () => {
  it("aplica o afiliado e registra o clique", async () => {
    const db = await createTestDb();
    const q = await upsertQuery(db, normalizeQuery("kindle"));
    const run = await createRun(db, q.id);
    const [id] = await saveOffers(db, run, [
      { store: "amazon", externalId: "B0K", title: "Kindle", url: "https://www.amazon.com.br/dp/B0K", price: 499, shipping: null, currency: "BRL", attributes: {} },
    ]);
    const url = await resolveRedirect(db, id, { AFFILIATE_PARAMS_AMAZON: "tag=meutag-20" }, "https://buskativa.app/busca");
    expect(url).toBe("https://www.amazon.com.br/dp/B0K?tag=meutag-20");
    expect(await resolveRedirect(db, 12345, {}, null)).toBeNull();
  }, 90000);

  it("sinaliza URL fora da allowlist com erro tipado", async () => {
    const db = await createTestDb();
    const q = await upsertQuery(db, normalizeQuery("kindle"));
    const run = await createRun(db, q.id);
    const [id] = await saveOffers(db, run, [
      { store: "amazon", externalId: "X", title: "Kindle", url: "https://evil.example.com/dp/X", price: 499, shipping: null, currency: "BRL", attributes: {} },
    ]);
    await expect(resolveRedirect(db, id, {}, null)).rejects.toBeInstanceOf(RedirectNotAllowedError);
  }, 90000);

  it("Lomadee: gera o link curto no primeiro clique, guarda e mantém depois de atualizar o preço", async () => {
    const db = await createTestDb();
    const q = await upsertQuery(db, normalizeQuery("air fryer"));
    const lmd = (price: number) => ({
      store: "lomadee" as const, externalId: "org:1", title: "Air Fryer", url: "https://www.friopecas.com.br/af/p", price,
      shipping: null, currency: "BRL" as const, attributes: { organizationId: "org", site: "friopecas.com.br" },
    });
    const [id] = await saveOffers(db, await createRun(db, q.id), [lmd(598)]);
    shortener.mockResolvedValueOnce("https://lmdee.link/abc");
    expect(await resolveRedirect(db, id, { LOMADEE_API_KEY: "k" }, null)).toBe("https://lmdee.link/abc");
    expect(shortener).toHaveBeenCalledWith({ apiKey: "k" }, "org", "https://www.friopecas.com.br/af/p");
    await saveOffers(db, await createRun(db, q.id), [lmd(579)]);
    expect((await getProduct(db, id))?.attributes.shortUrl).toBe("https://lmdee.link/abc");
    expect(await resolveRedirect(db, id, { LOMADEE_API_KEY: "k" }, null)).toBe("https://lmdee.link/abc");
    expect(shortener).toHaveBeenCalledTimes(1);
  }, 90000);

  it("Lomadee sem link curto: só vai para a página se for do site da loja", async () => {
    const db = await createTestDb();
    const q = await upsertQuery(db, normalizeQuery("tv"));
    const run = await createRun(db, q.id);
    const base = { store: "lomadee" as const, title: "TV", price: 1000, shipping: null, currency: "BRL" as const };
    const [ok, bad] = await saveOffers(db, run, [
      { ...base, externalId: "o:1", url: "https://loja.com.br/tv/p", attributes: { organizationId: "o", site: "loja.com.br" } },
      { ...base, externalId: "o:2", url: "https://evil.example.com/tv", attributes: { organizationId: "o", site: "loja.com.br" } },
    ]);
    shortener.mockResolvedValue(null);
    expect(await resolveRedirect(db, ok, { LOMADEE_API_KEY: "k" }, null)).toBe("https://loja.com.br/tv/p");
    await expect(resolveRedirect(db, bad, {}, null)).rejects.toBeInstanceOf(RedirectNotAllowedError);
  }, 90000);
});
