/** Rating analisti da fonte gratuita — §7.2, §10 (disabilitato dove non applicabile). */

import { consensoPerSottostante, percorsoPerSottostante } from "./consenso";
import { readData, writeData } from "./store";
import type { Fondamentali, RatingLogEntry } from "./types";

export async function aggiornaFondamentali(isin: string): Promise<Fondamentali> {
  const strumenti = await readData("strumenti");
  const s = strumenti.find((x) => x.isin === isin);
  if (!s) throw new Error(`ISIN ${isin} non in portafoglio.`);
  const fond = await readData("fondamentali");
  const sub = fond[isin]?.sotto || s.sottostante;
  if (!sub) throw new Error("sottostante non identificato.");
  const naMotivo = fond[isin]?.naMotivo || s.motivo_na;
  if (!s.analizzabile || naMotivo) throw new Error(naMotivo || "strumento non analizzabile.");
  if (!percorsoPerSottostante(sub)) {
    throw new Error(`nessuna fonte gratuita di consenso per «${sub}»`);
  }

  const c = await consensoPerSottostante(sub);
  if (!c) throw new Error("la fonte non espone il consenso per questo titolo.");

  const aggiornato: Fondamentali = {
    ...(fond[isin] ?? { isin }),
    isin,
    sotto: sub,
    rating: c.rating ?? undefined,
    numero_analisti: c.analisti ?? undefined,
    pt_medio: c.pt_medio ?? undefined,
    pt_mediano: c.pt_mediano ?? undefined,
    pt_max: c.pt_max ?? undefined,
    pt_min: c.pt_min ?? undefined,
    valuta: c.valuta ?? undefined,
    upside_medio: c.upside_medio ?? undefined,
    upside_max: c.upside_max ?? undefined,
    upside_min: c.upside_min ?? undefined,
    data_rilevazione: new Date().toISOString().slice(0, 10),
    fonte: c.fonte,
  };
  fond[isin] = aggiornato;
  await writeData("fondamentali", fond, `rating ${isin}`);

  if (c.rating) {
    const rlog = await readData("rating_log");
    const entry: RatingLogEntry = {
      isin,
      ts: Date.now(),
      rating: c.rating,
      pt_medio: c.pt_medio,
      buy: null,
      hold: null,
      sell: null,
    };
    rlog[isin] = [...(rlog[isin] ?? []), entry];
    await writeData("rating_log", rlog, `rating_log ${isin}`);
  }
  return aggiornato;
}

export interface RisultatoRatingTutti {
  ok: string[];
  falliti: string[];
  dettaglioErrore?: string;
}

/** Rating su tutti i titoli con sottostante coperto dalla fonte gratuita. */
export async function aggiornaFondamentaliTutti(): Promise<RisultatoRatingTutti> {
  const strumenti = await readData("strumenti");
  const fond = await readData("fondamentali");
  const target = strumenti.filter((s) => {
    const sub = fond[s.isin]?.sotto || s.sottostante;
    return sub && s.analizzabile && !fond[s.isin]?.naMotivo && !s.motivo_na && percorsoPerSottostante(sub);
  });

  const ok: string[] = [];
  const falliti: string[] = [];
  let primoErrore: string | undefined;
  for (const s of target) {
    try {
      await aggiornaFondamentali(s.isin);
      ok.push(s.isin);
    } catch (e) {
      falliti.push(s.isin);
      if (!primoErrore) primoErrore = e instanceof Error ? e.message : String(e);
    }
  }
  return { ok, falliti, ...(falliti.length && primoErrore ? { dettaglioErrore: primoErrore } : {}) };
}
