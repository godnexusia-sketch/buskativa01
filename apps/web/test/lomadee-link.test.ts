import { describe, expect, it } from "vitest";
import { lomadeeShortUrl } from "../lib/lomadee-link";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("lomadeeShortUrl", () => {
  it("pede link Custom e devolve o primeiro curto https", async () => {
    let body: unknown;
    const short = await lomadeeShortUrl(
      { apiKey: "k", fetch: async (_u, init) => { body = JSON.parse(String(init?.body)); return json([{ shortUrls: ["https://lmdee.link/abc"] }]); } },
      "org-1",
      "https://www.friopecas.com.br/p",
    );
    expect(short).toBe("https://lmdee.link/abc");
    expect(body).toEqual({ organizationId: "org-1", type: "Custom", url: "https://www.friopecas.com.br/p" });
    expect(await lomadeeShortUrl({ apiKey: "k", fetch: async () => json({}, 400) }, "o", "https://x.com")).toBeNull();
  });
});
