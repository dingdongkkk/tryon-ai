import { NextResponse } from "next/server";
import { placeOrder } from "@/lib/workflow";
import { jsonError } from "@/lib/http";
import type { Customer } from "@/lib/types";

const CUSTOMER_FIELDS: (keyof Customer)[] = ["firstName", "lastName", "email", "mobile", "address1", "city", "state", "pincode"];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const customer = {} as Customer;
    for (const f of CUSTOMER_FIELDS) {
      const v = String(body?.customer?.[f] ?? "").trim();
      if (!v) throw new Error(`Missing customer.${f}`);
      customer[f] = v.slice(0, 200);
    }
    const items = Array.isArray(body?.items)
      ? body.items.map((i: Record<string, unknown>) => ({
          productId: String(i.productId),
          size: String(i.size),
          quantity: Number(i.quantity) || 1,
        }))
      : [];
    const order = await placeOrder({ items, customer });
    return NextResponse.json({ order });
  } catch (err) {
    return jsonError(err);
  }
}
