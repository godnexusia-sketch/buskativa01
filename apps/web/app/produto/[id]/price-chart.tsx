"use client";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL, formatDateTime } from "../../../lib/format";

export function PriceChart({ points }: { points: { price: number; observedAt: string }[] }) {
  const data = points.map((p) => ({ t: new Date(p.observedAt).getTime(), price: p.price }));
  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t) => new Date(t).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
          />
          <YAxis width={90} tickFormatter={(v) => formatBRL(Math.round(Number(v) * 100))} domain={["auto", "auto"]} />
          <Tooltip
            labelFormatter={(t) => formatDateTime(new Date(Number(t)))}
            formatter={(v) => [formatBRL(Math.round(Number(v) * 100)), "Preço"]}
          />
          <Line type="stepAfter" dataKey="price" stroke="#16a34a" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
