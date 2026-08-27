"use client";

import { useCallback, useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarreTarget, ConsensoAnalisti } from "./Rating";
import { Btn, Card, ErroreCard, Label, N, Spinner, Tag } from "./ui";
import { CLASSE_COL, MONO, OMBRA, T, UI } from "@/lib/theme";
import type { TitoloResponse } from "@/lib/api-types";

interface Props {
  isin: string;
  elenco: { isin: string; nome: string }[];
  onSeleziona: (isin: string) => void;
}

export function TitoloTab({ isin, elenco, onSeleziona }: Props) {
  const [dati, setDati] = useState<TitoloResponse | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = useCallback(async () => {
    setCaricamento(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/titolo/${isin}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.errore);
      setDati(d as TitoloResponse);
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setCaricamento(false);
    }
  }, [isin]);

  useEffect(() => {
    carica();
  }, [carica]);

  async function aggiornaRating() {
    setBusy(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/rating/${isin}`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.errore);
      await carica();
    } catch (e) {
      setErrore(`Rating non recuperato: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (caricamento && !dati) return <Spinner testo="Carico…" />;
  if (!dati) return errore ? <ErroreCard messaggio={errore} /> : null;

  const s = dati.strumento;
  const f = dati.fondamentali;
  const sotto = f?.sotto || s.sottostante;
  const naMotivo = s.motivo_na || f?.naMotivo;
  const puoFond = s.analizzabile && !naMotivo && !!sotto;
  const serie = dati.serie.map((x) => ({
    t: new Date(x.data).toLocaleDateString("it-IT", { day: "2-digit", month: "short" }),
    v: x.prezzo,
  }));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card pad={22}>
        <Label>Titolo</Label>
        <select
          value={isin}
          onChange={(e) => onSeleziona(e.target.value)}
          style={{
            width: "100%",
            marginTop: 10,
            padding: "13px 14px",
            borderRadius: 10,
            border: `1px solid ${T.line}`,
            font: `600 14px ${UI}`,
            background: T.surf,
            color: T.ink,
            cursor: "pointer",
          }}
        >
          {elenco.map((x) => (
            <option key={x.isin} value={x.isin}>
              {x.nome} — {x.isin}
            </option>
          ))}
        </select>

        <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div style={{ font: `800 24px/1.15 ${UI}`, color: T.ink }}>{s.nome}</div>
            <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Tag col={CLASSE_COL[s.classe] || T.acc}>{s.classe}</Tag>
              <span style={{ font: `500 12px ${UI}`, color: T.mut }}>
                {s.mercato} · {s.valuta}
              </span>
            </div>
            {sotto && (
              <div style={{ marginTop: 10, font: `400 13px ${UI}`, color: T.mut }}>
                Sottostante: <strong style={{ color: T.ink }}>{sotto}</strong>
              </div>
            )}
            {s.nota && (
              <div style={{ marginTop: 10, padding: "10px 12px", background: T.surf2, borderRadius: 9, font: `400 12px/1.6 ${UI}`, color: T.mut, maxWidth: 520 }}>
                {s.nota}
              </div>
            )}
          </div>
          <Btn variant="accent" onClick={aggiornaRating} disabled={busy || !puoFond} title={!puoFond ? naMotivo || "" : ""}>
            {busy ? "Cerco…" : "Aggiorna rating"}
          </Btn>
        </div>
        {!puoFond && naMotivo && (
          <div style={{ marginTop: 14, padding: "10px 12px", background: T.surf2, borderRadius: 9, font: `400 12px ${UI}`, color: T.mut }}>
            Rating non disponibile per questo strumento: {naMotivo}
          </div>
        )}
      </Card>

      {errore && <ErroreCard messaggio={errore} />}

      {serie.length >= 2 && (
        <Card>
          <Label>Prezzo tra i tuoi aggiornamenti</Label>
          <div style={{ height: 190, marginTop: 14, marginLeft: -8 }}>
            <ResponsiveContainer>
              <LineChart data={serie}>
                <CartesianGrid stroke={T.line} strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="t" tick={{ fill: T.faint, fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis domain={["auto", "auto"]} width={56} tick={{ fill: T.faint, fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ border: "none", borderRadius: 10, boxShadow: OMBRA, fontFamily: MONO, fontSize: 12 }} />
                <Line type="monotone" dataKey="v" stroke={T.acc} strokeWidth={2.4} dot={{ r: 3, fill: "#fff", stroke: T.acc, strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {puoFond && f?.rating && (
        <Card pad={22}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 28 }}>
            <div>
              <Label>Consenso analisti — riportato, non raccomandato</Label>
              <div style={{ marginTop: 14 }}>
                <ConsensoAnalisti rating={f.rating} analisti={f.numero_analisti} />
              </div>
            </div>
            <div>
              <Label>Previsione a 12 mesi</Label>
              <div style={{ marginTop: 14 }}>
                <BarreTarget
                  ptMin={f.pt_min}
                  ptMedio={f.pt_medio}
                  ptMediano={f.pt_mediano}
                  ptMax={f.pt_max}
                  upMin={f.upside_min}
                  upMedio={f.upside_medio}
                  upMax={f.upside_max}
                  valuta={f.valuta}
                />
              </div>
            </div>
          </div>
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.line}`, font: `400 11px ${UI}`, color: T.faint }}>
            Rilevato il {f.data_rilevazione || "n.d."}
            {f.fonte ? ` · ${f.fonte}` : ""}
          </div>
          {dati.ratingLog.length > 1 && (
            <div style={{ marginTop: 16 }}>
              <Label>Storico rilevazioni</Label>
              <div style={{ marginTop: 10, display: "grid", gap: 7 }}>
                {[...dati.ratingLog].reverse().map((l, i) => (
                  <div key={i} style={{ display: "flex", gap: 14, alignItems: "center", padding: "8px 10px", background: T.surf2, borderRadius: 8 }}>
                    <N s={11} c={T.mut}>{new Date(l.ts).toLocaleDateString("it-IT")}</N>
                    <span style={{ font: `600 12px ${UI}`, color: T.ink }}>{l.rating}</span>
                    {l.pt_medio != null && <N s={11} c={T.mut}>PT {Number(l.pt_medio).toFixed(2)}</N>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
