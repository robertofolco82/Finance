import { NextResponse } from "next/server";
import { erroreJson } from "@/lib/api-helpers";
import { salvaRaccolti, type PrezzoRaccolto } from "@/lib/fetch-prezzi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Corpo {
  raccolti?: PrezzoRaccolto[];
  falliti?: string[];
  dettaglioErrore?: string;
}

/**
 * Chiude il refresh: quarantena (§5.7) e scritture. La validazione dei prezzi resta
 * qui lato server — il browser trasporta i dati raccolti, non decide cosa è valido.
 */
export async function POST(req: Request) {
  try {
    const { raccolti, falliti, dettaglioErrore } = (await req.json()) as Corpo;
    if (!Array.isArray(raccolti)) {
      return NextResponse.json({ errore: "elenco dei prezzi raccolti mancante" }, { status: 400 });
    }
    const validi = raccolti.filter(
      (r): r is PrezzoRaccolto => !!r && typeof r.isin === "string" && typeof r.prezzo === "number" && Number.isFinite(r.prezzo)
    );
    return NextResponse.json(await salvaRaccolti(validi, Array.isArray(falliti) ? falliti : [], dettaglioErrore));
  } catch (e) {
    return erroreJson(e);
  }
}
