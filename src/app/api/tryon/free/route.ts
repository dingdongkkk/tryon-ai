import { NextResponse } from "next/server";
import { getProduct } from "@/lib/catalog";
import { runFreeTryOn, FreeTryOnError } from "@/lib/freeTryOn";
import { assertSameOrigin, rateLimit } from "@/lib/access";
import { jsonError } from "@/lib/http";

// Free photo try-on (IDM-VTON on Hugging Face). The shopper's photo is forwarded for this one
// request and never stored by TryOn AI.
export const maxDuration = 180;

export async function POST(req: Request) {
  try {
    await assertSameOrigin();
    await rateLimit("free-tryon", 12, 10 * 60_000);
    const form = await req.formData();
    const person = form.get("person");
    const product = await getProduct(String(form.get("productId") ?? ""));
    if (!product) throw new Error("Unknown product");
    if (!(person instanceof Blob) || !/^image\/(jpeg|png|webp)$/.test(person.type)) throw new Error("Please use a JPEG, PNG or WebP photo");
    if (person.size > 8 * 1024 * 1024) throw new Error("That photo is too large (max 8 MB)");
    const { bytes, type } = await runFreeTryOn(person, product);
    return new NextResponse(new Uint8Array(bytes), { headers: { "content-type": type, "cache-control": "no-store" } });
  } catch (err) {
    return jsonError(err, err instanceof FreeTryOnError ? err.status : 400);
  }
}
