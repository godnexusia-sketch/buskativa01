import { listActiveCoupons, upsertCoupon } from "@buskativa/db";
import { createTestDb } from "@buskativa/db/testing";
import { describe, expect, it } from "vitest";
import {
  adminAuth, createCouponAdmin, deactivateCouponAdmin, hashVoter, listCouponsPublic, voteOnCoupon, voterHash, voterIdFromCookie,
} from "../lib/coupon-service";

const now = new Date("2026-11-03T12:00:00Z");
const body = { store: "amazon", code: "economiza10", title: "10% na Amazon", discountType: "percent", discountValue: 10, source: "manual" };

describe("adminAuth", () => {
  it("sem ADMIN_TOKEN responde 503", () => {
    expect(adminAuth("Bearer x", undefined)).toEqual({ status: 503, body: { error: "Administração desativada: ADMIN_TOKEN não configurado." } });
    expect(adminAuth("Bearer x", "")?.status).toBe(503);
  });
  it("token errado ou ausente responde 401", () => {
    expect(adminAuth("Bearer errado", "segredo")?.status).toBe(401);
    expect(adminAuth(null, "segredo")?.status).toBe(401);
    expect(adminAuth("segredo", "segredo")?.status).toBe(401);
  });
  it("token correto libera", () => {
    expect(adminAuth("Bearer segredo", "segredo")).toBeNull();
  });
});

describe("hashVoter", () => {
  it("é sha256 estável de IP + sal e muda com o sal", () => {
    const a = hashVoter("1.2.3.4", "sal");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashVoter("1.2.3.4", "sal")).toBe(a);
    expect(hashVoter("1.2.3.4", "outro")).not.toBe(a);
    expect(hashVoter("1.2.3.5", "sal")).not.toBe(a);
  });
});

describe("identidade do votante", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  it("lê só um UUID válido do cookie bk_voter", () => {
    expect(voterIdFromCookie(`a=1; bk_voter=${id}; b=2`)).toBe(id);
    expect(voterIdFromCookie("bk_voter=lixo")).toBeNull();
    expect(voterIdFromCookie(null)).toBeNull();
  });
  it("com cookie usa sha256(sal + id), sem cookie cai no hash do IP", () => {
    expect(voterHash("sal", id, "1.1.1.1")).toBe(voterHash("sal", id, "2.2.2.2"));
    expect(voterHash("sal", id, "1.1.1.1")).not.toBe(voterHash("sal", null, "1.1.1.1"));
    expect(voterHash("sal", null, "1.1.1.1")).toBe(hashVoter("1.1.1.1", "sal"));
  });
});

describe("cupons (serviço)", { timeout: 90000 }, () => {
  it("admin cria com validação em pt-BR, lista pública e desativa", async () => {
    const db = await createTestDb();
    const bad = await createCouponAdmin(db, { ...body, store: "x", discountValue: 99 }, now);
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ errors: ["Loja inválida.", "Desconto percentual deve ficar entre 1 e 90."] });

    const ok = await createCouponAdmin(db, body, now);
    expect(ok.status).toBe(201);
    expect((await createCouponAdmin(db, { ...body, title: "Outro título" }, now)).status).toBe(200);
    expect(ok.body).toMatchObject({ coupon: { code: "ECONOMIZA10", confidence: "baixa", worked: 0, failed: 0 } });

    const list = await listCouponsPublic(db, null, now);
    expect(list.status).toBe(200);
    expect((list.body as { coupons: unknown[] }).coupons).toHaveLength(1);
    expect((await listCouponsPublic(db, "magalu", now)).body).toEqual({ coupons: [] });
    expect((await listCouponsPublic(db, "inexistente", now)).status).toBe(400);

    const id = (ok.body as { coupon: { id: number } }).coupon.id;
    expect((await deactivateCouponAdmin(db, "abc")).status).toBe(400);
    expect((await deactivateCouponAdmin(db, "999")).status).toBe(404);
    expect((await deactivateCouponAdmin(db, String(id))).status).toBe(200);
    expect(await listActiveCoupons(db, undefined, now)).toEqual([]);
  });

  it("voto em cupom vencido responde 410", async () => {
    const db = await createTestDb();
    const c = await upsertCoupon(db, {
      store: "amazon", code: "VENC10", title: "t", description: null, discountType: "frete", discountValue: 0,
      minOrderCents: null, validUntil: new Date(Date.now() - 1000), sourceUrl: null, source: "manual", active: true,
    });
    const r = await voteOnCoupon(db, String(c.id), { funcionou: true }, "h1");
    expect(r).toEqual({ status: 410, body: { error: "Este cupom já venceu." } });
  });

  it("voto: valida corpo, conta uma vez por pessoa e deixa trocar", async () => {
    const db = await createTestDb();
    const c = await upsertCoupon(db, {
      store: "amazon", code: "VOTE10", title: "t", description: null, discountType: "frete", discountValue: 0,
      minOrderCents: null, validUntil: null, sourceUrl: null, source: "manual", active: true,
    });
    const id = String(c.id);
    expect((await voteOnCoupon(db, "x", { funcionou: true }, "h1")).status).toBe(400);
    expect((await voteOnCoupon(db, id, { funcionou: "sim" }, "h1")).body).toEqual({ error: "Informe funcionou: true ou false." });
    expect((await voteOnCoupon(db, "999", { funcionou: true }, "h1")).status).toBe(404);

    expect((await voteOnCoupon(db, id, { funcionou: true }, "h1")).body).toEqual({ worked: 1, failed: 0, confidence: "baixa" });
    expect((await voteOnCoupon(db, id, { funcionou: true }, "h1")).body).toMatchObject({ worked: 1, failed: 0 });
    expect((await voteOnCoupon(db, id, { funcionou: false }, "h1")).body).toMatchObject({ worked: 0, failed: 1 });
    expect((await voteOnCoupon(db, id, { funcionou: true }, "h2")).body).toMatchObject({ worked: 1, failed: 1 });
  });
});
