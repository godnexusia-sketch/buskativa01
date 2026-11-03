import type { SearchJob } from "@buskativa/queue";
import { saveOffers, finishRun } from "@buskativa/db";
import { createTestDb } from "@buskativa/db/testing";
import { describe, expect, it } from "vitest";
import { searchResults, startSearch } from "../lib/search-service";

describe("startSearch", () => {
  it("enfileira a primeira busca e reaproveita a mesma consulta logo depois", async () => {
    const db = await createTestDb();
    const jobs: SearchJob[] = [];
    const enqueue = async (j: SearchJob) => {
      jobs.push(j);
    };
    const a = await startSearch({ db, enqueue }, "Fone Bluetooth");
    const b = await startSearch({ db, enqueue }, "bluetooth fone");
    expect(a.cached).toBe(false);
    expect(b).toEqual({ runId: a.runId, cached: true });
    expect(jobs).toEqual([{ text: "Fone Bluetooth", runId: a.runId }]);
  }, 90000);
});

describe("searchResults", () => {
  it("ordena por preço total e agrupa títulos parecidos em consulta genérica", async () => {
    const db = await createTestDb();
    const { runId } = await startSearch({ db, enqueue: async () => {} }, "fone bluetooth");
    const base = { currency: "BRL" as const, attributes: {}, store: "mercadolivre" as const };
    await saveOffers(db, runId, [
      { ...base, externalId: "1", title: "Fone Bluetooth JBL Tune 510BT Preto", url: "https://www.mercadolivre.com.br/1", price: 200, shipping: 20 },
      { ...base, externalId: "2", title: "JBL Tune 510BT Fone Bluetooth Preto Original", url: "https://www.mercadolivre.com.br/2", price: 210, shipping: 0 },
      { ...base, externalId: "3", title: "Fone Bluetooth I12", url: "https://www.mercadolivre.com.br/3", price: 40, shipping: null },
    ]);
    await finishRun(db, runId);
    const res = await searchResults(db, runId);
    expect(res!.status).toBe("done");
    expect(res!.results.map((r) => r.totalCents)).toEqual([4000, 21000, 22000]);
    expect(res!.results[1].groupId).toBe(res!.results[2].groupId);
    expect(res!.results[0].groupId).not.toBe(res!.results[1].groupId);
  }, 90000);

  it("retorna null para execução inexistente", async () => {
    expect(await searchResults(await createTestDb(), 999)).toBeNull();
  }, 90000);
});
