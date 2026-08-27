/**
 * Lettura del file xls/xlsx per il re-import posizioni — §10: "L'xls serve solo
 * per posizioni, quantità e PMC. I prezzi non entrano mai da lì: si ricavano in
 * rete." Intestazioni riconosciute in modo tollerante (maiuscole/minuscole,
 * accenti, sinonimi comuni), non un formato rigido a colonne fisse.
 */

import ExcelJS from "exceljs";

function normalizza(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const SINONIMI_ISIN = ["isin"];
const SINONIMI_QUANTITA = ["quantita", "qta", "qty", "quantity", "nominale"];
const SINONIMI_PMC = ["pmc", "prezzo medio", "prezzo medio di carico", "prezzo carico", "prezzo di carico", "carico", "prezzo medio carico"];

export interface RigaImportata {
  isin: string;
  quantita: number;
  pmc: number;
}

function valoreGrezzo(v: ExcelJS.CellValue): string | number | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("result" in v && v.result != null) return valoreGrezzo(v.result as ExcelJS.CellValue);
    if ("text" in v) return String((v as { text: unknown }).text);
    if ("richText" in v) return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
    return null;
  }
  return typeof v === "boolean" ? String(v) : v;
}

export async function parseXls(buffer: Buffer): Promise<RigaImportata[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as never);
  const foglio = wb.worksheets[0];
  if (!foglio || foglio.rowCount < 2) throw new Error("il file non contiene righe di dati.");

  const intestazioni: Record<number, string> = {};
  foglio.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    intestazioni[colNumber] = String(valoreGrezzo(cell.value) ?? "").trim();
  });

  const trovaColonna = (sinonimi: string[]): number | null => {
    for (const [col, testo] of Object.entries(intestazioni)) {
      if (sinonimi.includes(normalizza(testo))) return Number(col);
    }
    return null;
  };

  const colIsin = trovaColonna(SINONIMI_ISIN);
  const colQuantita = trovaColonna(SINONIMI_QUANTITA);
  const colPmc = trovaColonna(SINONIMI_PMC);
  if (!colIsin || !colQuantita || !colPmc) {
    throw new Error(
      `colonne non riconosciute (trovate: ${Object.values(intestazioni).join(", ") || "nessuna"}). ` +
        `Servono una colonna ISIN, una Quantità e una PMC (prezzo medio di carico).`
    );
  }

  const righe: RigaImportata[] = [];
  for (let r = 2; r <= foglio.rowCount; r++) {
    const row = foglio.getRow(r);
    const isin = String(valoreGrezzo(row.getCell(colIsin).value) ?? "").trim().toUpperCase();
    const quantita = Number(valoreGrezzo(row.getCell(colQuantita).value));
    const pmc = Number(valoreGrezzo(row.getCell(colPmc).value));
    if (!isin || !Number.isFinite(quantita) || !Number.isFinite(pmc)) continue;
    righe.push({ isin, quantita, pmc });
  }
  if (righe.length === 0) throw new Error("nessuna riga valida trovata nel file (ISIN, quantità e PMC devono essere tutti presenti).");
  return righe;
}
