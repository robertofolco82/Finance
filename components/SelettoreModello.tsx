"use client";

import { useEffect, useState } from "react";
import { MODELLI_DISPONIBILI } from "@/lib/modelli";
import { T, UI } from "@/lib/theme";

const OPZIONE_DEFAULT = "__default__";

/**
 * Scelta del modello direttamente in dashboard: ha priorità su ANTHROPIC_MODEL
 * (Vercel), che resta solo la scelta di partenza finché qui non si seleziona nulla.
 */
export function SelettoreModello() {
  const [valore, setValore] = useState<string>(OPZIONE_DEFAULT);
  const [caricato, setCaricato] = useState(false);
  const [salvataggio, setSalvataggio] = useState(false);

  useEffect(() => {
    fetch("/api/impostazioni")
      .then((r) => r.json())
      .then((d) => setValore(d.modello ?? OPZIONE_DEFAULT))
      .catch(() => {})
      .finally(() => setCaricato(true));
  }, []);

  async function cambia(nuovo: string) {
    setValore(nuovo);
    setSalvataggio(true);
    try {
      await fetch("/api/impostazioni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modello: nuovo === OPZIONE_DEFAULT ? null : nuovo }),
      });
    } finally {
      setSalvataggio(false);
    }
  }

  if (!caricato) return null;

  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ font: `500 10px ${UI}`, color: T.faint, whiteSpace: "nowrap" }}>Modello</span>
      <select
        value={valore}
        onChange={(e) => cambia(e.target.value)}
        title="Modello usato per prezzi, rating, analisi e chat"
        style={{
          font: `600 11px ${UI}`,
          padding: "5px 8px",
          borderRadius: 7,
          border: `1px solid ${T.line}`,
          background: T.surf,
          color: T.ink,
          cursor: "pointer",
          opacity: salvataggio ? 0.6 : 1,
        }}
      >
        <option value={OPZIONE_DEFAULT}>Predefinito</option>
        {MODELLI_DISPONIBILI.map((m) => (
          <option key={m.id} value={m.id} title={m.descrizione}>
            {m.nome}
          </option>
        ))}
      </select>
    </label>
  );
}
