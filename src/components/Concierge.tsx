"use client";

import { useEffect, useRef, useState } from "react";
import { inr } from "@/lib/format";
import { analyzePhoto, type StyleProfile } from "@/lib/photoStyle";
import { useTryOn } from "@/components/tryon/TryOnProvider";
import { Icon } from "@/components/ui/Icon";
import type { Product } from "@/lib/types";

type Msg = {
  role: "user" | "assistant";
  text: string;
  productIds?: string[];
  source?: "agenticorg" | "rules";
  photo?: { url: string; profile: StyleProfile; file: File };
};

const STARTERS = ["A festive look for Diwali", "Casual tee under ₹1,200", "Something for a winter trip"];

/* eslint-disable @next/next/no-img-element */
export default function Concierge({ products, onTryOn, selectedId, bare = false }: { products: Product[]; onTryOn: (p: Product) => void; selectedId: string; bare?: boolean }) {
  const tryon = useTryOn();
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", text: "Hi, I'm your AI stylist. Tell me the occasion, your budget or a vibe, or upload a photo of your outfit and I'll pick pieces that go with it." },
  ]);
  const [followUps, setFollowUps] = useState(STARTERS);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [pending, setPending] = useState<Msg["photo"] | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastPhoto = useRef<Msg["photo"] | null>(null);
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs, thinking, pending]);

  async function pickPhoto(file: File) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return;
    setAnalyzing(true);
    try {
      const profile = await analyzePhoto(file);
      setPending({ url: URL.createObjectURL(file), profile, file });
    } finally {
      setAnalyzing(false);
    }
  }

  async function send(text: string) {
    const photo = pending ?? undefined;
    const t = text.trim() || (photo ? "What would go well with this look?" : "");
    if (!t || thinking) return;
    setInput("");
    setPending(null);
    if (photo) lastPhoto.current = photo;
    const next = [...msgs, { role: "user" as const, text: t, photo }];
    setMsgs(next);
    setThinking(true);
    try {
      const r = await fetch("/api/concierge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: t,
          history: next.slice(-8).map(({ role, text }) => ({ role, text })),
          // only the on-device colour profile is sent, never the image
          photo: (photo ?? lastPhoto.current)?.profile,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMsgs((m) => [...m, { role: "assistant", text: j.reply, productIds: j.productIds, source: j.source }]);
      if (j.followUps?.length) setFollowUps(j.followUps);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: `Sorry, I couldn't reach the stylist just now (${(e as Error).message}). Try again in a moment.` }]);
    } finally {
      setThinking(false);
    }
  }

  /** Use the shopper's photo in the free Photo AI try-on, then dress them in the pick. */
  function tryOnWithPhoto(p: Product) {
    const photo = lastPhoto.current;
    if (photo) {
      tryon.setMode("photo");
      tryon.uploadPhoto(photo.file);
    }
    onTryOn(p);
  }

  return (
    <section className={bare ? "flex min-h-0 flex-1 flex-col" : "card flex h-full min-h-[520px] flex-col overflow-hidden"}>
      {!bare && (
        <header className="flex items-center gap-3 border-b hairline px-5 py-4">
          <div className="agent-gradient grid h-10 w-10 place-items-center text-white"><Icon name="sparkle" size={18} /></div>
          <div className="min-w-0">
            <p className="font-semibold leading-tight">AI Stylist</p>
            <p className="text-xs text-mute">AgenticOrg concierge · advice only</p>
          </div>
        </header>
      )}

      <div ref={listRef} className={`scroll-thin flex-1 space-y-4 overflow-y-auto px-5 py-5 ${bare ? "" : "max-h-[560px]"}`}>
        {msgs.map((m, i) => (
          <div key={i} className={`animate-rise ${m.role === "user" ? "flex flex-col items-end" : ""}`}>
            {m.photo && (
              <div className="mb-1.5 w-44 overflow-hidden bg-ink text-white">
                <img src={m.photo.url} alt="Your outfit" className="aspect-[3/4] w-full object-cover" />
                <Swatches profile={m.photo.profile} dark />
              </div>
            )}
            <div className={`max-w-[92%] px-4 py-3 text-[14px] leading-relaxed ${m.role === "user" ? "bg-ink text-white" : "bg-cloud text-ink"}`}>{m.text}</div>
            {!!m.productIds?.length && (
              <div className="mt-2 grid gap-2">
                {m.productIds.map((id) => byId[id]).filter(Boolean).map((p) => (
                  <div key={p.id} className={`flex items-center gap-3 border bg-white p-2 pr-3 transition ${p.id === selectedId ? "border-ink" : "hairline"}`}>
                    <img src={p.modelImageUrl ?? p.imageUrl} alt="" className="h-16 w-12 shrink-0 object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="text-xs text-mute">{inr(p.pricePaise)} · {p.color.name}</span>
                    </span>
                    <button onClick={() => (lastPhoto.current ? tryOnWithPhoto(p) : onTryOn(p))} className="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent hover:underline">
                      {lastPhoto.current ? "Try on me" : "Try on"}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {m.source && <p className="mt-1.5 text-[11px] text-mute">{m.source === "agenticorg" ? "Answered by AgenticOrg" : "AgenticOrg offline: matched from the catalog"}</p>}
          </div>
        ))}
        {thinking && (
          <div className="flex w-20 items-center gap-1.5 bg-cloud px-4 py-3.5" aria-label="Stylist is thinking">
            {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-mute" style={{ animationDelay: `${i * 120}ms` }} />)}
          </div>
        )}
      </div>

      <div className="border-t hairline p-3">
        {pending ? (
          <div className="mb-2 flex items-center gap-3 border hairline p-2 animate-rise">
            <img src={pending.url} alt="Your outfit" className="h-16 w-12 object-cover" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold">Photo ready</p>
              <Swatches profile={pending.profile} />
            </div>
            <button onClick={() => setPending(null)} className="grid h-8 w-8 place-items-center text-mute hover:text-ink" aria-label="Remove photo"><Icon name="close" size={15} /></button>
          </div>
        ) : (
          <div className="no-scrollbar mb-2 flex gap-1.5 overflow-x-auto">
            {followUps.map((f) => <button key={f} onClick={() => send(f)} className="chip shrink-0 hover:border-ink">{f}</button>)}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={analyzing} className="grid h-11 w-11 shrink-0 place-items-center border border-line-2 hover:border-ink disabled:opacity-50" aria-label="Upload a photo of your outfit" title="Upload a photo of your outfit">
            {analyzing ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-2 border-t-ink" /> : <Icon name="camera" size={18} />}
          </button>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={pending ? "Add a note (optional): occasion, budget…" : "Ask for a look…"} className="field h-11" aria-label="Message the AI stylist" />
          <button className="btn btn-primary h-11 w-11 shrink-0 p-0" disabled={(!input.trim() && !pending) || thinking} aria-label="Send">
            <Icon name="arrow" size={18} />
          </button>
        </form>
        <p className="mt-2 text-[10px] leading-relaxed text-mute">Photos are analysed on your device. Only their colour profile is sent to the stylist.</p>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickPhoto(f); e.target.value = ""; }} />
      </div>
    </section>
  );
}

function Swatches({ profile, dark = false }: { profile: StyleProfile; dark?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${dark ? "p-2" : "mt-1"}`}>
      {profile.outfitColors.map((c) => (
        <span key={c.name} className={`flex items-center gap-1 text-[10px] ${dark ? "text-white/80" : "text-ink-2"}`}>
          <span className="h-3 w-3 rounded-full ring-1 ring-black/10" style={{ background: c.hex }} /> {c.name}
        </span>
      ))}
      <span className={`text-[10px] ${dark ? "text-white/50" : "text-mute"}`}>· {profile.temperature}, {profile.brightness}</span>
    </div>
  );
}
