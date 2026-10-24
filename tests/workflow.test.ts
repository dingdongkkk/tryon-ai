import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentAnalysis, Customer } from "@/lib/types";

// End-to-end workflow tests against a real (temporary) SQLite DB.
// AgenticOrg and Pine Labs are mocked at the module boundary.

const customer: Customer = { firstName: "Asha", lastName: "Rao", email: "asha@example.com", mobile: "9876543210", address1: "1 MG Road", city: "Bengaluru", state: "KA", pincode: "560001" };
const items = [{ productId: "1001", size: "M", quantity: 1 }]; // ₹799

const agentApprove: AgentAnalysis = { source: "agenticorg", tool: "t", summary: "ok", recommendation: "approve", confidence: 0.95, flags: [] };
const heuristicApprove: AgentAnalysis = { source: "heuristic", summary: "rules ok", recommendation: "approve", confidence: 0.9, flags: [] };

let dir: string;
const pl = {
  createCheckout: vi.fn(),
  fetchPlOrder: vi.fn(),
  submitRefund: vi.fn(),
};
const ao = {
  reviewOrder: vi.fn(),
  reviewRefund: vi.fn(),
  recommendSize: vi.fn(),
  mirrorCase: vi.fn(async () => undefined),
};

async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  dir = mkdtempSync(path.join(tmpdir(), "tryonai-"));
  vi.stubEnv("DATA_DIR", dir);
  vi.stubEnv("PINELABS_CLIENT_ID", "test-client");
  vi.stubEnv("PINELABS_CLIENT_SECRET", "test-secret");
  vi.stubEnv("PINELABS_ENV", "uat");
  vi.stubEnv("ORDER_APPROVAL_MODE", "always");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  vi.doMock("@/lib/pinelabs", () => pl);
  vi.doMock("@/lib/agenticorg", () => ao);
  const wf = await import("@/lib/workflow");
  const { store } = await import("@/lib/store");
  return { wf, store };
}

