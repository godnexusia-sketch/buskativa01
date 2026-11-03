import { describe, expect, it } from "vitest";
import { discountPercent } from "../src/discount";

describe("discountPercent", () => {
  it.each([
    [75, 100, 25],
    [279.9, 399, 30],
    [99, 100, 1],
    [5, 100, 95],
  ])("%d de %d -> %d%%", (price, original, expected) => {
    expect(discountPercent(price, original)).toBe(expected);
  });

  it.each([
    [100, undefined],
    [100, 100],
    [100, 90],
    [99.6, 100],
    [4, 100],
    [0, 100],
    [100, Number.NaN],
  ])("%d vs %s -> null", (price, original) => {
    expect(discountPercent(price, original)).toBeNull();
  });
});
