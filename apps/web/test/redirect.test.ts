import { normalizeQuery } from "@buskativa/core";
import { createRun, saveOffers, upsertQuery } from "@buskativa/db";
import { createTestDb } from "@buskativa/db/testing";
import { describe, expect, it } from "vitest";
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
});
