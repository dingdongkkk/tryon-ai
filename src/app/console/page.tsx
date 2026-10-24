"use client";

import { useCallback, useEffect, useState } from "react";
import { inr } from "@/lib/format";
import type { Approval, ApprovalStatus, Order } from "@/lib/types";

type Row = Approval & { order?: Order };

const KIND_LABEL: Record<Approval["kind"], string> = {
  order_review: "Order before payment",
  stylist_review: "Stylist review",
  refund_review: "Refund",
};

export default function ConsolePage() {
  const [tab, setTab] = useState<ApprovalStatus>("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [reviewer, setReviewer] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/approvals?status=${tab}`, { cache: "no-store" });
    if (r.ok) setRows((await r.json()).approvals);
  }, [tab]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    try {
      setReviewer(localStorage.getItem("wearable.reviewer") ?? "");
    } catch {}
  }, []);

  async function decide(id: string, approve: boolean, note: string, stylistSize?: string) {
    setError("");
    const r = await fetch(`/api/approvals/${id}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approve, note, stylistSize, reviewer }),
    });
    if (!r.ok) setError((await r.json()).error);
    load();
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Human-in-the-loop console</h1>
          <p className="text-sm text-neutral-500">AgenticOrg agents draft a recommendation, and you make the call.</p>
        </div>
        <label className="text-sm">
          <span className="mr-2 text-neutral-500">Reviewing as</span>
          <input
            value={reviewer}
            onChange={(e) => {
              setReviewer(e.target.value);
              try {
                localStorage.setItem("wearable.reviewer", e.target.value);
              } catch {}
            }}
            placeholder="Your name"
            className="rounded-lg border border-neutral-300 px-3 py-1.5"
          />
        </label>
      </div>

      <div className="flex gap-2">
        {(["pending", "approved", "rejected"] as ApprovalStatus[]).map((s) => (
          <button key={s} onClick={() => setTab(s)} className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize ${tab === s ? "bg-neutral-900 text-white" : "bg-white"}`}>
            {s}
          </button>
        ))}
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!rows.length && <p className="text-neutral-500">Nothing {tab}.</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((a) => (
          <ApprovalCard key={a.id} a={a} onDecide={decide} />
        ))}
      </div>
    </div>
  );
}

function ApprovalCard({ a, onDecide }: { a: Row; onDecide: (id: string, approve: boolean, note: string, size?: string) => void }) {
  const [note, setNote] = useState("");
  const [size, setSize] = useState(a.stylist?.suggestedSize ?? "");
  const [busy, setBusy] = useState(false);
  const rec = a.analysis.recommendation;
  const recTone = rec === "approve" ? "bg-emerald-100 text-emerald-800" : rec === "reject" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800";

  const go = async (approve: boolean) => {
    setBusy(true);
    await onDecide(a.id, approve, note, a.kind === "stylist_review" ? size : undefined);
    setBusy(false);
  };

  return (
    <article className="flex flex-col gap-3 rounded-2xl bg-white p-5">
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{KIND_LABEL[a.kind]}</p>
          <p className="font-mono text-xs text-neutral-400">{a.id} · {new Date(a.createdAt).toLocaleString()}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${recTone}`}>
          Agent: {rec} · {Math.round(a.analysis.confidence * 100)}%
        </span>
      </header>

      {a.stylist && (
        <div className="flex gap-3">
          {a.stylist.snapshot && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.stylist.snapshot} alt="Customer try-on" className="w-36 rounded-lg object-cover" />
          )}
          <div className="text-sm">
            <p className="font-semibold">{a.stylist.productName}</p>
            <p>Camera suggests <b>{a.stylist.suggestedSize}</b></p>
            <p className="text-neutral-500">
              {Object.entries(a.stylist.measurements).map(([k, v]) => `${k}: ${v}`).join(" · ") || "No measurements"}
            </p>
            {a.stylist.customerQuestion && <p className="mt-2 italic">“{a.stylist.customerQuestion}”</p>}
          </div>
        </div>
      )}

      {a.order && (
        <div className="text-sm">
          <p className="font-semibold">
            {a.order.customer.firstName} {a.order.customer.lastName} · {a.order.customer.city} · {inr(a.order.totalPaise)}
          </p>
          <ul className="text-neutral-600">
            {a.order.items.map((i) => (
              <li key={`${i.productId}-${i.size}`}>{i.quantity} × {i.name} ({i.size})</li>
            ))}
          </ul>
          {a.kind === "refund_review" && a.order.refund && (
            <p className="mt-1">Refund {inr(a.order.refund.amountPaise)}: “{a.order.refund.reason}”</p>
          )}
        </div>
      )}

      <div className="rounded-lg bg-neutral-50 p-3 text-sm">
        <p className="mb-1 text-xs font-medium text-neutral-500">
          {a.analysis.source === "agenticorg" ? `AgenticOrg · ${a.analysis.tool}` : "Rule-based check (AgenticOrg not configured)"}
        </p>
        <p className="whitespace-pre-wrap">{a.analysis.summary}</p>
        {!!a.analysis.flags.length && (
          <ul className="mt-2 list-disc pl-5 text-amber-800">
            {a.analysis.flags.map((f) => <li key={f}>{f}</li>)}
          </ul>
        )}
        {a.agenticorgCaseRef && <p className="mt-2 text-xs text-neutral-500">AgenticOrg case {a.agenticorgCaseRef}</p>}
      </div>

      {a.status === "pending" ? (
        <>
          {a.kind === "stylist_review" && (
            <label className="text-sm">
              <span className="mr-2">Recommend size</span>
              <input value={size} onChange={(e) => setSize(e.target.value.toUpperCase())} className="w-20 rounded-lg border border-neutral-300 px-2 py-1" />
            </label>
          )}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={a.kind === "stylist_review" ? "Note to the customer" : "Reason / internal note"} className="rounded-lg border border-neutral-300 p-2 text-sm" rows={2} />
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => go(true)} className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
              {a.kind === "order_review" ? "Approve & send payment link" : a.kind === "refund_review" ? "Approve refund" : "Send recommendation"}
            </button>
            <button disabled={busy} onClick={() => go(false)} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold hover:border-red-400 hover:text-red-700 disabled:opacity-50">
              Reject
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm text-neutral-500">
          {a.status} by {a.decidedBy} · {a.decidedAt && new Date(a.decidedAt).toLocaleString()}
          {a.note && <> · “{a.note}”</>}
        </p>
      )}
    </article>
  );
}
