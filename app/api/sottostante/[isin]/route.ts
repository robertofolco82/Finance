import { NextResponse } from "next/server";
import { erroreJson } from "@/lib/api-helpers";
import { salvaSottostante, trovaSottostante } from "@/lib/sottostante";

export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ isin: string }> }) {
  const { isin } = await params;
  try {
    const body = (await req.json().catch(() => ({}))) as { manuale?: string };
    if (body.manuale?.trim()) {
      await salvaSottostante(isin, body.manuale.trim());
      return NextResponse.json({ sotto: body.manuale.trim() });
    }
    const risultato = await trovaSottostante(isin);
    return NextResponse.json(risultato);
  } catch (e) {
    return erroreJson(e);
  }
}
