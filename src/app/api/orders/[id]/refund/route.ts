import { NextResponse } from "next/server";
import { requestRefund } from "@/lib/workflow";
import { jsonError } from "@/lib/http";

export async function POST(req: Request, ctx: RouteContext<"/api/orders/[id]/refund">) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const reason = String(body?.reason ?? "").trim().slice(0, 500);
    if (!reason) throw new Error("Please give a reason for the refund");
    const order = await requestRefund(id, Number(body?.amountPaise), reason);
    return NextResponse.json({ order });
  } catch (err) {
    return jsonError(err);
  }
}
