"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { N } from "./ui";
import { MONO, T, UI } from "@/lib/theme";

/** Rating analisti in stile Google Finance (§7.2): ciambella Buy/Hold/Sell + barre PT. */
export function Ciambella({
  buy,
  hold,
  sell,
  rating,
}: {
  buy?: number | null;
  hold?: number | null;
  sell?: number | null;
  rating?: string | null;
}) {
  const tot = (buy || 0) + (hold || 0) + (sell || 0);
  if (!tot) return null;
  const d = [
    { n: "Buy", v: buy || 0, c: T.pos },
    { n: "Hold", v: hold || 0, c: T.warn },
    { n: "Sell", v: sell || 0, c: T.neg },
  ];
  const s = (rating || "").toLowerCase();
  const et = s.includes("strong buy")
    ? "Acquisto forte"
    : s.includes("buy")
      ? "Acquisto"
      : s.includes("sell")
        ? "Vendita"
        : s.includes("hold")
          ? "Mantieni"
          : rating;
  return (
    <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ width: 132, height: 132, position: "relative" }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={d} dataKey="v" innerRadius={44} outerRadius={64} startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}>
              {d.map((x, i) => (
                <Cell key={i} fill={x.c} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
          <div style={{ textAlign: "center" }}>
            <N s={22} w={700}>{tot}</N>
            <div style={{ font: `600 8px ${UI}`, letterSpacing: ".1em", textTransform: "uppercase", color: T.faint }}>analisti</div>
          </div>
        </div>
      </div>
      <div>
        <div style={{ font: `700 16px ${UI}`, color: T.ink, marginBottom: 10 }}>{et}</div>
        <div style={{ display: "grid", gap: 6 }}>
          {d.map((x) => (
            <div key={x.n} style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: x.c }} />
              <span style={{ font: `500 12px ${UI}`, color: T.mut, width: 38 }}>{x.n}</span>
              <N s={12} w={700}>{x.v}</N>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BarreTarget({
  ptMax,
  ptMedio,
  ptMin,
  upMax,
  upMedio,
  upMin,
  valuta,
}: {
  ptMax?: number | null;
  ptMedio?: number | null;
  ptMin?: number | null;
  upMax?: number | null;
  upMedio?: number | null;
  upMin?: number | null;
  valuta?: string | null;
}) {
  if (ptMax == null && ptMedio == null && ptMin == null) return null;
  const vs = valuta === "USD" ? "$" : "€";
  const max = Math.max(ptMax || 0, ptMedio || 0, ptMin || 0) || 1;
  const righe: [string, number | null | undefined, number | null | undefined][] = [
    ["Massimo", ptMax, upMax],
    ["Medio", ptMedio, upMedio],
    ["Minimo", ptMin, upMin],
  ];
  const filtrate = righe.filter(([, v]) => v != null);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {filtrate.map(([l, v, u]) => (
        <div key={l}>
          <div style={{ font: `500 11px ${UI}`, color: T.mut, marginBottom: 5 }}>{l}</div>
          <div style={{ height: 32, background: T.surf2, borderRadius: 8, overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.max(18, ((v as number) / max) * 100)}%`,
                height: "100%",
                background: T.acc,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                padding: "0 10px",
              }}
            >
              <span style={{ font: `600 12px ${MONO}`, color: "#fff", whiteSpace: "nowrap" }}>
                {vs}
                {Number(v).toFixed(2)}
                {u != null ? ` (${u >= 0 ? "+" : ""}${Number(u).toFixed(1)}%)` : ""}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
