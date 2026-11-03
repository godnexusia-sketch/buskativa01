import { STORE_IDS, type StoreId } from "@buskativa/core";
import { STORES } from "@buskativa/core/stores";
import { listCouponsPublic, type PublicCoupon } from "../../lib/coupon-service";
import { getDb } from "../../lib/server";
import { CouponCard } from "./coupon-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cupons de desconto" };

export default async function CuponsPage({ searchParams }: { searchParams: Promise<{ loja?: string }> }) {
  const raw = (await searchParams).loja;
  const loja = STORE_IDS.includes(raw as StoreId) ? (raw as StoreId) : null;
  const res = await listCouponsPublic(getDb(), loja, new Date());
  const coupons = (res.body as { coupons: PublicCoupon[] }).coupons;

  return (
    <>
      <h1>Cupons de desconto</h1>
      <p className="muted">Cadastrados e conferidos pela comunidade. Vote se o cupom funcionou para ajudar os outros.</p>
      <nav className="chips" aria-label="Filtrar por loja">
        <a className={`chip ${loja === null ? "sel" : ""}`} href="/cupons">Todas as lojas</a>
        {STORE_IDS.map((id) => (
          <a key={id} className={`chip ${loja === id ? "sel" : ""}`} href={`/cupons?loja=${id}`}>{STORES[id].name}</a>
        ))}
      </nav>
      {coupons.length === 0 ? (
        <p>Nenhum cupom cadastrado{loja ? ` para ${STORES[loja].name}` : ""} no momento.</p>
      ) : (
        <div className="list">
          {coupons.map((c) => <CouponCard key={c.id} coupon={c} />)}
        </div>
      )}
    </>
  );
}
