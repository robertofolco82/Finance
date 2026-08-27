/**
 * Fetcher prezzi — §2.1 e §11. Gira server-side (cron o trigger manuale), mai nel browser.
 *
 * Correzioni rispetto al prototipo:
 *  - batch da 5 titoli, non 28 in sequenza
 *  - chiusura precedente salvata insieme al prezzo (§5.2)
 *  - quarantena confrontata con l'ultimo prezzo SCARICATO, non con l'export (§5.7)
 *  - un lotto fallito non blocca gli altri: isin falliti riportati, non un errore fatale
 */

import { attesa, chiedi, estraiJSON } from "./anthropic";
import { modelloCorrente } from "./settings";
import { readData, ultimoPrezzo, cambioEurUsdCorrente, writeData } from "./store";
import { costruisciVista } from "./portafoglio";
import type { PrezzoRecord, PrezzoSospetto, Strumento } from "./types";

const SOGLIA_QUARANTENA = 0.6;
const LOTTO = 5;

export interface RisultatoRefresh {
  aggiornati: number;
  quarantena: number;
  falliti: string[];
  cambioEurUsd: number;
}

interface PrezzoTrovato {
  isin: string;
  prezzo: number | null;
  chiusura_precedente: number | null;
  fonte?: string;
  data?: string;
}

export async function aggiornaPrezzi(): Promise<RisultatoRefresh> {
  const strumenti = await readData("strumenti");
  const prezziStorico = await readData("prezzi");
  const modello = await modelloCorrente();

  let cambio = cambioEurUsdCorrente(prezziStorico);
  try {
    const testo = await chiedi(
      `Qual è il tasso di cambio EUR/USD più recente (quanti USD per 1 EUR)? ` +
        `Rispondi SOLO con JSON: {"cambio":numero}`,
      { maxTokens: 300, effort: "low", model: modello }
    );
    const d = estraiJSON<{ cambio: number }>(testo);
    if (d.cambio && d.cambio > 0) cambio = d.cambio;
  } catch {
    // mantiene l'ultimo cambio noto: non è fatale, il fetcher prosegue sui prezzi
  }

  const oggi = new Date().toISOString().slice(0, 10);
  const nuoviPrezzi: PrezzoRecord[] = [];
  const nuoviSospetti: PrezzoSospetto[] = [];
  const falliti: string[] = [];

  const lotti: Strumento[][] = [];
  for (let i = 0; i < strumenti.length; i += LOTTO) lotti.push(strumenti.slice(i, i + LOTTO));

  for (let li = 0; li < lotti.length; li++) {
    const lotto = lotti[li];
    if (!lotto) continue;
    try {
      const testo = await chiedi(
        `Per ciascuno di questi strumenti cerca la quotazione più recente E la chiusura della seduta precedente.\n` +
          lotto.map((s) => `${s.isin} — ${s.nome} (${s.mercato}, ${s.valuta})`).join("\n") +
          `\n\nAttenzione: le obbligazioni quotano in percentuale del nominale (circa 80-105), non in euro.\n` +
          `"chiusura_precedente" è la chiusura della seduta precedente a quella dell'ultimo prezzo trovato.\n` +
          `Rispondi SOLO con JSON: {"prezzi":[{"isin":"","prezzo":numero,"chiusura_precedente":numero,"fonte":"","data":"AAAA-MM-GG"}]}\n` +
          `prezzo o chiusura_precedente null se non li trovi con certezza. Non inventare.`,
        { maxTokens: 1800, effort: "low", model: modello }
      );
      const d = estraiJSON<{ prezzi: PrezzoTrovato[] }>(testo);
      for (const q of d.prezzi || []) {
        if (q.prezzo == null) continue;
        const strumento = lotto.find((s) => s.isin === q.isin);
        if (!strumento) continue;
        const ultimo = ultimoPrezzo(prezziStorico, q.isin);
        const riferimento = ultimo?.chiusura;
        const variazione = riferimento ? ((q.prezzo - riferimento) / riferimento) * 100 : 0;
        const fonte = `${q.fonte || ""} ${q.data || ""}`.trim();
        if (riferimento != null && Math.abs(variazione / 100) > SOGLIA_QUARANTENA) {
          nuoviSospetti.push({
            isin: q.isin,
            nome: strumento.nome,
            vecchio: riferimento,
            nuovo: q.prezzo,
            variazione,
            chiusura_precedente: q.chiusura_precedente ?? null,
            fonte,
            valuta: strumento.valuta,
          });
        } else {
          nuoviPrezzi.push({
            isin: q.isin,
            data: oggi,
            chiusura: q.prezzo,
            chiusura_precedente: q.chiusura_precedente ?? ultimo?.chiusura_precedente ?? null,
            valuta: strumento.valuta,
            fonte,
            raccolto_il: new Date().toISOString(),
          });
        }
      }
    } catch {
      falliti.push(...lotto.map((s) => s.isin));
    }
    if (li < lotti.length - 1) await attesa(700);
  }

  nuoviPrezzi.push({
    isin: "EURUSD",
    data: oggi,
    chiusura: cambio,
    chiusura_precedente: null,
    valuta: "RATE",
    fonte: "web search",
    raccolto_il: new Date().toISOString(),
  });

  await writeData("prezzi", [...prezziStorico, ...nuoviPrezzi], `refresh prezzi ${oggi}`);

  const sospettiPrecedenti = await readData("sospetti");
  const isinAggiornati = new Set(nuoviPrezzi.map((p) => p.isin));
  await writeData(
    "sospetti",
    [...sospettiPrecedenti.filter((s) => !isinAggiornati.has(s.isin)), ...nuoviSospetti],
    `quarantena prezzi ${oggi}`
  );

  await registraSnapshot();

  return { aggiornati: nuoviPrezzi.length - 1, quarantena: nuoviSospetti.length, falliti, cambioEurUsd: cambio };
}

