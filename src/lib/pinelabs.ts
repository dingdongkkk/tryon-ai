import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { config } from "./config";
import type { Order } from "./types";

// Pine Labs Online (Plural) hosted checkout.
// Docs: https://www.pinelabs.com/docs/online-payments/hosted-checkout/integration-steps
// Never call these from the browser: tokens and secrets stay server-side.

let cachedToken: { value: string; expiresAt: number } | null = null;

function headers(extra: Record<string, string> = {}) {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "Request-ID": randomUUID(),
    "Request-Timestamp": new Date().toISOString(),
    ...extra,
  };
}

async function call<T>(path: string, init: { method: string; body?: unknown; auth?: boolean }): Promise<T> {
  const extra: Record<string, string> = {};
  if (init.auth !== false) extra.Authorization = `Bearer ${await getToken()}`;
  const res = await fetch(`${config.pinelabs.baseUrl}${path}`, {
    method: init.method,
    headers: headers(extra),
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`Pine Labs ${init.method} ${path} failed (${res.status}): ${text.slice(0, 500)}`);
  return data as T;
}

async function getToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const data = await call<{ access_token: string; expires_in?: number | string }>("/api/auth/v1/token", {
    method: "POST",
    auth: false,
    body: {
      client_id: config.pinelabs.clientId,
      client_secret: config.pinelabs.clientSecret,
      grant_type: "client_credentials",
    },
  });
  // expires_in may be seconds or an ISO timestamp depending on API version
  const exp = data.expires_in;
  const expiresAt =
    typeof exp === "number" ? Date.now() + exp * 1000 : exp && !Number.isNaN(Date.parse(exp)) ? Date.parse(exp) : Date.now() + 30 * 60_000;
  cachedToken = { value: data.access_token, expiresAt };
  return cachedToken.value;
}

export async function createCheckout(order: Order): Promise<{ orderId: string; redirectUrl: string }> {
  const callbackUrl = `${config.appUrl}/api/payments/pinelabs/callback?ref=${order.id}`;
  if (!config.pinelabs.enabled) {
    return { orderId: `mock_pl_${order.id}`, redirectUrl: `${config.appUrl}/pay/mock?ref=${order.id}` };
  }
  const c = order.customer;
  const address = {
    address1: c.address1,
    pincode: c.pincode,
    city: c.city,
    state: c.state,
    country: "India",
    full_name: `${c.firstName} ${c.lastName}`,
  };
  const data = await call<{ order_id: string; redirect_url: string; response_code?: number; response_message?: string }>(
    "/api/checkout/v1/orders",
    {
      method: "POST",
      body: {
        merchant_order_reference: order.id,
        order_amount: { value: order.totalPaise, currency: "INR" },
        pre_auth: false,
        integration_mode: "REDIRECT",
        allowed_payment_methods: ["CARD", "UPI", "NETBANKING", "WALLET"],
        notes: `Wearable order ${order.id}`,
        callback_url: callbackUrl,
        failure_callback_url: callbackUrl,
        purchase_details: {
          customer: {
            email_id: c.email,
            first_name: c.firstName,
            last_name: c.lastName,
            customer_id: c.email,
            mobile_number: c.mobile,
            country_code: "91",
            billing_address: address,
            shipping_address: address,
          },
          merchant_metadata: { app_order_id: order.id, shift4shop_order_id: order.shift4shopOrderId ?? "" },
          cart_details: {
            cart_items: order.items.map((i) => ({
              item_id: `${i.sku}-${i.size}`,
              item_name: `${i.name} (${i.size})`,
              item_description: i.name,
              item_quantity: i.quantity,
              item_currency: "INR",
              item_original_unit_price: i.unitPricePaise,
              item_discounted_unit_price: i.unitPricePaise,
            })),
          },
        },
      },
    },
  );
  if (!data.redirect_url) throw new Error(`Pine Labs did not return a redirect_url: ${JSON.stringify(data)}`);
  return { orderId: data.order_id, redirectUrl: data.redirect_url };
}

export async function getPinelabsOrder(pinelabsOrderId: string) {
  if (!config.pinelabs.enabled) return { data: { order_id: pinelabsOrderId, status: "PROCESSED" } };
  return call<{ data?: { order_id: string; status: string } }>(`/api/pay/v1/orders/${pinelabsOrderId}`, { method: "GET" });
}

export async function createRefund(order: Order, amountPaise: number) {
  if (!order.pinelabs) throw new Error("Order has no Pine Labs payment");
  if (!config.pinelabs.enabled) return { refundId: `mock_refund_${order.id}` };
  const data = await call<{ data?: { order_id?: string } }>(`/api/pay/v1/refunds/${order.pinelabs.orderId}`, {
    method: "POST",
    body: {
      // idempotency key: one refund per app order
      merchant_order_reference: `${order.id}-refund`,
      order_amount: { value: amountPaise, currency: "INR" },
      merchant_metadata: { app_order_id: order.id },
    },
  });
  return { refundId: data.data?.order_id ?? "" };
}

/**
 * Verify the signature Pine Labs posts to callback_url.
 * Sorted `key=value` pairs joined with `&`, HMAC-SHA256 with the hex-decoded secret, uppercase hex.
 * Confirm the exact field set with your Pine Labs integration manager.
 */
export function verifyCallbackSignature(fields: Record<string, string>, signature: string) {
  if (!config.pinelabs.enabled) return true;
  if (!config.pinelabs.secretKey || !signature) return false;
  const payload = Object.keys(fields)
    .filter((k) => k !== "signature" && fields[k] !== undefined && fields[k] !== "")
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("&");
  const expected = createHmac("sha256", Buffer.from(config.pinelabs.secretKey, "hex")).update(payload).digest("hex").toUpperCase();
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.toUpperCase());
  return a.length === b.length && timingSafeEqual(a, b);
}
