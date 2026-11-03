import { type Connector, ConnectorError, type Offer } from "@buskativa/core";
import { getRunWithResults } from "@buskativa/db";
import { createTestDb } from "@buskativa/db/testing";
import { describe, expect, it } from "vitest";
import { attemptTimeoutMs, runConnector, runSearch } from "../src/run-search";

const offer = (over: Partial<Offer>): Offer => ({
  store: "mercadolivre",
  externalId: "1",
  title: "Fone Bluetooth X",
  url: "https://www.mercadolivre.com.br/p/1",
  price: 100,
  shipping: null,
  currency: "BRL",
  attributes: {},
  ...over,
});

describe("runConnector", () => {
  it("repete erro de rede e não repete BLOCKED", async () => {
    let calls = 0;
    const flaky: Connector = {
      id: "magalu",
      async search() {
        calls++;
        if (calls < 3) throw new ConnectorError("NETWORK", "falhou");
        return [offer({ store: "magalu" })];
      },
    };
    await expect(runConnector(flaky, {} as never, 10, { baseDelayMs: 1 })).resolves.toHaveLength(1);
    expect(calls).toBe(3);

    let blockedCalls = 0;
    const blocked: Connector = {
      id: "shopee",
      async search() {
        blockedCalls++;
        throw new ConnectorError("BLOCKED", "captcha");
      },
    };
    await expect(runConnector(blocked, {} as never, 10, { baseDelayMs: 1 })).rejects.toMatchObject({ code: "BLOCKED" });
    expect(blockedCalls).toBe(1);
  });

  it("estoura TIMEOUT quando a loja demora demais", async () => {
    const slow: Connector = { id: "amazon", search: () => new Promise(() => {}) };
    await expect(runConnector(slow, {} as never, 10, { retries: 1, timeoutMs: 20 })).rejects.toMatchObject({
      code: "TIMEOUT",
    });
  });
});

describe("attemptTimeoutMs", () => {
  const perFetchWithGap = 45000 + 5000;
  it("cobre a fila do limitador por loja: uma busca própria mais (concorrência - 1) à frente", () => {
    expect(attemptTimeoutMs(1, 1, 1)).toBeGreaterThan(perFetchWithGap);
    expect(attemptTimeoutMs(3, 1, 3)).toBeGreaterThan(3 * perFetchWithGap);
    expect(attemptTimeoutMs(6, 2, 100)).toBeGreaterThan(6 * perFetchWithGap);
  });

  it("cobre a fila do semáforo global: todas as buscas de navegador de todas as lojas", () => {
    // 1 job, 5 lojas de navegador, 1 contexto: a última loja espera as outras 4
    expect(attemptTimeoutMs(1, 5, 1)).toBeGreaterThan(5 * perFetchWithGap);
    expect(attemptTimeoutMs(3, 6, 2)).toBeGreaterThan(9 * perFetchWithGap);
  });
});

describe("runSearch", () => {
  it("roda as lojas em paralelo, grava ofertas filtradas e o status por loja", async () => {
    const db = await createTestDb();
    const connectors: Connector[] = [
      {
        id: "mercadolivre",
        async search() {
          return [
            offer({ externalId: "a", price: 120 }),
            offer({ externalId: "b", price: 90 }),
            offer({ externalId: "golpe", url: "https://golpe.com/x" }),
          ];
        },
      },
      {
        id: "shopee",
        async search() {
          throw new ConnectorError("BLOCKED", "captcha");
        },
      },
      {
        id: "magalu",
        async search() {
          throw new Error("erro inesperado");
        },
      },
    ];
    const summary = await runSearch({ db, connectors, retryDelayMs: 1 }, "fone bluetooth");
    expect(summary).toMatchObject({ ok: 1, failed: 2, failures: { shopee: "BLOCKED", magalu: "NETWORK" } });
    const run = await getRunWithResults(db, summary.runId);
    expect(run!.status).toBe("done");
    expect(run!.results.map((r) => r.priceCents)).toEqual([9000, 12000]);
    expect(run!.storeStatus.mercadolivre).toEqual({ ok: true, count: 2 });
    expect(run!.storeStatus.shopee).toMatchObject({ ok: false, error: "BLOCKED" });
    expect(run!.storeStatus.magalu).toMatchObject({ ok: false, error: "NETWORK" });
  }, 90000);
});
