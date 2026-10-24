import { NextResponse } from "next/server";
import { decide } from "@/lib/workflow";
import { jsonError } from "@/lib/http";
import { config } from "@/lib/config";

// Console only (basic auth in src/proxy.ts).
export async function POST(req: Request, ctx: RouteContext<"/api/ops/approvals/[id]/decision">) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const reviewer = String(body?.reviewer ?? "").trim().slice(0, 80) || config.console.user;
    const approval = await decide(id, {
      approve: body?.approve === true,
      by: reviewer,
      note: body?.note ? String(body.note).slice(0, 1000) : undefined,
      stylistSize: body?.stylistSize ? String(body.stylistSize).slice(0, 10) : undefined,
    });
    return NextResponse.json({ approval });
  } catch (err) {
    return jsonError(err);
  }
}
