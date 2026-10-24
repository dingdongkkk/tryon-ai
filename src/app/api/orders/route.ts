import { NextResponse } from "next/server";
import { placeOrder } from "@/lib/workflow";
import { jsonError, publicOrder } from "@/lib/http";
import { assertSameOrigin, grantAccess, rateLimit } from "@/lib/access";
import type { Customer } from "@/lib/types";

const CUSTOMER_FIELDS: (keyof Customer)[] = ["firstName", "lastName", "email", "mobile", "address1", "city", "state", "pincode"];

export async function POST(req: Request) {
  try {
    await assertSameOrigin();
    await rateLimit("orders", 10, 60_000);
    const body = await req.json();
    const customer = {} as Customer;
    for (const f of CUSTOMER_FIELDS) {
      const v = String(body?.customer?.[f] ?? "").trim();
      if (!v) throw new Error(`Please fill in ${f}`);
      customer[f] = v.slice(0, 200);
    }
    if (!/^\S+@\S+\.\S+$/.test(customer.email)) throw new Error("Please enter a valid email");
    const items = Array.isArray(body?.items)
      ? body.items.slice(0, 20).map((i: Record<string, unknown>) => ({ productId: String(i.productId), size: String(i.size), quantity: Number(i.quantity) || 1 }))
      : [];
    const { order, accessToken } = await placeOrder({ items, customer });
    await grantAccess("o", order.id, accessToken);
    return NextResponse.json({ order: publicOrder(order) });
  } catch (err) {
    return jsonError(err);
  }
}
