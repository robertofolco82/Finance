import { NextResponse } from "next/server";
import { erroreJson } from "@/lib/api-helpers";
import { contaLotti, recuperaLotto } from "@/lib/fetch-prezzi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Quanti lotti servono per coprire il portafoglio — il browser lo chiede prima di partire. */
export async function GET() {
  try {
    return NextResponse.json({ totaleLotti: await contaLotti() });
  } catch (e) {
    return erroreJson(e);
  }
}

/**
 * Raccoglie i prezzi di UN solo lotto: una richiesta HTTP = una chiamata a Claude.
 * Nessuna scrittura nello store — quella avviene una volta sola in /api/refresh/salva.
 */
export async function POST(req: Request) {
  try {
    const { indice } = (await req.json()) as { indice?: number };
    if (typeof indice !== "number" || indice < 0) {
      return NextResponse.json({ errore: "indice del lotto mancante o non valido" }, { status: 400 });
    }
    return NextResponse.json(await recuperaLotto(indice));
  } catch (e) {
    return erroreJson(e);
  }
}
