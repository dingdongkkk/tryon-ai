import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { markExhausted } from "@/lib/decartKeys";
import { assertSameOrigin, rateLimit } from "@/lib/access";
import { safeEqual } from "@/lib/payment-rules";
import { jsonError } from "@/lib/http";

// The browser reports "session ended: insufficient credits" here, so the next token uses a backup key.
// Same gate as the token route; only moves the key order, it never reveals keys.
export async function POST(req: Request) {
  try {
    await assertSameOrigin();
    await rateLimit("decart-exhausted", 6, 60_000);
    if (config.decart.accessCode && !safeEqual(req.headers.get("x-access-code") ?? "", config.decart.accessCode)) {
      return NextResponse.json({ error: "Access code required" }, { status: 401 });
    }
    const { keyIndex } = await req.json();
    if (!Number.isInteger(keyIndex) || keyIndex < 0 || keyIndex >= config.decart.apiKeys.length) throw new Error("Bad key index");
    await markExhausted(keyIndex);
    return NextResponse.json({ ok: true, backups: config.decart.apiKeys.length - 1 });
  } catch (err) {
    return jsonError(err);
  }
}
