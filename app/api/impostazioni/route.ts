import { NextResponse } from "next/server";
import { erroreJson } from "@/lib/api-helpers";
import { modelloValido } from "@/lib/modelli";
import { impostaModello } from "@/lib/settings";
import { readData } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const impostazioni = await readData("impostazioni");
    return NextResponse.json(impostazioni);
  } catch (e) {
    return erroreJson(e);
  }
}

export async function POST(req: Request) {
  try {
    const { modello } = (await req.json()) as { modello?: string | null };
    if (modello != null && !modelloValido(modello)) {
      return NextResponse.json({ errore: `Modello «${modello}» non riconosciuto.` }, { status: 400 });
    }
    await impostaModello(modello ?? null);
    return NextResponse.json({ modello: modello ?? null });
  } catch (e) {
    return erroreJson(e);
  }
}
