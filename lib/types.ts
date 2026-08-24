/**
 * Modello dati — vedi SPEC.md §3.
 * Le posizioni si derivano dai movimenti, non si registrano direttamente (§3.1).
 */

export type Macro = "Azioni" | "Obbligazioni" | "Monetario" | "Commodities";

export type TipoStrumento =
  | "Azione"
  | "ETF"
  | "ETC"
  | "ETN"
  | "Certificate"
  | "Obbligazione";

export interface Strumento {
  isin: string;
  nome: string;
  simbolo: string;
  mercato: string;
  tipo: TipoStrumento;
  classe: string;
  macro: Macro;
  valuta: "EUR" | "USD";
  sottostante: string | null;
  sottostante_verificato: boolean;
  emittente?: string;
  cedola?: number;
  scadenza?: string; // ISO date
  frequenza_cedolare?: 1 | 2;
  barriera?: number;
  analizzabile: boolean;
  motivo_na?: string;
  nota?: string;
  fonte_scheda?: string;
}

export interface Movimento {
  id: number;
  isin: string;
  data: string; // ISO date
  segno: "acquisto" | "vendita";
  quantita: number;
  prezzo: number;
  cambio: number; // EUR/valuta alla data
  commissioni: number;
  nota?: string;
}

export interface PrezzoRecord {
  isin: string;
  data: string; // ISO date
  chiusura: number;
  chiusura_precedente: number | null;
  valuta: string;
  fonte: string;
  raccolto_il: string; // ISO timestamp
}

export interface SnapshotRiga {
  isin: string;
  prezzo: number;
  valore_eur: number;
}

export interface Snapshot {
  ts: number; // epoch ms
  totale_eur: number;
  righe: SnapshotRiga[];
}

export interface Fondamentali {
  isin: string;
  rating?: "Strong Buy" | "Buy" | "Hold" | "Sell" | string;
  buy?: number;
  hold?: number;
  sell?: number;
  periodo?: string;
  pt_medio?: number;
  pt_max?: number;
  pt_min?: number;
  upside_medio?: number;
  upside_max?: number;
  upside_min?: number;
  valuta?: string;
  data_rilevazione?: string;
  prossimi_utili?: string;
  attese?: string;
  guidance?: string;
  fonte?: string;
  sotto?: string;
  naMotivo?: string;
}

export interface RatingLogEntry {
  isin: string;
  ts: number;
  rating: string;
  pt_medio: number | null;
  buy: number | null;
  hold: number | null;
  sell: number | null;
}

export interface CallRicevuta {
  id: number;
  titolo: string;
  ticker: string;
  direzione: "long" | "short" | "neutrale";
  strumento: string;
  target: string;
  orizzonte: string;
  data_report: string; // ISO date, t0
  rating_autore: string;
  benchmark_ticker: string | null;
  rendimento: number | null;
  rendimento_strumento: number | null;
  benchmark: number | null;
  benchmark_nome?: string;
  file: string;
}

export interface ChatMessage {
  isin: string;
  ts: number;
  ruolo: "user" | "assistant";
  testo: string;
}

export interface AnalisiMetrica {
  voce: string;
  valore: string;
  nota?: string;
}

export interface AnalisiInsider {
  data: string;
  persona: string;
  ruolo: string;
  tipo: string;
  importo: string;
}

export interface AnalisiConsenso {
  rating?: string;
  numeroAnalisti?: string;
  ptMedio?: string;
  ptMediano?: string;
  ptMin?: string;
  ptMax?: string;
  distribuzione?: string;
}

export interface AnalisiReport {
  isin: string;
  nome?: string;
  ticker?: string;
  mercato?: string;
  sintesi?: string;
  metriche?: AnalisiMetrica[];
  consenso?: AnalisiConsenso;
  insider?: AnalisiInsider[];
  prossimaTrimestrale?: { data?: string; attese?: string };
  driver?: string[];
  rischi?: string[];
  lacune?: string;
  fonti?: string[];
  ts: number;
}

export interface PrezzoSospetto {
  isin: string;
  nome: string;
  vecchio: number;
  nuovo: number;
  variazione: number; // %
  chiusura_precedente: number | null;
  fonte: string;
  valuta: string;
}

/** L'intero store versionato su disco/GitHub. Vedi lib/store.ts. */
export interface DataStore {
  strumenti: Strumento[];
  movimenti: Movimento[];
  prezzi: PrezzoRecord[]; // storico, append-only, PK (isin,data) logica
  snapshot: Snapshot[];
  fondamentali: Record<string, Fondamentali>;
  rating_log: Record<string, RatingLogEntry[]>;
  calls: CallRicevuta[];
  chat: Record<string, ChatMessage[]>;
  analisi: Record<string, AnalisiReport>;
  sospetti: PrezzoSospetto[]; // quarantena corrente
}
