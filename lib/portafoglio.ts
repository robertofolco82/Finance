/**
 * Vista derivata del portafoglio: combina strumenti + movimenti + prezzi + snapshot
 * dello store in un'unica struttura pronta per l'API/frontend. Nessuna scrittura qui.
 */

import { readData, ultimoPrezzo, cambioEurUsdCorrente, chiusuraPrecedente } from "./store";
import {
  anniAllaScadenza,
  attribuzione,
  durationModificata,
  pnlGiorno,
  pnlTotale,
  posizioneDaMovimenti,
  valoreEur,
  ytm,
  type PnlGiorno,
  type PnlTotale,
  type RigaAttribuzione,
} from "./calc";
import type { Movimento, Strumento } from "./types";

export interface RigaPortafoglio {
  strumento: Strumento;
  quantita: number;
  pmc: number | null;
  carico_eur: number;
  prezzo: number | null;
  chiusura_precedente: number | null;
  valore_eur: number;
  peso_pct: number;
  var_carico_pct: number | null;
  var_refresh_pct: number | null;
  serie: { data: string; prezzo: number }[];
  ytm: number | null;
  duration: number | null;
}

export interface GruppoMacro {
  macro: string;
  valore_eur: number;
  quota_pct: number;
}

export interface VistaPortafoglio {
  righe: RigaPortafoglio[];
  totale_eur: number;
  cambioEurUsd: number;
  pnlGiorno: PnlGiorno;
  /** Data della chiusura usata come base del P&L giornaliero, quando deriva dallo storico. */
  dataRiferimentoPnl: string | null;
  pnlTotale: PnlTotale;
  variazioneUltimoRefresh: { eur: number; pct: number } | null;
  gruppiMacro: GruppoMacro[];
  attribuzione: RigaAttribuzione[];
  snapshotSerie: { ts: number; totale_eur: number }[];
}

function movimentiPer(movimenti: Movimento[], isin: string): Movimento[] {
  return movimenti.filter((m) => m.isin === isin);
}

