import { describe, expect, it } from "vitest";
import { chiusuraPrecedente, ultimoPrezzo } from "./store";
import type { PrezzoRecord } from "./types";

function prezzo(isin: string, data: string, chiusura: number, extra: Partial<PrezzoRecord> = {}): PrezzoRecord {
  return {
    isin,
    data,
    chiusura,
    chiusura_precedente: null,
    valuta: "EUR",
    fonte: "test",
    raccolto_il: `${data}T17:35:00.000Z`,
    ...extra,
  };
}

describe("ultimoPrezzo", () => {
  it("prende il record della seduta più recente, non l'ultimo inserito", () => {
    const p = [prezzo("X", "2026-08-28", 101), prezzo("X", "2026-08-27", 100)];
    expect(ultimoPrezzo(p, "X")?.chiusura).toBe(101);
  });
});

describe("chiusuraPrecedente (§5.2)", () => {
  it("preferisce la chiusura dichiarata dalla fonte, con la sua seduta", () => {
    // È il caso normale: la scheda pubblica l'ultimo contratto E la chiusura
    // della seduta prima, cioè i due termini esatti della formula.
    const p = [prezzo("X", "2026-08-28", 87.38, { chiusura_precedente: 87.39, data_chiusura_precedente: "2026-08-27" })];
    expect(chiusuraPrecedente(p, "X")).toEqual({ valore: 87.39, data: "2026-08-27" });
  });

  it("ripiega sullo storico quando la fonte non la dichiara", () => {
    const p = [prezzo("X", "2026-08-27", 100), prezzo("X", "2026-08-28", 101)];
    expect(chiusuraPrecedente(p, "X")).toEqual({ valore: 100, data: "2026-08-27" });
  });

  it("accetta il salto del fine settimana", () => {
    // Venerdì 28 → lunedì 31: tre giorni di calendario, ma sedute consecutive.
    const p = [prezzo("X", "2026-08-28", 100), prezzo("X", "2026-08-31", 101)];
    expect(chiusuraPrecedente(p, "X")).toEqual({ valore: 100, data: "2026-08-28" });
  });

  it("rifiuta un confronto di più giorni invece di spacciarlo per movimento di oggi", () => {
    // Un certificato illiquido passato da 998,47 (22/08) a 937,07 (28/08): quella
    // discesa è avvenuta in sei giorni. Contarla tutta nel P&L di oggi la
    // gonfierebbe di 1.228 € — il titolo va escluso e la copertura dichiarata.
    const p = [prezzo("X", "2026-08-22", 998.47), prezzo("X", "2026-08-28", 937.07)];
    expect(chiusuraPrecedente(p, "X")).toBeNull();
  });

  it("resta null quando c'è una sola seduta in archivio", () => {
    expect(chiusuraPrecedente([prezzo("X", "2026-08-28", 100)], "X")).toBeNull();
  });
});
