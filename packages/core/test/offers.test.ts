import { describe, expect, it } from "vitest";
import { filterOffers, groupSimilar, isSuspiciousPrice, median, totalPrice } from "../src/offers";
import { normalizeQuery } from "../src/query";
import type { Offer } from "../src/types";

const offer = (over: Partial<Offer>): Offer => ({
  store: "mercadolivre",
  externalId: "1",
  title: "Fone Bluetooth",
  url: "https://www.mercadolivre.com.br/p/1",
  price: 100,
  shipping: null,
  currency: "BRL",
  attributes: {},
  ...over,
});

describe("helpers", () => {
  it("totalPrice soma frete conhecido", () => {
    expect(totalPrice(offer({ price: 100, shipping: 15 }))).toBe(115);
    expect(totalPrice(offer({ price: 100, shipping: null }))).toBe(100);
  });

  it("median de listas par e ímpar", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it("isSuspiciousPrice", () => {
    expect(isSuspiciousPrice(0, 100)).toBe(true);
    expect(isSuspiciousPrice(9, 100)).toBe(true);
    expect(isSuspiciousPrice(10, 100)).toBe(false);
  });
});

describe("filterOffers", () => {
  it("remove URL fora da allowlist, vendedor ruim e preço suspeito", () => {
    const q = normalizeQuery("fone bluetooth");
    const result = filterOffers(
      [
        offer({ externalId: "ok", price: 100 }),
        offer({ externalId: "ok2", price: 120, sellerRating: 4.5 }),
        offer({ externalId: "fora", url: "https://golpe.com/p/1" }),
        offer({ externalId: "ruim", sellerRating: 3.2 }),
        offer({ externalId: "erro", price: 1 }),
      ],
      q,
    );
    expect(result.map((o) => o.externalId)).toEqual(["ok", "ok2"]);
  });

  it("em consulta específica mantém só títulos com os atributos", () => {
    const q = normalizeQuery("iPhone 15 128GB preto");
    const result = filterOffers(
      [
        offer({ externalId: "a", title: "Apple iPhone 15 128GB Preto", price: 4500 }),
        offer({ externalId: "b", title: "Capinha para iPhone 15", price: 4400 }),
        offer({ externalId: "c", title: "Apple iPhone 14 128GB Preto", price: 3900 }),
      ],
      q,
    );
    expect(result.map((o) => o.externalId)).toEqual(["a"]);
  });
});

describe("groupSimilar", () => {
  it("agrupa títulos parecidos", () => {
    const groups = groupSimilar([
      { title: "Fone Bluetooth JBL Tune 510BT Preto" },
      { title: "Caixa de Som JBL Go 3" },
      { title: "JBL Tune 510BT Fone Bluetooth Preto Original" },
    ]);
    expect(groups.map((g) => g.length)).toEqual([2, 1]);
  });
});
