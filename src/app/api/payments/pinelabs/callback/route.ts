import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { callbackSignature, safeEqual } from "@/lib/payment-rules";
import { store } from "@/lib/store";
import { syncPayment } from "@/lib/workflow";

// Pine Labs redirects the shopper here (POST) after hosted checkout.
// The callback body is only a hint: we check its signature, then re-read the order from Pine Labs
// server-to-server and verify reference, amount, currency and status before changing anything.
// Repeated callbacks are harmless (state transitions are idempotent and forward-only).

async function readFields(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const j = await req.json().catch(() => ({}));
    return Object.fromEntries(Object.entries(j).map(([k, v]) => [k, String(v ?? "")]));
  }
  const form = await req.formData().catch(() => null);
  return form ? Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)])) : {};
}

export async function POST(req: Request) {
  const ref = new URL(req.url).searchParams.get("ref") ?? "";
  const back = (q = "") => NextResponse.redirect(new URL(`/orders/${encodeURIComponent(ref)}${q}`, config.appUrl), 303);
  const order = ref ? await store.getOrder(ref) : undefined;
  if (!order || order.demo) return NextResponse.redirect(new URL("/", config.appUrl), 303);

  const f = await readFields(req);
  if (f.order_id && !order.attempts.some((a) => a.pinelabsOrderId === f.order_id)) {
    await store.updateOrder(order.id, () => undefined, `Callback for unknown Pine Labs order ${f.order_id} ignored`);
    return back("?payment=unknown");
  }
  if (config.pinelabs.secretKey) {
    const expected = callbackSignature({ order_id: f.order_id, status: f.status, error_code: f.error_code, error_message: f.error_message }, config.pinelabs.secretKey);
    if (!f.signature || !safeEqual(expected, f.signature.toUpperCase())) {
      await store.updateOrder(order.id, () => undefined, "Callback with invalid signature ignored");
      // still fall through to a server-side status read below: it's authoritative and safe
    }
  }
  try {
    await syncPayment(order.id, "Pine Labs callback");
  } catch (err) {
    await store.updateOrder(order.id, () => undefined, `Status check after callback failed: ${(err as Error).message}`);
  }
  return back();
}
