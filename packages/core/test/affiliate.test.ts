import { describe, expect, it } from "vitest";
import { affiliateUrl } from "../src/affiliate";
import { isAllowedUrl, storeForUrl } from "../src/stores";

describe("storeForUrl / isAllowedUrl", () => {
  it("reconhece domínios e subdomínios permitidos", () => {
    expect(storeForUrl("https://www.amazon.com.br/dp/B0C1")).toBe("amazon");
    expect(storeForUrl("https://produto.mercadolivre.com.br/MLB-1")).toBe("mercadolivre");
    expect(storeForUrl("https://pt.aliexpress.com/item/1.html")).toBe("aliexpress");
  });

  it("recusa domínios parecidos, http e URLs inválidas", () => {
    expect(storeForUrl("https://amazon.com.br.evil.com/x")).toBeNull();
    expect(storeForUrl("http://www.amazon.com.br/dp/B0C1")).toBeNull();
    expect(storeForUrl("não é url")).toBeNull();
  });

  it("confere a loja quando informada", () => {
    expect(isAllowedUrl("https://www.amazon.com.br/dp/B0C1", "amazon")).toBe(true);
    expect(isAllowedUrl("https://www.amazon.com.br/dp/B0C1", "shopee")).toBe(false);
  });
});

describe("affiliateUrl", () => {
  it("aplica os parâmetros de afiliado da loja", () => {
    const url = affiliateUrl("https://www.amazon.com.br/dp/B0C1?th=1", "amazon", {
      AFFILIATE_PARAMS_AMAZON: "tag=meutag-20",
    });
    const u = new URL(url);
    expect(u.searchParams.get("tag")).toBe("meutag-20");
    expect(u.searchParams.get("th")).toBe("1");
  });

  it("mantém a URL sem parâmetros configurados", () => {
    expect(affiliateUrl("https://www.amazon.com.br/dp/B0C1", "amazon", {})).toBe(
      "https://www.amazon.com.br/dp/B0C1",
    );
  });

  it("lança erro para URL fora da allowlist", () => {
    expect(() => affiliateUrl("https://evil.com/x", "amazon", {})).toThrow(/allowlist/);
  });
});
