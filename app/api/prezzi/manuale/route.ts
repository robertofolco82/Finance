import { NextResponse } from "next/server";
import { erroreJson } from "@/lib/api-helpers";
import { salvaRaccolti } from "@/lib/fetch-prezzi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Prezzo inserito a mano — §6.3: "prevedere sempre un campo di inserimento
 * manuale come fallback". Serve ai 5 strumenti che nessuna fonte gratuita copre
 * (i 4 strutturati EuroTLX e l'ETP SK Hynix). Passa dalla stessa validazione
 * degli altri: se il valore si scosta oltre il 60% finisce in quarantena.
 */
export async function POST(req: Request) {
  try {
    const { isin, prezzo } = (await req.json()) as { isin?: string; prezzo?: number };
    if (!isin) return NextResponse.json({ errore: "isin mancante" }, { status: 400 });
    if (typeof prezzo !== "number" || !Number.isFinite(prezzo) || prezzo <= 0) {
      return NextResponse.json({ errore: "prezzo non valido" }, { status: 400 });
    }
    const esito = await salvaRaccolti([{ isin, prezzo, chiusura_precedente: null, fonte: "inserito a mano" }]);
    return NextResponse.json(esito);
  } catch (e) {
    return erroreJson(e);
  }
}
