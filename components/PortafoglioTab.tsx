"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Attribuzione } from "./Attribuzione";
import { Btn, Card, Chip, Dato, Label, N, NA, Spark, Tag } from "./ui";
import { MACRO_COL, MONO, OMBRA, T, UI, nf, pc, sg } from "@/lib/theme";
import type { PortafoglioResponse, RigaPortafoglio } from "@/lib/api-types";

const FILTRI = ["Tutti", "Azioni", "Obbligazioni", "Monetario", "Commodities"] as const;
type Filtro = (typeof FILTRI)[number];

interface Props {
  vista: PortafoglioResponse;
  onApri: (isin: string) => void;
  ricarica: () => Promise<void>;
}

export function PortafoglioTab({ vista, onApri, ricarica }: Props) {
  const [filtro, setFiltro] = useState<Filtro>("Tutti");
  const [busy, setBusy] = useState<string | null>(null);
  const [prog, setProg] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [manuale, setManuale] = useState<Record<string, string>>({});

  const righeOrdinate = useMemo(() => [...vista.righe].sort((a, b) => b.valore_eur - a.valore_eur), [vista.righe]);
  const viste = filtro === "Tutti" ? righeOrdinate : righeOrdinate.filter((r) => r.strumento.macro === filtro);
  const serieTot = vista.snapshotSerie.map((s) => ({
    t: new Date(s.ts).toLocaleDateString("it-IT", { day: "2-digit", month: "short" }),
    v: s.totale_eur,
  }));
  const aggiornati = vista.righe.filter((r) => r.prezzo != null).length;

  async function aggiornaPrezzi() {
    setBusy("prezzi");
    setErrore(null);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.errore || "aggiornamento prezzi non riuscito.");
      if (d.falliti?.length) {
        const causa = d.dettaglioErrore ? ` Causa: ${d.dettaglioErrore}` : "";
        setErrore(`${d.falliti.length} titoli non aggiornati.${causa} (${d.falliti.join(", ")})`);
      }
      await ricarica();
    } catch (e) {
      setErrore(`Aggiornamento prezzi non riuscito: ${(e as Error).message}`);
    } finally {
      setBusy(null);
      setProg("");
    }
  }

  async function aggiornaRatingTutti() {
    setBusy("rating");
    setErrore(null);
    try {
      const res = await fetch("/api/rating/tutti", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.errore || "aggiornamento rating non riuscito.");
      if (d.falliti?.length) {
        const causa = d.dettaglioErrore ? ` Causa: ${d.dettaglioErrore}` : "";
        setErrore(`${d.falliti.length} titoli senza rating.${causa} Riprova singolarmente dal tab Titolo. (${d.falliti.join(", ")})`);
      }
      await ricarica();
    } catch (e) {
      setErrore(`Aggiornamento rating non riuscito: ${(e as Error).message}`);
    } finally {
      setBusy(null);
      setProg("");
    }
  }

  async function applicaSospetto(isin: string) {
    setBusy(`sosp:${isin}`);
    try {
      const res = await fetch("/api/prezzi/applica", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isin }) });
      if (!res.ok) throw new Error((await res.json()).errore);
      await ricarica();
    } catch (e) {
      setErrore(`Applicazione prezzo non riuscita: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function scartaSospetto(isin: string) {
    setBusy(`sosp:${isin}`);
    try {
      const res = await fetch("/api/prezzi/scarta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isin }) });
      if (!res.ok) throw new Error((await res.json()).errore);
      await ricarica();
    } catch (e) {
      setErrore(`Scarto prezzo non riuscito: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function trovaSottostante(isin: string) {
    setBusy(`map:${isin}`);
    setErrore(null);
    try {
      const res = await fetch(`/api/sottostante/${isin}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.errore);
      if (!d.sotto) setErrore(d.messaggio || `Sottostante non trovato per ${isin}.`);
      await ricarica();
    } catch (e) {
      setErrore(`Ricerca sottostante non riuscita: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function salvaManuale(isin: string) {
    const valore = manuale[isin]?.trim();
    if (!valore) return;
    try {
      const res = await fetch(`/api/sottostante/${isin}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manuale: valore }) });
      if (!res.ok) throw new Error((await res.json()).errore);
      setManuale((m) => ({ ...m, [isin]: "" }));
      await ricarica();
    } catch (e) {
      setErrore(`Salvataggio sottostante non riuscito: ${(e as Error).message}`);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* HERO */}
      <Card pad={24}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 20 }}>
          <div>
            <Label>Valore di mercato</Label>
            <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <span style={{ font: `800 40px/1 ${MONO}`, letterSpacing: "-.02em", color: T.ink, fontVariantNumeric: "tabular-nums" }}>
                {nf(vista.totale_eur)}
                <span style={{ color: T.faint, fontSize: 24 }}> €</span>
              </span>
              {vista.variazioneUltimoRefresh && <Chip v={vista.variazioneUltimoRefresh.pct} s={13} />}
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 26, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div>
                <div style={{ font: `600 9px ${UI}`, letterSpacing: ".09em", textTransform: "uppercase", color: T.faint, marginBottom: 6 }}>
                  P&amp;L complessivo
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <N s={19} w={700} c={sg(vista.pnlTotale.eur)}>
                    {vista.pnlTotale.eur >= 0 ? "+" : ""}
                    {nf(vista.pnlTotale.eur)} €
                  </N>
                  <Chip v={vista.pnlTotale.pct} s={12} />
                </div>
                <div style={{ marginTop: 5, font: `400 10px ${UI}`, color: T.faint }}>su {nf(vista.pnlTotale.carico)} € di carico</div>
              </div>
              <div>
                <div style={{ font: `600 9px ${UI}`, letterSpacing: ".09em", textTransform: "uppercase", color: T.faint, marginBottom: 6 }}>
                  P&amp;L di oggi
                </div>
                {vista.pnlGiorno.assente ? (
                  <span style={{ font: `400 12px ${UI}`, color: T.faint }}>premi Aggiorna prezzi</span>
                ) : (
                  <>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <N s={19} w={700} c={sg(vista.pnlGiorno.eur)}>
                        {vista.pnlGiorno.eur >= 0 ? "+" : ""}
                        {nf(vista.pnlGiorno.eur)} €
                      </N>
                      <Chip v={vista.pnlGiorno.pct} s={12} />
                    </div>
                    <div style={{ marginTop: 5, font: `400 10px ${UI}`, color: T.faint }}>
                      su {vista.pnlGiorno.copertura}/{vista.pnlGiorno.totali} titoli con chiusura precedente
                    </div>
                  </>
                )}
              </div>
              {vista.variazioneUltimoRefresh && (
                <div>
                  <div style={{ font: `600 9px ${UI}`, letterSpacing: ".09em", textTransform: "uppercase", color: T.faint, marginBottom: 6 }}>
                    Dall&apos;ultimo refresh
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <N s={19} w={700} c={sg(vista.variazioneUltimoRefresh.eur)}>
                      {vista.variazioneUltimoRefresh.eur >= 0 ? "+" : ""}
                      {nf(vista.variazioneUltimoRefresh.eur)} €
                    </N>
                    <Chip v={vista.variazioneUltimoRefresh.pct} s={12} />
                  </div>
                </div>
              )}
            </div>
            <div style={{ marginTop: 12, font: `500 12px ${UI}`, color: T.mut }}>
              {vista.righe.length} posizioni · {aggiornati > 0 ? `${aggiornati} prezzi disponibili` : "prezzi da caricare"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Btn variant="primary" onClick={aggiornaPrezzi} disabled={!!busy}>
              {busy === "prezzi" ? prog || "Aggiorno…" : "Aggiorna prezzi"}
            </Btn>
            <Btn variant="accent" onClick={aggiornaRatingTutti} disabled={!!busy}>
              {busy === "rating" ? prog || "Rating…" : "Aggiorna rating"}
            </Btn>
          </div>
        </div>

        {serieTot.length >= 2 && (
          <div style={{ height: 150, marginTop: 20, marginLeft: -8 }}>
            <ResponsiveContainer>
              <LineChart data={serieTot} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={T.line} strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="t" tick={{ fill: T.faint, fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis domain={["auto", "auto"]} width={46} tickFormatter={(v) => `${Math.round(v / 1000)}k`} tick={{ fill: T.faint, fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number) => `${nf(v)} €`} contentStyle={{ border: "none", borderRadius: 10, boxShadow: OMBRA, fontFamily: MONO, fontSize: 12 }} />
                <Line type="monotone" dataKey="v" stroke={T.acc} strokeWidth={2.4} dot={{ r: 3, fill: "#fff", stroke: T.acc, strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div style={{ marginTop: 22 }}>
          <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden" }}>
            {vista.gruppiMacro.map((g) => (
              <div key={g.macro} title={`${g.macro} ${g.quota_pct.toFixed(1)}%`} style={{ width: `${g.quota_pct}%`, background: MACRO_COL[g.macro] || T.mut }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 18, marginTop: 12, flexWrap: "wrap" }}>
            {vista.gruppiMacro.map((g) => (
              <div key={g.macro} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: 3, background: MACRO_COL[g.macro] || T.mut }} />
                <span style={{ font: `500 12px ${UI}`, color: T.mut }}>{g.macro}</span>
                <N s={12} w={700}>{g.quota_pct.toFixed(1)}%</N>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Attribuzione righe={vista.attribuzione} totale={vista.totale_eur} />

      {errore && <Card style={{ borderLeft: `3px solid ${T.neg}`, background: T.negBg }}><div style={{ font: `400 13px/1.6 ${UI}`, color: T.ink }}>{errore}</div></Card>}

      {vista.sospetti.length > 0 && (
        <Card style={{ borderLeft: `3px solid ${T.warn}` }}>
          <Label col={T.warn}>Prezzi bloccati — variazione anomala</Label>
          <div style={{ marginTop: 8, font: `400 13px/1.6 ${UI}`, color: T.ink, maxWidth: 640 }}>
            Questi valori si scostano oltre il 60% dal precedente. Quasi sempre significa che la ricerca ha preso uno
            strumento sbagliato o un prezzo pre-consolidamento. Non li applico senza il tuo assenso.
          </div>
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {vista.sospetti.map((s) => (
              <div key={s.isin} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 12px", background: T.warnBg, borderRadius: 9 }}>
                <div>
                  <div style={{ font: `600 13px ${UI}` }}>{s.nome}</div>
                  <div style={{ marginTop: 3 }}>
                    <N s={11} c={T.mut}>{s.vecchio.toFixed(4)} → {s.nuovo.toFixed(4)}</N>
                    <span style={{ marginLeft: 8 }}><N s={11} c={T.neg}>{pc(s.variazione, 0)}</N></span>
                  </div>
                  {s.fonte && <div style={{ marginTop: 3, font: `400 10px ${UI}`, color: T.faint }}>{s.fonte}</div>}
                </div>
                <div style={{ display: "flex", gap: 7 }}>
                  <Btn size="s" onClick={() => scartaSospetto(s.isin)} disabled={busy === `sosp:${s.isin}`}>Scarta</Btn>
                  <Btn size="s" variant="accent" onClick={() => applicaSospetto(s.isin)} disabled={busy === `sosp:${s.isin}`}>Applica</Btn>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        {FILTRI.map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            style={{
              font: `600 12px ${UI}`,
              padding: "9px 14px",
              borderRadius: 9,
              whiteSpace: "nowrap",
              cursor: "pointer",
              border: `1px solid ${filtro === f ? T.ink : T.line}`,
              background: filtro === f ? T.ink : T.surf,
              color: filtro === f ? "#fff" : T.mut,
            }}
          >
            {f}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {viste.map((r) => (
          <RigaCard
            key={r.strumento.isin}
            r={r}
            fondamentali={vista.fondamentali[r.strumento.isin] ?? null}
            onApri={onApri}
            onTrova={trovaSottostante}
            onSalvaManuale={salvaManuale}
            manualeValore={manuale[r.strumento.isin] ?? ""}
            onManualeChange={(v) => setManuale((m) => ({ ...m, [r.strumento.isin]: v }))}
            busy={busy}
          />
        ))}
      </div>
    </div>
  );
}

function RigaCard({
  r,
  fondamentali,
  onApri,
  onTrova,
  onSalvaManuale,
  manualeValore,
  onManualeChange,
  busy,
}: {
  r: RigaPortafoglio;
  fondamentali: PortafoglioResponse["fondamentali"][string] | null;
  onApri: (isin: string) => void;
  onTrova: (isin: string) => void;
  onSalvaManuale: (isin: string) => void;
  manualeValore: string;
  onManualeChange: (v: string) => void;
  busy: string | null;
}) {
  const s = r.strumento;
  const sotto = s.sottostante || fondamentali?.sotto;
  const naMotivo = s.motivo_na || fondamentali?.naMotivo;
  const puoFond = !naMotivo && !!sotto;

  return (
    <Card pad={16}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ minWidth: 210, flex: "1 1 260px" }}>
          <button onClick={() => onApri(s.isin)} style={{ border: "none", background: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
            <div style={{ font: `700 15px ${UI}`, color: T.ink }}>{s.nome}</div>
          </button>
          <div style={{ marginTop: 6, display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
            <Tag col={MACRO_COL[s.macro] || T.mut}>{s.macro}</Tag>
            <span style={{ font: `500 10px ${UI}`, color: T.faint }}>{s.classe}</span>
            <N s={10} c={T.faint} w={400}>{s.isin}</N>
          </div>
          <div style={{ marginTop: 8, font: `400 12px ${UI}`, color: T.mut }}>
            {sotto ? (
              <>
                Sottostante: <span style={{ color: T.ink, fontWeight: 600 }}>{sotto}</span>
              </>
            ) : (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <Btn size="s" variant="accent" onClick={() => onTrova(s.isin)} disabled={busy === `map:${s.isin}`}>
                  {busy === `map:${s.isin}` ? "Cerco…" : "Trova sottostante"}
                </Btn>
                <input
                  placeholder="…o scrivilo tu"
                  value={manualeValore}
                  onChange={(e) => onManualeChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSalvaManuale(s.isin);
                  }}
                  onBlur={() => manualeValore.trim() && onSalvaManuale(s.isin)}
                  style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.line}`, font: `500 11px ${UI}`, width: 150, background: T.surf }}
                />
              </div>
            )}
          </div>
        </div>

        <Spark dati={r.serie.map((x) => ({ v: x.prezzo }))} col={(r.var_refresh_pct ?? 0) >= 0 ? T.pos : T.neg} />

        <div style={{ textAlign: "right", minWidth: 130 }}>
          <N s={17} w={700}>{nf(r.valore_eur)} €</N>
          <div style={{ marginTop: 5, font: `500 11px ${UI}`, color: T.faint }}>{r.peso_pct.toFixed(1)}% del totale</div>
          <div style={{ marginTop: 8, display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <span title="Variazione dal prezzo di carico"><Chip v={r.var_carico_pct} s={11} /></span>
            {r.var_refresh_pct != null && <span title="Variazione dall'ultimo aggiornamento"><Chip v={r.var_refresh_pct} s={11} /></span>}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.line}`, display: "flex", gap: 26, flexWrap: "wrap" }}>
        {!puoFond ? (
          <div style={{ font: `400 12px ${UI}`, color: T.faint }}>
            Rating e utili: <NA motivo={naMotivo} /> {naMotivo ? `— ${naMotivo}` : ""}
          </div>
        ) : (
          <>
            <Dato l="Rating" v={fondamentali?.rating} />
            <Dato l="PT medio" v={fondamentali?.pt_medio != null ? `${fondamentali.valuta === "USD" ? "$" : "€"}${Number(fondamentali.pt_medio).toFixed(2)}` : null} />
            <Dato l="Upside" v={fondamentali?.upside_medio != null ? pc(fondamentali.upside_medio, 1) : null} col={fondamentali?.upside_medio != null ? sg(fondamentali.upside_medio) : undefined} />
            <Dato l="Prossimi utili" v={fondamentali?.prossimi_utili} />
          </>
        )}
        {r.ytm != null && (
          <>
            <Dato l="YTM" v={`${r.ytm.toFixed(2)}%`} />
            <Dato l="Duration" v={r.duration != null ? r.duration.toFixed(2) : null} />
          </>
        )}
      </div>
    </Card>
  );
}
