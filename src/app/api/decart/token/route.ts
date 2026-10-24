import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { mintToken } from "@/lib/decartKeys";
import { assertSameOrigin, rateLimit } from "@/lib/access";
import { jsonError } from "@/lib/http";
import { safeEqual } from "@/lib/payment-rules";

// Mints a short-lived Decart client token for the browser. Permanent keys never leave the server;
// tokens are scoped to the try-on model, this origin and a max session length.
// Backup keys take over automatically when one runs out of credits (src/lib/decartKeys.ts).
// Docs: https://docs.platform.decart.ai/examples/ecommerce-try-on
export async function POST(req: Request) {
  try {
    if (!config.decart.enabled) return NextResponse.json({ error: "Decart is not configured" }, { status: 503 });
    await assertSameOrigin();
    // Paid credits are reserved: when an access code is set, only holders of the code get tokens
    if (config.decart.accessCode && !safeEqual(req.headers.get("x-access-code") ?? "", config.decart.accessCode)) {
      return NextResponse.json({ error: "Live AI try-on needs an access code", code: "ACCESS_CODE" }, { status: 401 });
    }
    await rateLimit("decart-token", 10, 60_000);
    const token = await mintToken();
    return NextResponse.json({
      apiKey: token.apiKey,
      expiresAt: token.expiresAt,
      keyIndex: token.keyIndex,
      model: config.decart.model,
      maxSessionSeconds: config.decart.maxSessionSeconds,
    });
  } catch (err) {
    return jsonError(err, 502);
  }
}