beforeEach(() => {
  for (const f of [...Object.values(pl), ...Object.values(ao)]) f.mockReset();
  ao.mirrorCase.mockResolvedValue(undefined);
  ao.reviewOrder.mockResolvedValue(agentApprove);
  ao.reviewRefund.mockResolvedValue(agentApprove);
  let n = 0;
  pl.createCheckout.mockImplementation(async () => ({ pinelabsOrderId: `pl_${++n}`, redirectUrl: `https://pay.example/${n}` }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

const charge = (o: { id: string; attempts: { pinelabsOrderId: string; reference: string }[]; totalPaise: number }, status: string, i = -1) => {
  const a = o.attempts.at(i)!;
  return { orderId: a.pinelabsOrderId, reference: a.reference, type: "CHARGE", status, amountPaise: o.totalPaise, currency: "INR" };
};

describe("approval gates", () => {
  it("every order waits for a human in 'always' mode, even when the agent approves", async () => {
    const { wf, store } = await load();
    const { order } = await wf.placeOrder({ items, customer });
    expect(order.status).toBe("pending_approval");
    expect(order.totalPaise).toBe(79900); // price from catalog
    expect(pl.createCheckout).not.toHaveBeenCalled();
    expect((await store.listApprovals("pending")).map((a) => a.kind)).toEqual(["order_review"]);
  });

  it("threshold mode: agent failure/fallback still requires a human", async () => {
    const { wf } = await load({ ORDER_APPROVAL_MODE: "threshold" });
    ao.reviewOrder.mockResolvedValue(heuristicApprove);
    const { order } = await wf.placeOrder({ items, customer });
    expect(order.status).toBe("pending_approval");
  });

  it("threshold mode: uncertain or flagged agent answers require a human", async () => {
    const { wf } = await load({ ORDER_APPROVAL_MODE: "threshold" });
    ao.reviewOrder.mockResolvedValueOnce({ ...agentApprove, confidence: 0.5 });
    expect((await wf.placeOrder({ items, customer })).order.status).toBe("pending_approval");
    ao.reviewOrder.mockResolvedValueOnce({ ...agentApprove, flags: ["odd address"] });
    expect((await wf.placeOrder({ items, customer })).order.status).toBe("pending_approval");
    ao.reviewOrder.mockResolvedValueOnce({ ...agentApprove, recommendation: "review" });
    expect((await wf.placeOrder({ items, customer })).order.status).toBe("pending_approval");
  });

  it("threshold mode: only a confident, clean AgenticOrg approval below the threshold skips review", async () => {
    const { wf } = await load({ ORDER_APPROVAL_MODE: "threshold" });
    const { order } = await wf.placeOrder({ items, customer });
    expect(order.status).toBe("awaiting_payment");
  });

  it("human approval issues exactly one payment link; a second decision is refused", async () => {
    const { wf, store } = await load();
    const { order } = await wf.placeOrder({ items, customer });
    await wf.decide(order.approvalId!, { approve: true, by: "Priya" });
    await expect(wf.decide(order.approvalId!, { approve: false, by: "Ravi" })).rejects.toThrow(/already decided/);
    const after = (await store.getOrder(order.id))!;
    expect(after.status).toBe("awaiting_payment");
    expect(after.attempts).toHaveLength(1);
    expect(pl.createCheckout).toHaveBeenCalledTimes(1);
  });

  it("rejection never creates a payment link", async () => {
    const { wf, store } = await load();
    const { order } = await wf.placeOrder({ items, customer });
    await wf.decide(order.approvalId!, { approve: false, by: "Priya", note: "fraud signals" });
    expect((await store.getOrder(order.id))!.status).toBe("rejected");
    expect(pl.createCheckout).not.toHaveBeenCalled();
  });
});

describe("payment transitions & duplicate events", () => {
  async function approvedOrder(env?: Record<string, string>) {
    const ctx = await load(env);
    const { order } = await ctx.wf.placeOrder({ items, customer });
    await ctx.wf.decide(order.approvalId!, { approve: true, by: "Priya" });
    return { ...ctx, order: (await ctx.store.getOrder(order.id))! };
  }

  it("AUTHORIZED is pending, PROCESSED is paid", async () => {
    const { wf, order } = await approvedOrder();
    expect((await wf.applyChargeSnapshot(order.id, charge(order, "AUTHORIZED"), "test")).status).toBe("payment_pending");
    expect((await wf.applyChargeSnapshot(order.id, charge(order, "PROCESSED"), "test")).status).toBe("paid");
  });

  it("duplicate callbacks/webhooks are harmless", async () => {
    const { wf, order } = await approvedOrder();
    pl.fetchPlOrder.mockResolvedValue(charge(order, "PROCESSED"));
    await wf.syncPayment(order.id, "callback");
    await wf.syncPayment(order.id, "webhook");
    const final = await wf.syncPayment(order.id, "callback again");
    expect(final.status).toBe("paid");
    expect(final.history.filter((h) => h.event.includes("→ paid"))).toHaveLength(1);
  });

  it("a late FAILED after PROCESSED doesn't un-pay the order", async () => {
    const { wf, order } = await approvedOrder();
    await wf.applyChargeSnapshot(order.id, charge(order, "PROCESSED"), "test");
    expect((await wf.applyChargeSnapshot(order.id, charge(order, "FAILED"), "late")).status).toBe("paid");
  });

  it("amount tampering lands in payment_mismatch, not paid", async () => {
    const { wf, order } = await approvedOrder();
    const o = await wf.applyChargeSnapshot(order.id, { ...charge(order, "PROCESSED"), amountPaise: 100 }, "test");
    expect(o.status).toBe("payment_mismatch");
  });

  it("failed payment → retry creates a new attempt with a new reference", async () => {
    const { wf, order } = await approvedOrder();
    await wf.applyChargeSnapshot(order.id, charge(order, "FAILED"), "test");
    const retried = await wf.issuePaymentLink(order.id);
    expect(retried.status).toBe("awaiting_payment");
    expect(retried.attempts.map((a) => a.reference)).toEqual([`${order.id}-1`, `${order.id}-2`]);
    expect((await wf.applyChargeSnapshot(order.id, charge(retried, "PROCESSED"), "test")).status).toBe("paid");
  });

  it("payment-link failure is recoverable and concurrent retries don't duplicate checkouts", async () => {
    const { wf, store } = await load();
    const { order } = await wf.placeOrder({ items, customer });
    pl.createCheckout.mockRejectedValueOnce(new Error("Pine Labs 503"));
    await wf.decide(order.approvalId!, { approve: true, by: "Priya" });
    let o = (await store.getOrder(order.id))!;
    expect(o.status).toBe("approved");
    expect(o.lastError).toMatch(/503/);

    let release!: () => void;
    pl.createCheckout.mockImplementationOnce(() => new Promise((r) => (release = () => r({ pinelabsOrderId: "pl_slow", redirectUrl: "u" }))));
    const first = wf.issuePaymentLink(order.id);
    await new Promise((r) => setTimeout(r, 10));
    const second = await wf.issuePaymentLink(order.id); // claimed by the first: no-op
    release();
    o = await first;
    expect(second.attempts).toHaveLength(0);
    expect(o.status).toBe("awaiting_payment");
    expect(o.attempts).toHaveLength(1);
    expect(o.lastError).toBeUndefined();
  });
});

describe("refunds", () => {
  async function paidOrder(env?: Record<string, string>) {
    const ctx = await load(env);
    const { order } = await ctx.wf.placeOrder({ items, customer });
    await ctx.wf.decide(order.approvalId!, { approve: true, by: "Priya" });
    const o = (await ctx.store.getOrder(order.id))!;
    await ctx.wf.applyChargeSnapshot(o.id, charge(o, "PROCESSED"), "test");
    return { ...ctx, order: (await ctx.store.getOrder(o.id))! };
  }

  it("refunds need a human by default; submission accepted ≠ completed", async () => {
    const { wf, store, order } = await paidOrder();
    let o = await wf.requestRefund(order.id, order.totalPaise, "too small");
    expect(o.refund?.status).toBe("review");
    expect(pl.submitRefund).not.toHaveBeenCalled();

    const refundPl = { orderId: "pl_r1", reference: `${order.id}-refund-1`, type: "REFUND", status: "PENDING", amountPaise: order.totalPaise, currency: "INR" };
    pl.submitRefund.mockResolvedValue(refundPl);
    pl.fetchPlOrder.mockResolvedValue(refundPl);
    await wf.decide(o.refund!.approvalId!, { approve: true, by: "Priya" });
    o = (await store.getOrder(order.id))!;
    expect(o.refund?.status).toBe("pending");
    expect(o.status).toBe("paid"); // not refunded yet

    pl.fetchPlOrder.mockResolvedValue({ ...refundPl, status: "PROCESSED" });
    o = (await wf.syncRefund(order.id))!;
    expect(o.refund?.status).toBe("processed");
    expect(o.status).toBe("refunded");
  });

  it("refund submission failure is retryable with the same idempotency reference", async () => {
    const { wf, store, order } = await paidOrder();
    const o = await wf.requestRefund(order.id, order.totalPaise, "damaged");
    pl.submitRefund.mockRejectedValueOnce(new Error("timeout"));
    await wf.decide(o.refund!.approvalId!, { approve: true, by: "Priya" });
    expect((await store.getOrder(order.id))!.refund?.status).toBe("submit_failed");

    const refundPl = { orderId: "pl_r1", reference: `${order.id}-refund-1`, type: "REFUND", status: "PENDING", amountPaise: order.totalPaise, currency: "INR" };
    pl.submitRefund.mockResolvedValue(refundPl);
    pl.fetchPlOrder.mockResolvedValue(refundPl);
    await wf.submitRefundForOrder(order.id);
    expect(pl.submitRefund).toHaveBeenCalledTimes(2);
    expect(pl.submitRefund.mock.calls.map((c) => c[1])).toEqual([`${order.id}-refund-1`, `${order.id}-refund-1`]);
    expect((await store.getOrder(order.id))!.refund?.status).toBe("pending");
  });

  it("rejected refund leaves the order paid and allows a new request", async () => {
    const { wf, store, order } = await paidOrder();
    const o = await wf.requestRefund(order.id, order.totalPaise, "changed mind");
    await wf.decide(o.refund!.approvalId!, { approve: false, by: "Priya" });
    const after = (await store.getOrder(order.id))!;
    expect(after.status).toBe("paid");
    expect(after.refund?.status).toBe("rejected");
    await expect(wf.requestRefund(order.id, order.totalPaise, "again")).resolves.toBeTruthy();
  });

  it("can't double-request while a refund is in progress", async () => {
    const { wf, order } = await paidOrder();
    await wf.requestRefund(order.id, order.totalPaise, "first");
    await expect(wf.requestRefund(order.id, order.totalPaise, "second")).rejects.toThrow(/in progress/);
  });
});

describe("demo payments", () => {
  it("are flagged demo and run through the same verification", async () => {
    const { wf, store } = await load({ PINELABS_CLIENT_ID: "", PINELABS_CLIENT_SECRET: "" });
    const { order } = await wf.placeOrder({ items, customer });
    expect(order.demo).toBe(true);
    await wf.decide(order.approvalId!, { approve: true, by: "Priya" });
    const o = (await store.getOrder(order.id))!;
    expect(o.attempts[0].redirectUrl).toMatch(/^\/pay\/demo/);
    expect(pl.createCheckout).not.toHaveBeenCalled();
    expect((await wf.completeDemoPayment(order.id, "PROCESSED")).status).toBe("paid");
  });

  it("are refused in production unless explicitly enabled", async () => {
    const { wf } = await load({ PINELABS_CLIENT_ID: "", PINELABS_CLIENT_SECRET: "", NODE_ENV: "production" });
    await expect(wf.placeOrder({ items, customer })).rejects.toThrow(/not configured/);
  });
});
