import "server-only";
import { NextResponse } from "next/server";

export function jsonError(err: unknown, status = 400) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[api]", message);
  return NextResponse.json({ error: message }, { status });
}
