/**
 * Elenco curato dei modelli selezionabili dall'utente in dashboard — nessuna
 * dipendenza runtime, sicuro da importare sia lato server (validazione) sia
 * lato client (menù a tendina in components/SelettoreModello.tsx).
 */

export interface ModelloInfo {
  id: string;
  nome: string;
  descrizione: string;
}

export const MODELLI_DISPONIBILI: ModelloInfo[] = [
  { id: "claude-opus-5", nome: "Opus 5 — il più capace", descrizione: "Massima accuratezza, costo più alto." },
  { id: "claude-sonnet-5", nome: "Sonnet 5 — bilanciato", descrizione: "Buon compromesso tra qualità e costo, adatto all'uso quotidiano." },
  { id: "claude-haiku-4-5-20251001", nome: "Haiku 4.5 — il più economico", descrizione: "Veloce ed economico, meno adatto ad analisi complesse." },
];

export const MODELLO_DEFAULT = "claude-opus-5";

export function modelloValido(id: string): boolean {
  return MODELLI_DISPONIBILI.some((m) => m.id === id);
}
