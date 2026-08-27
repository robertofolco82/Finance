/**
 * Re-import posizioni da xls — §10: riallinea quantità e PMC dopo acquisti/vendite
 * reali. Non tocca l'anagrafica (mercato, classe, macro, sottostante...): quella
 * resta gestita a parte, qui si tocca solo lo stato derivabile da movimenti.
 *
 * Per ogni ISIN riconosciuto e diverso dallo stato attuale, i vecchi movimenti
 * per quell'ISIN vengono sostituiti con un unico movimento sintetico che
 * riproduce esattamente quantità e PMC del file — stesso principio già usato
 * per il seed iniziale (§13/README "Limiti noti": non riflette le date reali
 * dei singoli acquisti, ma tiene lo storico movimenti pulito invece di
 * accumulare correzioni su correzioni ad ogni re-import).
 */

import { posizioneDaMovimenti } from "./calc";
import { registraSnapshot } from "./fetch-prezzi";
import { cambioEurUsdCorrente, readData, writeData } from "./store";
import { parseXls } from "./xls";
import type { Movimento } from "./types";

export interface RisultatoImportazione {
  riallineati: string[];
  invariati: string[];
  nonRiconosciuti: string[];
  assenti: string[];
}

const EPSILON = 1e-6;

export async function importaPortafoglioXls(buffer: Buffer): Promise<RisultatoImportazione> {
  const righe = await parseXls(buffer);
  const strumenti = await readData("strumenti");
  const movimenti = await readData("movimenti");
  const prezzi = await readData("prezzi");
  const cambio = cambioEurUsdCorrente(prezzi);
  const oggi = new Date().toISOString().slice(0, 10);

  const riallineati: string[] = [];
  const invariati: string[] = [];
  const nonRiconosciuti: string[] = [];
  const isinNelFile = new Set(righe.map((r) => r.isin));

  let prossimoId = movimenti.reduce((m, x) => Math.max(m, x.id), 0) + 1;
  let movimentiAggiornati = [...movimenti];

  for (const r of righe) {
    const strumento = strumenti.find((s) => s.isin === r.isin);
    if (!strumento) {
      nonRiconosciuti.push(r.isin);
      continue;
    }

    const attuale = posizioneDaMovimenti(strumento, movimentiAggiornati.filter((m) => m.isin === r.isin));
    const stessaQuantita = Math.abs(attuale.quantita - r.quantita) < EPSILON;
    const stessoPmc = attuale.pmc != null && Math.abs(attuale.pmc - r.pmc) < EPSILON;
    if (stessaQuantita && stessoPmc) {
      invariati.push(r.isin);
      continue;
    }

    movimentiAggiornati = movimentiAggiornati.filter((m) => m.isin !== r.isin);
    const nuovo: Movimento = {
      id: prossimoId++,
      isin: r.isin,
      data: oggi,
      segno: "acquisto",
      quantita: r.quantita,
      prezzo: r.pmc,
      cambio: strumento.valuta === "USD" ? cambio : 1,
      commissioni: 0,
      nota: `Ricostruito da re-import xls del ${oggi}: sostituisce i movimenti precedenti per allinearsi a quantità e PMC del nuovo file. Non riflette le date reali dei singoli acquisti.`,
    };
    movimentiAggiornati.push(nuovo);
    riallineati.push(r.isin);
  }

  const assenti = strumenti
    .filter((s) => !isinNelFile.has(s.isin))
    .filter((s) => posizioneDaMovimenti(s, movimentiAggiornati.filter((m) => m.isin === s.isin)).quantita > EPSILON)
    .map((s) => s.isin);

  if (riallineati.length > 0) {
    await writeData("movimenti", movimentiAggiornati, `re-import xls ${oggi}: ${riallineati.length} posizioni riallineate`);
    await registraSnapshot();
  }

  return { riallineati, invariati, nonRiconosciuti, assenti };
}
