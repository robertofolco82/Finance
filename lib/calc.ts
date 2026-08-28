/**
 * Formule di calcolo — porta esatta di SPEC.md §5.
 * Pure functions, nessuna dipendenza da store o rete: testabili in isolamento.
 */

import type { Movimento, Strumento } from "./types";

type StrumentoValuta = Pick<Strumento, "tipo" | "valuta">;

/**
 * Valore di mercato in euro. Le obbligazioni quotano in percentuale del nominale
 * e sono trattate come già denominate in EUR (§5.1) — coerente coi titoli di stato
 * in portafoglio, tutti su MOT in EUR.
 */
export function valoreEur(
  strumento: StrumentoValuta,
  prezzo: number,
  quantita: number,
  cambioEurUsd: number
): number {
  if (strumento.tipo === "Obbligazione") return prezzo * (quantita / 100);
  if (strumento.valuta === "USD") return (prezzo * quantita) / cambioEurUsd;
  return prezzo * quantita;
}

/** Stesso calcolo ma con il cambio storico del singolo movimento, non quello corrente. */
function valoreMovimentoEur(strumento: StrumentoValuta, m: Movimento): number {
  if (strumento.tipo === "Obbligazione") return m.prezzo * (m.quantita / 100);
  if (strumento.valuta === "USD") return (m.prezzo * m.quantita) / m.cambio;
  return m.prezzo * m.quantita;
}

export interface PosizioneDerivata {
  quantita: number;
  carico_eur: number;
  /** Prezzo medio di carico nella valuta dello strumento, derivato dal carico_eur a ritroso. null se quantita è 0. */
  pmc: number | null;
}

/**
 * Deriva quantità e carico da movimenti (§3.1: si registrano i movimenti, non le posizioni).
 * Metodo a costo medio ponderato: ogni vendita riduce il carico proporzionalmente
 * al costo medio del momento, non FIFO/LIFO.
 */
export function posizioneDaMovimenti(
  strumento: StrumentoValuta,
  movimenti: Movimento[]
): PosizioneDerivata {
  const ordinati = [...movimenti].sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id);
  let quantita = 0;
  let carico_eur = 0;
  for (const m of ordinati) {
    if (m.segno === "acquisto") {
      quantita += m.quantita;
      carico_eur += valoreMovimentoEur(strumento, m);
    } else {
      const costoMedioUnitario = quantita > 0 ? carico_eur / quantita : 0;
      quantita -= m.quantita;
      carico_eur -= costoMedioUnitario * m.quantita;
    }
  }
  if (quantita <= 0) return { quantita: Math.max(0, quantita), carico_eur, pmc: null };

  // Ricostruisce il pmc nella valuta dello strumento invertendo valoreEur, usando
  // il cambio medio ponderato dei soli acquisti come approssimazione per le posizioni USD.
  const acquisti = ordinati.filter((m) => m.segno === "acquisto");
  const cambioMedio =
    acquisti.reduce((s, m) => s + m.cambio * m.quantita, 0) /
    (acquisti.reduce((s, m) => s + m.quantita, 0) || 1);

  let pmc: number;
  if (strumento.tipo === "Obbligazione") pmc = (carico_eur / quantita) * 100;
  else if (strumento.valuta === "USD") pmc = (carico_eur * cambioMedio) / quantita;
  else pmc = carico_eur / quantita;

  return { quantita, carico_eur, pmc };
}

export interface RigaPnlGiorno {
  isin: string;
  strumento: StrumentoValuta;
  quantita: number;
  prezzo: number;
  chiusura_precedente: number | null;
}

export type PnlGiorno =
  | { assente: true }
  | { assente: false; eur: number; pct: number; copertura: number; totali: number };

/**
 * P&L giornaliero dalla chiusura precedente per titolo (§5.2).
 * Non dipende da uno snapshot locale del giorno prima: se un titolo non ha
 * chiusura_precedente viene escluso e la copertura parziale va sempre mostrata.
 */
