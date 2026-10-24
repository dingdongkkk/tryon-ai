import { NextResponse } from "next/server";
import { getPinelabsOrder } from "@/lib/pinelabs";
import { store } from "@/lib/store";
import { markPayment } from "@/lib/workflow";

// Configure this URL in the Pine Labs dashboard for ORDER_PROCESSED / ORDER_AUTHORIZED / ORDER_FAILED events.
// The payload is treated as a hint only: status is always re-fetched from Pine Labs.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { data?: { order_id?: string; merchant_order_reference?: string } };
  const ref = body.data?.merchant_order_reference;
  const order = ref ? await store.getOrder(ref) : undefined;
  if (!order?.pinelabs || order.pinelabs.orderId !== body.data?.order_id) return NextResponse.json({ ok: true });
  const live = await getPinelabsOrder(order.pinelabs.orderId);
  if (live.data?.status) await markPayment(order.id, { status: live.data.status, pinelabsOrderId: live.data.order_id });
  return NextResponse.json({ ok: true });
}
