import { describe, expect, it } from "vitest";
import { formatBRL, formatDateTime, hourBlockLabel, WEEKDAYS } from "../lib/format";

describe("format", () => {
  it("formata reais a partir de centavos", () => {
    expect(formatBRL(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
  });
  it("rótulos de dia e horário", () => {
    expect(WEEKDAYS[2]).toBe("terça-feira");
    expect(hourBlockLabel(0)).toBe("0h–3h");
    expect(hourBlockLabel(7)).toBe("21h–24h");
  });
  it("data e hora em Brasília", () => {
    expect(formatDateTime("2026-01-06T03:00:00Z")).toBe("06/01/2026, 00:00");
  });
});
