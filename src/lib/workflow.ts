import "server-only";
import { config } from "./config";
import { mirrorCase, recommendSize, reviewOrder, reviewRefund } from "./agenticorg";
import { createCheckout, fetchPlOrder, submitRefund } from "./pinelabs";
import { applyCharge, refundStatusFromPl, type PlOrder } from "./payment-rules";
import { getProduct } from "./catalog";
import { hashSecret, newId, newSecret, store } from "./store";
import type { AgentAnalysis, Approval, CartItem, Customer, Order } from "./types";

const now = () => new Date().toISOString();
const CLAIM_MS = 60_000;

/**
 * The only path to skipping a human: AgenticOrg answered (no failure/fallback), recommends approve,
 * is confident, raised no flags, and policy allows auto-approval for this amount.
 */
export function canAutoApprove(analysis: AgentAnalysis, amountPaise: number, limitPaise: number) {
  return (
    analysis.source === "agenticorg" &&
    analysis.recommendation === "approve" &&
    analysis.confidence >= config.policy.minAgentConfidence &&
    analysis.flags.length === 0 &&
    amountPaise < limitPaise
  );
}

async function openApproval(a: Omit<Approval, "id" | "createdAt" | "status">) {
  const approval: Approval = { ...a, id: newId("apr"), createdAt: now(), status: "pending" };
  approval.agenticorgCaseRef = await mirrorCase(approval);
  return store.saveApproval(approval);
}

// ─── Orders ─────────────────────────────────────────────────────────────────

/** Customer checks out. Prices come from the catalog, never from the client. */
export async function placeOrder(input: { items: Pick<CartItem, "productId" | "size" | "quantity">[]; customer: Customer }) {
  if (!config.pinelabs.enabled && !config.payments.demo) throw new Error("Payments are not configured");
  if (!input.items.length) throw new Error("Your bag is empty");
  const items: CartItem[] = [];
  for (const i of input.items) {
    const p = await getProduct(i.productId);
    if (!p) throw new Error(`Unknown product ${i.productId}`);
    if (!p.sizes.includes(i.size)) throw new Error(`Size ${i.size} isn't available for ${p.name}`);
    const quantity = Math.max(1, Math.min(10, Math.floor(i.quantity)));
    items.push({ productId: p.id, sku: p.sku, name: p.name, size: i.size, quantity, unitPricePaise: p.pricePaise });
  }
  const accessToken = newSecret();
  const order: Order = {
    id: newId("ord"),
    createdAt: now(),
    updatedAt: now(),
    status: "pending_approval",
    demo: !config.pinelabs.enabled,
    items,
    customer: input.customer,
    totalPaise: items.reduce((s, i) => s + i.unitPricePaise * i.quantity, 0),
    currency: "INR",
    accessHash: hashSecret(accessToken),
    attempts: [],
    history: [{ at: now(), event: "Order placed" }],
  };
  await store.saveOrder(order);

  const analysis = await reviewOrder(order);
  const auto =
    config.policy.orderApprovalMode === "threshold" && canAutoApprove(analysis, order.totalPaise, config.policy.orderReviewThresholdPaise);

  if (auto) {
    await store.updateOrder(order.id, (o) => void (o.status = "approved"), `Auto-approved by AgenticOrg (confidence ${analysis.confidence})`);
    await issuePaymentLink(order.id).catch(() => undefined); // failure leaves it "approved" + lastError, retryable
  } else {
    const approval = await openApproval({ kind: "order_review", orderId: order.id, analysis });
    await store.updateOrder(order.id, (o) => void (o.approvalId = approval.id), "Sent to human review");
  }
  return { order: (await store.getOrder(order.id))!, accessToken };
}

/**
 * Issue a checkout link. Allowed from `approved` (first time) or `payment_failed` (retry).
 * A short claim prevents two concurrent requests from creating two checkouts.
 */
export async function issuePaymentLink(orderId: string) {
  const claim = now();
  const { order, changed } = await store.updateOrder(orderId, (o) => {
    if (o.status !== "approved" && o.status !== "payment_failed") return false;
    const c = o.issuingAt;
    if (c && Date.now() - Date.parse(c) < CLAIM_MS) return false;
    o.issuingAt = claim;
  });
  if (!changed) return order;

  const reference = `${order.id}-${order.attempts.length + 1}`;
  try {
    let link: { pinelabsOrderId: string; redirectUrl: string };
    if (order.demo) {
      if (!config.payments.demo) throw new Error("Demo payments are disabled");
      link = { pinelabsOrderId: `demo_${reference}`, redirectUrl: `/pay/demo?ref=${encodeURIComponent(order.id)}` };
    } else {
      link = await createCheckout(order, reference);
    }
    return (
      await store.updateOrder(
        orderId,
        (o) => {
          delete o.issuingAt;
          delete o.lastError;
          o.attempts.push({ reference, ...link, createdAt: now() });
          o.status = "awaiting_payment";
        },
        order.demo ? "Demo payment link issued (no real money)" : "Pine Labs payment link issued",
      )
    ).order;
  } catch (err) {
    await store.updateOrder(
      orderId,
      (o) => {
        delete o.issuingAt;
        o.lastError = (err as Error).message;
      },
      `Payment link failed: ${(err as Error).message}`,
    );
    throw err;
  }
}