/** Ricalcola la vista corrente e appende uno snapshot. Usato dopo un refresh o dopo l'applicazione di un prezzo in quarantena. */
export async function registraSnapshot(): Promise<void> {
  const vista = await costruisciVista();
  const snapshotStorico = await readData("snapshot");
  const nuovo = {
    ts: Date.now(),
    totale_eur: vista.totale_eur,
    righe: vista.righe.map((r) => ({ isin: r.strumento.isin, prezzo: r.prezzo ?? 0, valore_eur: r.valore_eur })),
  };
  await writeData("snapshot", [...snapshotStorico, nuovo].slice(-400), `snapshot ${new Date().toISOString()}`);
}

export async function applicaSospetto(isin: string): Promise<void> {
  const sospetti = await readData("sospetti");
  const s = sospetti.find((x) => x.isin === isin);
  if (!s) throw new Error(`Nessun prezzo in quarantena per ${isin}.`);
  const prezzi = await readData("prezzi");
  const oggi = new Date().toISOString().slice(0, 10);
  await writeData(
    "prezzi",
    [
      ...prezzi,
      {
        isin,
        data: oggi,
        chiusura: s.nuovo,
        chiusura_precedente: s.chiusura_precedente,
        valuta: s.valuta,
        fonte: s.fonte,
        raccolto_il: new Date().toISOString(),
      },
    ],
    `applica prezzo in quarantena ${isin}`
  );
  await writeData(
    "sospetti",
    sospetti.filter((x) => x.isin !== isin),
    `rimuove da quarantena ${isin}`
  );
  await registraSnapshot();
}

export async function scartaSospetto(isin: string): Promise<void> {
  const sospetti = await readData("sospetti");
  await writeData(
    "sospetti",
    sospetti.filter((x) => x.isin !== isin),
    `scarta quarantena ${isin}`
  );
}
