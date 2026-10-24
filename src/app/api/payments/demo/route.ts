import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { hasAccess, assertSameOrigin } from "@/lib/access";
import { store } from "@/lib/store";
import { completeDemoPayment } from "@/lib/workflow";
import { jsonError } from "@/lib/http";

// Demo checkout only: exists solely when Pine Labs isn't configured. No money moves.
export async function POST(req: Request) {
  try {
    if (!config.payments.demo) return NextResponse.json({ error: "Demo payments are disabled" }, { status: 404 });
    await assertSameOrigin();
    const form = await req.formData();
    const ref = String(form.get("ref") ?? "");
    const outcome = form.get("outcome") === "FAILED" ? "FAILED" : "PROCESSED";
    const order = await store.getOrder(ref);
    if (!order?.demo || !(await hasAccess("o", ref, order.accessHash))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await completeDemoPayment(ref, outcome);
    return NextResponse.redirect(new URL(`/orders/${ref}`, config.appUrl), 303);
  } catch (err) {
    return jsonError(err);
  }
}
