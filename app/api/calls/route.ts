import { NextResponse } from "next/server";
import { erroreJson } from "@/lib/api-helpers";
import { readData } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const calls = await readData("calls");
    return NextResponse.json({ calls });
  } catch (e) {
    return erroreJson(e);
  }
}
