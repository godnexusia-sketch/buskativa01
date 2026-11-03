import { ConnectorError } from "@buskativa/core";
import { type Browser, type BrowserContext, chromium } from "playwright";

let browserPromise: Promise<Browser> | null = null;

/** Shared Chromium; a failed launch or a crashed/closed browser is dropped so the next call relaunches. */
function getBrowser(): Promise<Browser> {
  if (browserPromise) return browserPromise;
  const p: Promise<Browser> = chromium.launch({ headless: true }).then(
    (browser) => {
      browser.on("disconnected", () => {
        if (browserPromise === p) browserPromise = null;
      });
      return browser;
    },
    (err: unknown) => {
      if (browserPromise === p) browserPromise = null;
      throw err;
    },
  );
  browserPromise = p;
  return p;
}

export async function closeBrowser(): Promise<void> {
  const p = browserPromise;
  if (!p) return;
  browserPromise = null;
  try {
    await (await p).close();
  } catch {
    // launch failed or the browser is already gone: nothing to close
  }
}

const BLOCKED_RESOURCES = new Set(["image", "media", "font"]);

const BLOCK_TEXT = /captcha|não sou um robô|nao sou um robo|verifique se você é humano|robot check|unusual traffic|acesso negado/i;
const LOGIN_URL = /\/(login|signin|buyer\/login|verify\/traffic)/i;

/** Devolve o motivo do bloqueio ou null. Só detecta; nunca tenta contornar. */
export function detectBlock(page: { status: number | null; url: string; text: string }): string | null {
  if (page.status === 403 || page.status === 429) return `HTTP ${page.status}`;
  if (LOGIN_URL.test(page.url)) return `redirecionado para login/verificação: ${page.url}`;
  if (BLOCK_TEXT.test(page.text)) return "página de verificação/CAPTCHA";
  if (page.text.trim().length < 20) return "página vazia (provável bloqueio anti-bot)";
  return null;
}

/**
 * Renders the page and returns its HTML. Aborting `signal` closes the browser context so the
 * in-flight navigation stops promptly (used by the per-fetch deadline in browserConnector).
 */
export async function fetchRendered(
  url: string,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const { timeoutMs = 30000, signal } = opts;
  let ctx: BrowserContext | undefined;
  const onAbort = () => void ctx?.close().catch(() => {});
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal?.aborted) throw new Error("aborted");
    const browser = await getBrowser();
    ctx = await browser.newContext({
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
      viewport: { width: 1366, height: 900 },
    });
    if (signal?.aborted) throw new Error("aborted");
    // the parsers read only the HTML: skipping images, media and fonts saves memory and bandwidth
    await ctx.route("**/*", (route) =>
      BLOCKED_RESOURCES.has(route.request().resourceType()) ? route.abort() : route.continue(),
    );
    const page = await ctx.newPage();
    const status = (await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs }))?.status() ?? null;
    if (status !== null && status >= 500) throw new ConnectorError("NETWORK", `HTTP ${status}`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    const visible = await page.innerText("body").catch(() => "");
    const blocked = detectBlock({ status, url: page.url(), text: visible });
    if (blocked) throw new ConnectorError("BLOCKED", blocked);
    return await page.content();
  } catch (e) {
    if (signal?.aborted) throw new ConnectorError("TIMEOUT", "busca interrompida por tempo esgotado");
    if (e instanceof ConnectorError) throw e;
    throw new ConnectorError(/timeout/i.test(String(e)) ? "TIMEOUT" : "NETWORK", String(e));
  } finally {
    signal?.removeEventListener("abort", onAbort);
    await ctx?.close().catch(() => {});
  }
}
