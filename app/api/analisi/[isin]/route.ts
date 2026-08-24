import { NextResponse } from "next/server";
import { analizza } from "@/lib/analisi";
import { erroreJson } from "@/lib/api-helpers";

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ isin: string }> }) {
  const { isin } = await params;
  try {
    const report = await analizza(isin);
    return NextResponse.json(report);
  } catch (e) {
    return erroreJson(e);
  }
}
