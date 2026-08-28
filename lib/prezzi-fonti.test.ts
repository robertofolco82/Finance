import { describe, expect, it } from "vitest";
import {
  campoEtichettato,
  componiPrezzoBorsaItaliana,
  dataIsoDaItaliana,
  estraiCampoBorsaItaliana,
  estraiIntestazioneBorsaItaliana,
  estraiPrezzoStockAnalysis,
  estraiRiferimentoBorsaItaliana,
  numeroInglese,
  numeroItaliano,
  percentualeItaliana,
  prezzoDentroRange,
} from "./prezzi-fonti";

/**
 * Le schede qui sotto riproducono la struttura reale delle pagine di Borsa
 * Italiana, verificata a mercato aperto: intestazione con il prezzo dell'ultimo
 * contratto, e più in basso il "Prezzo di riferimento", che è la chiusura della
 * seduta precedente. Sono due numeri diversi, ed è l'errore che il P&L di
 * giornata pagava per intero.
 */
function intestazione(prezzo: string, variazione: string, ultimoContratto: string): string {
  return `<div class="summary-value">
    <span class="t-text -black-warm-60 -formatPrice"><strong>${prezzo}</strong></span>
    <span class="t-text -size-lg -assertive -percPrice"><strong>${variazione}</strong></span>
  </div>
  <div class="summary-fase">
    <span class="t-text -block -size-xs">Fase: <strong>Continuous</strong></span>
    <span class="t-text -block -size-xs">Ultimo Contratto: <strong>${ultimoContratto}</strong></span>
  </div>`;
}

/** BTP alle 9.24 del 28/08, con la chiusura del 27/08 in tabella. */
const SCHEDA_BOND =
  intestazione("87,38", "-0,01%", "28/08/26&nbsp;&nbsp;9.24.54") +
  `<tr><td><span><strong>Prezzo di riferimento</strong></span></td><td><span class="t-text -right">87,39</span></td></tr>
   <tr><td><strong>Data di riferimento</strong></td><td>27/08/2026</td></tr>`;

/** ETF: prezzo di riferimento e data nella stessa cella. */
const SCHEDA_ETF =
  intestazione("128,28", "+0,14%", "28/08/26&nbsp;&nbsp;9.43.44") +
  `<tr><td><span><strong>Prezzo di riferimento</strong></span></td>
   <td><span class="t-text -right"> 128,10&nbsp;-&nbsp;27/08/26&nbsp;17.55.00 </span></td></tr>`;

/** Certificato illiquido: oggi non ha scambiato, l'intestazione è vuota. */
const SCHEDA_FERMA =
  intestazione("", "+0,00%", "&nbsp;&nbsp;") +
  `<tr><td><strong>Prezzo di riferimento</strong></td><td>2,905</td></tr>`;

const SCHEDA_SA = `<div class="text-4xl font-bold transition-colors duration-300 block sm:inline">427.30</div>
  <table><tr><td>Previous Close</td><td>417.69</td></tr>
  <tr><td>Day's Range</td><td>420.53 - 429.64</td></tr></table>`;

describe("numeroItaliano", () => {
  it("legge un numero semplice", () => {
    expect(numeroItaliano("87,39")).toBe(87.39);
  });

  it("legge le migliaia col punto", () => {
    expect(numeroItaliano("1.003,79")).toBe(1003.79);
  });

  it("prende il prezzo e ignora l'orario nella stessa cella", () => {
    expect(numeroItaliano("128,10&nbsp;-&nbsp;27/08/26&nbsp;17.55.00")).toBe(128.1);
  });

  it("restituisce null se non c'è alcun numero", () => {
    expect(numeroItaliano("n.d.")).toBeNull();
  });
});

describe("numeroInglese", () => {
  it("legge il formato con la virgola come separatore di migliaia", () => {
    expect(numeroInglese("1,486.40")).toBe(1486.4);
    expect(numeroInglese("427.30")).toBe(427.3);
  });
});

describe("percentualeItaliana", () => {
  it("tiene il segno: è quello che distingue un guadagno da una perdita", () => {
    expect(percentualeItaliana("-0,01%")).toBe(-0.01);
    expect(percentualeItaliana("+1,23%")).toBe(1.23);
    expect(percentualeItaliana("+0,00%")).toBe(0);
  });

  it("resta null se la percentuale non c'è", () => {
    expect(percentualeItaliana("")).toBeNull();
  });
});

describe("dataIsoDaItaliana", () => {
  it("accetta l'anno a due e a quattro cifre", () => {
    expect(dataIsoDaItaliana("27/08/26")).toBe("2026-08-27");
    expect(dataIsoDaItaliana("27/08/2026")).toBe("2026-08-27");
  });
});

