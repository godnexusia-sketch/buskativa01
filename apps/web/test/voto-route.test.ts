import { describe, expect, it, vi } from "vitest";

let allowed = true;
vi.mock("../lib/server", () => ({
  getDb: () => ({}),
  clientIp: () => "9.9.9.9",
  allowVote: () => allowed,
  voteSalt: () => process.env.VOTE_SALT || null,
}));

import { POST } from "../app/api/cupons/[id]/voto/route";

const call = () =>
  POST(new Request("http://localhost/api/cupons/1/voto", { method: "POST", body: JSON.stringify({ funcionou: true }) }), {
    params: Promise.resolve({ id: "1" }),
  });

describe("POST /api/cupons/[id]/voto", () => {
  it("responde 429 quando passa de 10 votos por minuto", async () => {
    allowed = false;
    expect((await call()).status).toBe(429);
  });
  it("responde 503 sem VOTE_SALT", async () => {
    allowed = true;
    delete process.env.VOTE_SALT;
    expect((await call()).status).toBe(503);
  });
});
