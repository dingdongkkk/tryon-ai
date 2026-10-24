import "server-only";
import { config } from "./config";
import { mirrorCase, recommendSize, reviewOrder, reviewRefund } from "./agenticorg";
import { createCheckout, createRefund } from "./pinelabs";
import { createStoreOrder, getProduct, setStoreOrderStatus } from "./shift4shop";
import { newId, store } from "./store";
import type { Approval, CartItem, Customer, Order } from "./types";

const now = () => new Date().toISOString();

async function openApproval(a: Omit<Approval, "id" | "createdAt" | "status">) {
  const approval: Approval = { ...a, id: newId("apr"), createdAt: now(), status: "pending" };
  approval.agenticorgCaseRef = await mirrorCase(approval);
  return store.saveApproval(approval);
}

/** Step 1: customer checks out. Prices are re-read from the catalog, never trusted from the client. */
export async function placeOrder(input: { items: Pick<CartItem, "productId" | "size" | "quantity">[]; customer: Customer }) {
  if (!input.items.length) throw new Error("Cart is empty");
  const items: CartItem[] = [];
  for (const i of input.items) {
    const p = await getProduct(i.productId);
    if (!p) throw new Error(`Unknown product ${i.productId}`);
    if (!p.sizes.includes(i.size)) throw new Error(`Size ${i.size} not available for ${p.name}`);
    const quantity = Math.max(1, Math.min(10, Math.floor(i.quantity)));
    items.push({ productId: p.id, sku: p.sku, name: p.name, size: i.size, quantity, unitPricePaise: p.pricePaise });
  }
  const order: Order = {
    id: newId("ord"),
    createdAt: now(),
    updatedAt: now(),
    status: "pending_approval",
    items,
    customer: input.customer,
    totalPaise: items.reduce((s, i) => s + i.unitPricePaise * i.quantity, 0),
    history: [{ at: now(), event: "Order placed" }],
  };
  await store.saveOrder(order);

  const analysis = await reviewOrder(order);
  const needsHuman =
    config.policy.orderApprovalMode === "always" ||
    order.totalPaise >= config.policy.orderReviewThresholdPaise ||
    analysis.recommendation !== "approve" ||
    analysis.confidence < config.policy.minAgentConfidence;

  if (!needsHuman) {
    await store.updateOrder(order.id, {}, `Auto-approved by ${analysis.source} (confidence ${analysis.confidence})`);
    return releaseForPayment(order.id);
  }
  const approval = await openApproval({ kind: "order_review", orderId: order.id, analysis });
  return store.updateOrder(order.id, { approvalId: approval.id }, "Sent to human review");
}

/** Step 2 (after approval): create the store order and a Pine Labs checkout link. */
async function releaseForPayment(orderId: string) {
  let order = await store.getOrder(orderId);
  if (!order) throw new Error("Order not found");
  if (!order.shift4shopOrderId) {
    const s4sId = await createStoreOrder(order);
    order = await store.updateOrder(orderId, { shift4shopOrderId: s4sId }, `Store order ${s4sId} created`);
  }
  const checkout = await createCheckout(order);
  return store.updateOrder(
    orderId,
    { status: "awaiting_payment", pinelabs: { orderId: checkout.orderId, redirectUrl: checkout.redirectUrl } },
    "Payment link issued",
  );
}

export async function markPayment(orderId: string, result: { status: string; pinelabsOrderId?: string }) {
  const order = await store.getOrder(orderId);
  if (!order) throw new Error("Order not found");
  if (order.pinelabs && result.pinelabsOrderId && order.pinelabs.orderId !== result.pinelabsOrderId) {
    throw new Error("Pine Labs order id mismatch");
  }
  const ok = ["PROCESSED", "AUTHORIZED", "SUCCESS", "CHARGED"].includes(result.status.toUpperCase());
  if (order.status === "paid") return order; // idempotent: callback + webhook may both arrive
  const updated = await store.updateOrder(
    orderId,
    { status: ok ? "paid" : "payment_failed", pinelabs: order.pinelabs && { ...order.pinelabs, status: result.status } },
    ok ? "Payment received" : `Payment ${result.status}`,
  );
  if (ok && order.shift4shopOrderId) await setStoreOrderStatus(order.shift4shopOrderId, 2).catch(() => undefined);
  return updated;
}

