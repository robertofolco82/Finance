import { NextResponse } from "next/server";
import { erroreJson } from "@/lib/api-helpers";
import { aggiornaFondamentali } from "@/lib/fondamentali";

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ isin: string }> }) {
  const { isin } = await params;
  try {
    const fond = await aggiornaFondamentali(isin);
    return NextResponse.json(fond);
  } catch (e) {
    return erroreJson(e);
  }
}
