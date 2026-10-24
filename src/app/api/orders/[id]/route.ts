import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { hasAccess } from "@/lib/access";
import { publicOrder } from "@/lib/http";
import { syncPayment, syncRefund } from "@/lib/workflow";

// Throttle server-to-server status checks triggered by shopper polling
const lastSync = new Map<string, number>();
const due = (id: string, ms: number) => {
  const t = Date.now();
  if ((lastSync.get(id) ?? 0) + ms > t) return false;
  lastSync.set(id, t);
  return true;
};

export async function GET(_req: Request, ctx: RouteContext<"/api/orders/[id]">) {
  const { id } = await ctx.params;
  let order = await store.getOrder(id);
  if (!order || !(await hasAccess("o", id, order.accessHash))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // While something is in flight, refresh from Pine Labs (server-to-server)
  try {
    if ((order.status === "payment_pending" || order.status === "awaiting_payment") && due(`p:${id}`, 10_000)) order = (await syncPayment(id, "Status check")) ?? order;
    if (order.refund?.status === "pending" && due(`r:${id}`, 10_000)) order = (await syncRefund(id)) ?? order;
  } catch {
    /* keep last known state */
  }
  return NextResponse.json({ order: publicOrder(order) });
}
