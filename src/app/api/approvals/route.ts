import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import type { ApprovalStatus } from "@/lib/types";

// Protected by src/proxy.ts (console basic auth).
export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status") as ApprovalStatus | null;
  const approvals = await store.listApprovals(status ?? undefined);
  const orders = await store.listOrders();
  const byId = Object.fromEntries(orders.map((o) => [o.id, o]));
  return NextResponse.json({
    approvals: approvals.map((a) => ({ ...a, order: a.orderId ? byId[a.orderId] : undefined })),
  });
}
