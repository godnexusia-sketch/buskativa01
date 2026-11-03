import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";
import { adsTxtLine, controllerName, DEFAULT_CONTROLLER_NAME, DEFAULT_SITE_URL, siteUrl, normalizeAdsenseClient, normalizeGaId, resolveSiteUrl } from "../lib/site";

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

describe("controllerName e aviso de siteUrl", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("usa o nome configurado ou o padrão", () => {
    vi.stubEnv("NEXT_PUBLIC_CONTROLLER_NAME", "");
    expect(controllerName()).toBe(DEFAULT_CONTROLLER_NAME);
    vi.stubEnv("NEXT_PUBLIC_CONTROLLER_NAME", " Fulano ");
    expect(controllerName()).toBe("Fulano");
  });
  it("avisa uma única vez em produção sem URL", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(siteUrl()).toBe(DEFAULT_SITE_URL);
    siteUrl();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
