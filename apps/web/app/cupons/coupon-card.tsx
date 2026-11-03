"use client";
import { CONFIDENCE_BADGE, describeDiscount } from "@buskativa/core/coupons";
import { STORES } from "@buskativa/core/stores";
import { useState } from "react";
import type { PublicCoupon } from "../../lib/coupon-service";
import { formatBRL, formatDateTime } from "../../lib/format";

export function CouponCard({ coupon, showStore = true }: { coupon: PublicCoupon; showStore?: boolean }) {
  const [counts, setCounts] = useState({ worked: coupon.worked, failed: coupon.failed, confidence: coupon.confidence });
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMsg("Não foi possível copiar. Selecione o código e copie manualmente.");
    }
  }

  async function vote(funcionou: boolean) {
    setMsg(null);
    try {
      const res = await fetch(`/api/cupons/${coupon.id}/voto`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ funcionou }),
      });
      const body = await res.json();
      if (!res.ok) return setMsg(typeof body?.error === "string" ? body.error : "Não foi possível registrar o voto.");
      setCounts(body);
      setMsg("Obrigado pelo voto!");
    } catch {
      setMsg("Não foi possível registrar o voto.");
    }
  }

  return (
    <div className="card coupon" data-testid="coupon">
      <div className="info">
        <div className="title">{coupon.title}</div>
        <div className="muted">
          {showStore && `${STORES[coupon.store].name} · `}
          {describeDiscount(coupon.discountType, coupon.discountValue)}
          {coupon.minOrderCents !== null && ` · pedido mínimo ${formatBRL(coupon.minOrderCents)}`}
        </div>
        {coupon.description && <div className="muted">{coupon.description}</div>}
        <div className="badges">
          <span className={`badge conf ${counts.confidence}`}>{CONFIDENCE_BADGE[counts.confidence]}</span>
          <span className="muted">
            {counts.worked} funcionou · {counts.failed} não funcionou
          </span>
          <span className="muted">{coupon.validUntil ? `válido até ${formatDateTime(coupon.validUntil)}` : "sem data de validade informada"}</span>
        </div>
        <div className="badges">
          <button type="button" className="ghost" onClick={() => vote(true)}>Funcionou</button>
          <button type="button" className="ghost" onClick={() => vote(false)}>Não funcionou</button>
          {coupon.sourceUrl && (
            <a className="muted" href={coupon.sourceUrl} target="_blank" rel="noopener noreferrer">ver origem</a>
          )}
        </div>
        {msg && <div className="muted" role="status">{msg}</div>}
      </div>
      <div className="code-box">
        <code>{coupon.code}</code>
        <button type="button" onClick={copy}>{copied ? "Copiado!" : "Copiar código"}</button>
      </div>
    </div>
  );
}
