import { describe, expect, it } from "vitest";
import { estraiConsenso, percorsoPerSottostante } from "./consenso";

/** Frammento nella forma reale servita dalla fonte (tabella + frase). */
const PAGINA = `
<div>Analyst Consensus: Strong Buy Price Target Chart
Target Low Average Median High
Price $901.65 $2,155 $2,241 $2,894
Change -48.03% +24.22% +29.17% +66.81%
According to 44 analysts polled by S&amp;P Global, ASML Holding stock has a consensus
rating of "Strong Buy" and an average price target of $2,155.</div>`;

const SOLO_FRASE = `
<p>According to 16 analysts polled by S&amp;P Global, COMPASS Pathways stock has a
consensus rating of "Strong Buy" and an average price target of $23.75. The average
1-year stock price forecast is 62.23% higher than the current stock price, while the
lowest is $13 (-11.20%) and the highest is $65 (+343.99%).</p>`;

describe("estraiConsenso", () => {
  it("preferisce la tabella strutturata, che include la mediana", () => {
    const c = estraiConsenso(PAGINA);
    expect(c).not.toBeNull();
    expect(c?.rating).toBe("Strong Buy");
    expect(c?.analisti).toBe(44);
    expect(c?.valuta).toBe("USD");
    expect(c?.pt_min).toBe(901.65);
    expect(c?.pt_medio).toBe(2155);
    expect(c?.pt_mediano).toBe(2241);
    expect(c?.pt_max).toBe(2894);
    expect(c?.upside_medio).toBeCloseTo(24.22, 2);
  });

  it("ricade sulla frase quando la tabella manca, senza mediana", () => {
    const c = estraiConsenso(SOLO_FRASE);
    expect(c?.rating).toBe("Strong Buy");
    expect(c?.analisti).toBe(16);
    // il punto finale non deve entrare nel numero: 23.75, non NaN
    expect(c?.pt_medio).toBe(23.75);
    expect(c?.pt_mediano).toBeNull();
    expect(c?.pt_min).toBe(13);
    expect(c?.pt_max).toBe(65);
    expect(c?.upside_medio).toBeCloseTo(62.23, 2);
  });

  it("segnala l'assenza di dati invece di inventarli", () => {
    expect(estraiConsenso("<p>Nessun dato di consenso disponibile.</p>")).toBeNull();
  });

  it("riconosce il sottostante solo su ticker interi, non su frammenti", () => {
    expect(percorsoPerSottostante("Micron Technology (MU)")).toBe("stocks/mu");
    expect(percorsoPerSottostante("Banco BPM (BAMI) / Barclays (BARC)")).toBe("quote/bit/BAMI");
    expect(percorsoPerSottostante("EURO STOXX 50 / FTSE MIB")).toBeNull();
    expect(percorsoPerSottostante(null)).toBeNull();
  });
});
