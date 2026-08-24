import { NextResponse } from "next/server";
import { erroreJson } from "@/lib/api-helpers";
import { aggiornaPrezzi } from "@/lib/fetch-prezzi";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // tetto piano Hobby Vercel; su Pro può salire

export async function POST() {
  try {
    const risultato = await aggiornaPrezzi();
    return NextResponse.json(risultato);
  } catch (e) {
    return erroreJson(e);
  }
}
