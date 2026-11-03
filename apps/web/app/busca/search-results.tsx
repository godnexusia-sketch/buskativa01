"use client";
import { STORES } from "@buskativa/core/stores";
import { useEffect, useState } from "react";
import { formatBRL } from "../../lib/format";
import { applyOfferView, parseReais, type OfferOrder } from "../../lib/offer-filters";
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
  const [store, setStore] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [order, setOrder] = useState<OfferOrder>("relevancia");

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

  const minCents = parseReais(min);
  const maxCents = parseReais(max);
  const view = applyOfferView(data.results, { store: store || null, minCents, maxCents, order });
  const storesInData = [...new Set(data.results.map((r) => r.store))];

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
      {data.results.length > 0 && (
        <div className="filters" role="group" aria-label="Filtros e ordenação">
          <label>Loja
            <select value={store} onChange={(e) => setStore(e.target.value)}>
              <option value="">Todas as lojas</option>
              {storesInData.map((id) => <option key={id} value={id}>{STORES[id].name}</option>)}
            </select>
          </label>
          <label>Preço mínimo (R$)
            <input inputMode="decimal" value={min} placeholder="0" onChange={(e) => setMin(e.target.value)} />
          </label>
          <label>Preço máximo (R$)
            <input inputMode="decimal" value={max} placeholder="sem limite" onChange={(e) => setMax(e.target.value)} />
          </label>
          <label>Ordenar por
            <select value={order} onChange={(e) => setOrder(e.target.value as OfferOrder)}>
              <option value="relevancia">Relevância</option>
              <option value="menor-preco">Menor preço</option>
              <option value="maior-desconto">Maior desconto</option>
            </select>
          </label>
        </div>
      )}
      {data.results.length > 0 && (
        <p className="muted" data-testid="offer-count" aria-live="polite">
          {view.offers} {view.offers === 1 ? "oferta" : "ofertas"} em {view.stores} {view.stores === 1 ? "loja" : "lojas"}
        </p>
      )}
      {data.results.length > 0 && view.offers === 0 && <p>Nenhuma oferta com esses filtros.</p>}
      <div className="list">
        {view.groups.map((items) =>
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
