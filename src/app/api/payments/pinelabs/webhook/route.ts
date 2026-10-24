import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { verifyWebhook } from "@/lib/payment-rules";
import { store } from "@/lib/store";
import { syncPayment, syncRefund } from "@/lib/workflow";

// Register APP_URL/api/payments/pinelabs/webhook in the Pine Labs dashboard.
// Signature: https://www.pinelabs.com/docs/online-payments/developer-tools/webhooks/signature-verification
// The payload only tells us *which* order changed; status is always re-read from Pine Labs.
export async function POST(req: Request) {
  const raw = await req.text();
  const h = { id: req.headers.get("webhook-id"), timestamp: req.headers.get("webhook-timestamp"), signature: req.headers.get("webhook-signature") };

  if (!config.pinelabs.webhookSecret) {
    if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  } else if (!verifyWebhook(h, raw, config.pinelabs.webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  // Pine Labs retries deliveries: process each webhook-id once
  if (h.id && (await store.isEventProcessed(`pl-webhook:${h.id}`))) return NextResponse.json({ ok: true, duplicate: true });

  let body: { event_type?: string; data?: Record<string, unknown> } = {};
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const d = body.data ?? {};
  const plOrderId = String(d.order_id ?? "");
  const parentId = d.parent_order_id ? String(d.parent_order_id) : "";
  const reference = String(d.merchant_order_reference ?? "");
  const appOrderId = reference.replace(/-refund-\d+$/, "").replace(/-\d+$/, "");
  const order = appOrderId ? await store.getOrder(appOrderId) : undefined;
  if (!order || order.demo) return NextResponse.json({ ok: true, ignored: true });

  try {
    const isRefund = String(d.type ?? "").toUpperCase() === "REFUND" || Boolean(parentId) || /-refund-\d+$/.test(reference);
    if (isRefund) {
      if (order.refund && (!order.refund.pinelabsRefundOrderId || order.refund.pinelabsRefundOrderId === plOrderId)) {
        if (!order.refund.pinelabsRefundOrderId) await store.updateOrder(order.id, (o) => void (o.refund!.pinelabsRefundOrderId = plOrderId));
        await syncRefund(order.id);
      }
    } else if (order.attempts.some((a) => a.pinelabsOrderId === plOrderId)) {
      await syncPayment(order.id, `Webhook ${body.event_type ?? ""}`.trim());
    }
  } catch (err) {
    // Not marked processed: Pine Labs will retry and we'll try again
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
  if (h.id) await store.markEventProcessed(`pl-webhook:${h.id}`);
  return NextResponse.json({ ok: true });
}
