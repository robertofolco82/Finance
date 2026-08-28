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
 *
 * ATTENZIONE al campo giusto. Su Borsa Italiana "Prezzo di riferimento" NON è il
 * prezzo di adesso: è la chiusura dell'ultima seduta conclusa (la scheda lo dice
 * esplicitamente nel campo "Data di riferimento"). Il prezzo di adesso è quello
 * dell'ULTIMO CONTRATTO, in cima alla scheda, insieme alla variazione % e all'ora.
 * Leggere il riferimento al posto dell'ultimo contratto significa confrontare la
 * chiusura di ieri con la chiusura di ieri: P&L giornaliero sempre nullo.
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
  /**
   * Data della seduta a cui il prezzo appartiene (ISO), quando la fonte la
   * dichiara. Serve a non archiviare la chiusura di venerdì sotto la data di
   * sabato: il P&L giornaliero confronta sedute, non momenti in cui hai premuto
   * il bottone.
   */
  data_sessione?: string | null;
  /** Seduta della chiusura precedente, quando la fonte la dichiara. */
  data_chiusura_precedente?: string | null;
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

/**
 * Percentuale italiana col segno: "-0,01%" → -0.01, "+1,23%" → 1.23.
 * Il segno serve: è la variazione rispetto alla chiusura precedente, e invertirla
 * è il modo per risalire a quella chiusura.
 */
