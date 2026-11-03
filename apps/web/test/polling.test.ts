import { describe, expect, it } from "vitest";
import { pollPlan } from "../lib/polling";

describe("pollPlan", () => {
  it("consulta a cada 2 s nos primeiros 90 s, sem aviso", () => {
    expect(pollPlan(0)).toEqual({ delayMs: 2000, slow: false });
    expect(pollPlan(89_999)).toEqual({ delayMs: 2000, slow: false });
  });

  it("depois de 90 s consulta a cada 5 s e mostra o aviso", () => {
    expect(pollPlan(90_000)).toEqual({ delayMs: 5000, slow: true });
    expect(pollPlan(299_999)).toEqual({ delayMs: 5000, slow: true });
  });

  it("para aos 5 min mantendo o aviso", () => {
    expect(pollPlan(300_000)).toEqual({ delayMs: null, slow: true });
    expect(pollPlan(600_000)).toEqual({ delayMs: null, slow: true });
  });
});
