import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createHealthServer, type HealthStatus } from "../src/health";

let server: ReturnType<typeof createHealthServer> | undefined;

async function start(status: HealthStatus | (() => Promise<HealthStatus>)) {
  server = createHealthServer(typeof status === "function" ? status : () => status);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  const s = server;
  server = undefined;
  if (s) await new Promise<void>((resolve) => s.close(() => resolve()));
});

describe("createHealthServer", () => {
  it.each(["/", "/healthz"])("%s responde 200 com a fila conectada", async (path) => {
    const base = await start({ queue: "connected" });
    const res = await fetch(base + path);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ ok: true, queue: "connected" });
  });

  it("inclui lastRunAt em ISO quando existe", async () => {
    const base = await start({ queue: "connected", lastRunAt: new Date("2026-11-02T10:00:00Z") });
    expect(await (await fetch(`${base}/healthz`)).json()).toEqual({
      ok: true,
      queue: "connected",
      lastRunAt: "2026-11-02T10:00:00.000Z",
    });
  });

  it("segue 200 (liveness) com a fila desconectada, informando o estado", async () => {
    const base = await start({ queue: "disconnected" });
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, queue: "disconnected" });
  });

  it("ignora query string e responde 404 em outros caminhos", async () => {
    const base = await start({ queue: "connected" });
    expect((await fetch(`${base}/healthz?x=1`)).status).toBe(200);
    expect((await fetch(`${base}/outra`)).status).toBe(404);
  });

  it("rejeita métodos que não sejam GET/HEAD com 404", async () => {
    const base = await start({ queue: "connected" });
    expect((await fetch(`${base}/healthz`, { method: "POST" })).status).toBe(404);
  });

  it("aceita status assíncrono e, se ele falhar, ainda responde 200 como desconectado", async () => {
    let base = await start(async () => ({ queue: "connected" }));
    expect(await (await fetch(`${base}/`)).json()).toEqual({ ok: true, queue: "connected" });
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    base = await start(async () => {
      throw new Error("redis fora");
    });
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, queue: "disconnected" });
  });
});
