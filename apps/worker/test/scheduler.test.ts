import { normalizeQuery } from "@buskativa/core";
import { createRun, finishRun, upsertQuery } from "@buskativa/db";
import { createTestDb } from "@buskativa/db/testing";
import { describe, expect, it } from "vitest";
import { dueQueries, isDue, pickStartupQueries } from "../src/scheduler";

describe("pickStartupQueries", () => {
  it("prioriza vigiadas, remove duplicadas e limita a 20", () => {
    const trending = Array.from({ length: 30 }, (_, i) => `produto ${i}`);
    const picked = pickStartupQueries(["fone bluetooth", "Bluetooth Fone"], ["FONE BLUETOOTH", ...trending]);
    expect(picked).toHaveLength(20);
    expect(picked[0]).toBe("fone bluetooth");
    expect(picked.filter((p) => normalizeQuery(p).hash === normalizeQuery("fone bluetooth").hash)).toHaveLength(1);
  });
});

describe("isDue", () => {
  const now = new Date("2026-05-01T12:00:00Z");
  const ago = (min: number) => new Date(now.getTime() - min * 60e3);
  it("nunca executada está vencida", () => expect(isDue(null, false, now)).toBe(true));
  it("60 min normal, 30 min com variação", () => {
    expect(isDue(ago(45), false, now)).toBe(false);
    expect(isDue(ago(60), false, now)).toBe(true);
    expect(isDue(ago(30), true, now)).toBe(true);
    expect(isDue(ago(20), true, now)).toBe(false);
  });
});

describe("dueQueries", () => {
  it("lista só as consultas vencidas", async () => {
    const db = await createTestDb();
    const now = new Date();
    const a = await upsertQuery(db, normalizeQuery("fone bluetooth"));
    const r = await createRun(db, a.id);
    await finishRun(db, r, new Date(now.getTime() - 10 * 60e3));
    await upsertQuery(db, normalizeQuery("air fryer"));
    expect(await dueQueries(db, now)).toEqual(["air fryer"]);
  }, 90000);
});
