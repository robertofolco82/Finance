/**
 * Impostazioni scelte dall'utente in dashboard (oggi: solo il modello). Hanno
 * priorità sulla variabile d'ambiente ANTHROPIC_MODEL, che resta la scelta di
 * partenza finché nessuno seleziona nulla dal menù a tendina.
 */

import { MODELLO_DEFAULT } from "./modelli";
import { readData, writeData } from "./store";

/** Modello da usare per la prossima chiamata a Claude: store → env var → default. */
export async function modelloCorrente(): Promise<string> {
  try {
    const impostazioni = await readData("impostazioni");
    if (impostazioni.modello) return impostazioni.modello;
  } catch {
    // store non raggiungibile: non blocca la richiesta, usa il fallback sotto
  }
  return process.env.ANTHROPIC_MODEL || MODELLO_DEFAULT;
}

export async function impostaModello(modello: string | null): Promise<void> {
  await writeData("impostazioni", { modello }, `impostazione modello: ${modello ?? "predefinito"}`);
}
