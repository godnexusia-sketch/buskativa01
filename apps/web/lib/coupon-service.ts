import { createHash, timingSafeEqual } from "node:crypto";
import { STORE_IDS, validateCoupon, type CouponConfidence, type StoreId } from "@buskativa/core";
import { couponConfidence } from "@buskativa/core/coupons";
import { deactivateCoupon, listActiveCoupons, upsertCoupon, voteCoupon, type CouponRow, type Db } from "@buskativa/db";

export interface ServiceResult {
  status: number;
  body: unknown;
}

export interface PublicCoupon {
  id: number;
  store: StoreId;
  code: string;
  title: string;
  description: string | null;
  discountType: CouponRow["discountType"];
  discountValue: number;
  minOrderCents: number | null;
  validUntil: string | null;
  sourceUrl: string | null;
  source: CouponRow["source"];
  worked: number;
  failed: number;
  confidence: CouponConfidence;
}

export function toPublicCoupon(c: CouponRow, now: Date): PublicCoupon {
  return {
    id: c.id,
    store: c.store,
    code: c.code,
    title: c.title,
    description: c.description,
    discountType: c.discountType,
    discountValue: c.discountValue,
    minOrderCents: c.minOrderCents,
    validUntil: c.validUntil ? c.validUntil.toISOString() : null,
    sourceUrl: c.sourceUrl,
    source: c.source,
    worked: c.worked,
    failed: c.failed,
    confidence: couponConfidence(c, now),
  };
}

const sha = (s: string) => createHash("sha256").update(s).digest();

/** Bearer-token check for /api/admin/*. Returns null when authorized. */
export function adminAuth(authorization: string | null, token: string | undefined): ServiceResult | null {
  if (!token) return { status: 503, body: { error: "Administração desativada: ADMIN_TOKEN não configurado." } };
  const given = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  // compare fixed-length digests so the comparison time does not leak the token
  if (!given || !timingSafeEqual(sha(given), sha(token))) return { status: 401, body: { error: "Não autorizado." } };
  return null;
}

/** Voter identity is only ever stored as sha256(IP + salt). */
export function hashVoter(ip: string, salt: string): string {
  return createHash("sha256").update(`${ip}${salt}`).digest("hex");
}

export async function listCouponsPublic(db: Db, loja: string | null, now: Date): Promise<ServiceResult> {
  if (loja && !STORE_IDS.includes(loja as StoreId)) return { status: 400, body: { error: "Loja inválida." } };
  const rows = await listActiveCoupons(db, (loja as StoreId | null) ?? undefined, now);
  return { status: 200, body: { coupons: rows.map((c) => toPublicCoupon(c, now)) } };
}

export async function createCouponAdmin(db: Db, input: unknown, now: Date): Promise<ServiceResult> {
  const v = validateCoupon(input, now);
  if (!v.ok) return { status: 400, body: { errors: v.errors } };
  const row = await upsertCoupon(db, v.value);
  return { status: 201, body: { coupon: toPublicCoupon(row, now) } };
}

function parseId(raw: string): number | null {
  return /^\d+$/.test(raw) && Number(raw) <= 2_147_483_647 ? Number(raw) : null;
}

export async function deactivateCouponAdmin(db: Db, rawId: string): Promise<ServiceResult> {
  const id = parseId(rawId);
  if (id === null) return { status: 400, body: { error: "id inválido" } };
  if (!(await deactivateCoupon(db, id))) return { status: 404, body: { error: "Cupom não encontrado." } };
  return { status: 200, body: { ok: true } };
}

export async function voteOnCoupon(
  db: Db,
  rawId: string,
  input: unknown,
  ip: string,
  salt: string,
): Promise<ServiceResult> {
  const id = parseId(rawId);
  if (id === null) return { status: 400, body: { error: "id inválido" } };
  const funcionou = (input as { funcionou?: unknown } | null)?.funcionou;
  if (typeof funcionou !== "boolean") return { status: 400, body: { error: "Informe funcionou: true ou false." } };
  const row = await voteCoupon(db, id, hashVoter(ip, salt), funcionou);
  if (!row) return { status: 404, body: { error: "Cupom não encontrado." } };
  const { worked, failed, confidence } = toPublicCoupon(row, new Date());
  return { status: 200, body: { worked, failed, confidence } };
}
