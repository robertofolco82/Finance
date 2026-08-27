/**
 * Fetcher prezzi — §2.1 e §11. Gira server-side (cron o trigger manuale), mai nel browser.
 *
 * Correzioni rispetto al prototipo:
 *  - batch da 5 titoli in PARALLELO, non 28 in sequenza — con la ricerca web reale
 *    ogni lotto può richiedere diversi secondi: in sequenza la somma di 7 lotti
 *    supera facilmente il limite di 60s delle funzioni Vercel (piano Hobby),
 *    che le termina restituendo una pagina d'errore invece della risposta JSON
 *  - chiusura precedente salvata insieme al prezzo (§5.2)
 *  - quarantena confrontata con l'ultimo prezzo SCARICATO, non con l'export (§5.7)
 *  - un lotto fallito non blocca gli altri: isin falliti riportati, non un errore fatale
 */

import { chiedi, estraiJSON } from "./anthropic";
import { modelloCorrente } from "./settings";
import { readData, ultimoPrezzo, cambioEurUsdCorrente, writeData } from "./store";
import { costruisciVista } from "./portafoglio";
import type { PrezzoRecord, PrezzoSospetto, Strumento } from "./types";

const SOGLIA_QUARANTENA = 0.6;
const LOTTO = 5;

// Limite nostro, più stretto dei 60s di Vercel (Hobby): lascia margine per le
// scritture su GitHub che seguono (prezzi, sospetti, snapshot). Il retry con
// backoff dentro chiedi() può da solo avvicinarsi o superare i 60s se un lotto
// incontra ripetuti 429/5xx — senza questo taglio, un singolo lotto lento
// trascina giù l'intera risposta (Vercel la interrompe restituendo una pagina
// d'errore invece del nostro JSON). Qui invece degradiamo noi stessi, in modo
// controllato: quel lotto risulta "non riuscito questa volta", gli altri restano validi.
const TIMEOUT_LOTTO_MS = 35_000;
const TIMEOUT_CAMBIO_MS = 12_000;

export function conTimeout<T>(promessa: Promise<T>, ms: number, valoreScaduto: T): Promise<T> {
  return Promise.race([promessa, new Promise<T>((resolve) => setTimeout(() => resolve(valoreScaduto), ms))]);
}

export interface RisultatoRefresh {
  aggiornati: number;
  quarantena: number;
  falliti: string[];
  cambioEurUsd: number;
  /** Messaggio del primo errore incontrato, se almeno un lotto è fallito — per capire la causa senza dover leggere i log. */
  dettaglioErrore?: string;
}

interface PrezzoTrovato {
  isin: string;
  prezzo: number | null;
  chiusura_precedente: number | null;
  fonte?: string;
  data?: string;
}

/** Prezzo grezzo appena raccolto: non ancora validato né scritto nello store. */
export interface PrezzoRaccolto {
  isin: string;
  prezzo: number;
  chiusura_precedente: number | null;
  fonte: string;
}

interface RisultatoLotto {
  raccolti: PrezzoRaccolto[];
  falliti: string[];
  errore?: string;
}

export interface RisultatoLottoApi extends RisultatoLotto {
  indice: number;
  totaleLotti: number;
}

async function recuperaCambio(modello: string): Promise<number | null> {
  try {
    const testo = await chiedi(
      `Qual è il tasso di cambio EUR/USD più recente (quanti USD per 1 EUR)? ` +
        `Rispondi SOLO con JSON: {"cambio":numero}`,
      { maxTokens: 300, effort: "low", model: modello }
    );
    const d = estraiJSON<{ cambio: number }>(testo);
    return d.cambio && d.cambio > 0 ? d.cambio : null;
  } catch {
    return null; // mantiene l'ultimo cambio noto: non è fatale, il fetcher prosegue sui prezzi
  }
}

/** Solo rete: una chiamata a Claude per il lotto, nessuna lettura/scrittura dello store. */
async function elaboraLotto(lotto: Strumento[], modello: string): Promise<RisultatoLotto> {
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
    const raccolti: PrezzoRaccolto[] = [];
    for (const q of d.prezzi || []) {
      if (q.prezzo == null) continue;
      if (!lotto.some((s) => s.isin === q.isin)) continue;
      raccolti.push({
        isin: q.isin,
        prezzo: q.prezzo,
        chiusura_precedente: q.chiusura_precedente ?? null,
        fonte: `${q.fonte || ""} ${q.data || ""}`.trim(),
      });
    }
    const trovati = new Set(raccolti.map((r) => r.isin));
    return { raccolti, falliti: lotto.filter((s) => !trovati.has(s.isin)).map((s) => s.isin) };
  } catch (e) {
    return { raccolti: [], falliti: lotto.map((s) => s.isin), errore: e instanceof Error ? e.message : String(e) };
  }
}

function dividiInLotti(strumenti: Strumento[]): Strumento[][] {
  const lotti: Strumento[][] = [];
  for (let i = 0; i < strumenti.length; i += LOTTO) lotti.push(strumenti.slice(i, i + LOTTO));
  return lotti;
}

/**
 * Raccoglie i prezzi di UN lotto. È il mattone usato dal browser: una richiesta
 * HTTP = una chiamata a Claude, quindi nessun rischio di superare il limite di
 * durata delle funzioni Vercel, per quanti titoli ci siano in portafoglio.
 */
