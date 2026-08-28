"use client";

import { useMemo, useRef, useState } from "react";
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

interface RisultatoImportXls {
  riallineati: string[];
  invariati: string[];
  nonRiconosciuti: string[];
  assenti: string[];
}

export function PortafoglioTab({ vista, onApri, ricarica }: Props) {
  const [filtro, setFiltro] = useState<Filtro>("Tutti");
  const [busy, setBusy] = useState<string | null>(null);
  const [prog, setProg] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [manuale, setManuale] = useState<Record<string, string>>({});
  const [risultatoImport, setRisultatoImport] = useState<RisultatoImportXls | null>(null);
  const [prezzoManuale, setPrezzoManuale] = useState<Record<string, string>>({});
  const inputXls = useRef<HTMLInputElement | null>(null);

  const righeOrdinate = useMemo(() => [...vista.righe].sort((a, b) => b.valore_eur - a.valore_eur), [vista.righe]);
  const viste = filtro === "Tutti" ? righeOrdinate : righeOrdinate.filter((r) => r.strumento.macro === filtro);
  const serieTot = vista.snapshotSerie.map((s) => ({
    t: new Date(s.ts).toLocaleDateString("it-IT", { day: "2-digit", month: "short" }),
    v: s.totale_eur,
  }));
  const aggiornati = vista.righe.filter((r) => r.prezzo != null).length;

  // La base del P&L giornaliero può essere di qualche giorno fa, se non aggiorni
  // ogni giorno. Chiamarlo comunque "di oggi" sarebbe fuorviante su un dato
  // finanziario: sopra i 3 giorni l'intestazione dice esplicitamente da quando misura.
  const giorniDallaBase = vista.dataRiferimentoPnl
    ? Math.round((Date.now() - new Date(vista.dataRiferimentoPnl).getTime()) / 86400000)
    : 0;
  const baseRecente = giorniDallaBase <= 3;
  const titoloPnlGiorno = baseRecente
    ? "P&L di oggi"
    : `Dalla chiusura del ${new Date(vista.dataRiferimentoPnl as string).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}`;

  /**
   * Orchestra il refresh dal browser: un lotto per richiesta HTTP, in parallelo,
   * poi un unico salvataggio. Il browser non ha il limite di durata che hanno le
   * funzioni Vercel, quindi nessuna singola richiesta può più essere troncata a
   * metà (che è ciò che produceva la pagina d'errore non-JSON).
   */
  async function aggiornaPrezzi() {
    setBusy("prezzi");
    setErrore(null);
    try {
      const resConteggio = await fetch("/api/refresh/lotto");
      const conteggio = await resConteggio.json();
      if (!resConteggio.ok) throw new Error(conteggio.errore || "non riesco a preparare l'aggiornamento.");
      const totale: number = conteggio.totaleLotti;

      let completati = 0;
      setProg(`0/${totale}`);
      const esiti = await Promise.all(
        Array.from({ length: totale }, async (_, indice) => {
          try {
            const res = await fetch("/api/refresh/lotto", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ indice }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.errore || `lotto ${indice + 1} non riuscito`);
            return d as { raccolti: unknown[]; falliti: string[]; errore?: string };
          } catch (e) {
            return { raccolti: [], falliti: [], errore: (e as Error).message };
          } finally {
            completati++;
            setProg(`${completati}/${totale}`);
          }
        })
      );

      const raccolti = esiti.flatMap((e) => e.raccolti);
      const falliti = esiti.flatMap((e) => e.falliti);
      const dettaglioErrore = esiti.find((e) => e.errore)?.errore;

      setProg("salvo…");
      const resSalva = await fetch("/api/refresh/salva", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raccolti, falliti, dettaglioErrore }),
      });
      const d = await resSalva.json();
      if (!resSalva.ok) throw new Error(d.errore || "salvataggio non riuscito.");

      if (d.falliti?.length) {
        const causa = d.dettaglioErrore ? ` Causa: ${d.dettaglioErrore}` : "";
        setErrore(`${d.aggiornati} prezzi aggiornati, ${d.falliti.length} non trovati.${causa} (${d.falliti.join(", ")})`);
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

  /** Prezzo digitato a mano per gli strumenti che nessuna fonte gratuita copre. */
  async function salvaPrezzoManuale(isin: string) {
    const grezzo = prezzoManuale[isin]?.trim().replace(",", ".");
    const prezzo = Number(grezzo);
    if (!grezzo || !Number.isFinite(prezzo) || prezzo <= 0) {
      setErrore(`Prezzo non valido per ${isin}.`);
      return;
    }
    setBusy(`man:${isin}`);
    setErrore(null);
    try {
      const res = await fetch("/api/prezzi/manuale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isin, prezzo }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.errore);
      if (d.quarantena > 0) {
        setErrore(`Prezzo di ${isin} messo in quarantena: si scosta oltre il 60% dal precedente. Confermalo qui sotto se è corretto.`);
      }
      setPrezzoManuale((m) => ({ ...m, [isin]: "" }));
      await ricarica();
    } catch (e) {
      setErrore(`Salvataggio prezzo non riuscito: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function importaXls(file: File) {
    setBusy("xls");
    setErrore(null);
    setRisultatoImport(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/portafoglio/importa-xls", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.errore);
      setRisultatoImport(d as RisultatoImportXls);
      await ricarica();
    } catch (e) {
      setErrore(`Import xls non riuscito: ${(e as Error).message}`);
    } finally {
      setBusy(null);
      if (inputXls.current) inputXls.current.value = "";
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
                  {titoloPnlGiorno}
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
                    <div style={{ marginTop: 5, font: `400 10px/1.5 ${UI}`, color: T.faint }}>
                      su {vista.pnlGiorno.copertura}/{vista.pnlGiorno.totali} titoli
                      {vista.dataRiferimentoPnl && baseRecente
                        ? `, rispetto al ${new Date(vista.dataRiferimentoPnl).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}`
                        : ""}
                      {/* Un titolo che oggi non ha scambiato non ha un prezzo nuovo, quindi non
                          ha un movimento di giornata: entra nel totale ma non nel P&L di oggi. */}
                      {vista.pnlGiorno.copertura < vista.pnlGiorno.totali && (
                        <>
                          <br />
                          {vista.pnlGiorno.totali - vista.pnlGiorno.copertura} non hanno ancora scambiato oggi
                        </>
                      )}
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
            <input
              ref={inputXls}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: "none" }}
              onChange={(e) => e.target.files?.[0] && importaXls(e.target.files[0])}
            />
            <Btn onClick={() => inputXls.current?.click()} disabled={!!busy} title="Carica un export con ISIN, quantità e PMC per riallineare le posizioni">
              {busy === "xls" ? "Importo…" : "Importa xls"}
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
                <Tooltip formatter={(v: number) => `${nf(v)} €`} contentStyle={{ border: `1px solid ${T.line}`, borderRadius: 0, boxShadow: OMBRA, fontFamily: MONO, fontSize: 12, background: T.surf }} />
                <Line type="monotone" dataKey="v" stroke={T.accSolid} strokeWidth={2.4} dot={{ r: 3, fill: T.bg, stroke: T.accSolid, strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div style={{ marginTop: 22 }}>
          <div style={{ display: "flex", height: 10, borderRadius: 0, overflow: "hidden" }}>
            {vista.gruppiMacro.map((g) => (
              <div key={g.macro} title={`${g.macro} ${g.quota_pct.toFixed(1)}%`} style={{ width: `${g.quota_pct}%`, background: MACRO_COL[g.macro] || T.mut }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 18, marginTop: 12, flexWrap: "wrap" }}>
            {vista.gruppiMacro.map((g) => (
              <div key={g.macro} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: 0, background: MACRO_COL[g.macro] || T.mut }} />
                <span style={{ font: `500 12px ${UI}`, color: T.mut }}>{g.macro}</span>
                <N s={12} w={700}>{g.quota_pct.toFixed(1)}%</N>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Attribuzione righe={vista.attribuzione} totale={vista.totale_eur} />

      {errore && <Card style={{ background: T.negBg }}><div style={{ font: `400 13px/1.6 ${UI}`, color: T.ink }}>{errore}</div></Card>}

      {risultatoImport && (
        <Card style={{ background: T.accBg }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <Label col={T.acc}>Import xls completato</Label>
            <button
              onClick={() => setRisultatoImport(null)}
              style={{ border: "none", background: "none", cursor: "pointer", color: T.faint, font: `600 10px ${UI}`, padding: 0, textDecoration: "underline" }}
            >
              chiudi
            </button>
          </div>
          <div style={{ marginTop: 10, display: "grid", gap: 6, font: `400 13px/1.6 ${UI}`, color: T.ink }}>
            {risultatoImport.riallineati.length > 0 && (
              <div><strong style={{ color: T.pos }}>{risultatoImport.riallineati.length} riallineate</strong>: {risultatoImport.riallineati.join(", ")}</div>
            )}
            {risultatoImport.invariati.length > 0 && (
              <div style={{ color: T.mut }}>{risultatoImport.invariati.length} invariate (già coerenti con il file)</div>
            )}
            {risultatoImport.nonRiconosciuti.length > 0 && (
              <div><strong style={{ color: T.warn }}>{risultatoImport.nonRiconosciuti.length} non riconosciute</strong> — ISIN assenti dall'anagrafica, vanno aggiunte prima: {risultatoImport.nonRiconosciuti.join(", ")}</div>
            )}
            {risultatoImport.assenti.length > 0 && (
              <div><strong style={{ color: T.warn }}>{risultatoImport.assenti.length} assenti dal file</strong> ma presenti in portafoglio — verifica se le hai vendute del tutto: {risultatoImport.assenti.join(", ")}</div>
            )}
            {risultatoImport.riallineati.length === 0 &&
              risultatoImport.nonRiconosciuti.length === 0 &&
              risultatoImport.assenti.length === 0 && <div style={{ color: T.mut }}>Nessuna modifica: il file coincide con lo stato attuale.</div>}
          </div>
        </Card>
      )}

      {vista.sospetti.length > 0 && (
        <Card style={{ background: T.warnBg }}>
          <Label col={T.warn}>Prezzi bloccati — variazione anomala</Label>
          <div style={{ marginTop: 8, font: `400 13px/1.6 ${UI}`, color: T.ink, maxWidth: 640 }}>
            Questi valori si scostano oltre il 60% dal precedente. Quasi sempre significa che la ricerca ha preso uno
            strumento sbagliato o un prezzo pre-consolidamento. Non li applico senza il tuo assenso.
          </div>
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {vista.sospetti.map((s) => (
              <div key={s.isin} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 12px", background: T.warnBg, borderRadius: 0 }}>
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
              borderRadius: 0,
              whiteSpace: "nowrap",
              cursor: "pointer",
              border: `1px solid ${filtro === f ? T.accSolid : T.line}`,
              background: filtro === f ? T.accSolid : T.surf,
              color: filtro === f ? T.bg : T.mut,
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
            prezzoManualeValore={prezzoManuale[r.strumento.isin] ?? ""}
            onPrezzoManualeChange={(v) => setPrezzoManuale((m) => ({ ...m, [r.strumento.isin]: v }))}
            onSalvaPrezzoManuale={salvaPrezzoManuale}
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
  prezzoManualeValore,
  onPrezzoManualeChange,
  onSalvaPrezzoManuale,
}: {
  r: RigaPortafoglio;
  fondamentali: PortafoglioResponse["fondamentali"][string] | null;
  onApri: (isin: string) => void;
  onTrova: (isin: string) => void;
  onSalvaManuale: (isin: string) => void;
  manualeValore: string;
  onManualeChange: (v: string) => void;
  busy: string | null;
  prezzoManualeValore: string;
  onPrezzoManualeChange: (v: string) => void;
  onSalvaPrezzoManuale: (isin: string) => void;
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
                  style={{ padding: "7px 10px", borderRadius: 0, border: `1px solid ${T.line}`, font: `500 11px ${UI}`, width: 150, background: T.surf }}
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

      {s.fonte_prezzo === "manuale" && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            background: T.warnBg,
            borderRadius: 0,
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span style={{ font: `400 12px ${UI}`, color: T.ink, flex: "1 1 240px" }}>
            Nessuna fonte gratuita quota questo strumento: il prezzo va inserito a mano.
          </span>
          <input
            value={prezzoManualeValore}
            onChange={(e) => onPrezzoManualeChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSalvaPrezzoManuale(s.isin);
            }}
            inputMode="decimal"
            placeholder={r.prezzo != null ? String(r.prezzo) : "prezzo"}
            style={{
              width: 110,
              padding: "8px 10px",
              borderRadius: 0,
              border: `1px solid ${T.line}`,
              font: `600 12px ${MONO}`,
              background: T.surf,
              color: T.ink,
            }}
          />
          <Btn size="s" variant="accent" onClick={() => onSalvaPrezzoManuale(s.isin)} disabled={busy === `man:${s.isin}`}>
            {busy === `man:${s.isin}` ? "Salvo…" : "Salva prezzo"}
          </Btn>
        </div>
      )}

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
