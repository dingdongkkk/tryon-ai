"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { dateTime, inr } from "@/lib/format";
import type { AgentRun, AgentUnit } from "@/lib/agents";
import type { Approval, ApprovalStatus, Order } from "@/lib/types";

type PubOrder = Omit<Order, "accessHash" | "issuingAt">;
type Row = Omit<Approval, "accessHash"> & { order?: PubOrder };
type Unit = AgentUnit & { tool: string; enabled: boolean; runs: number; failures: number; avgConfidence: number | null; hitlRate: number | null; avgMs: number | null; lastRunAt: string | null };
type Tab = "queue" | "agents" | "recon" | "orders";

const KIND: Record<Approval["kind"], { label: string; agent: string }> = {
  order_review: { label: "Order before payment", agent: "Order Guardian" },
  stylist_review: { label: "Stylist advice", agent: "Fit Advisor" },
  refund_review: { label: "Refund", agent: "Returns Desk" },
};

const pct = (n: number | null) => (n === null ? "-" : `${Math.round(n * 100)}%`);
const ago = (iso: string) => {
  const s = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : dateTime(iso);
};

/** Run `fn` now (async, outside the effect body) and then every `ms`. */
function usePolling(fn: () => void, ms: number | null) {
  useEffect(() => {
    const first = setTimeout(fn, 0);
    const t = ms ? setInterval(fn, ms) : undefined;
    return () => {
      clearTimeout(first);
      if (t) clearInterval(t);
    };
  }, [fn, ms]);
}

// Reviewer name, remembered per browser
const REVIEWER_KEY = "tryonai.reviewer";
const reviewerListeners = new Set<() => void>();
function useReviewer() {
  const value = useSyncExternalStore(
    (l) => (reviewerListeners.add(l), () => reviewerListeners.delete(l)),
    () => {
      try {
        return localStorage.getItem(REVIEWER_KEY) ?? "";
      } catch {
        return "";
      }
    },
    () => "",
  );
  const set = (v: string) => {
    try {
      localStorage.setItem(REVIEWER_KEY, v);
    } catch {}
    reviewerListeners.forEach((l) => l());
  };
  return [value, set] as const;
}

async function opsPost(url: string, body?: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j;
}

export default function ConsolePage() {
  const [tab, setTab] = useState<Tab>("queue");
  const [reviewer, setReviewer] = useReviewer();
  const [pending, setPending] = useState(0);

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "queue", label: "Review queue", badge: pending },
    { key: "agents", label: "AgenticOrg agents" },
    { key: "recon", label: "Reconciliation" },
    { key: "orders", label: "Orders" },
  ];

  return (
    <div className="shell grid gap-6 pb-16 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <p className="eyebrow">Operations</p>
          <h1 className="display mt-1 text-5xl">Human-in-the-loop console</h1>
          <p className="mt-2 max-w-xl text-sm text-ink-2">AgenticOrg agents draft every recommendation. Nothing reaches a shopper and no money moves until someone here approves it.</p>
        </div>
        <label className="text-sm">
          <span className="label">Reviewing as</span>
          <input
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
            placeholder="Your name"
            className="field h-10 w-56"
          />
        </label>
      </div>

      <div className="no-scrollbar flex gap-1 overflow-x-auto border-b hairline">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${tab === t.key ? "border-ink text-ink" : "border-transparent text-mute hover:text-ink"}`}
          >
            {t.label}
            {!!t.badge && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] text-white">{t.badge}</span>}
          </button>
        ))}
      </div>

      {tab === "queue" && <Queue reviewer={reviewer} onPendingCount={setPending} />}
      {tab === "agents" && <Agents />}
      {tab === "recon" && <Recon />}
      {tab === "orders" && <Orders />}
    </div>
  );
}

// ─── Review queue ───────────────────────────────────────────────────────────

function Queue({ reviewer, onPendingCount }: { reviewer: string; onPendingCount: (n: number) => void }) {
  const [status, setStatus] = useState<ApprovalStatus>("pending");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/ops/approvals?status=${status}`, { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    setRows(j.approvals);
    if (status === "pending") onPendingCount(j.approvals.length);
  }, [status, onPendingCount]);

  usePolling(load, 4000);

  async function decide(id: string, approve: boolean, note: string, stylistSize?: string) {
    setError("");
    try {
      await opsPost(`/api/ops/approvals/${id}/decision`, { approve, note, stylistSize, reviewer });
    } catch (e) {
      setError((e as Error).message);
    }
    load();
  }

  return (
    <div className="grid gap-4">
      <div className="flex gap-2">
        {(["pending", "approved", "rejected"] as ApprovalStatus[]).map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`chip h-8 px-3.5 capitalize ${status === s ? "border-ink bg-ink text-paper" : "hover:border-ink"}`}>{s}</button>
        ))}
      </div>
      {!reviewer && status === "pending" && <p className="rounded-md bg-[#fbf5ea] p-3 text-sm text-warn">Add your name above so decisions are attributed to you.</p>}
      {error && <p className="rounded-md bg-[#fdf3f1] p-3 text-sm text-bad">{error}</p>}
      {rows === null ? (
        <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <div key={i} className="skeleton h-64 rounded-md" />)}</div>
      ) : !rows.length ? (
        <div className="card grid place-items-center p-16 text-center">
          <p className="display text-3xl">All clear</p>
          <p className="mt-1 text-sm text-mute">Nothing {status} right now.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((a) => <ApprovalCard key={a.id} a={a} onDecide={decide} canDecide={Boolean(reviewer.trim())} onChanged={load} />)}
        </div>
      )}
    </div>
  );
}