export async function requestRefund(orderId: string, amountPaise: number, reason: string) {
  const order = await store.getOrder(orderId);
  if (!order) throw new Error("Order not found");
  if (order.status !== "paid") throw new Error("Only paid orders can be refunded");
  const amount = Math.min(Math.max(100, Math.round(amountPaise)), order.totalPaise);
  const analysis = await reviewRefund(order, amount, reason);
  const refund = { amountPaise: amount, reason };

  if (amount <= config.policy.refundAutoApproveLimitPaise && analysis.recommendation === "approve") {
    await store.updateOrder(orderId, { status: "refund_requested", refund }, "Refund requested (auto-approved)");
    return executeRefund(orderId);
  }
  const approval = await openApproval({ kind: "refund_review", orderId, analysis });
  return store.updateOrder(orderId, { status: "refund_requested", refund: { ...refund, approvalId: approval.id } }, "Refund sent to human review");
}

async function executeRefund(orderId: string) {
  const order = await store.getOrder(orderId);
  if (!order?.refund) throw new Error("No refund on order");
  const { refundId } = await createRefund(order, order.refund.amountPaise);
  if (order.shift4shopOrderId) await setStoreOrderStatus(order.shift4shopOrderId, 5).catch(() => undefined);
  return store.updateOrder(orderId, { status: "refunded", refund: { ...order.refund, pinelabsRefundId: refundId } }, "Refund processed");
}

export async function requestStylistReview(input: {
  productId: string;
  suggestedSize: string;
  measurements: Record<string, number>;
  snapshot?: string;
  question?: string;
}) {
  const p = await getProduct(input.productId);
  if (!p) throw new Error("Unknown product");
  if (input.snapshot && input.snapshot.length > 1_500_000) throw new Error("Snapshot too large");
  const analysis = await recommendSize({
    productName: p.name,
    category: p.category,
    sizes: p.sizes,
    suggestedSize: input.suggestedSize,
    measurements: input.measurements,
    question: input.question,
  });
  return openApproval({
    kind: "stylist_review",
    analysis,
    stylist: {
      productId: p.id,
      productName: p.name,
      suggestedSize: input.suggestedSize,
      measurements: input.measurements,
      snapshot: input.snapshot,
      customerQuestion: input.question,
    },
  });
}

/** Human decision from the console. */
export async function decide(approvalId: string, d: { approve: boolean; by: string; note?: string; stylistSize?: string }) {
  const approval = await store.decideApproval(approvalId, {
    status: d.approve ? "approved" : "rejected",
    by: d.by,
    note: d.note,
    stylistSize: d.stylistSize,
  });
  if (!approval) throw new Error("Approval not found or already decided");

  if (approval.kind === "order_review" && approval.orderId) {
    if (d.approve) {
      await store.updateOrder(approval.orderId, {}, `Approved by ${d.by}`);
      await releaseForPayment(approval.orderId);
    } else {
      await store.updateOrder(approval.orderId, { status: "rejected" }, `Rejected by ${d.by}${d.note ? `: ${d.note}` : ""}`);
    }
  }
  if (approval.kind === "refund_review" && approval.orderId) {
    if (d.approve) {
      await store.updateOrder(approval.orderId, {}, `Refund approved by ${d.by}`);
      await executeRefund(approval.orderId);
    } else {
      await store.updateOrder(approval.orderId, { status: "refund_rejected" }, `Refund rejected by ${d.by}${d.note ? `: ${d.note}` : ""}`);
    }
  }
  return approval;
}
