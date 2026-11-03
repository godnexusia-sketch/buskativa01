import { describe, expect, it } from "vitest";
import { CONSENT_DEFAULTS, CONSENT_STORAGE_KEY, consentState, parseConsent, readConsent, saveConsent } from "../lib/consent";

describe("consent mode v2", () => {
  it("defaults negam tudo", () => {
    expect(CONSENT_DEFAULTS).toEqual({
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
    });
  });
  it("aceitar concede os quatro sinais", () => {
    expect(Object.values(consentState("granted"))).toEqual(["granted", "granted", "granted", "granted"]);
    expect(Object.values(consentState("denied"))).toEqual(["denied", "denied", "denied", "denied"]);
  });
  it("parseConsent só aceita valores conhecidos", () => {
    expect(parseConsent("granted")).toBe("granted");
    expect(parseConsent("denied")).toBe("denied");
    expect(parseConsent("yes")).toBeNull();
    expect(parseConsent(null)).toBeNull();
  });
  it("lê e grava no storage, tolerando falhas", () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(readConsent(storage)).toBeNull();
    saveConsent("granted", storage);
    expect(mem.get(CONSENT_STORAGE_KEY)).toBe("granted");
    expect(readConsent(storage)).toBe("granted");
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readConsent(broken)).toBeNull();
    expect(() => saveConsent("denied", broken)).not.toThrow();
  });
});
