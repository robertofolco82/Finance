import { NextResponse } from "next/server";
import { erroreJson } from "@/lib/api-helpers";
import { posizioneDaMovimenti } from "@/lib/calc";
import { readData } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ isin: string }> }) {
  const { isin } = await params;
  try {
    const [strumenti, movimenti, prezzi, fondamentali, ratingLog] = await Promise.all([
      readData("strumenti"),
      readData("movimenti"),
      readData("prezzi"),
      readData("fondamentali"),
      readData("rating_log"),
    ]);
    const strumento = strumenti.find((s) => s.isin === isin);
    if (!strumento) return NextResponse.json({ errore: `ISIN ${isin} non trovato in portafoglio.` }, { status: 404 });

    const pos = posizioneDaMovimenti(strumento, movimenti.filter((m) => m.isin === isin));
    const serie = prezzi
      .filter((p) => p.isin === isin)
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((p) => ({ data: p.data, prezzo: p.chiusura }));

    return NextResponse.json({
      strumento,
      quantita: pos.quantita,
      pmc: pos.pmc,
      carico_eur: pos.carico_eur,
      serie,
      fondamentali: fondamentali[isin] ?? null,
      ratingLog: ratingLog[isin] ?? [],
    });
  } catch (e) {
    return erroreJson(e);
  }
}