export async function recuperaLotto(indice: number): Promise<RisultatoLottoApi> {
  const strumenti = await readData("strumenti");
  const lotti = dividiInLotti(strumenti);
  const lotto = lotti[indice];
  if (!lotto) throw new Error(`lotto ${indice} inesistente (ce ne sono ${lotti.length}).`);
  const modello = await modelloCorrente();
  const esito = await conTimeout(elaboraLotto(lotto, modello), TIMEOUT_LOTTO_MS, {
    raccolti: [],
    falliti: lotto.map((s) => s.isin),
    errore: `nessuna risposta entro ${TIMEOUT_LOTTO_MS / 1000}s`,
  });
  return { ...esito, indice, totaleLotti: lotti.length };
}

export async function contaLotti(): Promise<number> {
  return dividiInLotti(await readData("strumenti")).length;
}

/**
 * Applica quarantena (§5.7) e scrive: prezzi, sospetti, snapshot. Separato dalla
 * raccolta perché è la sola parte che tocca lo store — così il browser può
 * raccogliere in parallelo e salvare una volta sola alla fine.
 */
export async function salvaRaccolti(
  raccolti: PrezzoRaccolto[],
  falliti: string[] = [],
  primoErrore?: string
): Promise<RisultatoRefresh> {
  const strumenti = await readData("strumenti");
  const prezziStorico = await readData("prezzi");
  const modello = await modelloCorrente();
  const oggi = new Date().toISOString().slice(0, 10);

  const nuoviPrezzi: PrezzoRecord[] = [];
  const nuoviSospetti: PrezzoSospetto[] = [];
  for (const r of raccolti) {
    const strumento = strumenti.find((s) => s.isin === r.isin);
    if (!strumento) continue;
    const ultimo = ultimoPrezzo(prezziStorico, r.isin);
    const riferimento = ultimo?.chiusura;
    const variazione = riferimento ? ((r.prezzo - riferimento) / riferimento) * 100 : 0;
    if (riferimento != null && Math.abs(variazione / 100) > SOGLIA_QUARANTENA) {
      nuoviSospetti.push({
        isin: r.isin,
        nome: strumento.nome,
        vecchio: riferimento,
        nuovo: r.prezzo,
        variazione,
        chiusura_precedente: r.chiusura_precedente,
        fonte: r.fonte,
        valuta: strumento.valuta,
      });
    } else {
      nuoviPrezzi.push({
        isin: r.isin,
        data: oggi,
        chiusura: r.prezzo,
        chiusura_precedente: r.chiusura_precedente ?? ultimo?.chiusura_precedente ?? null,
        valuta: strumento.valuta,
        fonte: r.fonte,
        raccolto_il: new Date().toISOString(),
      });
    }
  }

  const aggiornatiReali = nuoviPrezzi.length;
  let cambio = cambioEurUsdCorrente(prezziStorico);
  const cambioTrovato = await conTimeout(recuperaCambio(modello), TIMEOUT_CAMBIO_MS, null);
  if (cambioTrovato != null) {
    cambio = cambioTrovato;
    // Il tasso si registra solo se questo giro l'ha davvero trovato: altrimenti un
    // refresh fallito scriverebbe comunque un prezzo "aggiornato" e uno snapshot
    // identico al precedente, mascherando il fallimento invece di segnalarlo.
    nuoviPrezzi.push({
      isin: "EURUSD",
      data: oggi,
      chiusura: cambio,
      chiusura_precedente: null,
      valuta: "RATE",
      fonte: "web search",
      raccolto_il: new Date().toISOString(),
    });
  }

  if (nuoviPrezzi.length === 0 && nuoviSospetti.length === 0) {
    return { aggiornati: 0, quarantena: 0, falliti, cambioEurUsd: cambio, ...(primoErrore ? { dettaglioErrore: primoErrore } : {}) };
  }

  await writeData("prezzi", [...prezziStorico, ...nuoviPrezzi], `refresh prezzi ${oggi}`);

  const sospettiPrecedenti = await readData("sospetti");
  const isinAggiornati = new Set(nuoviPrezzi.map((p) => p.isin));
  await writeData(
    "sospetti",
    [...sospettiPrecedenti.filter((s) => !isinAggiornati.has(s.isin)), ...nuoviSospetti],
    `quarantena prezzi ${oggi}`
  );

  if (aggiornatiReali > 0) await registraSnapshot();

  return {
    aggiornati: aggiornatiReali,
    quarantena: nuoviSospetti.length,
    falliti,
    cambioEurUsd: cambio,
    ...(falliti.length && primoErrore ? { dettaglioErrore: primoErrore } : {}),
  };
}

/**
 * Refresh completo in un colpo solo. Usato dallo scheduler notturno, dove non
 * c'è un browser a orchestrare: tutti i lotti in parallelo, poi un unico
 * salvataggio. Il browser usa invece recuperaLotto() + salvaRaccolti(), che
 * spezzano il lavoro in richieste HTTP separate e brevi per costruzione.
 */
export async function aggiornaPrezzi(): Promise<RisultatoRefresh> {
  const strumenti = await readData("strumenti");
  const modello = await modelloCorrente();
  const lotti = dividiInLotti(strumenti);

  const risultatiLotti = await Promise.all(
    lotti.map((lotto) =>
      conTimeout(elaboraLotto(lotto, modello), TIMEOUT_LOTTO_MS, {
        raccolti: [],
        falliti: lotto.map((s) => s.isin),
        errore: `nessuna risposta entro ${TIMEOUT_LOTTO_MS / 1000}s`,
      })
    )
  );

  const raccolti: PrezzoRaccolto[] = [];
  const falliti: string[] = [];
  let primoErrore: string | undefined;
  for (const r of risultatiLotti) {
    raccolti.push(...r.raccolti);
    falliti.push(...r.falliti);
    if (r.errore && !primoErrore) primoErrore = r.errore;
  }

  return salvaRaccolti(raccolti, falliti, primoErrore);
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
