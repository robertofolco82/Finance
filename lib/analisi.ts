/** Analisi completa per ISIN — §8. Su derivati risolve il sottostante da sé, non fallisce mai del tutto. */

import { chiedi, erroreFase, estraiJSON } from "./anthropic";
import { readData, writeData } from "./store";
import { salvaSottostante } from "./sottostante";
import type { AnalisiReport } from "./types";

export async function analizza(isin: string): Promise<AnalisiReport> {
  const strumenti = await readData("strumenti");
  const s = strumenti.find((x) => x.isin === isin);
  const fond = await readData("fondamentali");
  let sub = s ? fond[isin]?.sotto || s.sottostante : null;

  if (s && !sub) {
    try {
      const t = await chiedi(
        `${isin} qual è il sottostante? È uno strumento${s.emittente ? ` ${s.emittente}` : ""} quotato su ${s.mercato}.\n` +
          `Rispondi con una riga sola: SOTTOSTANTE: <nomi con ticker, oppure NON TROVATO>`,
        { maxTokens: 900, effort: "low" }
      );
      const m = t.match(/SOTTOSTANTE:\s*(.+)/i);
      if (m?.[1] && !/non trovato/i.test(m[1])) {
        sub = m[1].trim().replace(/[.*_]+$/, "");
        await salvaSottostante(isin, sub);
      }
    } catch {
      // prosegue comunque con l'analisi dello strumento — §8.2, non fallire
    }
  }

  const contesto = sub
    ? `${sub}, sottostante dello strumento ISIN ${isin}.`
    : `Lo strumento ISIN ${isin}${s ? ` (${s.nome}${s.emittente ? `, ${s.emittente}` : ""}, ${s.mercato})` : ""}. ` +
      `Se è un certificato strutturato di cui non trovi il sottostante, descrivi comunque tipologia, barriera, ` +
      `scadenza e meccanismo cedolare dalla scheda.`;

  let r1: Partial<AnalisiReport>;
  try {
    const t1 = await chiedi(
      `Analizza ${contesto}\nFonti: investor relations, SEC EDGAR, Google Finance, MarketScreener, Borsa Italiana.\n` +
        `Ogni numero con la sua fonte. Non stimare ciò che non verifichi.\n\n` +
        `Rispondi SOLO con JSON: {"isin":"","nome":"","ticker":"","mercato":"","sintesi":"3-4 frasi",` +
        `"metriche":[{"voce":"","valore":"","nota":""}],` +
        `"consenso":{"rating":"","numeroAnalisti":"","ptMedio":"","ptMediano":"","ptMin":"","ptMax":"","distribuzione":""},` +
        `"prossimaTrimestrale":{"data":"","attese":""}}`,
      { maxTokens: 3000, effort: "medium" }
    );
    r1 = estraiJSON<Partial<AnalisiReport>>(t1);
  } catch (e) {
    throw erroreFase("fondamentali", e);
  }

  let r2: Partial<AnalisiReport> = {};
  try {
    const t2 = await chiedi(
      `Per ${contesto}\nCerca le operazioni degli insider (SEC Form 4 se emittente USA), i principali driver e i rischi.\n\n` +
        `Rispondi SOLO con JSON: {"insider":[{"data":"","persona":"","ruolo":"","tipo":"","importo":""}],` +
        `"driver":[""],"rischi":[""],"lacune":"","fonti":[""]}`,
      { maxTokens: 2500, effort: "medium" }
    );
    r2 = estraiJSON<Partial<AnalisiReport>>(t2);
  } catch (e) {
    r2 = {
      lacune: `Seconda parte dell'analisi non recuperata (${(e as Error).message}). Fondamentali e consenso sopra restano validi.`,
    };
  }

  const report: AnalisiReport = { ...r1, ...r2, isin, ts: Date.now() };
  const analisi = await readData("analisi");
  analisi[isin] = report;
  await writeData("analisi", analisi, `analisi ${isin}`);
  return report;
}
