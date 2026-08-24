/**
 * Forme delle risposte API — solo tipi, nessuna dipendenza runtime. Sicuro da
 * importare nei componenti client (vedi lib/portafoglio.ts e lib/store.ts, che
 * invece toccano filesystem/rete e restano server-only).
 */

import type { GruppoMacro, RigaPortafoglio, VistaPortafoglio } from "./portafoglio";
import type {
  AnalisiReport,
  CallRicevuta,
  ChatMessage,
  Fondamentali,
  PrezzoSospetto,
  RatingLogEntry,
  Strumento,
} from "./types";

export interface PortafoglioResponse extends VistaPortafoglio {
  fondamentali: Record<string, Fondamentali>;
  sospetti: PrezzoSospetto[];
}

export interface TitoloResponse {
  strumento: Strumento;
  quantita: number;
  pmc: number | null;
  carico_eur: number;
  serie: { data: string; prezzo: number }[];
  fondamentali: Fondamentali | null;
  ratingLog: RatingLogEntry[];
  analisi: AnalisiReport | null;
  chat: ChatMessage[];
}

export interface CallsResponse {
  calls: CallRicevuta[];
}

export interface ErroreResponse {
  errore: string;
}

export type { GruppoMacro, RigaPortafoglio, VistaPortafoglio };
