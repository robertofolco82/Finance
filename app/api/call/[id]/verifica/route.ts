import { NextResponse } from "next/server";
import { erroreJson } from "@/lib/api-helpers";
import { verificaCall } from "@/lib/call";

export const maxDuration = 30;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const call = await verificaCall(Number(id));
    return NextResponse.json(call);
  } catch (e) {
    return erroreJson(e);
  }
}