/** Apply a Pine Labs charge snapshot (already fetched server-side). Idempotent. */
export async function applyChargeSnapshot(orderId: string, pl: PlOrder, source: string) {
  return (
    await store.updateOrder(orderId, (o) => {
      const { next, problem } = applyCharge(o, pl);
      const attempt = o.attempts.find((a) => a.pinelabsOrderId === pl.orderId);
      if (attempt) attempt.status = pl.status;
      if (problem) o.history.push({ at: now(), event: `${source}: ${problem}` });
      if (!next) return problem || attempt ? undefined : false;
      o.status = next;
      o.history.push({ at: now(), event: `${source}: payment ${pl.status} → ${next}` });
    })
  ).order;
}

/** Re-read the current attempt from Pine Labs and apply it. Never trusts browser-supplied status. */
export async function syncPayment(orderId: string, source = "Status check") {
  const order = await store.getOrder(orderId);
  if (!order) throw new Error("Order not found");
  if (order.demo) return order; // demo orders only change through the demo checkout
  const attempt = order.attempts.at(-1);
  if (!attempt) return order;
  return applyChargeSnapshot(orderId, await fetchPlOrder(attempt.pinelabsOrderId), source);
}

/** Demo checkout outcome, routed through the same verification rules as live payments. */
export async function completeDemoPayment(orderId: string, outcome: "PROCESSED" | "FAILED") {
  const order = await store.getOrder(orderId);
  if (!order?.demo || !config.payments.demo) throw new Error("Not a demo order");
  const attempt = order.attempts.at(-1);
  if (!attempt) throw new Error("No payment attempt");
  return applyChargeSnapshot(
    orderId,
    { orderId: attempt.pinelabsOrderId, reference: attempt.reference, type: "CHARGE", status: outcome, amountPaise: order.totalPaise, currency: order.currency },
    "Demo checkout",
  );
}

// ─── Refunds ────────────────────────────────────────────────────────────────

export async function requestRefund(orderId: string, amountPaise: number, reason: string) {
  const order = await store.getOrder(orderId);
  if (!order) throw new Error("Order not found");
  if (order.status !== "paid") throw new Error("Only paid orders can be refunded");
  if (order.refund && !["rejected", "failed"].includes(order.refund.status)) throw new Error("A refund is already in progress");
  const amount = Math.min(Math.max(100, Math.round(amountPaise || order.totalPaise)), order.totalPaise);
  const analysis = await reviewRefund(order, amount, reason);
  const attemptNo = order.history.filter((h) => h.event.startsWith("Refund requested")).length + 1;
  const reference = `${order.id}-refund-${attemptNo}`;

  if (canAutoApprove(analysis, amount, config.policy.refundAutoApproveLimitPaise + 1)) {
    await store.updateOrder(orderId, (o) => void (o.refund = { amountPaise: amount, reason, status: "approved", reference }), "Refund requested (auto-approved by AgenticOrg)");
    return submitRefundForOrder(orderId).catch(async () => (await store.getOrder(orderId))!);
  }
  const approval = await openApproval({ kind: "refund_review", orderId, analysis });
  return (
    await store.updateOrder(
      orderId,
      (o) => void (o.refund = { amountPaise: amount, reason, status: "review", reference, approvalId: approval.id }),
      "Refund requested, sent to human review",
    )
  ).order;
}

/** Submit an approved refund. Retryable: Pine Labs dedupes on the same reference. */
export async function submitRefundForOrder(orderId: string) {
  const claim = now();
  const { order, changed } = await store.updateOrder(orderId, (o) => {
    const r = o.refund;
    if (!r || !["approved", "submit_failed"].includes(r.status)) return false;
    if (r.submittingAt && Date.now() - Date.parse(r.submittingAt) < CLAIM_MS) return false;
    r.submittingAt = claim;
  });
  if (!changed || !order.refund) return order;
  const attempt = order.attempts.find((a) => a.status === "PROCESSED") ?? order.attempts.at(-1);
  try {
    let plRefund: PlOrder;
    if (order.demo) {
      plRefund = { orderId: `demo_${order.refund.reference}`, reference: order.refund.reference, type: "REFUND", status: "PENDING", amountPaise: order.refund.amountPaise, currency: "INR" };
    } else {
      if (!attempt) throw new Error("No captured payment to refund");
      const submitted = await submitRefund(attempt.pinelabsOrderId, order.refund.reference, order.refund.amountPaise, order.id);
      // Submission accepted ≠ refund complete: confirm with a fresh read
      plRefund = submitted.orderId ? await fetchPlOrder(submitted.orderId).catch(() => submitted) : submitted;
    }
    return await applyRefundSnapshot(orderId, plRefund, order.demo ? "Demo refund submitted" : "Refund submitted to Pine Labs");
  } catch (err) {
    await store.updateOrder(
      orderId,
      (o) => {
        if (!o.refund) return false;
        delete o.refund.submittingAt;
        o.refund.status = "submit_failed";
        o.refund.lastError = (err as Error).message;
      },
      `Refund submission failed (retryable): ${(err as Error).message}`,
    );
    throw err;
  }
}

