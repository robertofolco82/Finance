"use client";

import { useState } from "react";
import { N, Card, Label } from "./ui";
import { T, UI, nf, pc, sg } from "@/lib/theme";
import type { RigaAttribuzione } from "@/lib/calc";

/** §5.6: barra unica, larghezza = peso, intensità colore = contributo al movimento. */
export function Attribuzione({ righe, totale }: { righe: RigaAttribuzione[]; totale: number }) {
  const [h, setH] = useState<RigaAttribuzione | null>(null);
  if (righe.length === 0 || totale === 0) return null;

  // Nessuno snapshot precedente con cui confrontare (primo avvio, o subito dopo un
  // refresh completamente fallito): ogni riga avrebbe dPct null. Un placeholder è
  // più onesto di una barra a intensità 0 che sembra solo "rotta".
  const nessunoStorico = righe.every((r) => r.dPct == null);
  if (nessunoStorico) {
    return (
      <Card>
        <Label>Chi ha mosso il totale</Label>
        <div style={{ marginTop: 10, font: `400 13px/1.6 ${UI}`, color: T.mut }}>
          Ancora nessuno storico da confrontare. Compare qui a partire dal secondo "Aggiorna prezzi".
        </div>
      </Card>
    );
  }

  const ord = [...righe].sort((a, b) => Math.abs(b.dEur) - Math.abs(a.dEur));
  const maxAbs = Math.max(...ord.map((r) => Math.abs(r.dEur)), 1);

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <Label>Chi ha mosso il totale</Label>
        <span style={{ font: `400 11px ${UI}`, color: T.faint }}>larghezza = peso · intensità = contributo</span>
      </div>
      <div style={{ display: "flex", height: 40, marginTop: 14, borderRadius: 8, overflow: "hidden", background: T.surf2 }}>
        {ord.map((r) => {
          const w = (r.valore_eur / totale) * 100;
          const intensita = Math.min(1, Math.abs(r.dEur) / maxAbs);
          const base = r.dEur > 0 ? T.pos : r.dEur < 0 ? T.neg : T.line;
          return (
            <div
              key={r.isin}
              onMouseEnter={() => setH(r)}
              onMouseLeave={() => setH(null)}
              style={{ width: `${w}%`, background: base, opacity: 0.14 + intensita * 0.86, borderRight: "1px solid #fff", cursor: "default" }}
            />
          );
        })}
      </div>
      <div style={{ marginTop: 12, minHeight: 20, font: `400 12px ${UI}`, color: T.mut }}>
        {h ? (
          <>
            <strong style={{ color: T.ink }}>{h.nome}</strong> · peso {((h.valore_eur / totale) * 100).toFixed(1)}% ·{" "}
            <N s={12} c={sg(h.dEur)}>{pc(h.dPct)}</N> · <N s={12} c={sg(h.dEur)}>{nf(h.dEur)} €</N>
          </>
        ) : (
          "Passa sopra un segmento per il dettaglio."
        )}
      </div>
    </Card>
  );
}
