import "server-only";
import { NextResponse } from "next/server";

export function jsonError(err: unknown, status = 400) {
  const message = err instanceof Error ? err.message : String(err);
  const s = (err as { status?: number })?.status ?? status;
  console.error("[api]", message);
  return NextResponse.json({ error: message }, { status: s });
}

/** Strip server-only fields before sending an order to the shopper. */
export function publicOrder<T extends { accessHash?: string; issuingAt?: string }>(o: T) {
  const { accessHash: _a, issuingAt: _i, ...rest } = o;
  void _a;
  void _i;
  return rest;
}
