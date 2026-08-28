"use client";

import { useMemo } from "react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, Label, N } from "./ui";
import { OMBRA, T, UI, nf, pc, sg } from "@/lib/theme";
import type { RigaAttribuzione } from "@/lib/calc";

interface Punto {
  isin: string;
  nome: string;
  dEur: number;
  dPct: number | null;
  peso: number;
}

/**
 * §5.6 — chi ha mosso il totale. Istogramma verticale con base sullo zero:
 * l'altezza è la variazione in euro dalla chiusura precedente, il verso distingue
 * guadagno da perdita. Le barre sommano al P&L di giornata mostrato in alto: qui
 * si vede da chi arriva.
 *
 * La direzione della barra è una seconda codifica oltre al colore: verde e rosso
 * hanno una separazione insufficiente per la deuteranopia (ΔE 6,4), quindi da soli
 * non basterebbero — sopra/sotto la linea dello zero sì.
 */
export function Attribuzione({ righe, totale }: { righe: RigaAttribuzione[]; totale: number }) {
  const dati = useMemo<Punto[]>(
    () =>
      righe
        .map((r) => ({
          isin: r.isin,
          nome: r.nome,
          dEur: r.dEur,
          dPct: r.dPct,
          peso: totale ? (r.valore_eur / totale) * 100 : 0,
        }))
        .sort((a, b) => b.dEur - a.dEur),
    [righe, totale]
  );

  if (righe.length === 0 || totale === 0) return null;

  // Nessuno storico con cui confrontare: un istogramma tutto a zero sembrerebbe
  // rotto, meglio dirlo.
  if (righe.every((r) => r.dPct == null)) {
    return (
      <Card>
        <Label>Chi ha mosso il totale</Label>
        <div style={{ marginTop: 10, font: `400 13px/1.6 ${UI}`, color: T.mut }}>
          Ancora nessuna chiusura precedente con cui confrontare. Compare al primo &quot;Aggiorna prezzi&quot; a
          mercato aperto.
        </div>
      </Card>
    );
  }

  const mossi = dati.filter((d) => Math.abs(d.dEur) > 0.005);
  const su = mossi[0];
  const giu = mossi[mossi.length - 1];

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <Label>Chi ha mosso il totale</Label>
        <span style={{ font: `400 11px ${UI}`, color: T.faint }}>variazione in € dalla chiusura precedente</span>
      </div>

      <div style={{ height: 168, marginTop: 12, marginLeft: -10 }}>
        <ResponsiveContainer>
          <BarChart data={dati} margin={{ top: 8, right: 6, bottom: 4, left: 0 }} barCategoryGap="18%">
            <XAxis dataKey="isin" hide />
            <YAxis
              width={52}
              tick={{ fill: T.faint, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => (v === 0 ? "0" : `${v > 0 ? "+" : ""}${Math.round(v / 100) / 10}k`)}
            />
            <ReferenceLine y={0} stroke={T.line} strokeWidth={1} />
            <Tooltip cursor={{ fill: T.surf2, opacity: 0.6 }} content={<Etichetta />} />
            <Bar dataKey="dEur" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {dati.map((d) => (
                <Cell key={d.isin} fill={d.dEur >= 0 ? T.pos : T.neg} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 4, font: `400 12px/1.5 ${UI}`, color: T.mut }}>
        {su && su.dEur > 0 && (
          <div>
            Sale di più: <strong style={{ color: T.ink }}>{su.nome}</strong>{" "}
            <N s={12} c={T.pos}>+{nf(su.dEur)} €</N>
          </div>
        )}
        {giu && giu.dEur < 0 && (
          <div>
            Scende di più: <strong style={{ color: T.ink }}>{giu.nome}</strong>{" "}
            <N s={12} c={T.neg}>{nf(giu.dEur)} €</N>
          </div>
        )}
        {!mossi.length && <span>Nessun movimento rilevato.</span>}
      </div>
    </Card>
  );
}

/** Tooltip: tocca o passa sopra una barra per il dettaglio del singolo titolo. */
function Etichetta({ active, payload }: { active?: boolean; payload?: { payload: Punto }[] }) {
  const p = active ? payload?.[0]?.payload : null;
  if (!p) return null;
  return (
    <div
      style={{
        background: T.surf,
        border: `1px solid ${T.line}`,
        borderRadius: 10,
        boxShadow: OMBRA,
        padding: "9px 11px",
        maxWidth: 230,
      }}
    >
      <div style={{ font: `700 12px ${UI}`, color: T.ink }}>{p.nome}</div>
      <div style={{ marginTop: 5, display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <N s={13} c={sg(p.dEur)}>
          {p.dEur >= 0 ? "+" : ""}
          {nf(p.dEur)} €
        </N>
        <N s={11} c={sg(p.dEur)}>{pc(p.dPct)}</N>
      </div>
      <div style={{ marginTop: 3, font: `400 10px ${UI}`, color: T.faint }}>peso {p.peso.toFixed(1)}% del totale</div>
    </div>
  );
}
