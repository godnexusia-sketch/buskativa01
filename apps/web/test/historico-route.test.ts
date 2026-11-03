import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/server", () => ({ getDb: () => ({}) }));
vi.mock("@buskativa/db", () => ({
  getProduct: async (_db: unknown, id: number) => ({
    id,
    store: "mercadolivre",
    title: "Fone Bluetooth X",
    url: "https://www.mercadolivre.com.br/p/MLB1",
    imageUrl: null,
  }),
  getPriceHistory: async () => [{ price: 100, observedAt: new Date("2026-11-01T12:00:00Z") }],
}));

import { GET } from "../app/api/produtos/[id]/historico/route";

describe("GET /api/produtos/[id]/historico", () => {
  it("não expõe a URL crua da loja; aponta para o redirecionamento com afiliado", async () => {
    const res = await GET(new Request("http://localhost/api/produtos/7/historico"), {
      params: Promise.resolve({ id: "7" }),
    });
    const body = await res.json();
    expect(body.product).not.toHaveProperty("url");
    expect(body.product).toMatchObject({ id: 7, title: "Fone Bluetooth X", goUrl: "/ir/7" });
    expect(body.points).toEqual([{ price: 100, observedAt: "2026-11-01T12:00:00.000Z" }]);
  });
});
