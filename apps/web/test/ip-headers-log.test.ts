import { afterEach, describe, expect, it, vi } from "vitest";
import { logClientIpHeadersOnce } from "../lib/server";

const req = () =>
  new Request("http://localhost/api/buscas", {
    headers: { "x-forwarded-for": "1.1.1.1, 10.0.0.1", "true-client-ip": "1.1.1.1", "cf-connecting-ip": "2.2.2.2" },
  });

afterEach(() => {
  delete process.env.LOG_CLIENT_IP_HEADERS;
  vi.restoreAllMocks();
});

describe("logClientIpHeadersOnce", () => {
  it("sem LOG_CLIENT_IP_HEADERS=true não registra nada", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logClientIpHeadersOnce(req());
    process.env.LOG_CLIENT_IP_HEADERS = "1";
    logClientIpHeadersOnce(req());
    expect(info).not.toHaveBeenCalled();
  });

  it("com LOG_CLIENT_IP_HEADERS=true registra os cabeçalhos crus uma única vez por processo", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    process.env.LOG_CLIENT_IP_HEADERS = "true";
    logClientIpHeadersOnce(req());
    logClientIpHeadersOnce(req());
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][1]).toEqual({
      "x-forwarded-for": "1.1.1.1, 10.0.0.1",
      "true-client-ip": "1.1.1.1",
      "cf-connecting-ip": "2.2.2.2",
      clientIp: "10.0.0.1",
    });
  });
});
