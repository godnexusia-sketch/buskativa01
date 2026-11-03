"use client";
import { STORES } from "@buskativa/core/stores";
import { useEffect, useState } from "react";
import { formatBRL } from "../../lib/format";
import { PriceBadges } from "../price-badges";
import { pollPlan } from "../../lib/polling";
import type { SearchResponse, SearchResultItem } from "../../lib/search-service";

const ERRO_PADRAO = "Não foi possível buscar agora. Tente de novo em instantes.";

function Offer({ r }: { r: SearchResultItem }) {
  return (
    <div className="card" data-testid="offer">
      {r.imageUrl && <img src={r.imageUrl} alt="" />}
      <div className="info">
        <a className="title" href={`/produto/${r.productId}`}>{r.title}</a>
        <div className="muted">
          {STORES[r.store].name} ·{" "}
          {r.shippingCents === null ? "frete a calcular" : r.shippingCents === 0 ? "frete grátis" : `frete ${formatBRL(r.shippingCents)}`}
        </div>
        <PriceBadges priceCents={r.priceCents} originalPriceCents={r.originalPriceCents} pagamento={r.pagamento} />
      </div>
      <div className="price">{formatBRL(r.totalCents)}</div>
      <a className="btn" href={`/ir/${r.productId}`} target="_blank" rel="noopener sponsored">Ir para a loja</a>
    </div>
  );
}

export function SearchResults({ q }: { q: string }) {
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [couponCounts, setCouponCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    // coupon chips are a nicety: any failure just hides them
    fetch("/api/cupons")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { coupons?: { store: string }[] } | null) => {
        const counts: Record<string, number> = {};
        for (const c of b?.coupons ?? []) counts[c.store] = (counts[c.store] ?? 0) + 1;
        setCouponCounts(counts);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fail = (msg = ERRO_PADRAO) => {
      if (!stopped) setError(msg);
    };
    setData(null);
    setError(null);
    setSlow(false);
    (async () => {
      const res = await fetch("/api/buscas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q }),
      });
      const body = await res.json();
      if (!res.ok) return fail(typeof body?.error === "string" ? body.error : "Erro na busca.");
      const started = Date.now();
      const poll = async () => {
        if (stopped) return;
        try {
          const r = await fetch(`/api/buscas/${body.runId}`);
          if (!r.ok) return fail();
          const d = (await r.json()) as SearchResponse;
          if (stopped) return;
          if (!Array.isArray(d?.results)) return fail();
          setData(d);
          if (d.status === "done") return;
          const plan = pollPlan(Date.now() - started);
          setSlow(plan.slow);
          if (plan.delayMs !== null) timer = setTimeout(poll, plan.delayMs);
        } catch {
          fail();
        }
      };
      await poll();
    })().catch(() => fail());
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [q]);

  if (error) return <p className="chip fail">{error}</p>;
  if (!data) return <p className="muted">Procurando nas lojas…</p>;

  const groups = new Map<number, SearchResultItem[]>();
  for (const r of data.results) groups.set(r.groupId, [...(groups.get(r.groupId) ?? []), r]);

  return (
    <>
      <div className="chips">
        {Object.entries(data.storeStatus).map(([id, s]) => (
          <span key={id} className={`chip ${s?.ok ? "" : "fail"}`}>
            {STORES[id as keyof typeof STORES].name}: {s?.ok ? `${s.count} ofertas` : "indisponível agora"}
          </span>
        ))}
        {Object.keys(data.storeStatus)
          .filter((id) => couponCounts[id] > 0)
          .map((id) => (
            <a key={`c-${id}`} className="chip sel" href={`/cupons?loja=${id}`}>
              {couponCounts[id]} {couponCounts[id] === 1 ? "cupom" : "cupons"} {STORES[id as keyof typeof STORES].name}
            </a>
          ))}
        {data.status !== "done" && !slow && <span className="chip">buscando…</span>}
        {data.status !== "done" && slow && <span className="chip fail">A busca está demorando mais que o normal.</span>}
      </div>
      {data.results.length === 0 && data.status === "done" && <p>Nenhuma oferta encontrada.</p>}
      <div className="list">
        {[...groups.values()].map((items) =>
          items.length === 1 ? (
            <Offer key={items[0].productId} r={items[0]} />
          ) : (
            <div key={items[0].productId}>
              <Offer r={items[0]} />
              <details>
                <summary className="muted">+{items.length - 1} ofertas parecidas</summary>
                <div className="list">{items.slice(1).map((r) => <Offer key={r.productId} r={r} />)}</div>
              </details>
            </div>
          ),
        )}
      </div>
    </>
  );
}