export async function costruisciVista(): Promise<VistaPortafoglio> {
  const [strumenti, movimenti, prezzi, snapshotStorico] = await Promise.all([
    readData("strumenti"),
    readData("movimenti"),
    readData("prezzi"),
    readData("snapshot"),
  ]);
  const cambio = cambioEurUsdCorrente(prezzi);
  const adesso = new Date();

  // Snapshot "prima dell'ultimo refresh": l'ultimo elemento coincide con lo stato
  // corrente appena calcolato (viene appeso ad ogni refresh), quindi il confronto
  // per l'attribuzione e per "variazione dall'ultimo refresh" usa il penultimo.
  const snapPrec = snapshotStorico.length >= 2 ? snapshotStorico[snapshotStorico.length - 2] : null;

  const righeBase = strumenti.map((s) => {
    const pos = posizioneDaMovimenti(s, movimentiPer(movimenti, s.isin));
    const p = ultimoPrezzo(prezzi, s.isin);
    const prezzo = p?.chiusura ?? null;
    const prec = chiusuraPrecedente(prezzi, s.isin);
    const valore_eur = prezzo != null ? valoreEur(s, prezzo, pos.quantita, cambio) : 0;
    const serie = prezzi
      .filter((x) => x.isin === s.isin)
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((x) => ({ data: x.data, prezzo: x.chiusura }));

    let y: number | null = null;
    let dur: number | null = null;
    if (s.tipo === "Obbligazione" && s.scadenza && s.cedola != null && prezzo != null) {
      const anni = anniAllaScadenza(s.scadenza, adesso);
      y = ytm(prezzo, s.cedola, anni, s.frequenza_cedolare ?? 1);
      dur = y != null ? durationModificata(prezzo, s.cedola, anni, s.frequenza_cedolare ?? 1) : null;
    }

    const var_carico_pct = pos.pmc != null && pos.pmc !== 0 && prezzo != null ? ((prezzo - pos.pmc) / pos.pmc) * 100 : null;

    return { strumento: s, pos, prezzo, chiusura_precedente: prec?.valore ?? null, data_riferimento_precedente: prec?.data ?? null, valore_eur, serie, ytm: y, duration: dur, var_carico_pct };
  });

  const totale_eur = righeBase.reduce((s, r) => s + r.valore_eur, 0);
  const mappaPrec = new Map((snapPrec?.righe ?? []).map((r) => [r.isin, r.valore_eur]));

  const righe: RigaPortafoglio[] = righeBase.map((r) => {
    const prec = mappaPrec.get(r.strumento.isin);
    const var_refresh_pct = prec != null && prec !== 0 ? ((r.valore_eur - prec) / prec) * 100 : null;
    return {
      strumento: r.strumento,
      quantita: r.pos.quantita,
      pmc: r.pos.pmc,
      carico_eur: r.pos.carico_eur,
      prezzo: r.prezzo,
      chiusura_precedente: r.chiusura_precedente,
      valore_eur: r.valore_eur,
      peso_pct: totale_eur ? (r.valore_eur / totale_eur) * 100 : 0,
      var_carico_pct: r.var_carico_pct,
      var_refresh_pct,
      serie: r.serie,
      ytm: r.ytm,
      duration: r.duration,
    };
  });

  const caricoTotale = righe.reduce((s, r) => s + r.carico_eur, 0);

  const dateRiferimento = righeBase
    .map((r) => r.data_riferimento_precedente)
    .filter((d): d is string => !!d)
    .sort();
  const dataRiferimentoPnl = dateRiferimento[dateRiferimento.length - 1] ?? null;

  const pGiorno = pnlGiorno(
    righe.map((r) => ({
      isin: r.strumento.isin,
      strumento: r.strumento,
      quantita: r.quantita,
      prezzo: r.prezzo ?? 0,
      chiusura_precedente: r.chiusura_precedente,
    })),
    cambio
  );
  const pTotale = pnlTotale(totale_eur, caricoTotale);

  const variazioneUltimoRefresh = snapPrec
    ? { eur: totale_eur - snapPrec.totale_eur, pct: snapPrec.totale_eur ? ((totale_eur - snapPrec.totale_eur) / snapPrec.totale_eur) * 100 : 0 }
    : null;

  const gruppi = new Map<string, number>();
  for (const r of righe) gruppi.set(r.strumento.macro, (gruppi.get(r.strumento.macro) ?? 0) + r.valore_eur);
  const gruppiMacro: GruppoMacro[] = [...gruppi.entries()]
    .map(([macro, valore_eur]) => ({ macro, valore_eur, quota_pct: totale_eur ? (valore_eur / totale_eur) * 100 : 0 }))
    .sort((a, b) => b.valore_eur - a.valore_eur);

  // Base dell'attribuzione: il valore che ogni posizione aveva alla chiusura
  // precedente. Così le barre sommano al P&L di giornata mostrato in alto.
  // Solo se nessun titolo ha una chiusura precedente si ripiega sullo snapshot,
  // che è un confronto fra due refresh e non fra due sedute.
  const valoriAllaChiusura = righeBase
    .filter((r) => r.chiusura_precedente != null)
    .map((r) => ({
      isin: r.strumento.isin,
      valore_eur: valoreEur(r.strumento, r.chiusura_precedente as number, r.pos.quantita, cambio),
    }));
  const attrib = attribuzione(
    righe.map((r) => ({ isin: r.strumento.isin, nome: r.strumento.nome, valore_eur: r.valore_eur })),
    valoriAllaChiusura.length > 0
      ? valoriAllaChiusura
      : snapPrec
        ? snapPrec.righe.map((x) => ({ isin: x.isin, valore_eur: x.valore_eur }))
        : null
  );

  return {
    righe,
    totale_eur,
    cambioEurUsd: cambio,
    pnlGiorno: pGiorno,
    dataRiferimentoPnl,
    pnlTotale: pTotale,
    variazioneUltimoRefresh,
    gruppiMacro,
    attribuzione: attrib,
    snapshotSerie: snapshotStorico.map((s) => ({ ts: s.ts, totale_eur: s.totale_eur })),
  };
}
