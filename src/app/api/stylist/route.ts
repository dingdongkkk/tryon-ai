import { NextResponse } from "next/server";
import { requestStylistReview } from "@/lib/workflow";
import { jsonError } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const measurements: Record<string, number> = {};
    for (const [k, v] of Object.entries(body?.measurements ?? {})) {
      if (Number.isFinite(Number(v))) measurements[k] = Number(v);
    }
    const snapshot = typeof body?.snapshot === "string" && body.snapshot.startsWith("data:image/") ? body.snapshot : undefined;
    const approval = await requestStylistReview({
      productId: String(body?.productId),
      suggestedSize: String(body?.suggestedSize ?? "M"),
      measurements,
      snapshot,
      question: body?.question ? String(body.question).slice(0, 500) : undefined,
    });
    return NextResponse.json({ id: approval.id });
  } catch (err) {
    return jsonError(err);
  }
}
