import { NextResponse } from "next/server";
import { erroreJson } from "@/lib/api-helpers";
import { aggiornaFondamentaliTutti } from "@/lib/fondamentali";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    return NextResponse.json(await aggiornaFondamentaliTutti());
  } catch (e) {
    return erroreJson(e);
  }
}
