import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { applyCharge, callbackSignature, chargeStatusToOrderStatus, refundStatusFromPl, verifyWebhook, webhookSignature, type PlOrder } from "@/lib/payment-rules";
import type { Order } from "@/lib/types";

const order = (over: Partial<Order> = {}): Pick<Order, "status" | "totalPaise" | "currency" | "attempts"> => ({
  status: "awaiting_payment",
  totalPaise: 89900,
  currency: "INR",
  attempts: [{ reference: "ord_1-1", pinelabsOrderId: "pl_1", redirectUrl: "x", createdAt: "" }],
  ...over,
});
const pl = (over: Partial<PlOrder> = {}): PlOrder => ({ orderId: "pl_1", reference: "ord_1-1", type: "CHARGE", status: "PROCESSED", amountPaise: 89900, currency: "INR", ...over });

describe("charge status mapping", () => {
  it("treats only PROCESSED as paid. AUTHORIZED is held funds, not captured", () => {
    expect(chargeStatusToOrderStatus("PROCESSED")).toBe("paid");
    expect(chargeStatusToOrderStatus("AUTHORIZED")).toBe("payment_pending");
    expect(chargeStatusToOrderStatus("PENDING")).toBe("payment_pending");
    expect(chargeStatusToOrderStatus("ATTEMPTED")).toBe("payment_pending");
    expect(chargeStatusToOrderStatus("FAILED")).toBe("payment_failed");
    expect(chargeStatusToOrderStatus("CANCELLED")).toBe("payment_failed");
    expect(chargeStatusToOrderStatus("FULLY_REFUNDED")).toBe("refunded");
    expect(chargeStatusToOrderStatus("SOMETHING_NEW")).toBeNull();
  });

  it("maps refund statuses without treating acceptance as completion", () => {
    expect(refundStatusFromPl("CREATED")).toBe("pending");
    expect(refundStatusFromPl("PENDING")).toBe("pending");
    expect(refundStatusFromPl("PROCESSED")).toBe("processed");
    expect(refundStatusFromPl("FAILED")).toBe("failed");
  });
});

describe("applyCharge verification", () => {
  it("marks paid only when identity, amount and currency match", () => {
    expect(applyCharge(order(), pl())).toEqual({ next: "paid" });
  });
  it("flags amount, currency and reference mismatches instead of paying", () => {
    expect(applyCharge(order(), pl({ amountPaise: 100 })).next).toBe("payment_mismatch");
    expect(applyCharge(order(), pl({ currency: "USD" })).next).toBe("payment_mismatch");
    expect(applyCharge(order(), pl({ reference: "someone-else" })).next).toBe("payment_mismatch");
  });
  it("ignores unknown Pine Labs orders and refund-type orders", () => {
    expect(applyCharge(order(), pl({ orderId: "pl_other" })).next).toBeNull();
    expect(applyCharge(order(), pl({ type: "REFUND" })).next).toBeNull();
  });
  it("AUTHORIZED moves to payment_pending, never paid", () => {
    expect(applyCharge(order(), pl({ status: "AUTHORIZED" })).next).toBe("payment_pending");
  });
  it("is idempotent and never moves backwards (late FAILED after paid)", () => {
    expect(applyCharge(order({ status: "paid" }), pl()).next).toBeNull();
    const late = applyCharge(order({ status: "paid" }), pl({ status: "FAILED" }));
    expect(late.next).toBeNull();
    expect(late.problem).toMatch(/backwards/);
  });
  it("lets a superseded attempt prove payment but not fail the current one", () => {
    const o = order({
      status: "awaiting_payment",
      attempts: [
        { reference: "ord_1-1", pinelabsOrderId: "pl_1", redirectUrl: "", createdAt: "" },
        { reference: "ord_1-2", pinelabsOrderId: "pl_2", redirectUrl: "", createdAt: "" },
      ],
    });
    expect(applyCharge(o, pl({ status: "FAILED" })).next).toBeNull();
    expect(applyCharge(o, pl({ status: "PROCESSED" })).next).toBe("paid");
  });
});

describe("signatures", () => {
  it("callback signature: sorted pairs, hex key, uppercase hex HMAC-SHA256", () => {
    const secret = "a1b2c3d4";
    const expected = createHmac("sha256", Buffer.from(secret, "hex")).update("order_id=pl_1&status=FAILED").digest("hex").toUpperCase();
    expect(callbackSignature({ status: "FAILED", order_id: "pl_1", error_code: "" }, secret)).toBe(expected);
  });

  it("webhook signature round-trips and rejects tampering, bad prefix and replays", () => {
    const secret = Buffer.from("abc1234").toString("base64"); // docs' example key
    const body = '{"event_type":"ORDER_PROCESSED","data":{"order_id":"pl_1"}}';
    const ts = "1760000000";
    const sig = webhookSignature("msg_1", ts, body, secret);
    const now = 1760000010;
    expect(verifyWebhook({ id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, body, secret, now)).toBe(true);
    expect(verifyWebhook({ id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, body.replace("pl_1", "pl_2"), secret, now)).toBe(false);
    expect(verifyWebhook({ id: "msg_2", timestamp: ts, signature: `v1,${sig}` }, body, secret, now)).toBe(false);
    expect(verifyWebhook({ id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, body, secret, now + 3600)).toBe(false);
    expect(verifyWebhook({ id: "msg_1", timestamp: ts, signature: null }, body, secret, now)).toBe(false);
  });
});
