"use client";

import { useEffect, useRef, useState } from "react";
import { Report } from "./Report";
import { Btn, Card, Chip, Dato, ErroreCard, Label, N } from "./ui";
import { MONO, T, UI } from "@/lib/theme";
import type { AnalisiReport, CallRicevuta } from "@/lib/types";

/** Tab «Analisi» — §7.3: ISIN libero + track record delle call ricevute (§9). */
export function AnalisiTab() {
  const [isin, setIsin] = useState("");
  const [isinCorr, setIsinCorr] = useState<string | null>(null);
  const [report, setReport] = useState<AnalisiReport | null>(null);
  const [calls, setCalls] = useState<CallRicevuta[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const inputFile = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch("/api/calls")
      .then((r) => r.json())
      .then((d) => setCalls(d.calls || []))
      .catch(() => {});
  }, []);

  async function analizza() {
    if (!isin.trim()) return;
    const target = isin.trim().toUpperCase();
    setBusy("analisi");
    setErrore(null);
    setIsinCorr(target);
    try {
      const res = await fetch(`/api/analisi/${target}`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.errore);
      setReport(d as AnalisiReport);
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function caricaPdf(file: File) {
    setBusy("pdf");
    setErrore(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/call/pdf", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.errore);
      setCalls((c) => [...c, d as CallRicevuta]);
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function verifica(c: CallRicevuta) {
    setBusy(`ver:${c.id}`);
    setErrore(null);
    try {
      const res = await fetch(`/api/call/${c.id}/verifica`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.errore);
      setCalls((cs) => cs.map((x) => (x.id === c.id ? (d as CallRicevuta) : x)));
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const fatte = calls.filter((c) => c.rendimento != null && c.benchmark != null);
  const battuti = fatte.filter((c) => (c.rendimento as number) > (c.benchmark as number)).length;
  const positivi = fatte.filter((c) => (c.rendimento as number) > 0).length;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card pad={22}>
        <Label>Analisi su ISIN</Label>
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <input
            value={isin}
            onChange={(e) => setIsin(e.target.value.toUpperCase().trim())}
            onKeyDown={(e) => {
              if (e.key === "Enter") analizza();
            }}
            placeholder="US5738741041"
            style={{ flex: "1 1 220px", padding: "13px 14px", borderRadius: 10, border: `1px solid ${T.line}`, font: `600 14px ${MONO}`, letterSpacing: ".05em", background: T.surf, color: T.ink }}
          />
          <Btn variant="primary" onClick={analizza} disabled={!!busy || !isin}>
            {busy === "analisi" ? "Analizzo…" : "Analizza"}
          </Btn>
        </div>
        <div style={{ marginTop: 12, font: `400 12px/1.6 ${UI}`, color: T.mut }}>
          Su certificati e ETP l&apos;analisi va sul sottostante. Il giudizio è il consenso degli analisti con la sua dispersione, non una raccomandazione.
        </div>
      </Card>

      {errore && <ErroreCard messaggio={errore} />}

      {report && isinCorr && <Report r={report} />}

      <Card pad={22}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Label>Track record delle call ricevute</Label>
          <div>
            <input
              ref={inputFile}
              type="file"
              accept="application/pdf"
              style={{ display: "none" }}
              onChange={(e) => e.target.files?.[0] && caricaPdf(e.target.files[0])}
            />
            <Btn variant="accent" size="s" onClick={() => inputFile.current?.click()} disabled={busy === "pdf"}>
              {busy === "pdf" ? "Leggo il PDF…" : "Carica report PDF"}
            </Btn>
          </div>
        </div>

        {calls.length === 0 ? (
          <div style={{ marginTop: 16, font: `400 13px/1.75 ${UI}`, color: T.mut, maxWidth: 580 }}>
            Nessuna call registrata. Carica un report: estraggo titolo, direzione, target, orizzonte e la data del
            report, che diventa il t0. Registra <em>tutte</em> le call che ricevi, anche quelle che non segui — se
            carichi solo quelle che ti hanno convinto, il tasso misura il tuo filtro.
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 18, margin: "18px 0" }}>
              <div>
                <Label>Call registrate</Label>
                <div style={{ marginTop: 8 }}>
                  <N s={26} w={700}>{calls.length}</N>
                </div>
              </div>
              <div>
                <Label>Batte il benchmark</Label>
                <div style={{ marginTop: 8 }}>
                  <N s={26} w={700} c={T.acc}>{fatte.length ? Math.round((battuti / fatte.length) * 100) : 0}%</N>
                </div>
                <div style={{ font: `400 11px ${UI}`, color: T.faint, marginTop: 4 }}>su {fatte.length} verificate</div>
              </div>
              <div>
                <Label>Rendimento positivo</Label>
                <div style={{ marginTop: 8 }}>
                  <N s={26} w={700} c={T.mut}>{fatte.length ? Math.round((positivi / fatte.length) * 100) : 0}%</N>
                </div>
                <div style={{ font: `400 11px ${UI}`, color: T.faint, marginTop: 4 }}>metrica di controllo</div>
              </div>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {calls.map((c) => {
                const ex = c.rendimento != null && c.benchmark != null ? c.rendimento - c.benchmark : null;
                return (
                  <div key={c.id} style={{ padding: "14px 16px", background: T.surf2, borderRadius: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ font: `700 14px ${UI}` }}>
                          {c.titolo} <span style={{ color: T.faint, fontWeight: 500 }}>{c.ticker}</span>
                        </div>
                        <div style={{ marginTop: 5, font: `500 11px ${UI}`, color: T.mut }}>
                          {c.data_report} · {c.direzione}
                          {c.strumento ? ` · ${c.strumento}` : ""}
                          {c.target ? ` · target ${c.target}` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ font: `600 9px ${UI}`, letterSpacing: ".09em", textTransform: "uppercase", color: T.faint }}>Extra</div>
                          <div style={{ marginTop: 4 }}>
                            <Chip v={ex} s={12} />
                          </div>
                        </div>
                        <Btn size="s" onClick={() => verifica(c)} disabled={!!busy}>
                          {busy === `ver:${c.id}` ? "Verifico…" : "Verifica"}
                        </Btn>
                      </div>
                    </div>
                    {c.rendimento != null && (
                      <div style={{ marginTop: 10, display: "flex", gap: 22, flexWrap: "wrap" }}>
                        <Dato l="Rendimento" v={c.rendimento != null ? `${c.rendimento >= 0 ? "+" : ""}${c.rendimento.toFixed(1)}%` : null} col={c.rendimento != null && c.rendimento >= 0 ? T.pos : T.neg} />
                        <Dato l="Benchmark" v={c.benchmark != null ? `${c.benchmark >= 0 ? "+" : ""}${c.benchmark.toFixed(1)}%` : null} />
                        <Dato l="Indice" v={c.benchmark_nome} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 16, font: `400 12px/1.75 ${UI}`, color: T.faint, maxWidth: 640 }}>
              L&apos;extra-rendimento è la colonna che conta: il rendimento nudo, in un mercato in salita, misura il mercato.
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
