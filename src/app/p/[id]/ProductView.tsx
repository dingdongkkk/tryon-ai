"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProductCard from "@/components/shop/ProductCard";
import ProductImage from "@/components/shop/ProductImage";
import { useTryOn } from "@/components/tryon/TryOnProvider";
import { Icon } from "@/components/ui/Icon";
import { useCart } from "@/lib/cart";
import { inr } from "@/lib/format";
import { CATEGORIES, type Product } from "@/lib/types";

type Stylist = { id: string; status: "pending" | "approved" | "rejected"; size?: string; note?: string } | null;

const CHART: [string, string, string][] = [
  ["XS", "84–89", "71–76"], ["S", "89–94", "76–81"], ["M", "94–102", "81–89"],
  ["L", "102–109", "89–96"], ["XL", "109–117", "96–104"], ["XXL", "117–125", "104–112"],
];

export default function ProductView({ product: p, related }: { product: Product; related: Product[] }) {
  const m = useTryOn();
  const { add } = useCart();
  const [size, setSize] = useState<string | null>(null);
  const [needSize, setNeedSize] = useState(false);
  const [added, setAdded] = useState(false);
  const [open, setOpen] = useState<string | null>("details");
  const wearing = m.live && m.garment.id === p.id;
  const category = CATEGORIES.find((c) => c.key === p.category)!;

  function addToBag() {
    if (!size) return setNeedSize(true);
    add({ productId: p.id, sku: p.sku, name: p.name, size, quantity: 1, unitPricePaise: p.pricePaise });
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
    m.setBagOpen(true);
  }

  return (
    <div className="shell pt-6">
      <nav className="flex items-center gap-1.5 text-xs text-mute" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-ink">Home</Link><Icon name="chevron" size={12} />
        <Link href={`/shop?c=${p.category}`} className="hover:text-ink">{category.label}</Link><Icon name="chevron" size={12} />
        <span className="text-ink-2">{p.name}</span>
      </nav>

      <div className="mt-5 grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] xl:gap-16">
        {/* Gallery */}
        <div className="grid gap-4 sm:grid-cols-[1fr_.42fr]">
          <div className="group relative aspect-[3/4] overflow-hidden bg-cloud">
            <ProductImage product={p} variant="model" eager className="transition duration-700 group-hover:scale-[1.02]" />
            <div className="absolute left-4 top-4 flex gap-2">
              {p.badge && <span className="bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">{p.badge}</span>}
              {p.sample && !p.photo && <span className="bg-white/80 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-2" title="Illustrated sample garment">Sample illustration</span>}
            </div>
            <button onClick={() => m.tryOn(p)} className="absolute inset-x-4 bottom-4 flex items-center gap-3 bg-ink/90 p-2 pr-5 text-paper shadow-xl backdrop-blur-xl transition hover:bg-ink sm:inset-x-auto sm:right-4">
              <span className="grid h-11 w-11 place-items-center bg-paper/10"><Icon name="mirror" /></span>
              <span className="text-left leading-tight">
                <span className="block text-sm font-semibold">{wearing ? "You're wearing this" : "Try it on, live"}</span>
                <span className="text-xs text-paper/60">{wearing ? "Open the mirror to see" : "Opens the Live Mirror"}</span>
              </span>
            </button>
          </div>
          <div className="hidden gap-4 sm:grid">
            <div className="relative overflow-hidden bg-cloud">
              <ProductImage product={p} variant="product" />
              <span className="absolute bottom-3 left-3 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">Product</span>
            </div>
            <div className="flex flex-col justify-between bg-ink p-5 text-paper">
              <Icon name="sparkle" className="text-[#b9a6ff]" />
              <div>
                <p className="display text-2xl leading-tight">Unsure about the fit?</p>
                <p className="mt-1 text-xs text-paper/60">A human stylist will reply below.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Buy box */}
        <div className="lg:sticky lg:top-[120px] lg:self-start">
          <p className="eyebrow">{category.label}</p>
          <h1 className="display mt-2 text-[clamp(44px,5vw,68px)] leading-[0.95]">{p.name}</h1>
          <div className="mt-4 flex items-baseline gap-3">
            <p className="text-2xl font-semibold tracking-tight">{inr(p.pricePaise)}</p>
            <p className="text-sm text-mute">incl. taxes</p>
          </div>
          <p className="mt-4 max-w-md leading-relaxed text-ink-2">{p.description}</p>

          <div className="mt-6 flex items-center gap-3 text-sm">
            <span className="h-6 w-6 rounded-full ring-1 ring-ink ring-offset-2" style={{ background: p.color.hex }} />
            <span><span className="text-mute">Colour:</span> <b>{p.color.name}</b></span>
          </div>

          <div className="mt-7">
            <div className="mb-2.5 flex items-baseline justify-between">
              <span className={`text-sm font-semibold ${needSize && !size ? "text-bad" : ""}`}>{needSize && !size ? "Please select a size" : "Size"}</span>
              <button onClick={() => setOpen(open === "size" ? null : "size")} className="text-xs font-medium underline underline-offset-4">Size guide</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {p.sizes.map((s) => <button key={s} aria-pressed={s === size} onClick={() => setSize(s)} className="size-btn">{s}</button>)}
            </div>
            <p className="mt-2 text-xs text-mute">{p.stock <= 10 ? `Only ${p.stock} left` : "In stock, ships in 24 hours"}</p>
          </div>

          <div className="mt-6 grid gap-2.5 sm:grid-cols-[1fr_auto]">
            <button onClick={addToBag} className="btn btn-primary h-14 text-[15px]">{added ? <><Icon name="check" size={18} /> Added</> : <>Add to bag · {inr(p.pricePaise)}</>}</button>
            <button onClick={() => m.tryOn(p)} className="btn btn-ghost h-14 px-6 text-[15px]"><Icon name="mirror" size={18} /> {wearing ? "On you" : "Try on"}</button>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2 text-center text-[11px] text-ink-2">
            {[["truck", "Free over ₹1,999"], ["return", "15-day returns"], ["shield", "Pine Labs secure"]].map(([i, t]) => (
              <div key={t} className="flex flex-col items-center gap-1.5 border hairline px-2 py-3"><Icon name={i as "truck"} size={18} />{t}</div>
            ))}
          </div>

          <StylistRequest product={p} selectedSize={size} />

          <div className="mt-6 divide-y divide-[var(--line)] border-y hairline">
            <Accordion id="details" open={open} setOpen={setOpen} title="Details & care">
              <ul className="list-disc space-y-1 pl-5">{p.details.map((d) => <li key={d}>{d}</li>)}</ul>
            </Accordion>
            <Accordion id="size" open={open} setOpen={setOpen} title="Size guide">
              <table className="w-full text-left text-xs">
                <thead className="text-mute"><tr><th className="py-1.5">Size</th><th>Chest (cm)</th><th>Waist (cm)</th></tr></thead>
                <tbody>{CHART.filter(([s]) => p.sizes.includes(s)).map(([s, c, w]) => <tr key={s} className="border-t hairline"><td className="py-1.5 font-semibold">{s}</td><td>{c}</td><td>{w}</td></tr>)}</tbody>
              </table>
              <p className="mt-2 text-xs text-mute">Measure your chest at the fullest point. Between sizes? Size up for a relaxed fit.</p>
            </Accordion>
            <Accordion id="ship" open={open} setOpen={setOpen} title="Delivery & returns">
              <p>Every order is reviewed by our team before you pay, then ships within 24 hours. Returns within 15 days are checked by a person and refunded to your original payment method.</p>
            </Accordion>
          </div>
        </div>
      </div>

      <section className="pt-24">
        <div className="flex items-end justify-between">
          <h2 className="display text-[clamp(36px,4vw,56px)] leading-none">Complete the <em>look</em></h2>
          <Link href="/shop" className="link-underline text-sm font-semibold">Shop all</Link>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">
          {related.map((r) => <ProductCard key={r.id} product={r} />)}
        </div>
      </section>
    </div>
  );
}

