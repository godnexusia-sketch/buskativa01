import { describe, expect, it } from "vitest";
import { couponConfidence, validateCoupon } from "../src/coupons";

const now = new Date("2026-11-03T12:00:00Z");
const base = { store: "amazon", code: "ECONOMIZA10", title: "10% na Amazon", discountType: "percent", discountValue: 10, source: "manual" };
const errs = (input: unknown) => {
  const r = validateCoupon(input, now);
  return r.ok ? [] : r.errors;
};

describe("validateCoupon", () => {
  it("aceita um cupom válido e normaliza o código para maiúsculas", () => {
    const r = validateCoupon({ ...base, code: " economiza10 ", description: "  Válido no app  " }, now);
    expect(r).toMatchObject({
      ok: true,
      value: { store: "amazon", code: "ECONOMIZA10", description: "Válido no app", minOrderCents: null, validUntil: null, sourceUrl: null, active: true },
    });
  });

  it("rejeita loja fora da lista", () => {
    expect(errs({ ...base, store: "americanas" })).toContain("Loja inválida.");
  });

  it("rejeita código inválido", () => {
    const msg = "Código deve ter de 3 a 40 caracteres (letras, números, _ ou -).";
    expect(errs({ ...base, code: "ab" })).toContain(msg);
    expect(errs({ ...base, code: "COM ESPACO" })).toContain(msg);
    expect(errs({ ...base, code: "A".repeat(41) })).toHaveLength(1);
  });

  it("valida o valor conforme o tipo de desconto", () => {
    expect(errs({ ...base, discountValue: 0 })).toContain("Desconto percentual deve ficar entre 1 e 90.");
    expect(errs({ ...base, discountValue: 91 })).toContain("Desconto percentual deve ficar entre 1 e 90.");
    expect(errs({ ...base, discountType: "fixed", discountValue: 0 })).toContain("Desconto fixo deve ser maior que zero (em centavos).");
    expect(errs({ ...base, discountType: "fixed", discountValue: 10.5 })).toHaveLength(1);
    expect(errs({ ...base, discountType: "fixed", discountValue: 1500 })).toEqual([]);
    expect(errs({ ...base, discountType: "frete", discountValue: 5 })).toContain("Cupom de frete deve ter valor 0.");
    expect(errs({ ...base, discountType: "frete", discountValue: 0 })).toEqual([]);
    expect(errs({ ...base, discountType: "outro" })).toContain("Tipo de desconto inválido.");
  });

  it("rejeita cupom vencido", () => {
    expect(errs({ ...base, validUntil: "2026-11-01T00:00:00Z" })).toContain("Cupom já vencido.");
    expect(errs({ ...base, validUntil: "2026-12-01T00:00:00Z" })).toEqual([]);
    expect(errs({ ...base, validUntil: "ontem" })).toContain("Validade inválida.");
  });

  it("exige link de origem https e fonte conhecida", () => {
    expect(errs({ ...base, sourceUrl: "http://amazon.com.br/x" })).toContain("Link de origem deve começar com https://.");
    expect(errs({ ...base, sourceUrl: "https://amazon.com.br/cupom" })).toEqual([]);
    expect(errs({ ...base, source: "blog" })).toContain("Fonte inválida.");
  });

  it("valida título e pedido mínimo, acumulando mensagens", () => {
    expect(errs({ ...base, title: "  " })).toContain("Título é obrigatório (até 120 caracteres).");
    expect(errs({ ...base, minOrderCents: -5 })).toContain("Pedido mínimo deve ser um número inteiro de centavos maior que zero.");
    expect(errs({ ...base, title: "", code: "x" }).length).toBe(2);
    expect(errs(null)).toEqual(["Corpo da requisição inválido."]);
  });
});

describe("couponConfidence", () => {
  const c = (over: object) => couponConfidence({ worked: 0, failed: 0, validUntil: null, source: "manual", ...over } as never, now);

  it("expirado quando a validade passou", () => {
    expect(c({ validUntil: new Date("2026-11-03T11:00:00Z"), worked: 9 })).toBe("expirado");
  });
  it("oficial começa média; os demais começam baixa", () => {
    expect(c({ source: "oficial" })).toBe("media");
    expect(c({ source: "telegram" })).toBe("baixa");
    expect(c({ source: "manual", worked: 2 })).toBe("baixa");
  });
  it("com 3 votos ou mais usa a taxa de sucesso", () => {
    expect(c({ worked: 7, failed: 3 })).toBe("alta");
    expect(c({ worked: 4, failed: 6 })).toBe("media");
    expect(c({ worked: 3, failed: 7 })).toBe("baixa");
    expect(c({ source: "oficial", worked: 0, failed: 3 })).toBe("baixa");
    expect(c({ worked: 3, failed: 0 })).toBe("alta");
  });
});
