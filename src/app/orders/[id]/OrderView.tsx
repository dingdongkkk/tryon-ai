"use client";

import { useEffect, useState } from "react";
import { dateTime, inr } from "@/lib/format";
import type { Order, OrderStatus, RefundStatus } from "@/lib/types";

type PublicOrder = Omit<Order, "accessHash" | "issuingAt">;

const STATUS: Record<OrderStatus, { title: string; body: string; tone: "wait" | "ok" | "bad" | "act" }> = {
  pending_approval: { title: "Being reviewed", body: "A team member is checking your order. Your payment link will appear here once it's approved.", tone: "wait" },
  rejected: { title: "Order not approved", body: "We couldn't approve this order. You haven't been charged.", tone: "bad" },
  approved: { title: "Approved", body: "Preparing your secure payment link…", tone: "wait" },
  awaiting_payment: { title: "Approved. Ready to pay.", body: "Complete your payment securely on Pine Labs.", tone: "act" },
  payment_pending: { title: "Payment processing", body: "Pine Labs is confirming your payment. This page updates automatically.", tone: "wait" },
  paid: { title: "Paid. Thank you!", body: "Your order is confirmed.", tone: "ok" },
  payment_failed: { title: "Payment didn't go through", body: "No money was taken. You can try again.", tone: "bad" },
  payment_mismatch: { title: "We're checking your payment", body: "Something didn't match on our side. Our team will contact you. Please don't pay again.", tone: "wait" },
  partially_refunded: { title: "Partially refunded", body: "Part of your payment has been returned to your original payment method.", tone: "ok" },
  refunded: { title: "Refunded", body: "Your refund has been sent to your original payment method.", tone: "ok" },
};

const REFUND: Record<RefundStatus, string> = {
  review: "Your refund request is being reviewed by our team.",
  rejected: "Your refund request was declined. Contact support if you have questions.",
  approved: "Refund approved and being submitted.",
  submit_failed: "Refund approved. We're retrying the submission, and you don't need to do anything.",
  pending: "Refund submitted to Pine Labs. Waiting for the bank to confirm.",
  processed: "Refund completed.",
  failed: "The refund failed at the bank. Our team will follow up.",
};

const TONE = { wait: "bg-[#fbf5ea] text-warn", ok: "bg-[#eef7f1] text-ok", bad: "bg-[#fdf3f1] text-bad", act: "bg-accent-soft text-accent" };
const LIVE_STATES: OrderStatus[] = ["pending_approval", "approved", "awaiting_payment", "payment_pending"];

export default function OrderView({ initial }: { initial: PublicOrder }) {
  const [order, setOrder] = useState(initial);
  const [reason, setReason] = useState("");
  const [showRefund, setShowRefund] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const polling = LIVE_STATES.includes(order.status) || ["review", "approved", "pending", "submit_failed"].includes(order.refund?.status ?? "");
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/orders/${order.id}`, { cache: "no-store" });
      if (r.ok) setOrder((await r.json()).order);
    }, 3000);
    return () => clearInterval(t);
  }, [order.id, polling]);

  async function post(url: string, body?: unknown) {
    setBusy(true);
    setError("");
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setError(j.error), null;
    setOrder(j.order);
    return j.order;
  }

  const s = STATUS[order.status];
  const attempt = order.attempts.at(-1);

  return (
    <div className="shell grid max-w-4xl gap-6 pt-10">
      {order.demo && (
        <div className="rounded-md border border-dashed border-warn/40 bg-[#fbf5ea] px-4 py-3 text-sm text-warn">
          <b>Demo order.</b> Pine Labs isn&apos;t configured, so payments here are simulated. No real money moves.
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="p-6 sm:p-8">
          <span className={`chip ${TONE[s.tone]} border-transparent`}>{order.status.replace(/_/g, " ")}</span>
          <h1 className="display mt-3 text-5xl leading-tight">{s.title}</h1>
          <p className="mt-2 max-w-xl text-ink-2">{s.body}</p>

          {order.status === "awaiting_payment" && attempt && (
            <a href={attempt.redirectUrl} className="btn btn-primary mt-6 h-14 px-8 text-base">
              Pay {inr(order.totalPaise)} {order.demo ? "(demo)" : "with Pine Labs"}
            </a>
          )}
          {order.status === "payment_failed" && (
            <button disabled={busy} onClick={() => post(`/api/orders/${order.id}/pay`).then((o) => o?.attempts.at(-1) && (window.location.href = o.attempts.at(-1).redirectUrl))} className="btn btn-primary mt-6 h-14 px-8 text-base">
              {busy ? "Preparing…" : "Try paying again"}
            </button>
          )}

          {order.refund && <p className="mt-6 rounded-md bg-ivory p-4 text-sm"><b>Refund of {inr(order.refund.amountPaise)}:</b> {REFUND[order.refund.status]}</p>}

          {order.status === "paid" && (!order.refund || ["rejected", "failed"].includes(order.refund.status)) && !showRefund && (
            <button onClick={() => setShowRefund(true)} className="mt-6 text-sm font-medium underline underline-offset-4">Request a refund</button>
          )}
          {showRefund && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (await post(`/api/orders/${order.id}/refund`, { amountPaise: order.totalPaise, reason })) setShowRefund(false);
              }}
              className="mt-6 grid max-w-lg gap-3"
            >
              <textarea required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What went wrong? Fit, quality, changed your mind…" className="field text-sm" rows={3} />
              <div className="flex gap-2">
                <button disabled={busy} className="btn btn-primary">{busy ? "Submitting…" : `Request ${inr(order.totalPaise)} refund`}</button>
                <button type="button" onClick={() => setShowRefund(false)} className="btn btn-ghost">Cancel</button>
              </div>
              <p className="text-xs text-mute">Every refund is checked by a person before it&apos;s sent.</p>
            </form>
          )}
          {error && <p className="mt-4 text-sm text-bad">{error}</p>}
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card card-pad">
          <h2 className="font-semibold">Items</h2>
          <ul className="mt-3 divide-y divide-[var(--line)] text-sm">
            {order.items.map((i) => (
              <li key={`${i.productId}-${i.size}`} className="flex justify-between py-2.5">
                <span>{i.quantity} × {i.name} <span className="text-mute">({i.size})</span></span>
                <span>{inr(i.unitPricePaise * i.quantity)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex justify-between border-t hairline pt-3 font-semibold"><span>Total</span><span>{inr(order.totalPaise)}</span></p>
          <p className="mt-4 font-mono text-[11px] text-mute">{order.id}</p>
        </section>

        <section className="card card-pad">
          <h2 className="font-semibold">Timeline</h2>
          <ol className="relative mt-4 space-y-4 border-l hairline pl-5 text-sm">
            {[...order.history].reverse().map((h, i) => (
              <li key={i} className="relative">
                <span className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ${i === 0 ? "bg-ink" : "bg-line-2"}`} />
                <p className={i === 0 ? "font-medium" : "text-ink-2"}>{h.event}</p>
                <p className="text-xs text-mute">{dateTime(h.at)}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
