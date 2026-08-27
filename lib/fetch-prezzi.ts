/**
 * Fetcher prezzi — orchestrazione. Le fonti vere stanno in lib/prezzi-fonti.ts.
 *
 * Struttura pensata attorno al limite di durata delle funzioni Vercel: il lavoro
 * è spezzato in richieste HTTP separate e brevi (recuperaLotto per la raccolta,
 * salvaRaccolti per validazione e scritture), orchestrate dal browser che non ha
 * quel limite. Nessun automatismo: parte solo quando l'utente lo chiede.
 *
 * Regole della spec conservate:
 *  - chiusura precedente salvata insieme al prezzo, per il P&L giornaliero (§5.2)
 *  - quarantena oltre il 60% rispetto all'ultimo prezzo SCARICATO, non all'export (§5.7)
 *  - uno strumento non trovato non blocca gli altri: viene riportato, non è fatale
 */

import { cambioEurUsd, prezzoDaFonte } from "./prezzi-fonti";
import { readData, ultimoPrezzo, cambioEurUsdCorrente, writeData } from "./store";
import { costruisciVista } from "./portafoglio";
import type { PrezzoRecord, PrezzoSospetto, Strumento } from "./types";

const SOGLIA_QUARANTENA = 0.6;
const LOTTO = 5;

// Rete lenta o fonte che non risponde: degradiamo noi in modo controllato invece
// di lasciare che sia Vercel a troncare la richiesta senza una risposta leggibile.
// Con le fonti gratuite un lotto si chiude in frazioni di secondo, quindi questi
// valori sono un margine largo, non un vincolo stretto.
const TIMEOUT_LOTTO_MS = 20_000;
const TIMEOUT_CAMBIO_MS = 10_000;

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

/**
 * Solo rete: interroga le fonti gratuite per gli strumenti del lotto, in parallelo.
 * Nessuna lettura/scrittura dello store, nessuna chiamata a pagamento.
 */
async function elaboraLotto(lotto: Strumento[]): Promise<RisultatoLotto> {
  const esiti = await Promise.all(lotto.map((s) => prezzoDaFonte(s)));
  const raccolti: PrezzoRaccolto[] = [];
  const falliti: string[] = [];
  let primoErrore: string | undefined;
  for (const e of esiti) {
    if (e.prezzo != null) {
      raccolti.push({ isin: e.isin, prezzo: e.prezzo, chiusura_precedente: e.chiusura_precedente, fonte: e.fonte });
    } else {
      falliti.push(e.isin);
      if (e.errore && !primoErrore) primoErrore = e.errore;
    }
  }
  return { raccolti, falliti, ...(primoErrore ? { errore: primoErrore } : {}) };
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
  const esito = await conTimeout(elaboraLotto(lotto), TIMEOUT_LOTTO_MS, {
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
  const cambioTrovato = await conTimeout(cambioEurUsd(), TIMEOUT_CAMBIO_MS, null);
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
      fonte: "BCE via Frankfurter",
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
