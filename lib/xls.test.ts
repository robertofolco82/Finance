import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseXls } from "./xls";

async function creaBuffer(intestazioni: string[], righe: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const foglio = wb.addWorksheet("Posizioni");
  foglio.addRow(intestazioni);
  for (const r of righe) foglio.addRow(r);
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe("parseXls", () => {
  it("riconosce le intestazioni esatte", async () => {
    const buf = await creaBuffer(
      ["ISIN", "Quantità", "PMC"],
      [["IT0005436693", 30000, 88.06]]
    );
    const righe = await parseXls(buf);
    expect(righe).toEqual([{ isin: "IT0005436693", quantita: 30000, pmc: 88.06 }]);
  });

  it("riconosce sinonimi comuni e ignora maiuscole/accenti", async () => {
    const buf = await creaBuffer(
      ["isin", "QTA", "prezzo di carico"],
      [["us20451w1018", 200, 10.388223]]
    );
    const righe = await parseXls(buf);
    expect(righe).toEqual([{ isin: "US20451W1018", quantita: 200, pmc: 10.388223 }]);
  });

  it("ignora righe con campi mancanti o non numerici", async () => {
    const buf = await creaBuffer(
      ["ISIN", "Quantità", "PMC"],
      [
        ["IT0005436693", 30000, 88.06],
        ["", 100, 10],
        ["US8740391003", "n.d.", 255.5],
      ]
    );
    const righe = await parseXls(buf);
    expect(righe).toHaveLength(1);
    expect(righe[0]?.isin).toBe("IT0005436693");
  });

  it("segnala colonne non riconosciute invece di indovinare", async () => {
    const buf = await creaBuffer(["Titolo", "Pezzi"], [["BTP", 100]]);
    await expect(parseXls(buf)).rejects.toThrow(/colonne non riconosciute/);
  });
});