describe("estrazione da Borsa Italiana", () => {
  it("legge un campo etichettato dalla tabella", () => {
    expect(estraiCampoBorsaItaliana(SCHEDA_BOND, "Prezzo di riferimento")).toBe(87.39);
  });

  it("legge il campo anche quando la cella contiene pure l'orario", () => {
    expect(estraiCampoBorsaItaliana(SCHEDA_ETF, "Prezzo di riferimento")).toBe(128.1);
  });

  it("restituisce null se l'etichetta non esiste", () => {
    expect(estraiCampoBorsaItaliana(SCHEDA_BOND, "Prezzo ufficiale")).toBeNull();
  });

  it("legge dall'intestazione prezzo, variazione e seduta dell'ultimo contratto", () => {
    expect(estraiIntestazioneBorsaItaliana(SCHEDA_BOND)).toEqual({
      prezzo: 87.38,
      variazionePct: -0.01,
      seduta: "2026-08-28",
    });
  });

  it("riconosce l'intestazione vuota di uno strumento che oggi non ha scambiato", () => {
    expect(estraiIntestazioneBorsaItaliana(SCHEDA_FERMA)).toEqual({
      prezzo: null,
      variazionePct: 0,
      seduta: null,
    });
  });

  it("data il prezzo di riferimento, sia da campo separato sia dalla stessa cella", () => {
    expect(estraiRiferimentoBorsaItaliana(SCHEDA_BOND)).toEqual({ valore: 87.39, data: "2026-08-27" });
    expect(estraiRiferimentoBorsaItaliana(SCHEDA_ETF)).toEqual({ valore: 128.1, data: "2026-08-27" });
    expect(estraiRiferimentoBorsaItaliana(SCHEDA_FERMA)).toEqual({ valore: 2.905, data: null });
  });
});

describe("prezzo di adesso contro chiusura precedente (§5.2)", () => {
  it("a mercato aperto prende l'ultimo contratto, non il prezzo di riferimento", () => {
    // Il caso che rendeva nullo il P&L: 87,39 è la chiusura di IERI, non il
    // prezzo di adesso. Il prezzo di adesso è 87,38, delle 9.24 di oggi.
    expect(componiPrezzoBorsaItaliana(SCHEDA_BOND)).toEqual({
      prezzo: 87.38,
      chiusura_precedente: 87.39,
      data_sessione: "2026-08-28",
      data_chiusura_precedente: "2026-08-27",
    });
  });

  it("vale anche per gli ETF, dove la data sta dentro la cella del riferimento", () => {
    expect(componiPrezzoBorsaItaliana(SCHEDA_ETF)).toEqual({
      prezzo: 128.28,
      chiusura_precedente: 128.1,
      data_sessione: "2026-08-28",
      data_chiusura_precedente: "2026-08-27",
    });
  });

  it("a giornata chiusa scarta il riferimento, che ormai è la chiusura di oggi", () => {
    // A fine seduta la borsa ricalcola il riferimento: 128,28 diventa la chiusura
    // di OGGI. Usarlo come base del P&L azzererebbe il risultato, quindi la
    // chiusura precedente si ricava invertendo la variazione dichiarata.
    const dopoChiusura =
      intestazione("128,28", "+0,14%", "28/08/26&nbsp;&nbsp;17.35.00") +
      `<tr><td><strong>Prezzo di riferimento</strong></td><td>128,28&nbsp;-&nbsp;28/08/26&nbsp;17.55.00</td></tr>`;
    const c = componiPrezzoBorsaItaliana(dopoChiusura);
    expect(c.prezzo).toBe(128.28);
    expect(c.chiusura_precedente).toBeCloseTo(128.1, 1);
    expect(c.data_chiusura_precedente).toBeNull();
  });

  it("su uno strumento fermo resta il solo riferimento, e lo dichiara", () => {
    // Nessun contratto oggi: non si inventa una chiusura precedente, si lascia
    // null e il P&L la cerca nello storico.
    expect(componiPrezzoBorsaItaliana(SCHEDA_FERMA)).toEqual({
      prezzo: 2.905,
      chiusura_precedente: null,
      data_sessione: null,
      data_chiusura_precedente: null,
    });
  });
});

describe("estrazione da stockanalysis", () => {
  it("legge prezzo corrente e chiusura precedente", () => {
    expect(estraiPrezzoStockAnalysis(SCHEDA_SA)).toBe(427.3);
    expect(numeroInglese(campoEtichettato(SCHEDA_SA, "Previous Close") as string)).toBe(417.69);
  });

  it("accetta un prezzo dentro il range di giornata", () => {
    expect(prezzoDentroRange(SCHEDA_SA, 427.3)).toBe(true);
  });

  it("rifiuta un prezzo fuori dal range: segnala un'estrazione sbagliata", () => {
    expect(prezzoDentroRange(SCHEDA_SA, 4273)).toBe(false);
  });

  it("non blocca il prezzo se il range non è leggibile", () => {
    expect(prezzoDentroRange("<div>nessun range</div>", 100)).toBe(true);
  });
});