function ApprovalCard({ a, onDecide, canDecide, onChanged }: { a: Row; onDecide: (id: string, approve: boolean, note: string, size?: string) => Promise<void>; canDecide: boolean; onChanged: () => void }) {
  const [note, setNote] = useState("");
  const [size, setSize] = useState(a.stylist?.selectedSize ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const rec = a.analysis.recommendation;
  const recTone = rec === "approve" ? "chip-ok" : rec === "reject" ? "chip-bad" : "chip-warn";
  const fromAgent = a.analysis.source === "agenticorg";

  const go = async (approve: boolean) => {
    setBusy(true);
    await onDecide(a.id, approve, note, a.kind === "stylist_review" ? size : undefined);
    setBusy(false);
  };
  const retry = async (action: string) => {
    if (!a.orderId) return;
    setBusy(true);
    setErr("");
    try {
      await opsPost(`/api/ops/orders/${a.orderId}/${action}`);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
    onChanged();
  };

  return (
    <article className="card flex flex-col gap-4 p-5 animate-rise">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-accent">{KIND[a.kind].label}</p>
          <p className="mt-1 text-xs text-mute">{ago(a.createdAt)} · <span className="font-mono">{a.id}</span></p>
        </div>
        <span className={`chip ${recTone}`}>Agent: {rec} · {pct(a.analysis.confidence)}</span>
      </header>

      {a.stylist && (
        <div className="flex gap-4">
          {a.stylist.snapshot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.stylist.snapshot} alt="Shopper's try-on (shared with consent)" className="h-40 w-32 shrink-0 rounded-md object-cover" />
          ) : (
            <div className="grid h-40 w-32 shrink-0 place-items-center rounded-md bg-ivory p-3 text-center text-[11px] text-mute">No photo shared</div>
          )}
          <div className="min-w-0 text-sm">
            <p className="font-semibold">{a.stylist.productName}</p>
            <p className="text-ink-2">Shopper picked <b>{a.stylist.selectedSize || "no size yet"}</b></p>
            {a.stylist.cameraHint?.shoulderCm && <p className="text-xs text-mute">Camera hint (unreliable): shoulders ≈ {a.stylist.cameraHint.shoulderCm} cm</p>}
            {a.stylist.customerQuestion && <p className="mt-2 rounded bg-ivory p-2.5 italic">“{a.stylist.customerQuestion}”</p>}
          </div>
        </div>
      )}

      {a.order && (
        <div className="rounded-md border hairline p-3.5 text-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">{a.order.customer.firstName} {a.order.customer.lastName} · {a.order.customer.city}</p>
            <p className="font-semibold">{inr(a.order.totalPaise)}</p>
          </div>
          <ul className="mt-1 text-ink-2">
            {a.order.items.map((i) => <li key={`${i.productId}-${i.size}`}>{i.quantity} × {i.name} ({i.size})</li>)}
          </ul>
          {a.kind === "refund_review" && a.order.refund && <p className="mt-2">Refund {inr(a.order.refund.amountPaise)}: “{a.order.refund.reason}”</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="chip">order: {a.order.status.replace(/_/g, " ")}</span>
            {a.order.refund && <span className="chip">refund: {a.order.refund.status.replace(/_/g, " ")}</span>}
            {a.order.demo && <span className="chip chip-warn">demo</span>}
          </div>
        </div>
      )}

      <div className={`rounded-md p-3.5 text-sm ${fromAgent ? "bg-accent-soft/60" : "bg-ivory"}`}>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-2">
          {fromAgent ? <><span className="agent-gradient h-2 w-2 rounded-full" /> AgenticOrg · {KIND[a.kind].agent}</> : "Rule-based check: AgenticOrg didn't answer, review carefully"}
        </p>
        <p className="whitespace-pre-wrap leading-relaxed">{a.analysis.summary}</p>
        {!!a.analysis.flags.length && (
          <ul className="mt-2 space-y-1 text-warn">{a.analysis.flags.map((f) => <li key={f} className="flex gap-1.5"><span>⚠</span>{f}</li>)}</ul>
        )}
        {a.agenticorgCaseRef && <p className="mt-2 text-xs text-mute">AgenticOrg case {a.agenticorgCaseRef}</p>}
      </div>

      {a.status === "pending" ? (
        <div className="grid gap-3">
          {a.kind === "stylist_review" && (
            <label className="flex items-center gap-2 text-sm">
              <span className="font-medium">Recommend size</span>
              <input value={size} onChange={(e) => setSize(e.target.value.toUpperCase())} className="field h-9 w-20 text-center font-semibold" />
            </label>
          )}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={a.kind === "stylist_review" ? "Note to the shopper (they'll see this)" : "Reason or internal note"} className="field text-sm" rows={2} />
          <div className="flex gap-2">
            <button disabled={busy || !canDecide} onClick={() => go(true)} className="btn btn-primary flex-1">
              {a.kind === "order_review" ? "Approve & send payment link" : a.kind === "refund_review" ? "Approve refund" : "Send to shopper"}
            </button>
            <button disabled={busy || !canDecide} onClick={() => go(false)} className="btn btn-ghost hover:border-bad hover:text-bad">Reject</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t hairline pt-3 text-sm">
          <p className="text-mute">
            <span className={a.status === "approved" ? "text-ok" : "text-bad"}>{a.status}</span> by {a.decidedBy} · {a.decidedAt && ago(a.decidedAt)}
            {a.note && <> · “{a.note}”</>}
          </p>
          {a.order?.status === "approved" && <button disabled={busy} onClick={() => retry("retry-payment-link")} className="btn btn-ghost btn-sm">Retry payment link</button>}
          {a.order?.refund?.status === "submit_failed" && <button disabled={busy} onClick={() => retry("retry-refund")} className="btn btn-ghost btn-sm">Retry refund</button>}
          {a.order?.refund?.status === "pending" && <button disabled={busy} onClick={() => retry("sync-refund")} className="btn btn-ghost btn-sm">Check refund status</button>}
        </div>
      )}
      {(err || a.order?.lastError || a.order?.refund?.lastError) && <p className="text-xs text-bad">{err || a.order?.refund?.lastError || a.order?.lastError}</p>}
    </article>
  );
}

// ─── AgenticOrg Control Room ────────────────────────────────────────────────

function Agents() {
  const [data, setData] = useState<{ connected: boolean; baseUrl: string; units: Unit[]; runs: AgentRun[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/ops/agents", { cache: "no-store" });
    if (r.ok) setData(await r.json());
  }, []);
  usePolling(load, 5000);

  async function toggle(u: Unit) {
    await opsPost("/api/ops/agents", { agent: u.key, enabled: !u.enabled });
    load();
  }

  if (!data) return <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-56 rounded-md" />)}</div>;

  return (
    <div className="grid gap-6">
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-md p-5 ${data.connected ? "agent-gradient text-white" : "border border-dashed border-line-2 bg-paper"}`}>
        <div>
          <p className="text-lg font-semibold">{data.connected ? "Connected to AgenticOrg" : "AgenticOrg isn't connected"}</p>
          <p className={`text-sm ${data.connected ? "text-white/80" : "text-mute"}`}>
            {data.connected ? `${data.baseUrl} · agents called over MCP` : "Set AGENTICORG_API_KEY. Until then every unit uses rule-based checks and every decision goes to a human."}
          </p>
        </div>
        <span className={`chip ${data.connected ? "chip-dark" : ""}`}>{data.units.filter((u) => u.enabled).length}/{data.units.length} units enabled</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.units.map((u) => (
          <article key={u.key} className={`card flex flex-col gap-3 p-5 ${u.enabled ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">{u.audience}</p>
                <h3 className="display mt-1 text-2xl">{u.name}</h3>
              </div>
              <button
                role="switch"
                aria-checked={u.enabled}
                aria-label={`${u.enabled ? "Disable" : "Enable"} ${u.name}`}
                onClick={() => toggle(u)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition ${u.enabled ? "bg-ok" : "bg-line-2"}`}
              >
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${u.enabled ? "left-6" : "left-1"}`} />
              </button>
            </div>
            <p className="text-sm leading-relaxed text-ink-2">{u.purpose}</p>
            <p className="rounded bg-ivory p-2.5 text-xs text-ink-2"><b>Human in the loop:</b> {u.humanInLoop}</p>
            <dl className="grid grid-cols-4 gap-2 border-t hairline pt-3 text-center">
              {[
                ["Runs", String(u.runs)],
                ["Confidence", pct(u.avgConfidence)],
                ["HITL", pct(u.hitlRate)],
                ["Latency", u.avgMs === null ? "-" : `${(u.avgMs / 1000).toFixed(1)}s`],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[10px] uppercase tracking-wider text-mute">{k}</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="font-mono text-[11px] text-mute">{u.tool}{u.failures ? ` · ${u.failures} failed` : ""}{u.lastRunAt ? ` · last ${ago(u.lastRunAt)}` : ""}</p>
          </article>
        ))}
      </div>

      <section className="card overflow-hidden">
        <header className="flex items-center justify-between border-b hairline px-5 py-4">
          <h3 className="font-semibold">Run log</h3>
          <span className="text-xs text-mute">Every AgenticOrg call, newest first</span>
        </header>
        {!data.runs.length ? (
          <p className="p-8 text-center text-sm text-mute">No agent runs yet. Chat with the stylist or place an order to see them here.</p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {data.runs.map((r) => (
              <li key={r.id}>
                <button onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left text-sm hover:bg-ivory/60">
                  <span className={`h-2 w-2 rounded-full ${r.source === "disabled" ? "bg-line-2" : r.ok ? "bg-ok" : "bg-bad"}`} />
                  <span className="w-40 font-medium">{data.units.find((u) => u.key === r.agent)?.name}</span>
                  <span className="text-mute">{r.source === "disabled" ? "skipped (disabled)" : r.ok ? `${r.recommendation ?? "answered"}${r.confidence !== undefined ? ` · ${pct(r.confidence)}` : ""}` : `error: ${r.error}`}</span>
                  {r.hitl && <span className="chip chip-warn">HITL</span>}
                  <span className="ml-auto text-xs tabular-nums text-mute">{r.ms ? `${r.ms} ms · ` : ""}{ago(r.at)}</span>
                </button>
                {open === r.id && (
                  <div className="grid gap-3 bg-ivory/60 px-5 pb-4 text-xs md:grid-cols-2">
                    <pre className="scroll-thin max-h-60 overflow-auto whitespace-pre-wrap rounded bg-paper p-3 font-mono">{r.input}</pre>
                    <pre className="scroll-thin max-h-60 overflow-auto whitespace-pre-wrap rounded bg-paper p-3 font-mono">{r.output || r.error}</pre>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── Reconciliation ─────────────────────────────────────────────────────────

type Report = { at: string; checked: number; summary: string; source: string; lines: { orderId: string; appStatus: string; pinelabsStatus: string; amountPaise: number; issue?: string }[] };

function Recon() {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function run() {
    setBusy(true);
    setErr("");
    try {
      setReport((await opsPost("/api/ops/recon")).report);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }
  return (
    <div className="grid gap-4">
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h3 className="display text-2xl">Payment reconciliation</h3>
          <p className="text-sm text-ink-2">Re-reads every order&apos;s payment from Pine Labs and asks the AgenticOrg recon agent to explain any mismatch. Read-only.</p>
        </div>
        <button onClick={run} disabled={busy} className="btn btn-accent">{busy ? "Reconciling…" : "Run reconciliation"}</button>
      </div>
      {err && <p className="text-sm text-bad">{err}</p>}
      {report && (
        <>
          <div className={`rounded-md p-5 text-sm ${report.lines.some((l) => l.issue) ? "bg-[#fbf5ea]" : "bg-[#eef7f1]"}`}>
            <p className="mb-1 text-xs font-semibold text-ink-2">{report.source === "agenticorg" ? "AgenticOrg recon agent" : "Rule-based summary"} · {report.checked} orders · {dateTime(report.at)}</p>
            <p className="whitespace-pre-wrap leading-relaxed">{report.summary}</p>
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-mute"><tr><th className="px-5 py-3">Order</th><th className="px-5 py-3">App</th><th className="px-5 py-3">Pine Labs</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Issue</th></tr></thead>
              <tbody>
                {report.lines.map((l) => (
                  <tr key={l.orderId} className="border-t hairline">
                    <td className="px-5 py-3 font-mono text-xs">{l.orderId}</td>
                    <td className="px-5 py-3">{l.appStatus.replace(/_/g, " ")}</td>
                    <td className="px-5 py-3">{l.pinelabsStatus}</td>
                    <td className="px-5 py-3">{inr(l.amountPaise)}</td>
                    <td className={`px-5 py-3 ${l.issue ? "text-warn" : "text-ok"}`}>{l.issue ?? "Matched"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Orders ─────────────────────────────────────────────────────────────────

function Orders() {
  const [orders, setOrders] = useState<PubOrder[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/ops/orders", { cache: "no-store" });
    if (r.ok) setOrders((await r.json()).orders);
  }, []);
  usePolling(load, null);
  async function act(id: string, action: string) {
    setBusy(id + action);
    try {
      await opsPost(`/api/ops/orders/${id}/${action}`);
    } catch (e) {
      alert((e as Error).message);
    }
    setBusy(null);
    load();
  }
  if (!orders) return <div className="skeleton h-64 rounded-md" />;
  if (!orders.length) return <div className="card p-16 text-center text-sm text-mute">No orders yet.</div>;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-mute"><tr><th className="px-5 py-3">Order</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Total</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Refund</th><th className="px-5 py-3" /></tr></thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-t hairline align-top">
              <td className="px-5 py-3"><p className="font-mono text-xs">{o.id}</p><p className="text-xs text-mute">{ago(o.createdAt)}{o.demo ? " · demo" : ""}</p></td>
              <td className="px-5 py-3">{o.customer.firstName} {o.customer.lastName}<p className="text-xs text-mute">{o.customer.city}</p></td>
              <td className="px-5 py-3">{inr(o.totalPaise)}</td>
              <td className="px-5 py-3">{o.status.replace(/_/g, " ")}{o.lastError && <p className="max-w-56 text-xs text-bad">{o.lastError}</p>}</td>
              <td className="px-5 py-3">{o.refund ? o.refund.status.replace(/_/g, " ") : "-"}</td>
              <td className="space-x-1 whitespace-nowrap px-5 py-3 text-right">
                {o.status === "approved" && <button disabled={!!busy} onClick={() => act(o.id, "retry-payment-link")} className="btn btn-ghost btn-sm">Retry link</button>}
                {["awaiting_payment", "payment_pending"].includes(o.status) && !o.demo && <button disabled={!!busy} onClick={() => act(o.id, "sync-payment")} className="btn btn-ghost btn-sm">Check payment</button>}
                {o.refund?.status === "submit_failed" && <button disabled={!!busy} onClick={() => act(o.id, "retry-refund")} className="btn btn-ghost btn-sm">Retry refund</button>}
                {o.refund?.status === "pending" && <button disabled={!!busy} onClick={() => act(o.id, "sync-refund")} className="btn btn-ghost btn-sm">Check refund</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
