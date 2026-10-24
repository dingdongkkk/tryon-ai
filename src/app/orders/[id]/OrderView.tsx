"use client";

import { useEffect, useState } from "react";
import { inr } from "@/lib/cart";
import type { Order, OrderStatus } from "@/lib/types";

const LABEL: Record<OrderStatus, { title: string; body: string; tone: string }> = {
  pending_approval: { title: "Being reviewed", body: "A team member is checking your order. Your payment link appears here as soon as it's approved.", tone: "bg-amber-50 text-amber-900" },
  rejected: { title: "Order not approved", body: "We couldn't approve this order. You have not been charged.", tone: "bg-red-50 text-red-900" },
  awaiting_payment: { title: "Approved: ready to pay", body: "Complete payment securely with Pine Labs.", tone: "bg-indigo-50 text-indigo-900" },
  paid: { title: "Paid", body: "Thanks! Your order is confirmed.", tone: "bg-emerald-50 text-emerald-900" },
  payment_failed: { title: "Payment didn't go through", body: "No money was taken. You can try again.", tone: "bg-red-50 text-red-900" },
  refund_requested: { title: "Refund under review", body: "A team member is reviewing your refund request.", tone: "bg-amber-50 text-amber-900" },
  refunded: { title: "Refunded", body: "Your refund has been sent to your original payment method.", tone: "bg-emerald-50 text-emerald-900" },
  refund_rejected: { title: "Refund declined", body: "Your refund request was declined. Contact support if you have questions.", tone: "bg-red-50 text-red-900" },
};

const POLLING: OrderStatus[] = ["pending_approval", "refund_requested"];

export default function OrderView({ initial }: { initial: Order }) {
  const [order, setOrder] = useState(initial);
  const [reason, setReason] = useState("");
  const [showRefund, setShowRefund] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!POLLING.includes(order.status)) return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/orders/${order.id}`);
      if (r.ok) setOrder((await r.json()).order);
    }, 3000);
    return () => clearInterval(t);
  }, [order.id, order.status]);

  async function refund(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await fetch(`/api/orders/${order.id}/refund`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amountPaise: order.totalPaise, reason }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setError(j.error);
    setOrder(j.order);
    setShowRefund(false);
  }

  const s = LABEL[order.status];
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div className={`rounded-2xl p-6 ${s.tone}`}>
        <p className="text-xs font-mono opacity-70">{order.id}</p>
        <h1 className="mt-1 text-2xl font-semibold">{s.title}</h1>
        <p className="mt-1">{s.body}</p>
        {(order.status === "awaiting_payment" || order.status === "payment_failed") && order.pinelabs && (
          <a href={order.pinelabs.redirectUrl} className="mt-4 inline-block rounded-xl bg-neutral-900 px-6 py-3 font-semibold text-white hover:bg-neutral-700">
            Pay {inr(order.totalPaise)} with Pine Labs
          </a>
        )}
        {order.status === "paid" && !showRefund && (
          <button onClick={() => setShowRefund(true)} className="mt-4 text-sm font-medium underline">
            Request a refund
          </button>
        )}
        {showRefund && (
          <form onSubmit={refund} className="mt-4 grid gap-2">
            <textarea required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What went wrong? (fit, quality, changed mind…)" className="rounded-lg border border-neutral-300 bg-white p-2 text-sm text-neutral-900" rows={2} />
            <div className="flex gap-2">
              <button disabled={busy} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {busy ? "Submitting…" : `Request ${inr(order.totalPaise)} refund`}
              </button>
              <button type="button" onClick={() => setShowRefund(false)} className="px-3 text-sm">Cancel</button>
            </div>
            {error && <p className="text-sm text-red-700">{error}</p>}
          </form>
        )}
      </div>

      <div className="rounded-2xl bg-white p-6">
        <h2 className="mb-3 font-semibold">Items</h2>
        <ul className="divide-y divide-neutral-100 text-sm">
          {order.items.map((i) => (
            <li key={`${i.productId}-${i.size}`} className="flex justify-between py-2">
              <span>{i.quantity} × {i.name} ({i.size})</span>
              <span>{inr(i.unitPricePaise * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex justify-between border-t pt-3 font-semibold"><span>Total</span><span>{inr(order.totalPaise)}</span></p>
      </div>

      <div className="rounded-2xl bg-white p-6">
        <h2 className="mb-3 font-semibold">Timeline</h2>
        <ol className="space-y-2 text-sm">
          {order.history.map((h, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-36 shrink-0 text-neutral-500">{new Date(h.at).toLocaleString()}</span>
              <span>{h.event}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
