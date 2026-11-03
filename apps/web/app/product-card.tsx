import { discountPercent } from "@buskativa/core/discount";
import { STORES } from "@buskativa/core/stores";
import type { StoreId } from "@buskativa/core";
import { formatBRL } from "../lib/format";
import { PAGAMENTO_LABEL } from "./price-badges";

export interface CardProduct {
  productId: number;
  store: StoreId;
  title: string;
  imageUrl: string | null;
  priceCents: number;
  originalPriceCents: number | null;
  shippingCents: number | null;
  pagamento: "app" | "pix" | null;
}

export const shippingLabel = (cents: number | null) =>
  cents === null ? "frete a calcular" : cents === 0 ? "frete grátis" : `frete ${formatBRL(cents)}`;

/** Product tile for the grids and shelves. The big number is the total (price + shipping when informed). */
export function ProductCard({ p }: { p: CardProduct }) {
  const pct = discountPercent(p.priceCents / 100, p.originalPriceCents == null ? null : p.originalPriceCents / 100);
  const total = p.priceCents + (p.shippingCents ?? 0);
  return (
    <article className="pcard" data-testid="offer">
      <a className="pcard-media" href={`/produto/${p.productId}`} tabIndex={-1} aria-hidden="true">
        {p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" /> : <span className="pcard-noimg" />}
        {pct !== null && <span className="stamp">-{pct}%</span>}
      </a>
      <div className="pcard-body">
        <span className="pcard-store">{STORES[p.store].name}</span>
        <a className="title" href={`/produto/${p.productId}`}>{p.title}</a>
        <div className="pcard-price">
          {pct !== null && <s className="was">{formatBRL(p.originalPriceCents as number)}</s>}
          <span className="price">{formatBRL(total)}</span>
          <span className="pcard-meta">
            {p.pagamento ? PAGAMENTO_LABEL[p.pagamento] : shippingLabel(p.shippingCents)}
          </span>
        </div>
        <a className="btn btn-store" href={`/ir/${p.productId}`} target="_blank" rel="noopener sponsored">Ir para a loja</a>
      </div>
    </article>
  );
}
