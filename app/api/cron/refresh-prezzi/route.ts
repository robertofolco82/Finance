import { NextResponse } from "next/server";
import { erroreJson } from "@/lib/api-helpers";
import { aggiornaPrezzi } from "@/lib/fetch-prezzi";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // tetto piano Hobby Vercel; su Pro può salire

/**
 * Target del Vercel Cron Job (vercel.json). Vercel invia automaticamente
 * `Authorization: Bearer $CRON_SECRET` quando la variabile d'ambiente CRON_SECRET
 * è impostata — qui verifichiamo che corrisponda per bloccare chiamate esterne.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ errore: "non autorizzato" }, { status: 401 });
    }
  }
  try {
    const risultato = await aggiornaPrezzi();
    return NextResponse.json(risultato);
  } catch (e) {
    return erroreJson(e);
  }
}