function Accordion({ id, open, setOpen, title, children }: { id: string; open: string | null; setOpen: (v: string | null) => void; title: string; children: React.ReactNode }) {
  const isOpen = open === id;
  return (
    <div>
      <button onClick={() => setOpen(isOpen ? null : id)} className="flex w-full items-center justify-between py-4 text-left text-sm font-semibold" aria-expanded={isOpen}>
        {title}<Icon name="plus" size={16} className={`transition ${isOpen ? "rotate-45" : ""}`} />
      </button>
      {isOpen && <div className="pb-5 text-sm leading-relaxed text-ink-2 animate-rise">{children}</div>}
    </div>
  );
}

function StylistRequest({ product, selectedSize }: { product: Product; selectedSize: string | null }) {
  const m = useTryOn();
  const [question, setQuestion] = useState("");
  const [consent, setConsent] = useState(false);
  const [stylist, setStylist] = useState<Stylist>(null);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (stylist?.status !== "pending") return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/stylist/${stylist.id}`);
      if (!r.ok) return;
      const j = await r.json();
      if (j.status !== "pending") setStylist({ id: stylist.id, ...j });
    }, 3000);
    return () => clearInterval(t);
  }, [stylist]);

  async function send() {
    setSending(true);
    setErr("");
    try {
      const snapshot = consent ? m.captureFrame() : undefined;
      const r = await fetch("/api/stylist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: product.id, selectedSize: selectedSize ?? "", question, snapshotConsent: consent && Boolean(snapshot), snapshot, cameraHint: m.hint() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setStylist({ id: j.id, status: "pending" });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-6 border hairline p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">Ask a stylist about fit</p>
        <span className="chip chip-accent">Human-reviewed</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-mute">Our AgenticOrg Fit Advisor drafts an answer; a real stylist checks it before you see it.</p>
      {!stylist ? (
        <div className="mt-3 grid gap-3">
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="I'm 5′10″, 72 kg and like a relaxed fit. M or L?" className="field text-sm" rows={2} />
          <label className="flex items-start gap-2.5 text-xs leading-relaxed text-ink-2">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--ink)]" />
            <span>Share one still photo of my live try-on with the stylist, used only for this review.{consent && !m.live && <em className="block text-warn">Start the Live Mirror first so there&apos;s a frame to share.</em>}</span>
          </label>
          <button onClick={send} disabled={sending || (!question.trim() && !consent)} className="btn btn-ghost">{sending ? "Sending…" : "Send to a stylist"}</button>
          {err && <p className="text-xs text-bad">{err}</p>}
        </div>
      ) : stylist.status === "pending" ? (
        <div className="mt-4 flex items-center gap-3 rounded-md bg-accent-soft p-4 text-sm text-accent"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> A stylist is reviewing your request…</div>
      ) : (
        <div className={`mt-4 rounded-md p-4 text-sm ${stylist.status === "approved" ? "bg-[#eef7f1] text-ok" : "bg-[#fbf5ea] text-warn"}`}>
          <p className="font-semibold">{stylist.status === "approved" ? `Stylist recommends size ${stylist.size}` : "The stylist has another suggestion"}</p>
          {stylist.note && <p className="mt-1 text-ink-2">&ldquo;{stylist.note}&rdquo;</p>}
          <button onClick={() => setStylist(null)} className="mt-2 text-xs font-medium underline underline-offset-4">Ask again</button>
        </div>
      )}
    </div>
  );
}
