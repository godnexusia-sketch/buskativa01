import { describe, expect, it } from "vitest";
import { discountPercent, withOriginalPrice } from "../src/discount";

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

describe("withOriginalPrice", () => {
  it("só devolve originalPrice quando o valor é numérico e maior que o preço", () => {
    expect(withOriginalPrice(100, 150)).toEqual({ originalPrice: 150 });
    expect(withOriginalPrice(100, "150.5")).toEqual({ originalPrice: 150.5 });
    for (const v of [100, 99, null, undefined, "abc", Number.NaN, {}]) expect(withOriginalPrice(100, v)).toEqual({});
  });
});
