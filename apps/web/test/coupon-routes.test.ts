import { describe, expect, it, vi } from "vitest";

const created: unknown[] = [];
vi.mock("../lib/server", () => ({
  getDb: () => ({}),
  clientIp: () => "9.9.9.9",
  allowVote: () => true,
}));
vi.mock("@buskativa/db", () => ({
  upsertCoupon: async (_db: unknown, c: unknown) => {
    created.push(c);
    return { id: 1, ...(c as object), worked: 0, failed: 0, createdAt: new Date(), created: true };
  },
  deactivateCoupon: async () => true,
}));

import { afterEach, beforeEach } from "vitest";
import { DELETE } from "../app/api/admin/cupons/[id]/route";
import { POST } from "../app/api/admin/cupons/route";

const payload = { store: "amazon", code: "abc123", title: "Teste", discountType: "frete", discountValue: 0, source: "manual" };
const post = (headers: Record<string, string>) =>
  POST(new Request("http://localhost/api/admin/cupons", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(payload) }));

describe("rotas admin de cupons", () => {
  const original = process.env.ADMIN_TOKEN;
  beforeEach(() => {
    created.length = 0;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = original;
  });

  it("sem ADMIN_TOKEN configurado responde 503", async () => {
    delete process.env.ADMIN_TOKEN;
    expect((await post({ authorization: "Bearer x" })).status).toBe(503);
    expect((await DELETE(new Request("http://localhost/api/admin/cupons/1", { method: "DELETE" }), { params: Promise.resolve({ id: "1" }) })).status).toBe(503);
    expect(created).toHaveLength(0);
  });

  it("token errado responde 401 e nada é gravado", async () => {
    process.env.ADMIN_TOKEN = "segredo";
    expect((await post({ authorization: "Bearer errado" })).status).toBe(401);
    expect((await post({})).status).toBe(401);
    expect((await DELETE(new Request("http://localhost/x", { method: "DELETE", headers: { authorization: "Bearer errado" } }), { params: Promise.resolve({ id: "1" }) })).status).toBe(401);
    expect(created).toHaveLength(0);
  });

  it("token certo cria; JSON inválido dá 400 em pt-BR", async () => {
    process.env.ADMIN_TOKEN = "segredo";
    expect((await post({ authorization: "Bearer segredo" })).status).toBe(201);
    expect(created).toHaveLength(1);
    const bad = await POST(new Request("http://localhost/api/admin/cupons", { method: "POST", headers: { authorization: "Bearer segredo" }, body: "{" }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ errors: ["Corpo da requisição inválido."] });
    const del = await DELETE(new Request("http://localhost/x", { method: "DELETE", headers: { authorization: "Bearer segredo" } }), { params: Promise.resolve({ id: "1" }) });
    expect(del.status).toBe(200);
  });
});
