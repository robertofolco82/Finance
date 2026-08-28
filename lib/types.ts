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
  /** Da dove si preleva il prezzo — vedi lib/prezzi-fonti.ts. */
  fonte_prezzo?: "borsaitaliana" | "stockanalysis" | "manuale";
  /** Percorso della scheda Borsa Italiana, se fonte_prezzo = borsaitaliana. */
  percorso_borsait?: string;
  /** Percorso della scheda stockanalysis.com, se fonte_prezzo = stockanalysis. */
  percorso_stockanalysis?: string;
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
  data: string; // ISO date: la SEDUTA del prezzo, non il momento del refresh
  chiusura: number;
  chiusura_precedente: number | null;
  /** Seduta a cui appartiene chiusura_precedente, quando la fonte la dichiara. */
  data_chiusura_precedente?: string | null;
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
  numero_analisti?: number;
  buy?: number;
  hold?: number;
  sell?: number;
  periodo?: string;
  pt_medio?: number;
  pt_mediano?: number;
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
  sospetti: PrezzoSospetto[]; // quarantena corrente
}