export async function applyRefundSnapshot(orderId: string, pl: PlOrder, source: string) {
  return (
    await store.updateOrder(orderId, (o) => {
      const r = o.refund;
      if (!r) return false;
      delete r.submittingAt;
      if (pl.reference && pl.reference !== r.reference) {
        o.history.push({ at: now(), event: `${source}: refund reference mismatch (${pl.reference})` });
        return;
      }
      if (r.status === "processed") return false; // terminal
      const next = refundStatusFromPl(pl.status) ?? "pending";
      r.pinelabsRefundOrderId = pl.orderId || r.pinelabsRefundOrderId;
      r.pinelabsStatus = pl.status;
      r.status = next;
      delete r.lastError;
      if (next === "processed") o.status = r.amountPaise >= o.totalPaise ? "refunded" : "partially_refunded";
      o.history.push({ at: now(), event: `${source}: refund ${pl.status}` });
    })
  ).order;
}

/** Poll Pine Labs for a pending refund (also driven by webhooks). */
export async function syncRefund(orderId: string) {
  const order = await store.getOrder(orderId);
  if (!order?.refund?.pinelabsRefundOrderId || order.refund.status !== "pending") return order;
  if (order.demo) {
    return applyRefundSnapshot(
      orderId,
      { orderId: order.refund.pinelabsRefundOrderId, reference: order.refund.reference, type: "REFUND", status: "PROCESSED", amountPaise: order.refund.amountPaise, currency: "INR" },
      "Demo refund settled",
    );
  }
  return applyRefundSnapshot(orderId, await fetchPlOrder(order.refund.pinelabsRefundOrderId), "Refund status check");
}

// ─── Stylist reviews ────────────────────────────────────────────────────────

export async function requestStylistReview(input: {
  productId: string;
  selectedSize: string;
  cameraHint?: Record<string, number>;
  snapshot?: string;
  snapshotConsent: boolean;
  question?: string;
}) {
  const p = await getProduct(input.productId);
  if (!p) throw new Error("Unknown product");
  const snapshot = input.snapshotConsent ? input.snapshot : undefined;
  if (snapshot && snapshot.length > 1_500_000) throw new Error("Snapshot too large");
  const analysis = await recommendSize({
    productName: p.name,
    category: p.category,
    sizes: p.sizes,
    selectedSize: input.selectedSize,
    cameraHint: input.cameraHint,
    question: input.question,
  });
  const accessToken = newSecret();
  const approval = await openApproval({
    kind: "stylist_review",
    analysis,
    accessHash: hashSecret(accessToken),
    stylist: {
      productId: p.id,
      productName: p.name,
      selectedSize: input.selectedSize,
      cameraHint: input.cameraHint,
      snapshot,
      customerQuestion: input.question,
    },
  });
  return { approval, accessToken };
}

// ─── Human decisions (console) ──────────────────────────────────────────────

export async function decide(approvalId: string, d: { approve: boolean; by: string; note?: string; stylistSize?: string }) {
  const approval = await store.decideApproval(approvalId, { status: d.approve ? "approved" : "rejected", by: d.by, note: d.note, stylistSize: d.stylistSize });
  if (!approval) throw new Error("Approval not found or already decided");
  const suffix = d.note ? `: ${d.note}` : "";

  if (approval.kind === "order_review" && approval.orderId) {
    if (d.approve) {
      await store.updateOrder(approval.orderId, (o) => (o.status === "pending_approval" ? void (o.status = "approved") : false), `Approved by ${d.by}${suffix}`);
      await issuePaymentLink(approval.orderId).catch(() => undefined); // stays "approved" with lastError; console can retry
    } else {
      await store.updateOrder(approval.orderId, (o) => (o.status === "pending_approval" ? void (o.status = "rejected") : false), `Rejected by ${d.by}${suffix}`);
    }
  }
  if (approval.kind === "refund_review" && approval.orderId) {
    await store.updateOrder(
      approval.orderId,
      (o) => (o.refund?.status === "review" ? void (o.refund.status = d.approve ? "approved" : "rejected") : false),
      `Refund ${d.approve ? "approved" : "rejected"} by ${d.by}${suffix}`,
    );
    if (d.approve) await submitRefundForOrder(approval.orderId).catch(() => undefined); // submit_failed is retryable
  }
  return approval;
}
