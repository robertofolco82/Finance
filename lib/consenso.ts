/**
 * Consenso analisti da fonte gratuita (stockanalysis.com), in sostituzione della
 * ricerca via LLM che costava a ogni rilevazione.
 *
 * Preferisce la tabella strutturata "Target Low / Average / Median / High" perché
 * espone anche la MEDIANA, che §8.2 della spec chiede esplicitamente ("il price
 * target va scomposto: media, mediana, minimo, massimo"); ricade sulla frase
 * discorsiva solo se la tabella non c'è.
 *
 * Nessun dato viene stimato: ciò che non si legge resta null e la UI mostra "—".
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

export interface Consenso {
  rating: string | null;
  analisti: number | null;
  valuta: string | null;
  pt_medio: number | null;
  pt_mediano: number | null;
  pt_min: number | null;
  pt_max: number | null;
  upside_medio: number | null;
  upside_min: number | null;
  upside_max: number | null;
  fonte: string;
}

const SIMBOLI: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP", "₩": "KRW" };

function numero(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s.replace(/[^\d.-]/g, "").replace(/(?!^)-/g, ""));
  return Number.isFinite(n) ? n : null;
}

function valutaDa(s: string | undefined): string | null {
  if (!s) return null;
  for (const [sim, cod] of Object.entries(SIMBOLI)) if (s.includes(sim)) return cod;
  return null;
}

/** Testo visibile della pagina, senza tag né script. */
export function testoVisibile(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

export function estraiConsenso(html: string): Consenso | null {
  const t = testoVisibile(html);

  const frase = t.match(
    /According to ([\d,]+) analysts[^.]*?consensus rating of "([^"]+)"/i
  );
  const rating = frase?.[2] ?? null;
  const analisti = frase?.[1] ? numero(frase[1]) : null;

  // Tabella: "Target Low Average Median High Price <4 valori> Change <4 valori>"
  const tab = t.match(
    /Target\s+Low\s+Average\s+Median\s+High\s+Price\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+Change\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/i
  );
  if (tab) {
    return {
      rating,
      analisti,
      valuta: valutaDa(tab[1]),
      pt_min: numero(tab[1]),
      pt_medio: numero(tab[2]),
      pt_mediano: numero(tab[3]),
      pt_max: numero(tab[4]),
      upside_min: numero(tab[5]),
      upside_medio: numero(tab[6]),
      upside_max: numero(tab[8]),
      fonte: "stockanalysis.com",
    };
  }

  // Ricaduta sulla frase discorsiva, che non contiene la mediana.
  const media = t.match(/average price target of ([^\d\s]{0,3})([\d,]+(?:\.\d+)?)/i);
  const min = t.match(/lowest is ([^\d\s]{0,3})([\d,]+(?:\.\d+)?) \(([+\-\d.]+)%\)/i);
  const max = t.match(/highest is ([^\d\s]{0,3})([\d,]+(?:\.\d+)?) \(([+\-\d.]+)%\)/i);
  const up = t.match(/forecast is ([\d.]+)% (higher|lower)/i);
  if (!rating && !media) return null;
  const upMedio = up?.[1] ? numero(up[1]) : null;
  return {
    rating,
    analisti,
    valuta: valutaDa(media?.[1]),
    pt_medio: numero(media?.[2]),
    pt_mediano: null,
    pt_min: numero(min?.[2]),
    pt_max: numero(max?.[2]),
    upside_medio: upMedio != null && up?.[2]?.toLowerCase() === "lower" ? -upMedio : upMedio,
    upside_min: numero(min?.[3]),
    upside_max: numero(max?.[3]),
    fonte: "stockanalysis.com",
  };
}

/** Percorsi già verificati per i sottostanti del portafoglio. */
export const PERCORSO_CONSENSO: Record<string, string> = {
  CMPS: "stocks/cmps",
  TSM: "stocks/tsm",
  ASML: "stocks/asml",
  MU: "stocks/mu",
  JD: "stocks/jd",
  "000660.KS": "quote/krx/000660",
  BAMI: "quote/bit/BAMI",
  BARC: "quote/lon/BARC",
  CBK: "quote/etr/CBK",
};

/** Estrae il primo ticker riconosciuto dalla descrizione del sottostante. */
export function percorsoPerSottostante(sottostante: string | null | undefined): string | null {
  if (!sottostante) return null;
  for (const [ticker, percorso] of Object.entries(PERCORSO_CONSENSO)) {
    if (new RegExp(`\\b${ticker.replace(".", "\\.")}\\b`).test(sottostante)) return percorso;
  }
  return null;
}

export async function consensoPerSottostante(sottostante: string | null | undefined): Promise<Consenso | null> {
  const percorso = percorsoPerSottostante(sottostante);
  if (!percorso) return null;
  const r = await fetch(`https://stockanalysis.com/${percorso}/forecast/`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`la fonte ha risposto ${r.status}`);
  return estraiConsenso(await r.text());
}
