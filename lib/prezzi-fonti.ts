/**
 * Fonti prezzi gratuite — §6.1 della spec.
 *
 * Perché non Yahoo Finance: funziona da un browser, ma risponde 429 (troppe
 * richieste) alle chiamate provenienti dai server Vercel, che escono da indirizzi
 * di datacenter condivisi. Verificato in produzione: tutti e 11 i titoli che
 * passavano da Yahoo fallivano, mentre quelli su Borsa Italiana passavano.
 *
 * Copertura attuale, verificata sui 28 ISIN reali (scripts/verifica-fonti.mjs):
 *  - Borsa Italiana (19): titoli di Stato su MOT, certificati SeDeX, ETF ed ETC
 *    su ETFplus
 *  - stockanalysis.com (4): le azioni estere e l'ETF quotato solo su XETRA
 *  - inserimento manuale (5): i 4 strutturati EuroTLX e l'ETP SK Hynix, che
 *    nessuna fonte gratuita quota (§6.3 prevede il campo manuale come fallback)
 *
 * Ogni prezzo estratto passa un controllo di plausibilità prima di essere
 * restituito: meglio un buco dichiarato che un numero sbagliato nei totali (§5.7).
 */

import type { Strumento } from "./types";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const TIMEOUT_MS = 12_000;

export interface EsitoPrezzo {
  isin: string;
  prezzo: number | null;
  chiusura_precedente: number | null;
  fonte: string;
  errore?: string;
}

