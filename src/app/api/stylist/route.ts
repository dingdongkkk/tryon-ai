import { NextResponse } from "next/server";
import { requestStylistReview } from "@/lib/workflow";
import { jsonError } from "@/lib/http";
import { assertSameOrigin, grantAccess, rateLimit } from "@/lib/access";

export async function POST(req: Request) {
  try {
    await assertSameOrigin();
    await rateLimit("stylist", 5, 60_000);
    const body = await req.json();
    const cameraHint: Record<string, number> = {};
    for (const [k, v] of Object.entries(body?.cameraHint ?? {})) if (Number.isFinite(Number(v))) cameraHint[k] = Number(v);
    const consent = body?.snapshotConsent === true;
    const snapshot = consent && typeof body?.snapshot === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(body.snapshot) ? body.snapshot : undefined;
    const { approval, accessToken } = await requestStylistReview({
      productId: String(body?.productId),
      selectedSize: String(body?.selectedSize ?? "").slice(0, 10),
      cameraHint: Object.keys(cameraHint).length ? cameraHint : undefined,
      snapshot,
      snapshotConsent: consent,
      question: body?.question ? String(body.question).slice(0, 500) : undefined,
    });
    await grantAccess("s", approval.id, accessToken);
    return NextResponse.json({ id: approval.id });
  } catch (err) {
    return jsonError(err);
  }
}
