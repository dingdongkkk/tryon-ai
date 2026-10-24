import "server-only";
import { randomUUID } from "node:crypto";
import { config } from "./config";
import { normalizePlOrder, type PlOrder } from "./payment-rules";
import type { Order } from "./types";

// Pine Labs Online (Plural) server-side client. Never call these APIs from the browser.
// Docs: https://www.pinelabs.com/docs/online-payments/hosted-checkout/integration-steps
//       https://www.pinelabs.com/docs/online-payments/api/orders/get-order-by-id
//       https://www.pinelabs.com/docs/online-payments/payment-lifecycle/refunds

let cachedToken: { value: string; expiresAt: number } | null = null;

export class PinelabsError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

function assertLiveAllowed() {
  if (!config.pinelabs.enabled) throw new PinelabsError("Pine Labs is not configured");
  if (config.pinelabs.env === "prod" && !config.payments.allowLive) {
    throw new PinelabsError("Live Pine Labs payments are disabled. Set ALLOW_LIVE_PAYMENTS=true after go-live review.");
  }
}

async function call<T>(path: string, init: { method: string; body?: unknown; auth?: boolean }): Promise<T> {
  assertLiveAllowed();
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
    "Request-ID": randomUUID(),
    "Request-Timestamp": new Date().toISOString(),
  };
  if (init.auth !== false) headers.Authorization = `Bearer ${await getToken()}`;
  const res = await fetch(`${config.pinelabs.baseUrl}${path}`, {
    method: init.method,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) throw new PinelabsError(`Pine Labs ${init.method} ${path} → ${res.status}: ${text.slice(0, 300)}`, res.status);
  return (text ? JSON.parse(text) : {}) as T;
}

async function getToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const data = await call<{ access_token: string; expires_in?: number | string; expires_at?: string }>("/api/auth/v1/token", {
    method: "POST",
    auth: false,
    body: { client_id: config.pinelabs.clientId, client_secret: config.pinelabs.clientSecret, grant_type: "client_credentials" },
  });
  const exp = data.expires_at ?? data.expires_in;
  const expiresAt =
    typeof exp === "number" ? Date.now() + exp * 1000 : exp && !Number.isNaN(Date.parse(exp)) ? Date.parse(exp) : Date.now() + 15 * 60_000;
  cachedToken = { value: data.access_token, expiresAt };
  return cachedToken.value;
}

/** Hosted checkout. `reference` must be unique per attempt (Pine Labs dedupes on it). */
export async function createCheckout(order: Order, reference: string): Promise<{ pinelabsOrderId: string; redirectUrl: string }> {
  const callbackUrl = `${config.appUrl}/api/payments/pinelabs/callback?ref=${encodeURIComponent(order.id)}`;
  const c = order.customer;
  const address = { address1: c.address1, pincode: c.pincode, city: c.city, state: c.state, country: "India", full_name: `${c.firstName} ${c.lastName}` };
  const data = await call<{ order_id?: string; redirect_url?: string; response_message?: string }>("/api/checkout/v1/orders", {
    method: "POST",
    body: {
      merchant_order_reference: reference,
      order_amount: { value: order.totalPaise, currency: order.currency },
      pre_auth: false, // capture immediately: PROCESSED = paid
      integration_mode: "REDIRECT",
      allowed_payment_methods: ["CARD", "UPI", "NETBANKING", "WALLET"],
      notes: `TryOn AI order ${order.id}`,
      callback_url: callbackUrl,
      failure_callback_url: callbackUrl,
      purchase_details: {
        customer: {
          email_id: c.email,
          first_name: c.firstName,
          last_name: c.lastName,
          customer_id: order.id,
          mobile_number: c.mobile,
          country_code: "91",
          billing_address: address,
          shipping_address: address,
        },
        merchant_metadata: { app_order_id: order.id },
        cart_details: {
          cart_items: order.items.map((i) => ({
            item_id: `${i.sku}-${i.size}`,
            item_name: `${i.name} (${i.size})`,
            item_description: i.name,
            item_quantity: i.quantity,
            item_currency: order.currency,
            item_original_unit_price: i.unitPricePaise,
            item_discounted_unit_price: i.unitPricePaise,
          })),
        },
      },
    },
  });
  if (!data.order_id || !data.redirect_url) throw new PinelabsError(`Checkout response missing order_id/redirect_url: ${data.response_message ?? ""}`);
  return { pinelabsOrderId: data.order_id, redirectUrl: data.redirect_url };
}

export async function fetchPlOrder(pinelabsOrderId: string): Promise<PlOrder> {
  return normalizePlOrder(await call(`/api/pay/v1/orders/${encodeURIComponent(pinelabsOrderId)}`, { method: "GET" }));
}

/** Submit a refund. Pine Labs dedupes on merchant_order_reference, so retries are safe. Returns the REFUND order. */
export async function submitRefund(chargeOrderId: string, reference: string, amountPaise: number, appOrderId: string): Promise<PlOrder> {
  const raw = await call(`/api/pay/v1/refunds/${encodeURIComponent(chargeOrderId)}`, {
    method: "POST",
    body: {
      merchant_order_reference: reference,
      order_amount: { value: amountPaise, currency: "INR" },
      merchant_metadata: { app_order_id: appOrderId },
    },
  });
  return normalizePlOrder(raw);
}
