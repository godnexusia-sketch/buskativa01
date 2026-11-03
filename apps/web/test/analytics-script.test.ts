import { describe, expect, it } from "vitest";
import { consentBootstrapScript } from "../lib/analytics-script";

describe("consentBootstrapScript", () => {
  it("define o consentimento negado antes de configurar o GA4", () => {
    const s = consentBootstrapScript("G-TEST123456");
    const def = s.indexOf("gtag('consent','default'");
    expect(def).toBeGreaterThan(-1);
    expect(s).toContain('"analytics_storage":"denied"');
    expect(s).toContain('"ad_user_data":"denied"');
    expect(s.indexOf("gtag('config'")).toBeGreaterThan(def);
    expect(s).toContain('gtag(\'config\',"G-TEST123456")');
  });
  it("restaura escolha aceita via localStorage com try/catch", () => {
    const s = consentBootstrapScript(null);
    expect(s).toContain("try{");
    expect(s).toContain("gtag('consent','update'");
    expect(s).toContain('"ad_storage":"granted"');
  });
  it("sem GA4 não faz config", () => {
    expect(consentBootstrapScript(null)).not.toContain("gtag('config'");
  });
});
