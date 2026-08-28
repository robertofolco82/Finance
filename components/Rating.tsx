"use client";

import { N } from "./ui";
import { MONO, T, UI } from "@/lib/theme";

const ETICHETTA: Record<string, string> = {
  "strong buy": "Acquisto forte",
  buy: "Acquisto",
  hold: "Mantieni",
  sell: "Vendita",
  "strong sell": "Vendita forte",
};

function coloreRating(rating: string): string {
  const s = rating.toLowerCase();
  if (s.includes("buy")) return T.pos;
  if (s.includes("sell")) return T.neg;
  return T.warn;
}

/**
 * Consenso analisti — §7.2. La fonte gratuita espone il giudizio sintetico e il
 * numero di analisti, non la ripartizione buy/hold/sell: la ciambella del
 * prototipo non è replicabile senza inventare i conteggi, quindi si mostra il
 * dato che esiste davvero e nient'altro.
 */
export function ConsensoAnalisti({ rating, analisti }: { rating?: string | null; analisti?: number | null }) {
  if (!rating) return null;
  const col = coloreRating(rating);
  const etichetta = ETICHETTA[rating.toLowerCase()] ?? rating;
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
      <span
        style={{
          font: `700 15px ${UI}`,
          color: col,
          background: `${col}14`,
          border: `1px solid ${col}33`,
          padding: "10px 14px",
          borderRadius: 0,
        }}
      >
        {etichetta}
      </span>
      {analisti != null && (
        <span style={{ font: `400 12px ${UI}`, color: T.mut }}>
          su <N s={13} w={700}>{analisti}</N> analisti
        </span>
      )}
    </div>
  );
}

interface RigaTarget {
  etichetta: string;
  prezzo?: number | null;
  upside?: number | null;
  evidenzia?: boolean;
}

const SIMBOLO: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", KRW: "₩" };

/** Barre orizzontali dei price target, larghezza proporzionale al valore (§7.2). */
export function BarreTarget({
  ptMin,
  ptMedio,
  ptMediano,
  ptMax,
  upMin,
  upMedio,
  upMax,
  valuta,
}: {
  ptMin?: number | null;
  ptMedio?: number | null;
  ptMediano?: number | null;
  ptMax?: number | null;
  upMin?: number | null;
  upMedio?: number | null;
  upMax?: number | null;
  valuta?: string | null;
}) {
  const righe: RigaTarget[] = [
    { etichetta: "Massimo", prezzo: ptMax, upside: upMax },
    { etichetta: "Medio", prezzo: ptMedio, upside: upMedio, evidenzia: true },
    { etichetta: "Mediano", prezzo: ptMediano },
    { etichetta: "Minimo", prezzo: ptMin, upside: upMin },
  ].filter((r) => r.prezzo != null);
  if (righe.length === 0) return null;

  const vs = SIMBOLO[valuta ?? ""] ?? "";
  const max = Math.max(...righe.map((r) => r.prezzo as number)) || 1;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {righe.map((r) => (
        <div key={r.etichetta}>
          <div style={{ font: `500 11px ${UI}`, color: T.mut, marginBottom: 4 }}>{r.etichetta}</div>
          <div style={{ height: 30, background: T.surf2, borderRadius: 0, overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.max(22, ((r.prezzo as number) / max) * 100)}%`,
                height: "100%",
                background: r.evidenzia ? T.accSolid : `${T.accSolid}99`,
                borderRadius: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                padding: "0 10px",
              }}
            >
              <span style={{ font: `600 12px ${MONO}`, color: T.bg, whiteSpace: "nowrap" }}>
                {vs}
                {Number(r.prezzo).toLocaleString("it-IT", { maximumFractionDigits: 2 })}
                {r.upside != null ? ` (${r.upside >= 0 ? "+" : ""}${r.upside.toFixed(1)}%)` : ""}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
