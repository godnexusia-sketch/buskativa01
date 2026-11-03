import { describe, expect, it, vi } from "vitest";

const topDrops = vi.fn();
const listProducts = vi.fn();
const categoryCounts = vi.fn();
vi.mock("@buskativa/db", () => ({
  topDrops: (...a: unknown[]) => topDrops(...a),
  listProducts: (...a: unknown[]) => listProducts(...a),
  categoryCounts: (...a: unknown[]) => categoryCounts(...a),
}));
vi.mock("../lib/server", () => ({ getDb: () => ({}) }));

import { GET, dynamic } from "../app/api/health/route";
import { loadHomeSections, loadTopDrops } from "../lib/home";

describe("GET /api/health", () => {
  it("responde 200 {ok:true} sem tocar no banco", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(dynamic).toBe("force-dynamic");
    expect(topDrops).not.toHaveBeenCalled();
  });
});

describe("loadTopDrops (home)", () => {
  it("devolve as quedas quando o banco responde", async () => {
    topDrops.mockResolvedValueOnce([{ productId: 1 }]);
    expect(await loadTopDrops(new Date(), 12)).toEqual([{ productId: 1 }]);
  });

  it("devolve [] (estado vazio da home) e registra o erro quando topDrops falha", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    topDrops.mockRejectedValueOnce(new Error("banco fora"));
    expect(await loadTopDrops(new Date(), 12)).toEqual([]);
    expect(err).toHaveBeenCalledWith("falha ao carregar as maiores quedas", expect.any(Error));
    err.mockRestore();
  });
});

describe("loadHomeSections", () => {
  it("monta descontos e prateleiras das categorias com mais produtos, sem outros", async () => {
    categoryCounts.mockResolvedValueOnce({ outros: 99, tvs: 5, audio: 9, games: 1 });
    listProducts.mockImplementation(async (_db: unknown, o: { category?: string }) => ({ items: [{ productId: o.category ?? "deal" }], total: 1 }));
    const h = await loadHomeSections(2, 4);
    expect(h.total).toBe(114);
    expect(h.deals).toEqual([{ productId: "deal" }]);
    expect(h.rails.map((r) => r.category)).toEqual(["audio", "tvs"]);
    expect(listProducts).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ onlyDiscount: true, order: "maior-desconto" }));
  });

  it("sem banco devolve seções vazias", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    categoryCounts.mockRejectedValueOnce(new Error("banco fora"));
    expect(await loadHomeSections()).toEqual({ deals: [], counts: {}, total: 0, rails: [] });
    err.mockRestore();
  });
});
