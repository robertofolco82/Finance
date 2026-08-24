/** Chat sul titolo — §7.2. Contesto precaricato, niente ricerca web, risposte brevi. */

import { chiedi } from "./anthropic";
import { readData, writeData } from "./store";
import { posizioneDaMovimenti } from "./calc";
import type { ChatMessage } from "./types";

export async function chattaSuTitolo(isin: string, domanda: string): Promise<ChatMessage> {
  const strumenti = await readData("strumenti");
  const s = strumenti.find((x) => x.isin === isin);
  const fond = await readData("fondamentali");
  const analisi = await readData("analisi");
  const chat = await readData("chat");
  const movimenti = await readData("movimenti");

  const storico = chat[isin] ?? [];
  const domandaMsg: ChatMessage = { isin, ts: Date.now(), ruolo: "user", testo: domanda };
  const conDomanda = [...storico, domandaMsg];
  chat[isin] = conDomanda;
  await writeData("chat", chat, `chat ${isin} domanda`);

  const f = fond[isin];
  const sub = f?.sotto || s?.sottostante || s?.nome || isin;
  const pos = s ? posizioneDaMovimenti(s, movimenti.filter((m) => m.isin === isin)) : null;
  const a = analisi[isin];

  const contesto =
    `Strumento: ${s?.nome ?? isin} (${isin})${s ? `, ${s.classe}, mercato ${s.mercato}, valuta ${s.valuta}` : ""}.\n` +
    `Sottostante: ${sub}.${pos ? ` Quantità in portafoglio: ${pos.quantita}, pmc ${pos.pmc ?? "n.d."}.` : ""}\n` +
    (s?.nota ? `Scheda: ${s.nota}\n` : "") +
    (f?.rating
      ? `Consenso: ${f.rating}, ${f.buy ?? 0} buy / ${f.hold ?? 0} hold / ${f.sell ?? 0} sell, PT medio ${f.pt_medio ?? "n.d."}.\n`
      : "") +
    (a?.sintesi ? `Sintesi analisi: ${a.sintesi}\n` : "");
  const dialogo = conDomanda
    .slice(-8)
    .map((m) => `${m.ruolo === "user" ? "Domanda" : "Risposta"}: ${m.testo}`)
    .join("\n\n");

  let rispostaTesto: string;
  try {
    rispostaTesto = await chiedi(
      `Contesto:\n${contesto}\n${dialogo}\n\n` +
        `Rispondi all'ultima domanda in italiano, massimo 6 frasi, concreto e senza preamboli. ` +
        `Se una cosa non la sai dal contesto, dillo invece di inventarla. Non dare raccomandazioni di acquisto o vendita.`,
      { ricerca: false, maxTokens: 700, effort: "low" }
    );
  } catch (e) {
    rispostaTesto = `Non sono riuscito a rispondere: ${(e as Error).message}`;
  }
  const rispostaMsg: ChatMessage = { isin, ts: Date.now(), ruolo: "assistant", testo: rispostaTesto };
  chat[isin] = [...conDomanda, rispostaMsg];
  await writeData("chat", chat, `chat ${isin} risposta`);
  return rispostaMsg;
}
