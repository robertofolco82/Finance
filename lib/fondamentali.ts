/** Rating analisti e calendario utili — §7.2, §10 (disabilitato dove non applicabile). */

import { attesa, chiedi, estraiJSON } from "./anthropic";
import { modelloCorrente } from "./settings";
import { readData, writeData } from "./store";
import type { Fondamentali, RatingLogEntry } from "./types";

interface RispostaFondamentali {
  rating: string;
  buy: number;
  hold: number;
  sell: number;
  periodo: string;
  ptMedio: number;
  ptMax: number;
  ptMin: number;
  valuta: string;
  upMedio: number;
  upMax: number;
  upMin: number;
  dataRilevazione: string;
  prossimiUtili: string;
  attese: string;
  guidance: string;
  fonte: string;
}

export async function aggiornaFondamentali(isin: string, modelloOverride?: string): Promise<Fondamentali> {
  const strumenti = await readData("strumenti");
  const s = strumenti.find((x) => x.isin === isin);
  if (!s) throw new Error(`ISIN ${isin} non in portafoglio.`);
  const fond = await readData("fondamentali");
  const sub = fond[isin]?.sotto || s.sottostante;
  if (!sub) throw new Error("sottostante non identificato: cercalo prima con «Trova sottostante».");
  const naMotivo = fond[isin]?.naMotivo || s.motivo_na;
  if (!s.analizzabile || naMotivo) throw new Error(naMotivo || "strumento non analizzabile.");

  const modello = modelloOverride ?? (await modelloCorrente());
  const testo = await chiedi(
    `Titolo: ${sub}. Cerca il consenso degli analisti e il calendario utili.\n` +
      `Fonti: Google Finance, MarketScreener, Nasdaq, StockAnalysis, investor relations.\n` +
      `Rispondi SOLO con JSON: {"rating":"Strong Buy|Buy|Hold|Sell","buy":num,"hold":num,"sell":num,` +
      `"periodo":"es. ultimi 3 mesi","ptMedio":num,"ptMax":num,"ptMin":num,"valuta":"USD|EUR",` +
      `"upMedio":num,"upMax":num,"upMin":num,"dataRilevazione":"AAAA-MM-GG",` +
      `"prossimiUtili":"AAAA-MM-GG","attese":"","guidance":"","fonte":""}\n` +
      `Numeri puri senza simboli. null se non verificabile.`,
    { maxTokens: 1800, effort: "medium", model: modello }
  );
  const d = estraiJSON<Partial<RispostaFondamentali>>(testo);

  const aggiornato: Fondamentali = {
    ...(fond[isin] ?? { isin }),
    isin,
    sotto: sub,
    rating: d.rating,
    buy: d.buy,
    hold: d.hold,
    sell: d.sell,
    periodo: d.periodo,
    pt_medio: d.ptMedio,
    pt_max: d.ptMax,
    pt_min: d.ptMin,
    valuta: d.valuta,
    upside_medio: d.upMedio,
    upside_max: d.upMax,
    upside_min: d.upMin,
    data_rilevazione: d.dataRilevazione,
    prossimi_utili: d.prossimiUtili,
    attese: d.attese,
    guidance: d.guidance,
    fonte: d.fonte,
  };
  fond[isin] = aggiornato;
  await writeData("fondamentali", fond, `rating ${isin}`);

  if (d.rating) {
    const rlog = await readData("rating_log");
    const entry: RatingLogEntry = {
      isin,
      ts: Date.now(),
      rating: d.rating,
      pt_medio: d.ptMedio ?? null,
      buy: d.buy ?? null,
      hold: d.hold ?? null,
      sell: d.sell ?? null,
    };
    rlog[isin] = [...(rlog[isin] ?? []), entry];
    await writeData("rating_log", rlog, `rating_log ${isin}`);
  }
  return aggiornato;
}

export interface RisultatoRatingTutti {
  ok: string[];
  falliti: string[];
  /** Messaggio del primo errore incontrato, se almeno un titolo è fallito. */
  dettaglioErrore?: string;
}

/** Rating su tutti i titoli con sottostante noto e analizzabile (§7.1 "Aggiorna rating"). */
export async function aggiornaFondamentaliTutti(): Promise<RisultatoRatingTutti> {
  const strumenti = await readData("strumenti");
  const fond = await readData("fondamentali");
  const target = strumenti.filter((s) => {
    const sub = fond[s.isin]?.sotto || s.sottostante;
    return sub && s.analizzabile && !fond[s.isin]?.naMotivo && !s.motivo_na;
  });

  const modello = await modelloCorrente();
  const ok: string[] = [];
  const falliti: string[] = [];
  let primoErrore: string | null = null;
  for (const [i, s] of target.entries()) {
    try {
      await aggiornaFondamentali(s.isin, modello);
      ok.push(s.isin);
    } catch (e) {
      falliti.push(s.isin);
      if (!primoErrore) primoErrore = e instanceof Error ? e.message : String(e);
    }
    if (i < target.length - 1) await attesa(700);
  }
  return { ok, falliti, ...(falliti.length && primoErrore ? { dettaglioErrore: primoErrore } : {}) };
}
