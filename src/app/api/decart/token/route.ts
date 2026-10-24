import { NextResponse } from "next/server";
import { createDecartClient } from "@decartai/sdk";
import { config } from "@/lib/config";
import { assertSameOrigin, rateLimit } from "@/lib/access";
import { jsonError } from "@/lib/http";
import { safeEqual } from "@/lib/payment-rules";

// Mints a short-lived Decart client token for the browser. The permanent DECART_API_KEY never
// leaves the server; tokens are scoped to the try-on model, this origin and a max session length.
// Docs: https://docs.platform.decart.ai/examples/ecommerce-try-on
export async function POST(req: Request) {
  try {
    if (!config.decart.enabled) return NextResponse.json({ error: "Decart is not configured" }, { status: 503 });
    await assertSameOrigin();
    // Paid credits are reserved: when an access code is set, only holders of the code get tokens
    if (config.decart.accessCode && !safeEqual(req.headers.get("x-access-code") ?? "", config.decart.accessCode)) {
      return NextResponse.json({ error: "Live AI try-on needs an access code", code: "ACCESS_CODE" }, { status: 401 });
    }
    await rateLimit("decart-token", 6, 60_000);
    const client = createDecartClient({ apiKey: config.decart.apiKey });
    const token = await client.tokens.create({
      expiresIn: 60,
      allowedModels: [config.decart.model],
      allowedOrigins: [new URL(config.appUrl).origin],
      constraints: { realtime: { maxSessionDuration: config.decart.maxSessionSeconds } },
      metadata: { app: "tryon-ai" },
    });
    return NextResponse.json({ apiKey: token.apiKey, expiresAt: token.expiresAt, model: config.decart.model, maxSessionSeconds: config.decart.maxSessionSeconds });
  } catch (err) {
    return jsonError(err, 502);
  }
}
