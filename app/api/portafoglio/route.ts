import { NextResponse } from "next/server";
import { erroreJson } from "@/lib/api-helpers";
import { costruisciVista } from "@/lib/portafoglio";
import { readData } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [vista, fondamentali, sospetti] = await Promise.all([
      costruisciVista(),
      readData("fondamentali"),
      readData("sospetti"),
    ]);
    return NextResponse.json({ ...vista, fondamentali, sospetti });
  } catch (e) {
    return erroreJson(e);
  }
}
