import { describe, expect, it, vi } from "vitest";

const topDrops = vi.fn();
vi.mock("@buskativa/db", () => ({ topDrops: (...a: unknown[]) => topDrops(...a) }));
vi.mock("../lib/server", () => ({ getDb: () => ({}) }));

import { GET, dynamic } from "../app/api/health/route";
import { loadTopDrops } from "../lib/home";

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
