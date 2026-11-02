import { describe, expect, it } from "vitest";
import { matchesAttributes, normalizeQuery } from "../src/query";

describe("normalizeQuery", () => {
  it("consulta genérica sem atributos", () => {
    const q = normalizeQuery("Fone Bluetooth");
    expect(q.tipo).toBe("generica");
    expect(q.atributos).toEqual({});
    expect(q.termo).toBe("fone bluetooth");
  });

  it("produto específico com marca, modelo, capacidade e cor", () => {
    const q = normalizeQuery("iPhone 15 128GB preto");
    expect(q.tipo).toBe("especifica");
    expect(q.atributos).toEqual({ marca: "apple", modelo: "iphone 15", capacidade: "128gb", cor: "preto" });
  });

  it("modelo com sufixo e capacidade separada por espaço", () => {
    const q = normalizeQuery("Samsung Galaxy S24 Ultra 256 GB");
    expect(q.atributos.marca).toBe("samsung");
    expect(q.atributos.modelo).toBe("galaxy s24 ultra");
    expect(q.atributos.capacidade).toBe("256gb");
  });

  it("linha sem marca explícita e modelo de duas palavras", () => {
    const q = normalizeQuery("redmi note 13");
    expect(q.atributos.marca).toBe("xiaomi");
    expect(q.atributos.modelo).toBe("redmi note 13");
  });

  it("tamanho com prefixo conta como atributo e não vira modelo", () => {
    const q = normalizeQuery("Tênis Nike tamanho 42");
    expect(q.atributos).toEqual({ marca: "nike", tamanho: "42" });
    expect(q.tipo).toBe("especifica");
  });

  it("um único atributo continua genérico; 5g não vira capacidade", () => {
    expect(normalizeQuery("air fryer 220v").atributos).toEqual({ voltagem: "220v" });
    expect(normalizeQuery("air fryer 220v").tipo).toBe("generica");
    expect(normalizeQuery("celular 5g").atributos).toEqual({});
  });

  it("hash ignora caixa, acentos, espaços e ordem das palavras", () => {
    expect(normalizeQuery("Fone Bluetooth").hash).toBe(normalizeQuery("  bluetooth   fone ").hash);
    expect(normalizeQuery("tênis").hash).toBe(normalizeQuery("tenis").hash);
  });
});

describe("matchesAttributes", () => {
  const { atributos } = normalizeQuery("iPhone 15 128GB preto");

  it("aceita título equivalente", () => {
    expect(matchesAttributes("Apple iPhone 15 (128 GB) - Preto", atributos)).toBe(true);
    expect(matchesAttributes("iPhone 15 128GB Preta", atributos)).toBe(true);
  });

  it("recusa modelo ou capacidade diferentes", () => {
    expect(matchesAttributes("Apple iPhone 14 128GB Preto", atributos)).toBe(false);
    expect(matchesAttributes("Apple iPhone 15 256GB Preto", atributos)).toBe(false);
  });

  it("bivolt satisfaz qualquer voltagem", () => {
    expect(matchesAttributes("Air Fryer Mondial Bivolt", { voltagem: "220v" })).toBe(true);
    expect(matchesAttributes("Air Fryer Mondial 127V", { voltagem: "220v" })).toBe(false);
  });
});
