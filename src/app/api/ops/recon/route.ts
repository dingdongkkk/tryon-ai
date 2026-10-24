import { NextResponse } from "next/server";
import { reconcile } from "@/lib/agenticorg";
import { jsonError } from "@/lib/http";

// Console only. Runs the Payment Reconciliation unit on demand. Read-only: changes nothing.
export async function POST() {
  try {
    return NextResponse.json({ report: await reconcile() });
  } catch (err) {
    return jsonError(err, 502);
  }
}
