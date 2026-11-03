import { describe, expect, it } from "vitest";
import { positiveNumber } from "../src/env";

describe("positiveNumber", () => {
  it("usa o padrão quando a variável não existe, sem aviso", () => {
    const warnings: string[] = [];
    expect(positiveNumber("X", undefined, 60, (m) => warnings.push(m))).toBe(60);
    expect(positiveNumber("X", "", 60, (m) => warnings.push(m))).toBe(60);
    expect(warnings).toEqual([]);
  });

  it("aceita número positivo finito", () => {
    expect(positiveNumber("X", "15", 60)).toBe(15);
    expect(positiveNumber("X", "2.5", 60)).toBe(2.5);
  });

  it.each(["abc", "0", "-5", "Infinity", "NaN"])("rejeita %s com aviso e usa o padrão", (raw) => {
    const warnings: string[] = [];
    expect(positiveNumber("SEARCH_INTERVAL_MIN", raw, 60, (m) => warnings.push(m))).toBe(60);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("SEARCH_INTERVAL_MIN");
  });

  it("com integer exige inteiro", () => {
    const warnings: string[] = [];
    expect(positiveNumber("WORKER_CONCURRENCY", "2.5", 3, (m) => warnings.push(m), { integer: true })).toBe(3);
    expect(positiveNumber("WORKER_CONCURRENCY", "4", 3, undefined, { integer: true })).toBe(4);
    expect(warnings).toHaveLength(1);
  });
});
