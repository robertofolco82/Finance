"use client";

import { useCallback, useEffect, useState } from "react";
import { PortafoglioTab } from "@/components/PortafoglioTab";
import { TitoloTab } from "@/components/TitoloTab";
import { ErroreCard, Spinner } from "@/components/ui";
import { MONO, T, UI } from "@/lib/theme";
import type { PortafoglioResponse } from "@/lib/api-types";

const TABS = [
  ["portafoglio", "Portafoglio"],
  ["titolo", "Titolo"],
] as const;
type TabKey = (typeof TABS)[number][0];

export default function Page() {
  const [tab, setTab] = useState<TabKey>("portafoglio");
  const [vista, setVista] = useState<PortafoglioResponse | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  const ricarica = useCallback(async () => {
    try {
      const res = await fetch("/api/portafoglio");
      const d = await res.json();
      if (!res.ok) throw new Error(d.errore);
      const v = d as PortafoglioResponse;
      setVista(v);
      setErrore(null);
      setSel((corrente) => corrente ?? v.righe[0]?.strumento.isin ?? null);
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setCaricamento(false);
    }
  }, []);

  useEffect(() => {
    ricarica();
  }, [ricarica]);

  const elenco = vista?.righe.map((r) => ({ isin: r.strumento.isin, nome: r.strumento.nome })) ?? [];
  const ultimoTs = vista?.snapshotSerie.length ? vista.snapshotSerie[vista.snapshotSerie.length - 1]?.ts : null;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.ink }}>
      <header
        style={{
          background: "rgba(245,246,249,.88)",
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${T.line}`,
          position: "sticky",
          top: 0,
          zIndex: 30,
        }}
      >
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "16px 20px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ font: `800 16px ${UI}`, letterSpacing: "-.02em" }}>
              Portafoglio<span style={{ color: T.acc }}>.</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ font: `500 10px ${MONO}`, color: T.faint }}>
                {ultimoTs ? new Date(ultimoTs).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
              </div>
            </div>
          </div>
          <nav style={{ display: "flex", gap: 4, marginTop: 14 }}>
            {TABS.map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                style={{
                  font: `600 12px ${UI}`,
                  padding: "11px 15px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: tab === k ? T.ink : T.mut,
                  borderBottom: tab === k ? `2px solid ${T.acc}` : "2px solid transparent",
                }}
              >
                {l}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "20px 20px 72px" }}>
        {caricamento && !vista && <Spinner testo="Carico…" />}
        {errore && !vista && <ErroreCard messaggio={errore} />}
        {vista && tab === "portafoglio" && (
          <PortafoglioTab
            vista={vista}
            onApri={(isin) => {
              setSel(isin);
              setTab("titolo");
            }}
            ricarica={ricarica}
          />
        )}
        {vista && tab === "titolo" && sel && <TitoloTab isin={sel} elenco={elenco} onSeleziona={setSel} />}
      </main>
    </div>
  );
}
