import { describe, expect, it } from "vitest";
import { adsTxtLine, DEFAULT_SITE_URL, normalizeAdsenseClient, normalizeGaId, resolveSiteUrl } from "../lib/site";

describe("resolveSiteUrl", () => {
  it("usa o valor informado sem barra final", () => {
    expect(resolveSiteUrl("https://buskativa.onrender.com/")).toBe("https://buskativa.onrender.com");
  });
  it("cai em localhost quando ausente ou inválido", () => {
    expect(resolveSiteUrl(undefined)).toBe(DEFAULT_SITE_URL);
    expect(resolveSiteUrl("  ")).toBe(DEFAULT_SITE_URL);
    expect(resolveSiteUrl("nao e url")).toBe(DEFAULT_SITE_URL);
    expect(resolveSiteUrl("javascript:alert(1)")).toBe(DEFAULT_SITE_URL);
  });
});

describe("adsTxtLine", () => {
  it("gera a linha DIRECT a partir do client", () => {
    expect(adsTxtLine("ca-pub-0000000000000000")).toBe("google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0\n");
  });
  it("sem client válido devolve null", () => {
    expect(adsTxtLine(undefined)).toBeNull();
    expect(adsTxtLine("")).toBeNull();
    expect(adsTxtLine("pub-123")).toBeNull();
    expect(adsTxtLine("ca-pub-12\nevil")).toBeNull();
  });
});

describe("normalizers", () => {
  it("valida client AdSense e GA4", () => {
    expect(normalizeAdsenseClient(" ca-pub-0000000000000000 ")).toBe("ca-pub-0000000000000000");
    expect(normalizeAdsenseClient("x")).toBeNull();
    expect(normalizeGaId("G-TEST123456")).toBe("G-TEST123456");
    expect(normalizeGaId("UA-1")).toBeNull();
    expect(normalizeGaId('G-1");alert(1)//')).toBeNull();
  });
});
