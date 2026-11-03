import type { Confidence } from "@buskativa/core";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const formatBRL = (cents: number) => brl.format(cents / 100);

export const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export const hourBlockLabel = (block: number) => `${block * 3}h–${block * 3 + 3}h`;

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  baixa: "confiança baixa (poucos dados ainda)",
  media: "confiança média",
  alta: "confiança alta",
};

export function formatDateTime(d: Date | string): string {
  return new Date(d).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
