import { NextResponse } from "next/server";
import { erroreJson } from "@/lib/api-helpers";
import { aggiornaFondamentali } from "@/lib/fondamentali";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(_req: Request, { params }: { params: Promise<{ isin: string }> }) {
  const { isin } = await params;
  try {
    return NextResponse.json(await aggiornaFondamentali(isin));
  } catch (e) {
    return erroreJson(e);
  }
}
