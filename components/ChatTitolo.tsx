"use client";

import { useEffect, useRef, useState } from "react";
import { Btn, Card, Label } from "./ui";
import { T, UI } from "@/lib/theme";
import type { ChatMessage } from "@/lib/types";

/** Chat sul titolo — §7.2. Contesto precaricato lato server, risposte brevi senza ricerca web. */
export function ChatTitolo({
  isin,
  nomeSottostante,
  messaggiIniziali,
}: {
  isin: string;
  nomeSottostante: string;
  messaggiIniziali: ChatMessage[];
}) {
  const [messaggi, setMessaggi] = useState<ChatMessage[]>(messaggiIniziali);
  const [testo, setTesto] = useState("");
  const [occupato, setOccupato] = useState(false);
  const fine = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessaggi(messaggiIniziali);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isin]);

  useEffect(() => {
    fine.current?.scrollIntoView({ block: "nearest" });
  }, [messaggi]);

  async function invia() {
    const domanda = testo.trim();
    if (!domanda || occupato) return;
    setTesto("");
    setMessaggi((m) => [...m, { isin, ts: Date.now(), ruolo: "user", testo: domanda }]);
    setOccupato(true);
    try {
      const res = await fetch(`/api/chat/${isin}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domanda }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.errore);
      setMessaggi((m) => [...m, d as ChatMessage]);
    } catch (e) {
      setMessaggi((m) => [...m, { isin, ts: Date.now(), ruolo: "assistant", testo: `Non sono riuscito a rispondere: ${(e as Error).message}` }]);
    } finally {
      setOccupato(false);
    }
  }

  return (
    <Card pad={20}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <Label>Chiedi su {nomeSottostante}</Label>
        <span style={{ font: `400 10px ${UI}`, color: T.faint }}>risposte brevi, senza ricerca web</span>
      </div>

      {messaggi.length > 0 && (
        <div style={{ marginTop: 14, display: "grid", gap: 10, maxHeight: 340, overflowY: "auto" }}>
          {messaggi.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.ruolo === "user" ? "flex-end" : "flex-start" }}>
              <div
                style={{
                  maxWidth: "86%",
                  padding: "11px 13px",
                  borderRadius: 12,
                  background: m.ruolo === "user" ? T.accBg : T.surf2,
                  color: T.ink,
                  font: `400 13px/1.65 ${UI}`,
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.testo}
              </div>
            </div>
          ))}
          {occupato && (
            <div style={{ display: "flex", gap: 9, alignItems: "center", padding: "6px 2px" }}>
              <div style={{ width: 13, height: 13, borderRadius: "50%", border: `2px solid ${T.line}`, borderTopColor: T.acc, animation: "gira .8s linear infinite" }} />
              <span style={{ font: `400 12px ${UI}`, color: T.faint }}>sto rispondendo…</span>
            </div>
          )}
          <div ref={fine} />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <input
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") invia();
          }}
          placeholder={messaggi.length ? "Continua…" : "Es. perché il consenso è così disperso?"}
          style={{ flex: "1 1 200px", padding: "12px 13px", borderRadius: 10, border: `1px solid ${T.line}`, font: `400 13px ${UI}`, background: T.surf, color: T.ink }}
        />
        <Btn variant="primary" onClick={invia} disabled={occupato || !testo.trim()}>
          Invia
        </Btn>
      </div>
    </Card>
  );
}
