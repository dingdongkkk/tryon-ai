import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { publicOrder } from "@/lib/http";
import type { ApprovalStatus } from "@/lib/types";

// Console only (basic auth in src/proxy.ts).
export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status") as ApprovalStatus | null;
  const approvals = await store.listApprovals(status ?? undefined);
  const orders = Object.fromEntries((await store.listOrders()).map((o) => [o.id, publicOrder(o)]));
  return NextResponse.json({
    approvals: approvals.map(({ accessHash: _h, ...a }) => (void _h, { ...a, order: a.orderId ? orders[a.orderId] : undefined })),
  });
}
