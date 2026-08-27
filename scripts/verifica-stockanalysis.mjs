// Verifica quali sottostanti del portafoglio hanno il consenso analisti su
// stockanalysis.com (fonte gratuita). Uso: node scripts/verifica-stockanalysis.mjs
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// ticker → percorso su stockanalysis.com (quotate USA sotto /stocks/, estere sotto /quote/)
const TICKER = {
  CMPS: "stocks/cmps",
  TSM: "stocks/tsm",
  ASML: "stocks/asml",
  MU: "stocks/mu",
  JD: "stocks/jd",
  "SK Hynix": "quote/krx/000660",
  "Banco BPM": "quote/bit/BAMI",
  Barclays: "quote/lon/BARC",
  Commerzbank: "quote/etr/CBK",
};

function testo(html) {
  let t = html.replace(/<script[\s\S]*?<\/script>/g, "");
  t = t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return t;
}

export function estraiConsenso(html) {
  const t = testo(html);
  const frase = t.match(
    /According to ([\d,]+) analysts[^.]*?consensus rating of "([^"]+)" and an average price target of ([^\d\s]{0,3})([\d,]+(?:\.\d+)?)/i
  );
  if (!frase) return null;
  const num = (s) => {
    const n = Number(String(s).replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  const min = t.match(/lowest is [^\d]*([\d,]+(?:\.\d+)?) \(([-\d.]+)%\)/i);
  const max = t.match(/highest is [^\d]*([\d,]+(?:\.\d+)?) \(([+\-\d.]+)%\)/i);
  const upside = t.match(/forecast is ([\d.]+)% (higher|lower)/i);
  return {
    analisti: num(frase[1]),
    rating: frase[2],
    valuta: { $: "USD", "€": "EUR", "£": "GBP", "₩": "KRW" }[frase[3].trim()] ?? null,
    ptMedio: num(frase[4]),
    ptMin: min ? num(min[1]) : null,
    upMin: min ? num(min[2]) : null,
    ptMax: max ? num(max[1]) : null,
    upMax: max ? num(max[2]) : null,
    upMedio: upside ? (upside[2].toLowerCase() === "lower" ? -num(upside[1]) : num(upside[1])) : null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let ok = 0;
  for (const [nome, percorso] of Object.entries(TICKER)) {
    try {
      const r = await fetch(`https://stockanalysis.com/${percorso}/forecast/`, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) { console.log(`--   ${nome.padEnd(12)} HTTP ${r.status}`); continue; }
      const d = estraiConsenso(await r.text());
      if (!d) { console.log(`--   ${nome.padEnd(12)} nessun consenso nella pagina`); continue; }
      ok++;
      console.log(
        `OK   ${nome.padEnd(12)} ${String(d.rating).padEnd(12)} ${d.analisti} analisti  PT ${d.ptMedio} ${d.valuta ?? "?"}  (min ${d.ptMin} / max ${d.ptMax}, upside ${d.upMedio}%)`
      );
    } catch (e) {
      console.log(`--   ${nome.padEnd(12)} ${e.message}`);
    }
  }
  console.log(`\nCoperti ${ok}/${Object.keys(TICKER).length}`);
}
