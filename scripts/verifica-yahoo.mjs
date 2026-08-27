// Verifica quali ISIN del portafoglio sono coperti da Yahoo Finance, provando
// più suffissi di borsa per ciascuno. Stampa il primo simbolo che risponde.
const CANDIDATI = {
  US20451W1018: ["CMPS"],
  US8740391003: ["TSM"],
  NL0010273215: ["ASML.AS", "ASML.MI"],
  IE00BFMXXD54: ["VUAA.MI", "VUAA.DE", "VUAA.L"],
  IE00B3XXRP09: ["VUSA.MI", "VUSA.DE", "VUSA.L"],
  IE00BLDGHT92: ["UIQ4.DE", "UIQ4.MI"],
  IE00B579F325: ["SGLD.MI", "SGLD.L", "8PSG.DE"],
  LU0290358497: ["XEON.MI", "XEON.DE"],
  IE00B3VWN179: ["CSBGU3.MI", "IBTA.L", "CSBGU3.SW"],
  LU1287023185: ["EM710.MI", "EM710.DE"],
  IE000UWJUW87: ["CATB.MI", "CATB.L", "CATB.DE"],
  IT0005436693: ["IT0005436693.MI", "BTP.MI"],
  BE0000351602: ["BE0000351602.MI"],
  AT0000A2VB47: ["AT0000A2VB47.MI"],
  EU000A283859: ["EU000A283859.MI"],
  DE0001102523: ["DE0001102523.MI"],
  FR0014007L00: ["FR0014007L00.MI"],
  XS1503043694: ["XS1503043694.MI"],
  XS2388495942: ["XS2388495942.MI"],
  DE000VY3NBZ6: ["DE000VY3NBZ6.MI"],
  NLBNPIT3MRU4: ["NLBNPIT3MRU4.MI"],
  NLBNPIT37C90: ["NLBNPIT37C90.MI"],
  NLBNPIT3MA79: ["NLBNPIT3MA79.MI"],
  XS3388190996: ["XS3388190996.MI"],
  CH1358858129: ["CH1358858129.MI"],
  CH1336232371: ["CH1336232371.MI"],
  IT0006775073: ["IT0006775073.MI"],
  DE000UR0A4S0: ["DE000UR0A4S0.MI"],
};

async function prova(simbolo) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?interval=1d&range=5d`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const j = await r.json();
    const m = j?.chart?.result?.[0]?.meta;
    if (!m || m.regularMarketPrice == null) return null;
    return { prezzo: m.regularMarketPrice, prec: m.chartPreviousClose ?? m.previousClose ?? null, valuta: m.currency };
  } catch {
    return null;
  }
}

let ok = 0;
const falliti = [];
for (const [isin, simboli] of Object.entries(CANDIDATI)) {
  let trovato = null;
  for (const s of simboli) {
    const r = await prova(s);
    if (r) { trovato = { s, ...r }; break; }
  }
  if (trovato) {
    ok++;
    console.log(`OK   ${isin}  ${trovato.s.padEnd(18)} ${String(trovato.prezzo).padEnd(12)} prec=${String(trovato.prec).padEnd(12)} ${trovato.valuta}`);
  } else {
    falliti.push(isin);
    console.log(`--   ${isin}  nessuno di: ${simboli.join(", ")}`);
  }
}
console.log(`\nCoperti ${ok}/28. Non coperti (${falliti.length}): ${falliti.join(", ")}`);
