import { NextResponse } from "next/server";
import { erroreJson } from "@/lib/api-helpers";
import { importaPortafoglioXls } from "@/lib/importa-portafoglio";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ errore: "file mancante" }, { status: 400 });
    if (!/\.xlsx?$/i.test(file.name)) return NextResponse.json({ errore: "atteso un file .xlsx o .xls" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const risultato = await importaPortafoglioXls(buffer);
    return NextResponse.json(risultato);
  } catch (e) {
    return erroreJson(e);
  }
}
