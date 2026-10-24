import { NextResponse } from "next/server";
import { requestRefund } from "@/lib/workflow";
import { jsonError, publicOrder } from "@/lib/http";
import { assertSameOrigin, hasAccess, rateLimit } from "@/lib/access";
import { store } from "@/lib/store";

export async function POST(req: Request, ctx: RouteContext<"/api/orders/[id]/refund">) {
  try {
    await assertSameOrigin();
    await rateLimit("refund", 5, 60_000);
    const { id } = await ctx.params;
    const existing = await store.getOrder(id);
    if (!existing || !(await hasAccess("o", id, existing.accessHash))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = await req.json();
    const reason = String(body?.reason ?? "").trim().slice(0, 500);
    if (!reason) throw new Error("Please tell us why you'd like a refund");
    const order = await requestRefund(id, Number(body?.amountPaise), reason);
    return NextResponse.json({ order: publicOrder(order) });
  } catch (err) {
    return jsonError(err);
  }
}
