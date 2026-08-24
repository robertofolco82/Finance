import { NextResponse } from "next/server";
import { erroreJson } from "@/lib/api-helpers";
import { estraiCallDaPdf } from "@/lib/call";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ errore: "file mancante" }, { status: 400 });
    if (file.type !== "application/pdf") return NextResponse.json({ errore: "atteso un PDF" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const call = await estraiCallDaPdf(base64, file.name);
    return NextResponse.json(call);
  } catch (e) {
    return erroreJson(e);
  }
}