export function pnlGiorno(righe: RigaPnlGiorno[], cambioEurUsd: number): PnlGiorno {
  const conChiusura = righe.filter((r) => r.chiusura_precedente != null);
  if (conChiusura.length === 0) return { assente: true };
  const oggi = conChiusura.reduce(
    (s, r) => s + valoreEur(r.strumento, r.prezzo, r.quantita, cambioEurUsd),
    0
  );
  const ieri = conChiusura.reduce(
    (s, r) => s + valoreEur(r.strumento, r.chiusura_precedente as number, r.quantita, cambioEurUsd),
    0
  );
  if (ieri === 0) return { assente: true };
  return {
    assente: false,
    eur: oggi - ieri,
    pct: ((oggi - ieri) / ieri) * 100,
    copertura: conChiusura.length,
    totali: righe.length,
  };
}

export interface PnlTotale {
  eur: number;
  pct: number;
  carico: number;
}

/** P&L complessivo dal carico (§5.3): valore corrente meno carico derivato dai movimenti. */
export function pnlTotale(valoreTotaleEur: number, caricoTotaleEur: number): PnlTotale {
  return {
    eur: valoreTotaleEur - caricoTotaleEur,
    pct: caricoTotaleEur !== 0 ? ((valoreTotaleEur - caricoTotaleEur) / caricoTotaleEur) * 100 : 0,
    carico: caricoTotaleEur,
  };
}

/** Anni residui alla scadenza da una data ISO, rispetto a "adesso" (o a una data di riferimento). */
export function anniAllaScadenza(scadenzaIso: string, adesso: Date = new Date()): number {
  const scad = new Date(scadenzaIso);
  return (scad.getTime() - adesso.getTime()) / (365.25 * 86400000);
}

/** YTM per bisezione, prezzo tel quel su 100 di nominale (§5.4). */
export function ytm(
  prezzo: number,
  cedola: number,
  anniResidui: number,
  freq: 1 | 2 = 1
): number | null {
  if (anniResidui <= 0) return null;
  const n = Math.max(1, Math.round(anniResidui * freq));
  const c = cedola / freq;
  const pv = (y: number): number => {
    const r = y / freq;
    let s = 0;
    for (let i = 1; i <= n; i++) s += c / Math.pow(1 + r, i);
    return s + 100 / Math.pow(1 + r, n);
  };
  let lo = -0.5;
  let hi = 1.0;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > prezzo) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * 100;
}

/** Duration modificata (§5.5). */
export function durationModificata(
  prezzo: number,
  cedola: number,
  anniResidui: number,
  freq: 1 | 2 = 1
): number | null {
  const y = ytm(prezzo, cedola, anniResidui, freq);
  if (y == null) return null;
  const r = y / 100 / freq;
  const n = Math.max(1, Math.round(anniResidui * freq));
  const c = cedola / freq;
  let pvTotale = 0;
  let ponderato = 0;
  for (let i = 1; i <= n; i++) {
    const cf = i === n ? c + 100 : c;
    const pv = cf / Math.pow(1 + r, i);
    pvTotale += pv;
    ponderato += (i / freq) * pv;
  }
  const macaulay = ponderato / pvTotale;
  return macaulay / (1 + r);
}

export interface RigaAttribuzione {
  isin: string;
  nome: string;
  valore_eur: number;
  dEur: number;
  dPct: number | null;
}

/**
 * Attribuzione (§5.6): quanto ha spostato il totale ogni singola posizione.
 *
 * La base di confronto è il valore della posizione alla chiusura precedente,
 * così la somma delle barre è esattamente il P&L di giornata mostrato in alto:
 * il grafico scompone quel numero invece di raccontare un'altra storia. Se una
 * posizione non ha un valore di confronto (nessun prezzo precedente noto) il suo
 * dPct è null e la barra è a zero.
 */
export function attribuzione(
  righeAttuali: { isin: string; nome: string; valore_eur: number }[],
  valoriPrecedenti: { isin: string; valore_eur: number }[] | null
): RigaAttribuzione[] {
  const mappa = new Map((valoriPrecedenti ?? []).map((r) => [r.isin, r.valore_eur]));
  return righeAttuali.map((r) => {
    const prec = mappa.get(r.isin);
    const dEur = prec != null ? r.valore_eur - prec : 0;
    const dPct = prec != null && prec !== 0 ? (dEur / prec) * 100 : null;
    return { isin: r.isin, nome: r.nome, valore_eur: r.valore_eur, dEur, dPct };
  });
}

/** Sensibilità a +100bp (§5.5): -duration_media * valore_obbligazionario / 100. */
export function sensibilitaTassi(durationMedia: number, valoreObbligazionarioEur: number): number {
  return -durationMedia * (valoreObbligazionarioEur / 100);
}
