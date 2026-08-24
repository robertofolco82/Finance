import { describe, expect, it } from "vitest";
import {
  anniAllaScadenza,
  attribuzione,
  durationModificata,
  pnlGiorno,
  pnlTotale,
  posizioneDaMovimenti,
  valoreEur,
  ytm,
} from "./calc";
import type { Movimento, Strumento } from "./types";

const azioneEur: Pick<Strumento, "tipo" | "valuta"> = { tipo: "Azione", valuta: "EUR" };
const azioneUsd: Pick<Strumento, "tipo" | "valuta"> = { tipo: "Azione", valuta: "USD" };
const obbligazione: Pick<Strumento, "tipo" | "valuta"> = { tipo: "Obbligazione", valuta: "EUR" };

describe("valoreEur", () => {
  it("azione EUR: prezzo * quantità", () => {
    expect(valoreEur(azioneEur, 1505.6, 4, 1.1682)).toBeCloseTo(6022.4, 6);
  });

  it("azione USD: converte al cambio corrente", () => {
    // ASML-style non applicabile qui; usiamo TSM: 12 * 418.65 / 1.1682
    expect(valoreEur(azioneUsd, 418.65, 12, 1.1682)).toBeCloseTo((418.65 * 12) / 1.1682, 6);
  });

  it("obbligazione: prezzo come % del nominale, senza cambio", () => {
    // BTP 0,60% ago 2031 — 30.000 nominale, prezzo 87,36
    expect(valoreEur(obbligazione, 87.36, 30000, 1.1682)).toBeCloseTo(87.36 * 300, 6);
  });
});

describe("posizioneDaMovimenti", () => {
  it("un solo acquisto: pmc e carico coincidono col movimento", () => {
    const movimenti: Movimento[] = [
      { id: 1, isin: "X", data: "2026-08-22", segno: "acquisto", quantita: 200, prezzo: 10.388223, cambio: 1.1682, commissioni: 0 },
    ];
    const pos = posizioneDaMovimenti(azioneUsd, movimenti);
    expect(pos.quantita).toBe(200);
    expect(pos.carico_eur).toBeCloseTo((10.388223 * 200) / 1.1682, 6);
    expect(pos.pmc).toBeCloseTo(10.388223, 4);
  });

  it("acquisto poi vendita parziale: riduce carico proporzionalmente al costo medio", () => {
    const movimenti: Movimento[] = [
      { id: 1, isin: "X", data: "2026-01-01", segno: "acquisto", quantita: 100, prezzo: 10, cambio: 1, commissioni: 0 },
      { id: 2, isin: "X", data: "2026-02-01", segno: "acquisto", quantita: 100, prezzo: 20, cambio: 1, commissioni: 0 },
      { id: 3, isin: "X", data: "2026-03-01", segno: "vendita", quantita: 100, prezzo: 25, cambio: 1, commissioni: 0 },
    ];
    // costo medio dopo i due acquisti: (1000+2000)/200 = 15 a unità
    const pos = posizioneDaMovimenti(azioneEur, movimenti);
    expect(pos.quantita).toBe(100);
    expect(pos.carico_eur).toBeCloseTo(1500, 6); // 3000 - 15*100
    expect(pos.pmc).toBeCloseTo(15, 6);
  });

  it("obbligazione: pmc ricostruito in percentuale del nominale", () => {
    const movimenti: Movimento[] = [
      { id: 1, isin: "IT0005436693", data: "2026-01-01", segno: "acquisto", quantita: 30000, prezzo: 88.06, cambio: 1, commissioni: 0 },
    ];
    const pos = posizioneDaMovimenti(obbligazione, movimenti);
    expect(pos.pmc).toBeCloseTo(88.06, 6);
  });
});

describe("pnlGiorno", () => {
  it("assente quando nessun titolo ha chiusura precedente", () => {
    const r = pnlGiorno(
      [{ isin: "A", strumento: azioneEur, quantita: 10, prezzo: 100, chiusura_precedente: null }],
      1.1682
    );
    expect(r.assente).toBe(true);
  });

  it("calcola eur/pct solo sui titoli con copertura, e riporta la copertura parziale", () => {
    const r = pnlGiorno(
      [
        { isin: "A", strumento: azioneEur, quantita: 10, prezzo: 110, chiusura_precedente: 100 },
        { isin: "B", strumento: azioneEur, quantita: 5, prezzo: 50, chiusura_precedente: null },
      ],
      1.1682
    );
    expect(r.assente).toBe(false);
    if (!r.assente) {
      expect(r.eur).toBeCloseTo(100, 6); // (1100-1000)
      expect(r.pct).toBeCloseTo(10, 6);
      expect(r.copertura).toBe(1);
      expect(r.totali).toBe(2);
    }
  });
});

describe("pnlTotale", () => {
  it("eur e pct dal carico", () => {
    const r = pnlTotale(632000, 606922.62);
    expect(r.eur).toBeCloseTo(25077.38, 1);
    expect(r.pct).toBeCloseTo(4.13, 1);
  });
});

describe("ytm + durationModificata", () => {
  it("titolo alla pari (prezzo 100) ha ytm ≈ cedola", () => {
    const anni = 5;
    const y = ytm(100, 4, anni, 1);
    expect(y).not.toBeNull();
    expect(y as number).toBeCloseTo(4, 1);
  });

  it("BTP zero coupon-like sotto la pari ha ytm positivo", () => {
    const anni = anniAllaScadenza("2031-08-01", new Date("2026-08-22"));
    const y = ytm(87.36, 0.6, anni, 2);
    expect(y).not.toBeNull();
    expect(y as number).toBeGreaterThan(0);
  });

  it("duration modificata è positiva e minore degli anni residui per una cedolare", () => {
    const anni = 5;
    const d = durationModificata(100, 4, anni, 1);
    expect(d).not.toBeNull();
    expect(d as number).toBeGreaterThan(0);
    expect(d as number).toBeLessThan(anni);
  });
});

describe("attribuzione", () => {
  it("titolo nuovo (assente nello snapshot precedente) ha dPct null", () => {
    const r = attribuzione([{ isin: "A", nome: "A", valore_eur: 100 }], []);
    expect(r[0]?.dPct).toBeNull();
    expect(r[0]?.dEur).toBe(0);
  });

  it("calcola dEur e dPct rispetto allo snapshot precedente", () => {
    const r = attribuzione(
      [{ isin: "A", nome: "A", valore_eur: 110 }],
      [{ isin: "A", valore_eur: 100 }]
    );
    expect(r[0]?.dEur).toBeCloseTo(10, 6);
    expect(r[0]?.dPct).toBeCloseTo(10, 6);
  });
});
