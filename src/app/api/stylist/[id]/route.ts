import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { hasAccess } from "@/lib/access";

// Shopper's view of their stylist request: status and the stylist's answer only.
export async function GET(_req: Request, ctx: RouteContext<"/api/stylist/[id]">) {
  const { id } = await ctx.params;
  const a = await store.getApproval(id);
  if (!a || a.kind !== "stylist_review" || !(await hasAccess("s", id, a.accessHash))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    status: a.status,
    size: a.status === "approved" ? (a.stylist?.stylistSize ?? a.stylist?.selectedSize) : undefined,
    note: a.status !== "pending" ? a.note : undefined,
  });
}