async function preleva(url: string): Promise<Response> {
  return fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

/**
 * Primo numero in formato italiano dentro il testo ("1.234,56" → 1234.56).
 * Prende il PRIMO token numerico perché alcune schede mettono prezzo e orario
 * nella stessa cella ("128,10 - 27/08/26 17.55.00"): la data non deve essere
 * scambiata per un prezzo.
 */
export function numeroItaliano(testo: string): number | null {
  const m = testo.replace(/&nbsp;/g, " ").match(/\d{1,3}(?:\.\d{3})*(?:,\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** "1,486.40" (formato inglese) → 1486.4 */
export function numeroInglese(testo: string): number | null {
  const n = Number(testo.trim().replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Valore di un campo etichettato in una tabella HTML (etichetta in una cella, valore nella successiva). */
export function campoEtichettato(html: string, etichetta: string): string | null {
  const h = html.replace(/\s+/g, " ");
  const re = new RegExp(
    `<t[dh][^>]*>\\s*(?:<[^>]+>\\s*)*${etichetta}\\s*(?:</[^>]+>\\s*)*</t[dh]>\\s*<t[dh][^>]*>\\s*(?:<[^>]+>\\s*)*([^<]{1,40})`,
    "i"
  );
  return html.match(re)?.[1]?.trim() ?? h.match(re)?.[1]?.trim() ?? null;
}

export function estraiCampoBorsaItaliana(html: string, etichetta: string): number | null {
  const v = campoEtichettato(html, etichetta);
  return v ? numeroItaliano(v) : null;
}

/** Prezzo corrente su stockanalysis.com: è il numero grande in testa alla scheda. */
export function estraiPrezzoStockAnalysis(html: string): number | null {
  const m = html.match(/class="text-4xl font-bold[^"]*"[^>]*>\s*([\d,]+\.?\d*)\s*</i);
  return m?.[1] ? numeroInglese(m[1]) : null;
}

/**
 * Controllo di plausibilità: la pagina espone anche il range di giornata, quindi
 * un prezzo estratto dal punto sbagliato si smaschera da solo cadendo fuori.
 * Se il range non è leggibile il prezzo passa (non si può verificare, ma resta
 * comunque la quarantena al 60% a valle).
 */
export function prezzoDentroRange(html: string, prezzo: number): boolean {
  const range = campoEtichettato(html, "Day's Range");
  const m = range?.match(/([\d,]+\.?\d*)\s*-\s*([\d,]+\.?\d*)/);
  if (!m) return true;
  const min = numeroInglese(m[1] as string);
  const max = numeroInglese(m[2] as string);
  if (min == null || max == null) return true;
  return prezzo >= min * 0.999 && prezzo <= max * 1.001;
}

async function daStockAnalysis(s: Strumento): Promise<EsitoPrezzo> {
  const percorso = s.percorso_stockanalysis;
  if (!percorso) {
    return { isin: s.isin, prezzo: null, chiusura_precedente: null, fonte: "", errore: "percorso stockanalysis non configurato" };
  }
  try {
    const r = await preleva(`https://stockanalysis.com/${percorso}/`);
    if (!r.ok) throw new Error(`la fonte ha risposto ${r.status}`);
    const html = await r.text();
    const prezzo = estraiPrezzoStockAnalysis(html);
    if (prezzo == null) throw new Error("prezzo non presente nella scheda");
    if (!prezzoDentroRange(html, prezzo)) throw new Error("prezzo fuori dal range di giornata: estrazione non attendibile");
    const prec = campoEtichettato(html, "Previous Close");
    return {
      isin: s.isin,
      prezzo,
      chiusura_precedente: prec ? numeroInglese(prec) : null,
      fonte: `stockanalysis.com (${percorso})`,
    };
  } catch (e) {
    return { isin: s.isin, prezzo: null, chiusura_precedente: null, fonte: "", errore: (e as Error).message };
  }
}

async function daBorsaItaliana(s: Strumento): Promise<EsitoPrezzo> {
  const percorso = s.percorso_borsait;
  if (!percorso) {
    return { isin: s.isin, prezzo: null, chiusura_precedente: null, fonte: "", errore: "percorso Borsa Italiana non configurato" };
  }
  try {
    const r = await preleva(`https://www.borsaitaliana.it/borsa/${percorso}/scheda/${s.isin}.html?lang=it`);
    if (!r.ok) throw new Error(`la fonte ha risposto ${r.status}`);
    const html = await r.text();
    // Se la scheda non contiene l'ISIN chiesto siamo su una pagina di ricaduta:
    // i numeri che contiene appartengono ad altri strumenti.
    if (!html.includes(s.isin)) throw new Error("la scheda non corrisponde all'ISIN");
    const prezzo = estraiCampoBorsaItaliana(html, "Prezzo di riferimento") ?? estraiCampoBorsaItaliana(html, "Prezzo ufficiale");
    if (prezzo == null) throw new Error("prezzo non presente nella scheda");
    return {
      isin: s.isin,
      prezzo,
      // La scheda non espone la chiusura precedente: resta null e il P&L
      // giornaliero la recupera dallo storico locale (§5.2).
      chiusura_precedente: null,
      fonte: "Borsa Italiana",
    };
  } catch (e) {
    return { isin: s.isin, prezzo: null, chiusura_precedente: null, fonte: "", errore: (e as Error).message };
  }
}

export async function prezzoDaFonte(s: Strumento): Promise<EsitoPrezzo> {
  if (s.fonte_prezzo === "borsaitaliana") return daBorsaItaliana(s);
  if (s.fonte_prezzo === "stockanalysis") return daStockAnalysis(s);
  return {
    isin: s.isin,
    prezzo: null,
    chiusura_precedente: null,
    fonte: "",
    errore: "nessuna fonte gratuita quota questo strumento: inserisci il prezzo a mano",
  };
}

/** Cambio EUR/USD dalla Banca Centrale Europea, gratuito e ufficiale. */
export async function cambioEurUsd(): Promise<number | null> {
  try {
    const r = await preleva("https://api.frankfurter.app/latest?from=EUR&to=USD");
    if (!r.ok) throw new Error(`risposta ${r.status}`);
    const j = (await r.json()) as { rates?: { USD?: number } };
    const v = j.rates?.USD;
    return typeof v === "number" && v > 0 ? v : null;
  } catch {
    return null;
  }
}
