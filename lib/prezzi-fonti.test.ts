import { describe, expect, it } from "vitest";
import {
  campoEtichettato,
  estraiCampoBorsaItaliana,
  estraiPrezzoStockAnalysis,
  numeroInglese,
  numeroItaliano,
  prezzoDentroRange,
} from "./prezzi-fonti";

/** Cella con solo il numero, come nelle schede obbligazionarie. */
const SCHEDA_BOND = `<tr><td><span><strong>Prezzo di riferimento</strong></span></td>
  <td><span class="t-text -right">87,39</span></td></tr>`;

/** Cella con prezzo E orario insieme, come nelle schede ETF: il caso che rompeva l'estrazione. */
const SCHEDA_ETF = `<tr><td><span><strong>Prezzo di riferimento</strong></span></td>
  <td><span class="t-text -right"> 128,10&nbsp;-&nbsp;27/08/26&nbsp;17.55.00 </span></td></tr>`;

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

describe("estrazione da Borsa Italiana", () => {
  it("legge il prezzo da una scheda obbligazionaria", () => {
    expect(estraiCampoBorsaItaliana(SCHEDA_BOND, "Prezzo di riferimento")).toBe(87.39);
  });

  it("legge il prezzo da una scheda ETF, dove la cella contiene anche l'orario", () => {
    expect(estraiCampoBorsaItaliana(SCHEDA_ETF, "Prezzo di riferimento")).toBe(128.1);
  });

  it("restituisce null se l'etichetta non esiste", () => {
    expect(estraiCampoBorsaItaliana(SCHEDA_BOND, "Prezzo ufficiale")).toBeNull();
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
