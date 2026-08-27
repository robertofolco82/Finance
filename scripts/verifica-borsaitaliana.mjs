// Verifica quali dei 17 ISIN non coperti da Yahoo sono leggibili da Borsa Italiana,
// provando i pattern di URL scoperti. Stampa il prezzo trovato per ciascuno.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const PATTERN = [
  (i) => `borsa/obbligazioni/mot/btp/scheda/${i}.html`,
  (i) => `borsa/obbligazioni/mot/obbligazioni-in-euro/scheda/${i}.html`,
  (i) => `borsa/cw-e-certificates/scheda/${i}.html`,
  (i) => `borsa/etf/scheda/${i}.html`,
];

const ISIN = [
  "IT0005436693", "BE0000351602", "AT0000A2VB47", "EU000A283859", "DE0001102523",
  "FR0014007L00", "XS1503043694", "XS2388495942", "DE000VY3NBZ6", "NLBNPIT3MRU4",
  "NLBNPIT37C90", "NLBNPIT3MA79", "XS3388190996", "CH1358858129", "CH1336232371",
  "IT0006775073", "DE000UR0A4S0",
];

function estrai(html) {
  const h = html.replace(/\s+/g, " ");
  const cerca = (etichetta) => {
    const re = new RegExp(
      `<t[dh][^>]*>\\s*(?:<[^>]+>\\s*)*${etichetta}\\s*(?:</[^>]+>\\s*)*</t[dh]>\\s*<t[dh][^>]*>\\s*(?:<[^>]+>\\s*)*([\\-0-9.,]{1,20})`,
      "i"
    );
    const m = h.match(re);
    if (!m || !m[1]) return null;
    const n = Number(m[1].replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  return { riferimento: cerca("Prezzo di riferimento"), ufficiale: cerca("Prezzo ufficiale") };
}

let ok = 0;
const falliti = [];
for (const isin of ISIN) {
  let esito = null;
  for (const p of PATTERN) {
    try {
      const r = await fetch(`https://www.borsaitaliana.it/${p(isin)}?lang=it`, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) continue;
      const d = estrai(await r.text());
      const prezzo = d.riferimento ?? d.ufficiale;
      if (prezzo != null) { esito = { prezzo, via: p("X").split("/")[1] + "/" + (p("X").split("/")[2] || "") }; break; }
    } catch { /* passa al pattern successivo */ }
  }
  if (esito) { ok++; console.log(`OK   ${isin}  ${String(esito.prezzo).padEnd(12)} via ${esito.via}`); }
  else { falliti.push(isin); console.log(`--   ${isin}  non trovato`); }
}
console.log(`\nBorsa Italiana copre ${ok}/17. Restano: ${falliti.join(", ") || "nessuno"}`);
