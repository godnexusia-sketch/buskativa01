import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../lib/rate-limit";

describe("createRateLimiter", () => {
  it("permite até o limite por janela e libera depois", () => {
    const allow = createRateLimiter(2, 1000);
    expect(allow("ip", 0)).toBe(true);
    expect(allow("ip", 10)).toBe(true);
    expect(allow("ip", 20)).toBe(false);
    expect(allow("outro", 20)).toBe(true);
    expect(allow("ip", 1001)).toBe(true);
  });
});
