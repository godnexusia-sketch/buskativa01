import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../lib/rate-limit";
import { clientIp } from "../lib/server";

describe("createRateLimiter", () => {
  it("permite até o limite por janela e libera depois", () => {
    const allow = createRateLimiter(2, 1000);
    expect(allow("ip", 0)).toBe(true);
    expect(allow("ip", 10)).toBe(true);
    expect(allow("ip", 20)).toBe(false);
    expect(allow("outro", 20)).toBe(true);
    expect(allow("ip", 1001)).toBe(true);
  });

  it("descarta chaves cuja janela esvaziou", () => {
    const allow = createRateLimiter(2, 1000);
    for (let i = 0; i < 100; i++) allow(`ip-${i}`, 0);
    expect(allow.size()).toBe(100);
    allow("novo", 1500);
    expect(allow.size()).toBe(1);
    // ainda bloqueia quem continua dentro da janela
    allow("novo", 1600);
    expect(allow("novo", 1700)).toBe(false);
  });
});

const req = (headers: Record<string, string>) => new Request("http://localhost/api/buscas", { headers });

describe("clientIp", () => {
  it("prefere cabeçalhos definidos pelo proxy/CDN", () => {
    expect(clientIp(req({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "9.9.9.9" }))).toBe("1.1.1.1");
    expect(clientIp(req({ "true-client-ip": "2.2.2.2", "x-forwarded-for": "9.9.9.9" }))).toBe("2.2.2.2");
    expect(clientIp(req({ "x-real-ip": "3.3.3.3", "x-forwarded-for": "9.9.9.9" }))).toBe("3.3.3.3");
  });

  it("usa o salto mais à direita do x-forwarded-for (o primeiro é forjável pelo cliente)", () => {
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 10.0.0.1, 4.4.4.4" }))).toBe("4.4.4.4");
    expect(clientIp(req({ "x-forwarded-for": "5.5.5.5" }))).toBe("5.5.5.5");
  });

  it("cai para local sem cabeçalhos", () => {
    expect(clientIp(req({}))).toBe("local");
    expect(clientIp(req({ "x-forwarded-for": " , " }))).toBe("local");
  });
});
