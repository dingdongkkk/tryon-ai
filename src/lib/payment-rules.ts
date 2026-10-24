import { createHmac, timingSafeEqual } from "node:crypto";
import type { Order, OrderStatus, RefundStatus } from "./types";

// Pure payment rules: no I/O, so they're unit-tested directly (tests/payment-rules.test.ts).

/** Normalized view of a Pine Labs order (GET /api/pay/v1/orders/{id}). */
export type PlOrder = {
  orderId: string;
  reference: string; // merchant_order_reference
  type: string; // CHARGE | REFUND
  status: string; // CREATED | PENDING | ATTEMPTED | AUTHORIZED | PROCESSED | FAILED | CANCELLED | FULLY_REFUNDED | PARTIALLY_REFUNDED
  amountPaise: number;
  currency: string;
  parentOrderId?: string;
};

export function normalizePlOrder(raw: unknown): PlOrder {
  const r = raw as Record<string, unknown>;
  const d = ((r?.data as Record<string, unknown>) ?? r ?? {}) as Record<string, unknown>;
  const amt = (d.order_amount ?? {}) as { value?: number; currency?: string };
  return {
    orderId: String(d.order_id ?? ""),
    reference: String(d.merchant_order_reference ?? ""),
    type: String(d.type ?? "CHARGE").toUpperCase(),
    status: String(d.status ?? "UNKNOWN").toUpperCase(),
    amountPaise: Number(amt.value ?? NaN),
    currency: String(amt.currency ?? "").toUpperCase(),
    parentOrderId: d.parent_order_id ? String(d.parent_order_id) : undefined,
  };
}

/**
 * Map a Pine Labs CHARGE status to our order status.
 * AUTHORIZED is NOT paid: funds are only held until captured (PROCESSED).
 */
export function chargeStatusToOrderStatus(status: string): OrderStatus | null {
  switch (status.toUpperCase()) {
    case "PROCESSED":
      return "paid";
    case "AUTHORIZED":
    case "PENDING":
    case "ATTEMPTED":
      return "payment_pending";
    case "CREATED":
      return "awaiting_payment";
    case "FAILED":
    case "CANCELLED":
      return "payment_failed";
    case "PARTIALLY_REFUNDED":
      return "partially_refunded";
    case "FULLY_REFUNDED":
      return "refunded";
    default:
      return null; // unknown: don't change state
  }
}

export function refundStatusFromPl(status: string): RefundStatus | null {
  switch (status.toUpperCase()) {
    case "PROCESSED":
      return "processed";
    case "CREATED":
    case "PENDING":
      return "pending";
    case "FAILED":
    case "CANCELLED":
      return "failed";
    default:
      return null;
  }
}

const RANK: Record<OrderStatus, number> = {
  pending_approval: 0,
  rejected: 0,
  approved: 1,
  awaiting_payment: 2,
  payment_failed: 2,
  payment_pending: 3,
  payment_mismatch: 4,
  paid: 5,
  partially_refunded: 6,
  refunded: 7,
};

/**
 * Decide the next order status from a verified Pine Labs charge.
 * Returns { next, problem }: next=null means "leave as is".
 * - identity, amount and currency must match, otherwise payment_mismatch
 * - status never moves backwards (a late FAILED callback can't un-pay an order)
 */
export function applyCharge(order: Pick<Order, "status" | "totalPaise" | "currency" | "attempts">, pl: PlOrder): { next: OrderStatus | null; problem?: string } {
  const attempt = order.attempts.find((a) => a.pinelabsOrderId === pl.orderId);
  if (!attempt) return { next: null, problem: `Unknown Pine Labs order ${pl.orderId}` };
  const latest = order.attempts[order.attempts.length - 1] === attempt;
  if (pl.type !== "CHARGE") return { next: null, problem: `Expected CHARGE, got ${pl.type}` };
  if (pl.reference !== attempt.reference) return { next: "payment_mismatch", problem: `Reference mismatch: ${pl.reference} ≠ ${attempt.reference}` };
  if (pl.amountPaise !== order.totalPaise) return { next: "payment_mismatch", problem: `Amount mismatch: ${pl.amountPaise} ≠ ${order.totalPaise}` };
  if (pl.currency !== order.currency) return { next: "payment_mismatch", problem: `Currency mismatch: ${pl.currency} ≠ ${order.currency}` };
  const mapped = chargeStatusToOrderStatus(pl.status);
  if (!mapped) return { next: null, problem: `Unhandled Pine Labs status ${pl.status}` };
  // An older attempt can still prove payment, but can't drag the current attempt's state around
  if (!latest && mapped !== "paid") return { next: null, problem: `Ignored ${pl.status} for superseded attempt` };
  if (mapped === order.status) return { next: null };
  // Allow retries after a failure (new attempt), otherwise only move forward
  if (RANK[mapped] < RANK[order.status]) return { next: null, problem: `Ignored backwards transition ${order.status} → ${mapped}` };
  return { next: mapped };
}

/** Callback signature: sorted key=value pairs joined by &, HMAC-SHA256 with hex-decoded secret, uppercase hex. */
export function callbackSignature(fields: Record<string, string | undefined>, hexSecret: string) {
  const payload = Object.keys(fields)
    .filter((k) => k !== "signature" && fields[k] !== undefined && fields[k] !== "")
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("&");
  return createHmac("sha256", Buffer.from(hexSecret, "hex")).update(payload).digest("hex").toUpperCase();
}

/** Webhook signature: base64(HMAC-SHA256(base64decode(secret), `${id}.${timestamp}.${rawBody}`)), header "v1,<sig>". */
export function webhookSignature(id: string, timestamp: string, rawBody: string, base64Secret: string) {
  return createHmac("sha256", Buffer.from(base64Secret, "base64")).update(`${id}.${timestamp}.${rawBody}`, "utf8").digest("base64");
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function verifyWebhook(headers: { id?: string | null; timestamp?: string | null; signature?: string | null }, rawBody: string, base64Secret: string, nowSec = Math.floor(Date.now() / 1000)) {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  if (Math.abs(nowSec - Number(timestamp)) > 300) return false; // 5-minute replay window
  const expected = webhookSignature(id, timestamp, rawBody, base64Secret);
  // header may carry several space-separated "v1,<sig>" entries
  return signature.split(" ").some((part) => {
    const [, sig] = part.split(",");
    return sig ? safeEqual(sig, expected) : false;
  });
}
