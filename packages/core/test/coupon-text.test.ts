import { describe, expect, it } from "vitest";
import { parseCouponText } from "../src/coupons";

describe("parseCouponText", () => {
  it.each([
    ["20% OFF em peças Plus Size", { discountType: "percent", discountValue: 20, minOrderCents: null }],
    ["15% OFF em compras acima de R$ 149,90 nas categorias de Livros", { discountType: "percent", discountValue: 15, minOrderCents: 14990 }],
    ["Cupom de R$ 30,00 de desconto", { discountType: "fixed", discountValue: 3000, minOrderCents: null }],
    ["Cupom de R$ 50,00 de desconto na Panela", { discountType: "fixed", discountValue: 5000, minOrderCents: null }],
    ["R$ 20 OFF acima de R$ 199", { discountType: "fixed", discountValue: 2000, minOrderCents: 19900 }],
    ["Frete grátis em todo o site", { discountType: "frete", discountValue: 0, minOrderCents: null }],
  ])("%s", (text, expected) => {
    expect(parseCouponText(text)).toEqual(expected);
  });

  it("sem valor no texto não vira cupom", () => {
    expect(parseCouponText("Cupom exclusivo para a Black Friday")).toBeNull();
    expect(parseCouponText("99% de desconto")).toBeNull();
  });
});
