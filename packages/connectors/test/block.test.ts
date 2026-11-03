import { describe, expect, it } from "vitest";
import { detectBlock } from "../src/browser";

const ok = { status: 200, url: "https://loja.example/busca", text: "Fone de Ouvido Bluetooth R$ 99,90 e muitos outros produtos" };

describe("detectBlock", () => {
  it("aceita página normal", () => expect(detectBlock(ok)).toBeNull());
  it("bloqueia HTTP 403 e 429", () => {
    expect(detectBlock({ ...ok, status: 403 })).toMatch(/403/);
    expect(detectBlock({ ...ok, status: 429 })).toMatch(/429/);
  });
  it("bloqueia redirecionamento para login/verificação", () => {
    expect(detectBlock({ ...ok, url: "https://shopee.com.br/verify/traffic/error?x=1" })).not.toBeNull();
    expect(detectBlock({ ...ok, url: "https://loja.example/buyer/login" })).not.toBeNull();
  });
  it("bloqueia CAPTCHA e página vazia", () => {
    expect(detectBlock({ ...ok, text: "Digite o CAPTCHA abaixo" })).not.toBeNull();
    expect(detectBlock({ ...ok, text: "" })).not.toBeNull();
  });
});
