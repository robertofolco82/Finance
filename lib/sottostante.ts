/** Risoluzione del sottostante — §6.3: domanda diretta, poi fallback, mai solo fonti ufficiali. */

import { chiedi } from "./anthropic";
import { readData, writeData } from "./store";
import type { Fondamentali } from "./types";

export interface RisultatoMappa {
  sotto: string | null;
  naMotivo?: string;
  messaggio?: string;
}

export async function trovaSottostante(isin: string): Promise<RisultatoMappa> {
  const strumenti = await readData("strumenti");
  const s = strumenti.find((x) => x.isin === isin);
  if (!s) throw new Error(`ISIN ${isin} non in portafoglio.`);

  const testo = await chiedi(
    `${isin} qual è il sottostante?\n` +
      `È lo strumento "${s.nome}"${s.emittente ? `, emittente ${s.emittente}` : ""}, quotato su ${s.mercato}.\n` +
      `Se è un basket, elenca tutti i sottostanti.\n\n` +
      `Chiudi con due righe:\n` +
      `SOTTOSTANTE: <nomi con ticker, oppure NON TROVATO>\n` +
      `GENERE: <azione | indice | materia prima | valuta | altro>`,
    { maxTokens: 1200, effort: "low" }
  );
  const m = testo.match(/SOTTOSTANTE:\s*(.+)/i);
  const g = testo.match(/GENERE:\s*(.+)/i);
  const valore = m?.[1] ? m[1].trim().replace(/[.*_]+$/, "") : "";
  const genere = g?.[1] ? g[1].trim().toLowerCase() : "";

  if (!valore || /non trovato/i.test(valore)) {
    return {
      sotto: null,
      messaggio: `Nessun sottostante trovato dalla ricerca per ${s.nome} (${isin}). Inseriscilo a mano.`,
    };
  }

  const naMotivo = /materia prima|commodity|valuta/.test(genere)
    ? "Sottostante non azionario: nessuna copertura di analisti."
    : undefined;

  await salvaSottostante(isin, valore, naMotivo);
  return { sotto: valore, naMotivo };
}

export async function salvaSottostante(isin: string, sotto: string, naMotivo?: string): Promise<void> {
  const fond = await readData("fondamentali");
  const attuale: Fondamentali = fond[isin] ?? { isin };
  fond[isin] = { ...attuale, isin, sotto, ...(naMotivo ? { naMotivo } : {}) };
  await writeData("fondamentali", fond, `sottostante ${isin}`);
}
