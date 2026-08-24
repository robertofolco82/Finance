import { NextResponse } from "next/server";
import { erroreJson } from "@/lib/api-helpers";
import { aggiornaFondamentaliTutti } from "@/lib/fondamentali";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // tetto piano Hobby Vercel — vedi README "Limiti noti" per "Aggiorna rating"

export async function POST() {
  try {
    const risultato = await aggiornaFondamentaliTutti();
    return NextResponse.json(risultato);
  } catch (e) {
    return erroreJson(e);
  }
}
