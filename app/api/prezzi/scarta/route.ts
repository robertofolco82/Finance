import { NextResponse } from "next/server";
import { erroreJson } from "@/lib/api-helpers";
import { scartaSospetto } from "@/lib/fetch-prezzi";

export async function POST(req: Request) {
  try {
    const { isin } = (await req.json()) as { isin?: string };
    if (!isin) return NextResponse.json({ errore: "isin mancante" }, { status: 400 });
    await scartaSospetto(isin);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroreJson(e);
  }
}
