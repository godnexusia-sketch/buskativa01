import { EventEmitter } from "node:events";
import { ConnectorError } from "@buskativa/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fakes for the Playwright API surface used by browser.ts; no real Chromium is launched.
const launch = vi.hoisted(() => vi.fn());
vi.mock("playwright", () => ({ chromium: { launch } }));

import { closeBrowser, fetchRendered } from "../src/browser";

const BODY = "Fone de Ouvido Bluetooth R$ 99,90 e muitos outros produtos";

function fakeBrowser(opts: { status?: number; newContext?: () => Promise<unknown> } = {}) {
  const page = {
    goto: vi.fn(async () => ({ status: () => opts.status ?? 200 })),
    waitForLoadState: vi.fn(async () => {}),
    innerText: vi.fn(async () => BODY),
    url: () => "https://loja.example/busca",
    content: vi.fn(async () => `<html><body>${BODY}</body></html>`),
  };
  type RouteHandler = (route: { request: () => { resourceType: () => string }; abort: () => Promise<void>; continue: () => Promise<void> }) => unknown;
  const routes: RouteHandler[] = [];
  const ctx = {
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => {}),
    route: vi.fn(async (_pattern: string, handler: RouteHandler) => void routes.push(handler)),
    routes,
  };
  const browser = Object.assign(new EventEmitter(), {
    newContext: vi.fn(opts.newContext ?? (async () => ctx)),
    close: vi.fn(async () => {}),
  });
  return { browser, ctx, page };
}

async function rejection(p: Promise<unknown>): Promise<ConnectorError> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(ConnectorError);
  return e as ConnectorError;
}

beforeEach(() => launch.mockReset());
afterEach(async () => {
  await closeBrowser();
});

describe("fetchRendered", () => {
  it("devolve o HTML de uma página normal e reaproveita o navegador", async () => {
    const { browser } = fakeBrowser();
    launch.mockResolvedValue(browser);
    expect(await fetchRendered("https://loja.example/busca")).toContain(BODY);
    await fetchRendered("https://loja.example/busca");
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it("mapeia HTTP 5xx para NETWORK (não para 0 ofertas)", async () => {
    launch.mockResolvedValue(fakeBrowser({ status: 503 }).browser);
    const err = await rejection(fetchRendered("https://loja.example/busca"));
    expect(err.code).toBe("NETWORK");
    expect(err.message).toMatch(/503/);
  });

  it("falha ao abrir o navegador não fica em cache", async () => {
    launch.mockRejectedValueOnce(new Error("chromium ausente"));
    const err = await rejection(fetchRendered("https://loja.example/busca"));
    expect(err.code).toBe("NETWORK");
    launch.mockResolvedValue(fakeBrowser().browser);
    expect(await fetchRendered("https://loja.example/busca")).toContain(BODY);
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it("navegador desconectado é relançado na próxima busca", async () => {
    const first = fakeBrowser().browser;
    launch.mockResolvedValueOnce(first);
    await fetchRendered("https://loja.example/busca");
    first.emit("disconnected");
    launch.mockResolvedValue(fakeBrowser().browser);
    await fetchRendered("https://loja.example/busca");
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it("erro em newContext vira ConnectorError", async () => {
    launch.mockResolvedValue(
      fakeBrowser({
        newContext: async () => {
          throw new Error("Target closed");
        },
      }).browser,
    );
    expect((await rejection(fetchRendered("https://loja.example/busca"))).code).toBe("NETWORK");
  });
});

describe("fetchRendered bloqueia recursos pesados", () => {
  it("aborta imagem, mídia e fonte e deixa passar o resto", async () => {
    const { browser, ctx } = fakeBrowser();
    launch.mockResolvedValue(browser);
    await fetchRendered("https://loja.example/busca");
    expect(ctx.route).toHaveBeenCalledTimes(1);
    const handler = ctx.routes[0];
    const decide = async (type: string) => {
      const route = { request: () => ({ resourceType: () => type }), abort: vi.fn(async () => {}), continue: vi.fn(async () => {}) };
      await handler(route);
      return route.abort.mock.calls.length ? "abort" : route.continue.mock.calls.length ? "continue" : "nada";
    };
    expect(await decide("image")).toBe("abort");
    expect(await decide("media")).toBe("abort");
    expect(await decide("font")).toBe("abort");
    expect(await decide("document")).toBe("continue");
    expect(await decide("script")).toBe("continue");
    expect(await decide("xhr")).toBe("continue");
  });
});

describe("closeBrowser", () => {
  it("tolera navegador que falhou ao abrir", async () => {
    let fail!: (e: Error) => void;
    launch.mockReturnValueOnce(new Promise((_, reject) => (fail = reject)));
    const pending = fetchRendered("https://loja.example/busca").catch(() => {});
    const closing = closeBrowser();
    fail(new Error("chromium ausente"));
    await expect(closing).resolves.toBeUndefined();
    await pending;
  });
});

describe("fetchRendered com signal", () => {
  it("abortar fecha o contexto e devolve TIMEOUT", async () => {
    const { browser, ctx, page } = fakeBrowser();
    launch.mockResolvedValue(browser);
    const ac = new AbortController();
    // navigation hangs until the context is closed, like Playwright does
    page.goto.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          ctx.close.mockImplementationOnce(async () => reject(new Error("Target closed")));
        }) as never,
    );
    const pending = rejection(fetchRendered("https://loja.example/busca", { signal: ac.signal }));
    await new Promise((r) => setTimeout(r, 10));
    ac.abort();
    expect((await pending).code).toBe("TIMEOUT");
    expect(ctx.close).toHaveBeenCalled();
  });
});
