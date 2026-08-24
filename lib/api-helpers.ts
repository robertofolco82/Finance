import { NextResponse } from "next/server";

export function erroreJson(e: unknown, status = 500): NextResponse {
  const messaggio = e instanceof Error ? e.message : String(e);
  return NextResponse.json({ errore: messaggio }, { status });
}
