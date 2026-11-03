import { describe, expect, it } from "vitest";
import { createLimiter } from "../src/limiter";

describe("createLimiter", () => {
  it("respeita concorrência e intervalo mínimo", async () => {
    const limit = createLimiter(1, 100);
    let active = 0;
    let maxActive = 0;
    const starts: number[] = [];
    const task = () =>
      limit(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        starts.push(Date.now());
        await new Promise((r) => setTimeout(r, 20));
        active--;
      });
    await Promise.all([task(), task(), task()]);
    expect(maxActive).toBe(1);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(95);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(95);
  });

  it("libera a vaga mesmo quando a tarefa falha", async () => {
    const limit = createLimiter(1, 0);
    await expect(limit(async () => { throw new Error("x"); })).rejects.toThrow("x");
    await expect(limit(async () => 42)).resolves.toBe(42);
  });
});
