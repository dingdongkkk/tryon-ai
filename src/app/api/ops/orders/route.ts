import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { publicOrder } from "@/lib/http";

// Console only. All orders, newest first.
export async function GET() {
  return NextResponse.json({ orders: (await store.listOrders()).slice(0, 200).map(publicOrder) });
}
