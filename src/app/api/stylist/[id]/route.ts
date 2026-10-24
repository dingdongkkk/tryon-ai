import { NextResponse } from "next/server";
import { store } from "@/lib/store";

// Customer-facing view of a stylist review: status + the stylist's answer, nothing internal.
export async function GET(_req: Request, ctx: RouteContext<"/api/stylist/[id]">) {
  const { id } = await ctx.params;
  const a = await store.getApproval(id);
  if (!a || a.kind !== "stylist_review") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    status: a.status,
    size: a.stylist?.stylistSize ?? (a.status === "approved" ? a.stylist?.suggestedSize : undefined),
    note: a.note,
    agentSummary: a.analysis.summary,
  });
}
