import { NextResponse } from "next/server";
import { issuePaymentLink } from "@/lib/workflow";
import { jsonError, publicOrder } from "@/lib/http";
import { assertSameOrigin, hasAccess, rateLimit } from "@/lib/access";
import { store } from "@/lib/store";

// Shopper retry after a failed payment: creates a fresh checkout attempt.
export async function POST(_req: Request, ctx: RouteContext<"/api/orders/[id]/pay">) {
  try {
    await assertSameOrigin();
    await rateLimit("pay", 5, 60_000);
    const { id } = await ctx.params;
    const existing = await store.getOrder(id);
    if (!existing || !(await hasAccess("o", id, existing.accessHash))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status !== "payment_failed") throw new Error("This order isn't waiting for a retry");
    const order = await issuePaymentLink(id);
    return NextResponse.json({ order: publicOrder(order) });
  } catch (err) {
    return jsonError(err);
  }
}
