import { discountPercent } from "@buskativa/core/discount";
import { formatBRL } from "../lib/format";

export const PAGAMENTO_LABEL = { app: "Preço no app", pix: "Preço no Pix" } as const;

interface Props {
  priceCents: number;
  originalPriceCents?: number | null;
  pagamento?: "app" | "pix" | null;
}

/** "de R$ X por R$ Y" line plus the discount and payment badges; renders nothing without them. */
export function PriceBadges({ priceCents, originalPriceCents, pagamento }: Props) {
  const pct = discountPercent(priceCents / 100, originalPriceCents == null ? null : originalPriceCents / 100);
  if (pct === null && !pagamento) return null;
  return (
    <div className="badges">
      {pct !== null && (
        <>
          <span className="badge off">-{pct}%</span>
          <span className="muted">
            de <s>{formatBRL(originalPriceCents as number)}</s> por {formatBRL(priceCents)}
          </span>
        </>
      )}
      {pagamento && <span className="badge pay">{PAGAMENTO_LABEL[pagamento]}</span>}
    </div>
  );
}
