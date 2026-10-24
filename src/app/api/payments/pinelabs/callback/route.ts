import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getPinelabsOrder, verifyCallbackSignature } from "@/lib/pinelabs";
import { store } from "@/lib/store";
import { markPayment } from "@/lib/workflow";

// Pine Labs redirects the shopper here (POST) after hosted checkout.
// We verify the signature, then re-read the order status server-to-server before trusting it.
async function readFields(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const j = await req.json();
    return Object.fromEntries(Object.entries(j).map(([k, v]) => [k, String(v ?? "")]));
  }
  const form = await req.formData();
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
}

async function handle(req: Request, fields: Record<string, string>) {
  const ref = new URL(req.url).searchParams.get("ref") ?? "";
  const order = ref ? await store.getOrder(ref) : undefined;
  const back = (q = "") => NextResponse.redirect(new URL(`/orders/${ref}${q}`, config.appUrl), 303);
  if (!order?.pinelabs) return NextResponse.redirect(new URL("/", config.appUrl), 303);

  const { signature = "", ...rest } = fields;
  const signed = { order_id: rest.order_id, status: rest.status, error_code: rest.error_code, error_message: rest.error_message };
  if (!verifyCallbackSignature(signed, signature)) {
    await store.updateOrder(order.id, {}, "Rejected callback with invalid signature");
    return back("?payment=invalid");
  }
  const live = config.pinelabs.enabled
    ? await getPinelabsOrder(order.pinelabs.orderId)
    : { data: { order_id: order.pinelabs.orderId, status: rest.status } };
  const status = live.data?.status ?? rest.status ?? "UNKNOWN";
  await markPayment(order.id, { status, pinelabsOrderId: live.data?.order_id });
  return back();
}

export async function POST(req: Request) {
  return handle(req, await readFields(req));
}

// Mock checkout (no Pine Labs credentials) redirects here with GET.
export async function GET(req: Request) {
  if (config.pinelabs.enabled) return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  const sp = new URL(req.url).searchParams;
  return handle(req, { order_id: sp.get("order_id") ?? "", status: sp.get("status") ?? "PROCESSED" });
}