export function percentualeItaliana(testo: string): number | null {
  const m = testo.replace(/&nbsp;/g, " ").match(/([+-]?)\s*(\d{1,3}(?:\.\d{3})*(?:,\d+)?)\s*%/);
  if (!m) return null;
  const n = Number((m[2] as string).replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return m[1] === "-" ? -n : n;
}

/** Data italiana → ISO. Accetta sia "27/08/26" sia "27/08/2026": la scheda usa entrambe. */
export function dataIsoDaItaliana(testo: string): string | null {
  const m = testo.replace(/&nbsp;/g, " ").match(/(\d{2})\/(\d{2})\/(\d{2}(?:\d{2})?)/);
  if (!m) return null;
  const [, gg, mm, aa] = m;
  const anno = (aa as string).length === 2 ? `20${aa}` : (aa as string);
  return `${anno}-${mm}-${gg}`;
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

/**
 * Intestazione della scheda: è lì che sta il prezzo di ADESSO.
 *
 *   <span class="... -formatPrice"><strong>87,38</strong></span>
 *   <span class="... -percPrice"><strong>-0,01%</strong></span>
 *   Fase: <strong>Continuous</strong>
 *   Ultimo Contratto: <strong>28/08/26&nbsp;&nbsp;9.24.54</strong>
 *
 * Su uno strumento illiquido che oggi non ha scambiato, il prezzo è vuoto e
 * l'ultimo contratto pure: è un'informazione, non un errore.
 */
export interface IntestazioneBorsaItaliana {
  /** Prezzo dell'ultimo contratto concluso. */
  prezzo: number | null;
  /** Variazione dichiarata dalla borsa, calcolata sulla chiusura precedente. */
  variazionePct: number | null;
  /** Seduta a cui appartiene l'ultimo contratto (ISO). */
  seduta: string | null;
}

export function estraiIntestazioneBorsaItaliana(html: string): IntestazioneBorsaItaliana {
  const prezzoGrezzo = html.match(/-formatPrice[^"]*"[^>]*>\s*<strong>([^<]*)<\/strong>/i)?.[1] ?? "";
  const pctGrezzo = html.match(/-percPrice[^"]*"[^>]*>\s*<strong>([^<]*)<\/strong>/i)?.[1] ?? "";
  // La frase "Ultimo Contratto:" è spezzata da tag nella pagina reale: vanno tolti.
  const testo = html.replace(/&nbsp;|&#160;/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const seduta = testo.match(/Ultimo Contratto:\s*(\d{2}\/\d{2}\/\d{2,4})/i)?.[1] ?? null;
  return {
    prezzo: numeroItaliano(prezzoGrezzo),
    variazionePct: percentualeItaliana(pctGrezzo),
    seduta: seduta ? dataIsoDaItaliana(seduta) : null,
  };
}

/** Prezzo di riferimento = chiusura dell'ultima seduta conclusa, con la sua data. */
export interface RiferimentoBorsaItaliana {
  valore: number;
  /** Seduta della chiusura, quando la scheda la dichiara. */
  data: string | null;
}

export function estraiRiferimentoBorsaItaliana(html: string): RiferimentoBorsaItaliana | null {
  // Due formati: la data dentro la cella stessa (ETF: "128,10 - 27/08/26 17.55.00")
  // oppure in un campo separato (obbligazioni: "Data di riferimento").
  const coppie: [string, string][] = [
    ["Prezzo di riferimento", "Data di riferimento"],
    ["Prezzo ufficiale", "Data Pr Ufficiale"],
  ];
  for (const [etichettaPrezzo, etichettaData] of coppie) {
    const cella = campoEtichettato(html, etichettaPrezzo);
    if (!cella) continue;
    const valore = numeroItaliano(cella);
    if (valore == null) continue;
    const data = dataIsoDaItaliana(cella) ?? dataIsoDaItaliana(campoEtichettato(html, etichettaData) ?? "");
    return { valore, data };
  }
  return null;
}

export interface PrezzoComposto {
  prezzo: number | null;
  chiusura_precedente: number | null;
  /** Seduta a cui appartiene `prezzo`. */
  data_sessione: string | null;
  /** Seduta a cui appartiene `chiusura_precedente`, quando è nota. */
  data_chiusura_precedente: string | null;
}

/**
 * Mette insieme i due numeri che servono al P&L di giornata (§5.2):
 * prezzo dell'ultimo contratto e chiusura della seduta precedente.
 *
 * Il riferimento pubblicato è la chiusura precedente FINCHÉ la seduta è in corso;
 * a fine giornata la borsa lo ricalcola e diventa la chiusura di oggi. Per non
 * confondere i due casi si usa la variazione % come arbitro: è per definizione
 * calcolata sulla chiusura precedente, quindi invertirla ricostruisce quella
 * chiusura. Se il riferimento coincide con quel valore è ancora la chiusura
 * precedente e lo si preferisce (non ha l'arrotondamento della percentuale); se
 * non coincide, è già passato a oggi e va scartato.
 */
export function componiPrezzoBorsaItaliana(html: string): PrezzoComposto {
  const testa = estraiIntestazioneBorsaItaliana(html);
  const rif = estraiRiferimentoBorsaItaliana(html);

  // Oggi non ha scambiato: l'unico prezzo vero è il riferimento, e la chiusura
  // precedente va cercata nello storico locale.
  if (testa.prezzo == null) {
    return {
      prezzo: rif?.valore ?? null,
      chiusura_precedente: null,
      data_sessione: rif?.data ?? null,
      data_chiusura_precedente: null,
    };
  }

  const dallaVariazione =
    testa.variazionePct != null && testa.variazionePct > -100
      ? testa.prezzo / (1 + testa.variazionePct / 100)
      : null;

  let chiusura = dallaVariazione;
  let dataChiusura: string | null = null;
  if (rif) {
    // Quando entrambe le date ci sono, decidono loro: un riferimento di una
    // seduta ANTERIORE all'ultimo contratto è per definizione la chiusura
    // precedente; se è della stessa seduta, la borsa l'ha già ricalcolato a fine
    // giornata ed è la chiusura di oggi, quindi non serve. Solo se la scheda non
    // datta il riferimento si ricorre al confronto con la variazione.
    const eChiusuraPrecedente =
      rif.data != null && testa.seduta != null
        ? rif.data < testa.seduta
        : dallaVariazione != null && Math.abs(rif.valore - dallaVariazione) / dallaVariazione < 0.001;
    if (eChiusuraPrecedente) {
      chiusura = rif.valore;
      dataChiusura = rif.data;
    }
  }

  return {
    prezzo: testa.prezzo,
    chiusura_precedente: chiusura,
    data_sessione: testa.seduta ?? rif?.data ?? null,
    data_chiusura_precedente: dataChiusura,
  };
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
    const c = componiPrezzoBorsaItaliana(html);
    if (c.prezzo == null) throw new Error("prezzo non presente nella scheda");
    return {
      isin: s.isin,
      prezzo: c.prezzo,
      chiusura_precedente: c.chiusura_precedente,
      data_sessione: c.data_sessione,
      data_chiusura_precedente: c.data_chiusura_precedente,
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
