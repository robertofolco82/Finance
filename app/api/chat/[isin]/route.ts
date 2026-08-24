import { NextResponse } from "next/server";
import { erroreJson } from "@/lib/api-helpers";
import { chattaSuTitolo } from "@/lib/chat";

export const maxDuration = 30;

export async function POST(req: Request, { params }: { params: Promise<{ isin: string }> }) {
  const { isin } = await params;
  try {
    const { domanda } = (await req.json()) as { domanda?: string };
    if (!domanda?.trim()) return NextResponse.json({ errore: "domanda mancante" }, { status: 400 });
    const risposta = await chattaSuTitolo(isin, domanda.trim());
    return NextResponse.json(risposta);
  } catch (e) {
    return erroreJson(e);
  }
}
