/**
 * Riverifica che ogni ISIN del portafoglio sia ancora raggiungibile dalla fonte
 * configurata in data/strumenti.json. Da rilanciare se un giorno i prezzi
 * smettono di arrivare: dice subito quale fonte si è rotta.
 *
 *   node scripts/verifica-fonti.mjs
 */
import { readFileSync } from "node:fs";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const strumenti = JSON.parse(readFileSync(new URL("../data/strumenti.json", import.meta.url), "utf8"));

const numeroItaliano = (t) => {
  const m = t.replace(/&nbsp;/g, " ").match(/\d{1,3}(?:\.\d{3})*(?:,\d+)?/);
  return m ? Number(m[0].replace(/\./g, "").replace(",", ".")) : null;
};

function campo(html, etichetta) {
  const re = new RegExp(
    `<t[dh][^>]*>\\s*(?:<[^>]+>\\s*)*${etichetta}\\s*(?:</[^>]+>\\s*)*</t[dh]>\\s*<t[dh][^>]*>\\s*(?:<[^>]+>\\s*)*([^<]{1,40})`,
    "i"
  );
  return html.match(re)?.[1]?.trim() ?? null;
}

async function prova(s) {
  if (s.fonte_prezzo === "borsaitaliana") {
    const r = await fetch(
      `https://www.borsaitaliana.it/borsa/${s.percorso_borsait}/scheda/${s.isin}.html?lang=it`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) }
    );
    if (!r.ok) return { errore: `HTTP ${r.status}` };
    const html = await r.text();
    if (!html.includes(s.isin)) return { errore: "scheda non corrispondente all'ISIN" };
    const v = campo(html, "Prezzo di riferimento") ?? campo(html, "Prezzo ufficiale");
    return v ? { prezzo: numeroItaliano(v) } : { errore: "prezzo assente nella scheda" };
  }
  if (s.fonte_prezzo === "stockanalysis") {
    const r = await fetch(`https://stockanalysis.com/${s.percorso_stockanalysis}/`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return { errore: `HTTP ${r.status}` };
    const html = await r.text();
    const m = html.match(/class="text-4xl font-bold[^"]*"[^>]*>\s*([\d,]+\.?\d*)\s*</i);
    return m ? { prezzo: Number(m[1].replace(/,/g, "")) } : { errore: "prezzo assente nella scheda" };
  }
  return { manuale: true };
}

let ok = 0;
const rotti = [];
for (const s of strumenti) {
  const esito = await prova(s);
  if (esito.manuale) {
    console.log(`man  ${s.isin}  ${s.nome}`);
  } else if (esito.prezzo != null) {
    ok++;
    console.log(`OK   ${s.isin}  ${String(esito.prezzo).padEnd(12)} ${s.fonte_prezzo}`);
  } else {
    rotti.push(s.isin);
    console.log(`ROTT ${s.isin}  ${esito.errore}  (${s.fonte_prezzo})`);
  }
}
console.log(`\nAutomatici funzionanti: ${ok}. Da inserire a mano: 5. Rotti: ${rotti.length ? rotti.join(", ") : "nessuno"}`);
