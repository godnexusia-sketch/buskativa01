"use client";
import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL, formatDateTime } from "../../../lib/format";

interface Point { price: number; observedAt: string }

const brl = (v: unknown) => formatBRL(Math.round(Number(v) * 100));
const day = (t: number) => new Date(t).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

/** Step chart of the observed price with the highest and lowest points marked and the 30-day average as a line. */
export function PriceChart({ points, avg }: { points: Point[]; avg?: number }) {
  const [reduced, setReduced] = useState(true);
  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  const data = points.map((p) => ({ t: new Date(p.observedAt).getTime(), price: p.price }));
  if (data.length < 2) return <p className="muted">O gráfico aparece quando tivermos pelo menos dois preços registrados.</p>;
  let hi = data[0];
  let lo = data[0];
  for (const d of data) {
    if (d.price > hi.price) hi = d;
    if (d.price < lo.price) lo = d;
  }
  return (
    <figure className="chart">
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={day} tick={{ fontSize: 12, fill: "var(--muted)" }} stroke="var(--line)" />
            <YAxis width={78} tickFormatter={brl} domain={["auto", "auto"]} tick={{ fontSize: 12, fill: "var(--muted)" }} stroke="var(--line)" />
            <Tooltip labelFormatter={(t) => formatDateTime(new Date(Number(t)))} formatter={(v) => [brl(v), "Preço"]} />
            {avg !== undefined && <ReferenceLine y={avg} stroke="var(--muted)" strokeDasharray="4 4" />}
            <Line type="stepAfter" dataKey="price" stroke="var(--ink)" strokeWidth={2} dot={false} isAnimationActive={!reduced} animationDuration={1100} animationEasing="ease-out" />
            {hi.price !== lo.price && <ReferenceDot x={hi.t} y={hi.price} r={5} fill="var(--drop)" stroke="var(--surface)" strokeWidth={2} />}
            <ReferenceDot x={lo.t} y={lo.price} r={5} fill="var(--brand)" stroke="var(--surface)" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="chart-legend">
        <span><i className="dot lo" /> mais barato: {brl(lo.price)} em {day(lo.t)}</span>
        {hi.price !== lo.price && <span><i className="dot hi" /> mais caro: {brl(hi.price)} em {day(hi.t)}</span>}
        {avg !== undefined && <span><i className="dash" /> média de 30 dias</span>}
      </figcaption>
    </figure>
  );
}
