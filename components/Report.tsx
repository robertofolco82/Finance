"use client";

import type { ReactNode } from "react";
import { Card, Label, N } from "./ui";
import { T, UI } from "@/lib/theme";
import type { AnalisiReport } from "@/lib/types";

function Sez({ t, children }: { t: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 24 }}>
      <Label col={T.acc}>{t}</Label>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

/** Report analisi per ISIN — §8. Ogni numero con fonte, nessun verdetto proprio. */
export function Report({ r }: { r: AnalisiReport }) {
  const consensoRighe: [string, string | undefined][] = r.consenso
    ? [
        ["Rating", r.consenso.rating],
        ["Analisti", r.consenso.numeroAnalisti],
        ["PT medio", r.consenso.ptMedio],
        ["PT mediano", r.consenso.ptMediano],
        ["PT min", r.consenso.ptMin],
        ["PT max", r.consenso.ptMax],
      ]
    : [];

  return (
    <Card pad={24}>
      <div style={{ paddingBottom: 16, borderBottom: `1px solid ${T.line}` }}>
        <div style={{ font: `800 22px ${UI}`, color: T.ink }}>{r.nome}</div>
        <div style={{ marginTop: 6 }}>
          <N s={11} c={T.faint} w={400}>
            {r.isin}
            {r.ticker ? ` · ${r.ticker}` : ""}
            {r.mercato ? ` · ${r.mercato}` : ""}
          </N>
        </div>
      </div>

      {r.sintesi && <div style={{ marginTop: 16, font: `400 14px/1.75 ${UI}`, color: T.ink }}>{r.sintesi}</div>}

      {r.metriche && r.metriche.length > 0 && (
        <Sez t="Ultimo trimestre">
          <div style={{ display: "grid", gap: 1, background: T.line, borderRadius: 10, overflow: "hidden" }}>
            {r.metriche.map((m, i) => (
              <div
                key={i}
                style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "12px 14px", background: T.surf }}
              >
                <span style={{ font: `600 13px ${UI}`, color: T.mut }}>{m.voce}</span>
                <span style={{ textAlign: "right" }}>
                  <N s={13} w={700}>{m.valore}</N>
                  {m.nota && <div style={{ font: `400 11px ${UI}`, color: T.faint, marginTop: 3 }}>{m.nota}</div>}
                </span>
              </div>
            ))}
          </div>
        </Sez>
      )}

      {r.consenso && (
        <Sez t="Consenso analisti — riportato, non raccomandato">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(105px,1fr))", gap: 16 }}>
            {consensoRighe
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <div style={{ font: `600 9px ${UI}`, letterSpacing: ".09em", textTransform: "uppercase", color: T.faint, marginBottom: 6 }}>{k}</div>
                  <N s={15} w={700}>{v}</N>
                </div>
              ))}
          </div>
          {r.consenso.distribuzione && <div style={{ marginTop: 14, font: `400 13px/1.6 ${UI}`, color: T.mut }}>{r.consenso.distribuzione}</div>}
        </Sez>
      )}

      {r.insider && r.insider.length > 0 && (
        <Sez t="Operazioni insider — SEC Form 4">
          <div style={{ display: "grid", gap: 8 }}>
            {r.insider.map((o, i) => (
              <div
                key={i}
                style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "10px 12px", background: T.surf2, borderRadius: 8, font: `500 12px ${UI}` }}
              >
                <span>
                  {o.data} · {o.persona} <span style={{ color: T.faint }}>{o.ruolo}</span>
                </span>
                <N s={12} c={o.tipo?.toLowerCase().includes("vend") ? T.neg : T.pos}>
                  {o.tipo} {o.importo}
                </N>
              </div>
            ))}
          </div>
        </Sez>
      )}

      {r.prossimaTrimestrale?.data && (
        <Sez t="Prossima trimestrale">
          <div style={{ font: `400 14px/1.7 ${UI}` }}>
            <N s={14} w={700}>{r.prossimaTrimestrale.data}</N>
            {r.prossimaTrimestrale.attese ? ` — ${r.prossimaTrimestrale.attese}` : ""}
          </div>
        </Sez>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 24 }}>
        {r.driver && r.driver.length > 0 && (
          <Sez t="Driver">
            <ul style={{ margin: 0, paddingLeft: 18, font: `400 13px/1.8 ${UI}`, color: T.ink }}>
              {r.driver.map((d, i) => (
                <li key={i} style={{ marginBottom: 7 }}>
                  {d}
                </li>
              ))}
            </ul>
          </Sez>
        )}
        {r.rischi && r.rischi.length > 0 && (
          <Sez t="Rischi">
            <ul style={{ margin: 0, paddingLeft: 18, font: `400 13px/1.8 ${UI}`, color: T.ink }}>
              {r.rischi.map((d, i) => (
                <li key={i} style={{ marginBottom: 7 }}>
                  {d}
                </li>
              ))}
            </ul>
          </Sez>
        )}
      </div>

      {r.lacune && (
        <div style={{ marginTop: 22, padding: "12px 14px", background: T.warnBg, borderRadius: 10, font: `400 12px/1.7 ${UI}`, color: T.ink }}>
          <strong>Non verificato:</strong> {r.lacune}
        </div>
      )}

      {r.fonti && r.fonti.length > 0 && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${T.line}` }}>
          <Label>Fonti</Label>
          <div style={{ marginTop: 8 }}>
            {r.fonti.map((f, i) => (
              <div key={i} style={{ font: `400 11px/1.7 ${UI}`, color: T.faint, wordBreak: "break-all" }}>
                {f}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
