/**
 * Fonti prezzi gratuite — sostituiscono la ricerca web via LLM (§6.1 della spec).
 *
 * Perché: una ricerca LLM per 5 titoli impiegava oltre 35 secondi e costava a ogni
 * giro. Una lettura diretta risponde in frazioni di secondo, è gratuita, e non può
 * "sbagliare a leggere" un numero — l'errore da 24× che aveva falsato il prototipo
 * nasceva proprio lì.
 *
 * Copertura verificata sui 28 ISIN reali del portafoglio:
 *  - Yahoo Finance (11): azioni ed ETF, con chiusura precedente inclusa
 *  - Borsa Italiana (12): titoli di Stato su MOT e certificati su SeDeX
 *  - nessuna fonte gratuita (5): i 4 strutturati EuroTLX e l'ETP SK Hynix,
 *    che restano a inserimento manuale (§6.3: prevedere sempre il campo manuale)
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

/** Numero in formato italiano ("1.234,56") → number. */
export function numeroItaliano(testo: string): number | null {
  const n = Number(testo.trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Estrae un campo etichettato dalla scheda Borsa Italiana (tabella etichetta/valore). */
export function estraiCampoBorsaItaliana(html: string, etichetta: string): number | null {
  const h = html.replace(/\s+/g, " ");
  const re = new RegExp(
    `<t[dh][^>]*>\\s*(?:<[^>]+>\\s*)*${etichetta}\\s*(?:</[^>]+>\\s*)*</t[dh]>\\s*<t[dh][^>]*>\\s*(?:<[^>]+>\\s*)*([\\-0-9.,]{1,20})`,
    "i"
  );
  const m = h.match(re);
  return m?.[1] ? numeroItaliano(m[1]) : null;
}

async function daYahoo(s: Strumento): Promise<EsitoPrezzo> {
  const simbolo = s.simbolo_yahoo;
  if (!simbolo) return { isin: s.isin, prezzo: null, chiusura_precedente: null, fonte: "", errore: "simbolo Yahoo non configurato" };
  try {
    const r = await preleva(
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?interval=1d&range=5d`
    );
    if (!r.ok) throw new Error(`risposta ${r.status}`);
    const j = (await r.json()) as {
      chart?: { result?: { meta?: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number; currency?: string } }[] };
    };
    const meta = j.chart?.result?.[0]?.meta;
    if (!meta || meta.regularMarketPrice == null) throw new Error("nessuna quotazione nella risposta");

    // Guardia sulla valuta: se Yahoo restituisce una divisa diversa da quella attesa
    // il numero non è confrontabile con lo storico, quindi va scartato invece che
    // applicato — meglio un buco dichiarato che un valore sbagliato in portafoglio.
    if (meta.currency && s.valuta && meta.currency.toUpperCase() !== s.valuta.toUpperCase()) {
      throw new Error(`valuta inattesa ${meta.currency} (attesa ${s.valuta})`);
    }
    return {
      isin: s.isin,
      prezzo: meta.regularMarketPrice,
      chiusura_precedente: meta.chartPreviousClose ?? meta.previousClose ?? null,
      fonte: `Yahoo Finance (${simbolo})`,
    };
  } catch (e) {
    return { isin: s.isin, prezzo: null, chiusura_precedente: null, fonte: "", errore: (e as Error).message };
  }
}

async function daBorsaItaliana(s: Strumento): Promise<EsitoPrezzo> {
  const percorso = s.percorso_borsait;
  if (!percorso) return { isin: s.isin, prezzo: null, chiusura_precedente: null, fonte: "", errore: "percorso Borsa Italiana non configurato" };
  try {
    const url = `https://www.borsaitaliana.it/borsa/${percorso}/scheda/${s.isin}.html?lang=it`;
    const r = await preleva(url);
    if (!r.ok) throw new Error(`risposta ${r.status}`);
    const html = await r.text();
    // Controllo che la scheda sia davvero quella dell'ISIN chiesto: se la pagina
    // ricade su un elenco generico, i numeri che contiene sono di altri strumenti.
    if (!html.includes(s.isin)) throw new Error("la scheda non corrisponde all'ISIN");
    const prezzo = estraiCampoBorsaItaliana(html, "Prezzo di riferimento") ?? estraiCampoBorsaItaliana(html, "Prezzo ufficiale");
    if (prezzo == null) throw new Error("prezzo non presente nella scheda");
    return {
      isin: s.isin,
      prezzo,
      // La scheda non espone la chiusura della seduta precedente: resta null e il
      // P&L giornaliero la recupera dallo storico locale (§5.2), che con una fonte
      // affidabile giornaliera è attendibile.
      chiusura_precedente: null,
      fonte: "Borsa Italiana",
    };
  } catch (e) {
    return { isin: s.isin, prezzo: null, chiusura_precedente: null, fonte: "", errore: (e as Error).message };
  }
}

/** Recupera il prezzo di un singolo strumento dalla fonte configurata per esso. */
export async function prezzoDaFonte(s: Strumento): Promise<EsitoPrezzo> {
  if (s.fonte_prezzo === "yahoo") return daYahoo(s);
  if (s.fonte_prezzo === "borsaitaliana") return daBorsaItaliana(s);
  return {
    isin: s.isin,
    prezzo: null,
    chiusura_precedente: null,
    fonte: "",
    errore: "nessuna fonte gratuita copre questo strumento: inserisci il prezzo a mano",
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
