/** Track record delle call ricevute — §9. Estrazione da PDF e verifica contro benchmark. */

import { chiedi, estraiJSON } from "./anthropic";
import { modelloCorrente } from "./settings";
import { readData, writeData } from "./store";
import type { CallRicevuta } from "./types";

interface CallEstratta {
  titolo: string;
  ticker: string;
  direzione: string;
  strumento: string;
  target: string;
  orizzonte: string;
  dataReport: string;
  ratingAutore: string;
  benchmarkSuggerito: string;
}

export async function estraiCallDaPdf(base64: string, nomeFile: string): Promise<CallRicevuta> {
  const modello = await modelloCorrente();
  const testo = await chiedi(
    [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
      {
        type: "text",
        text:
          `Estrai la call dal report. Rispondi SOLO con JSON:\n` +
          `{"titolo":"","ticker":"","direzione":"long|short|neutrale","strumento":"azione|covered warrant|certificato|altro",` +
          `"target":"","orizzonte":"","dataReport":"AAAA-MM-GG","ratingAutore":"","benchmarkSuggerito":"ticker indice"}\n` +
          `dataReport è la data del report, non quella odierna — è il t0 della call, non va confusa con oggi.`,
      },
    ],
    { ricerca: false, maxTokens: 1200, effort: "medium", model: modello }
  );
  const d = estraiJSON<CallEstratta>(testo);

  const direzioniValide: CallRicevuta["direzione"][] = ["long", "short", "neutrale"];
  const direzione = direzioniValide.includes(d.direzione as CallRicevuta["direzione"])
    ? (d.direzione as CallRicevuta["direzione"])
    : "neutrale";

  const calls = await readData("calls");
  const nuova: CallRicevuta = {
    id: Date.now(),
    titolo: d.titolo,
    ticker: d.ticker,
    direzione,
    strumento: d.strumento,
    target: d.target,
    orizzonte: d.orizzonte,
    data_report: d.dataReport,
    rating_autore: d.ratingAutore,
    benchmark_ticker: d.benchmarkSuggerito || null,
    rendimento: null,
    rendimento_strumento: null,
    benchmark: null,
    file: nomeFile,
  };
  await writeData("calls", [...calls, nuova], `call da PDF ${nomeFile}`);
  return nuova;
}

export async function verificaCall(id: number): Promise<CallRicevuta> {
  const calls = await readData("calls");
  const c = calls.find((x) => x.id === id);
  if (!c) throw new Error(`Call ${id} non trovata.`);

  const modello = await modelloCorrente();
  const testo = await chiedi(
    `Dal ${c.data_report} a oggi: variazione percentuale di ${c.titolo} (${c.ticker}) e dell'indice ` +
      `${c.benchmark_ticker || "di settore di riferimento"} nello stesso intervallo, stesso identico periodo.\n` +
      `Rispondi SOLO con JSON: {"rendimento":num,"benchmark":num,"benchmarkNome":"","fonte":""}`,
    { maxTokens: 1000, effort: "low", model: modello }
  );
  const d = estraiJSON<{ rendimento: number; benchmark: number; benchmarkNome?: string }>(testo);
  const aggiornata: CallRicevuta = {
    ...c,
    rendimento: d.rendimento,
    benchmark: d.benchmark,
    benchmark_nome: d.benchmarkNome,
  };
  await writeData(
    "calls",
    calls.map((x) => (x.id === id ? aggiornata : x)),
    `verifica call ${id}`
  );
  return aggiornata;
}
