import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/server", async (orig) => ({ ...(await orig<typeof import("../lib/server")>()), getDb: () => ({}) }));
vi.mock("@buskativa/db", () => ({
  voteCoupon: async () => ({ id: 1, worked: 1, failed: 0, source: "manual", validUntil: null }),
}));

import { POST } from "../app/api/cupons/[id]/voto/route";

const ID = "123e4567-e89b-42d3-a456-426614174000";
const call = (ip: string, cookie?: string) =>
  POST(
    new Request("http://localhost/api/cupons/1/voto", {
      method: "POST",
      headers: { "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ funcionou: true }),
    }),
    { params: Promise.resolve({ id: "1" }) },
  );

describe("voto com o limitador real", () => {
  it("a 11ª tentativa na janela vira 429 e o cookie funcional é definido só no primeiro voto", async () => {
    process.env.VOTE_SALT = "sal";
    const first = await call("7.7.7.7");
    expect(first.status).toBe(200);
    const setCookie = first.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/bk_voter=[0-9a-f-]{36}/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect((await call("7.7.7.7", `bk_voter=${ID}`)).headers.get("set-cookie")).toBeNull();
    for (let i = 0; i < 8; i++) expect((await call("7.7.7.7", `bk_voter=${ID}`)).status).toBe(200);
    expect((await call("7.7.7.7")).status).toBe(429);
    expect((await call("8.8.8.8")).status).toBe(200);
  });
});
