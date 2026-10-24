import { NextResponse } from "next/server";
import { issuePaymentLink, submitRefundForOrder, syncPayment, syncRefund } from "@/lib/workflow";
import { jsonError, publicOrder } from "@/lib/http";

// Console only (basic auth in src/proxy.ts). Retry / re-check operations that failed earlier.
const ACTIONS = {
  "retry-payment-link": issuePaymentLink,
  "retry-refund": submitRefundForOrder,
  "sync-payment": (id: string) => syncPayment(id, "Ops status check"),
  "sync-refund": syncRefund,
} as const;

export async function POST(_req: Request, ctx: RouteContext<"/api/ops/orders/[id]/[action]">) {
  try {
    const { id, action } = await ctx.params;
    const fn = ACTIONS[action as keyof typeof ACTIONS];
    if (!fn) return NextResponse.json({ error: "Unknown action" }, { status: 404 });
    const order = await fn(id);
    return NextResponse.json({ order: order && publicOrder(order) });
  } catch (err) {
    return jsonError(err);
  }
}
