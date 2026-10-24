"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMirrorRefs, useTryOn } from "./TryOnProvider";
import { catalog } from "@/lib/catalog";
import { inr } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/* eslint-disable @next/next/no-img-element */
/**
 * The Live Mirror: one stage that morphs between a launcher pill, a docked card and a full-screen
 * fitting room. Media elements never unmount, so sessions survive browsing.
 */
export default function MirrorDock() {
  const m = useTryOn();
  const { view, setView, mode, garment, remoteStream } = m;
  const { videoRef, camRef } = useMirrorRefs();
  const fileRef = useRef<HTMLInputElement>(null);
  const [comparing, setComparing] = useState(false);
  const [code, setCode] = useState("");
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = remoteStream;
  }, [remoteStream, videoRef]);

  useEffect(() => {
    document.body.style.overflow = view === "full" ? "hidden" : "";
    return () => void (document.body.style.overflow = "");
  }, [view]);

  // elapsed timer while a free try-on renders
  useEffect(() => {
    if (!m.generatingSince) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [m.generatingSince]);
  const elapsed = m.generatingSince && now ? Math.max(0, Math.round((now - m.generatingSince) / 1000)) : 0;

  const full = view === "full";
  const rail = [...m.tried, ...catalog.filter((p) => !m.tried.some((t) => t.id === p.id))].slice(0, 14);
  const photoMode = mode === "photo";
  const cameraOn = photoMode && m.photoPhase === "camera";
  const shownStill = photoMode && m.photoUrl ? (comparing ? m.photoUrl : (m.resultUrl ?? m.photoUrl)) : null;
  const pendingProduct = m.pendingId ? catalog.find((p) => p.id === m.pendingId) : null;

  return (
    <>
      {view === "closed" && (
        <button
          onClick={() => setView("dock")}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-3 bg-ink py-2 pl-2 pr-5 text-white shadow-[0_18px_50px_-12px_rgba(0,0,0,.55)] transition hover:-translate-y-0.5"
          aria-label="Open the Live Mirror"
        >
          <span className="relative grid h-10 w-10 place-items-center bg-white/10">
            <Icon name="mirror" size={19} />
            {(m.live || m.busy) && <span className="absolute right-1 top-1 h-2 w-2 animate-pulse rounded-full bg-red-500" />}
          </span>
          <span className="text-left leading-tight">
            <span className="block text-[12px] font-semibold uppercase tracking-[0.12em]">Live Mirror</span>
            <span className="block text-[11px] text-white/60">{m.busy ? "Creating your look…" : m.live ? `Wearing ${garment.name}` : "Try anything on"}</span>
          </span>
        </button>
      )}

      {full && <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm" onClick={() => setView("dock")} />}

      <section
        aria-label="Live Mirror"
        aria-hidden={view === "closed"}
        className={
          view === "closed"
            ? "pointer-events-none fixed bottom-5 right-5 z-50 h-0 w-0 overflow-hidden opacity-0"
            : full
              ? "fixed inset-0 z-[70] flex flex-col overflow-hidden bg-stage sm:inset-6 lg:inset-x-[6vw] lg:inset-y-6"
              : "fixed inset-x-2 bottom-2 z-50 flex h-[64vh] flex-col overflow-hidden bg-stage shadow-[0_30px_80px_-20px_rgba(0,0,0,.7)] animate-rise sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[600px] sm:w-[380px]"
        }
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5 text-white">
          <div className="flex bg-white/10 p-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]" role="tablist" aria-label="Try-on engine">
            <button role="tab" aria-selected={photoMode} onClick={() => m.setMode("photo")} disabled={!m.freeAvailable}
              className={`px-3 py-1.5 transition disabled:opacity-40 ${photoMode ? "bg-white text-ink" : "text-white/70 hover:text-white"}`}>
              Photo AI <span className={photoMode ? "text-ok" : "text-white/50"}>· Free</span>
            </button>
            <button role="tab" aria-selected={!photoMode} onClick={() => m.setMode("decart")}
              className={`px-3 py-1.5 transition ${!photoMode ? "bg-white text-ink" : "text-white/70 hover:text-white"}`}>
              Live AI
            </button>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setView(full ? "dock" : "full")} className="grid h-8 w-8 place-items-center text-white/80 hover:bg-white/10 hover:text-white" aria-label={full ? "Shrink mirror" : "Expand mirror"}>
              <Icon name={full ? "shrink" : "expand"} size={15} />
            </button>
            <button onClick={() => setView("closed")} className="grid h-8 w-8 place-items-center text-white/80 hover:bg-white/10 hover:text-white" aria-label="Minimise mirror">
              <Icon name="minus" size={15} />
            </button>
          </div>
        </header>

        <div className={`relative min-h-0 flex-1 ${full ? "lg:grid lg:grid-cols-[minmax(0,1fr)_360px]" : ""}`}>
          <div className="stage-glow relative h-full overflow-hidden">
            {/* media (always mounted) */}
            <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${!photoMode && remoteStream ? "opacity-100" : "opacity-0"}`} />
            <video ref={camRef} autoPlay playsInline muted className={`absolute inset-0 h-full w-full -scale-x-100 object-cover ${cameraOn ? "opacity-100" : "opacity-0"}`} />
            {shownStill && (
              <img src={shownStill} alt={m.resultUrl && !comparing ? `You wearing ${garment.name}` : "Your photo"} data-tryon-result={m.resultUrl && !comparing ? "" : undefined}
                className={`absolute inset-0 h-full w-full object-contain transition duration-500 ${m.busy ? "scale-[1.01] blur-[2px] brightness-75" : ""}`} />
            )}

            {/* ── PHOTO MODE overlays ── */}
            {photoMode && cameraOn && (
              <>
                <div className="pointer-events-none absolute inset-[12%_18%_18%] border border-dashed border-white/40" />
                <p className="absolute inset-x-0 top-4 text-center text-xs font-medium text-white/85">Face the camera · upper body inside the frame · good light</p>
                <div className="absolute inset-x-0 bottom-24 flex items-center justify-center gap-6">
                  <button onClick={m.resetPhoto} className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80 hover:text-white">Cancel</button>
                  <button onClick={m.capturePhoto} className="grid h-16 w-16 place-items-center rounded-full border-4 border-white/90 bg-white/20 transition hover:bg-white/40" aria-label="Take photo">
                    <span className="h-11 w-11 rounded-full bg-white" />
                  </button>
                  <button onClick={() => fileRef.current?.click()} className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80 hover:text-white">Upload</button>
                </div>
              </>
            )}

            {photoMode && !cameraOn && !m.photoUrl && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-7 pb-24 text-center text-white">
                <span className="grid h-14 w-14 place-items-center border border-white/20"><Icon name="camera" size={24} /></span>
                <div>
                  <p className="display text-[28px] leading-tight">{m.failed ? "Let's try that again" : "See it on you"}</p>
                  <p className="mx-auto mt-2 max-w-[280px] text-[13px] leading-relaxed text-white/65">
                    {m.failed ? m.error : "Take one photo, then tap Try on on anything in the store. Each look is created in about 20 seconds, free."}
                  </p>
                </div>
                <div className="grid w-full max-w-[260px] gap-2">
                  <button onClick={m.openCamera} className="btn h-11 bg-white text-ink hover:bg-white/85"><Icon name="camera" size={16} /> Use my camera</button>
                  <button onClick={() => fileRef.current?.click()} className="btn h-11 border border-white/40 text-white hover:bg-white hover:text-ink">Upload a photo</button>
                </div>
                <p className="max-w-[270px] text-[11px] leading-relaxed text-white/45">Your photo is sent to Hugging Face (IDM-VTON) to create the try-on. TryOn AI doesn&apos;t store it.</p>
              </div>
            )}

            {photoMode && m.photoUrl && m.busy && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center text-white">
                <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                <div>
                  <p className="display text-2xl">Dressing you in<br />{pendingProduct?.name}</p>
                  <p className="mt-2 text-xs tabular-nums text-white/70">{elapsed}s · usually 15–40s on the free GPU</p>
                </div>
                <div className="h-0.5 w-48 overflow-hidden bg-white/15"><div className="h-full bg-white transition-all duration-500" style={{ width: `${Math.min(95, (elapsed / 35) * 100)}%` }} /></div>
              </div>
            )}

            {photoMode && m.photoUrl && !m.busy && m.failed && (
              <div className="absolute inset-x-4 top-14 bg-black/75 p-3 text-xs text-white backdrop-blur">
                <p>{m.error}</p>
                <button onClick={m.start} className="mt-2 font-semibold uppercase tracking-[0.1em] underline underline-offset-4">Retry</button>
              </div>
            )}

            {photoMode && m.photoUrl && !m.busy && !m.resultUrl && !m.failed && (
              <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
                <button onClick={m.start} className="btn h-12 bg-white px-6 text-ink shadow-xl hover:bg-white/85"><Icon name="sparkle" size={15} /> Try on {garment.name}</button>
              </div>
            )}

            {photoMode && m.photoUrl && (
              <div className="absolute left-3 top-3 flex gap-1.5">
                {m.resultUrl && (
                  <button onPointerDown={() => setComparing(true)} onPointerUp={() => setComparing(false)} onPointerLeave={() => setComparing(false)}
                    className="chip chip-dark select-none" aria-label="Hold to compare with your original photo">{comparing ? "Original" : "Hold to compare"}</button>
                )}
                <button onClick={m.resetPhoto} className="chip chip-dark">New photo</button>
              </div>
            )}

            {/* ── LIVE (DECART) MODE overlays ── */}
            {!photoMode && m.decartPhase === "live" && (
              <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                <span className="chip chip-dark"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> LIVE</span>
                {m.secondsLeft !== null && <span className="chip chip-dark tabular-nums">{fmt(m.secondsLeft)}</span>}
                {m.applying && <span className="chip chip-dark">Changing outfit…</span>}
                <button onClick={m.stop} className="chip chip-dark">Stop</button>
              </div>
            )}

            {!photoMode && m.decartPhase !== "live" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-7 pb-24 text-center text-white">
                {m.busy ? (
                  <>
                    <div className="h-11 w-11 animate-spin rounded-full border-2 border-white/15 border-t-white" />
                    <p className="display text-2xl">{m.queue ? `You're #${m.queue.position} in line…` : m.decartPhase === "reconnecting" ? "Reconnecting…" : "Dressing you, live…"}</p>
                  </>
                ) : m.needsCode ? (
                  <form className="grid w-full max-w-[260px] gap-3" onSubmit={(e) => { e.preventDefault(); if (code.trim()) m.submitAccessCode(code); }}>
                    <span className="mx-auto grid h-12 w-12 place-items-center border border-white/20"><Icon name="shield" size={20} /></span>
                    <p className="display text-2xl leading-tight">Live AI is reserved</p>
                    <p className="text-[13px] text-white/65">Real-time try-on is available with an access code. Everyone can use Photo AI for free.</p>
                    <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Access code" type="password" autoComplete="off" className="h-11 border border-white/30 bg-transparent px-3 text-center text-sm text-white outline-none placeholder:text-white/40 focus:border-white" aria-label="Access code" />
                    <button className="btn h-11 bg-white text-ink hover:bg-white/85">Unlock Live AI</button>
                    {m.error && !/access code/i.test(m.error) && <p className="text-xs text-red-300">{m.error}</p>}
                    <button type="button" onClick={() => m.setMode("photo")} className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70 underline-offset-4 hover:underline">Use free Photo AI</button>
                  </form>
                ) : (
                  <>
                    <span className="grid h-14 w-14 place-items-center border border-white/20"><Icon name="mirror" size={24} /></span>
                    <div>
                      <p className="display text-[28px] leading-tight">{m.failed ? "Let's try again" : "Real-time try-on"}</p>
                      <p className="mx-auto mt-2 max-w-[280px] text-[13px] leading-relaxed text-white/65">
                        {m.failed ? m.error : m.decartAvailable ? "See outfits on you in live video. Keep browsing: tap Try on anywhere to swap instantly." : "Live AI isn't configured on this server. Photo AI works for free."}
                      </p>
                    </div>
                    {m.decartAvailable ? (
                      <button onClick={m.start} className="btn h-11 bg-white px-6 text-ink hover:bg-white/85"><Icon name="camera" size={16} /> {m.failed ? "Retry" : "Start Live AI"}</button>
                    ) : (
                      <button onClick={() => m.setMode("photo")} className="btn h-11 bg-white px-6 text-ink hover:bg-white/85">Use free Photo AI</button>
                    )}
                    <p className="max-w-[270px] text-[11px] leading-relaxed text-white/45">Live AI streams your camera to Decart to generate the try-on. We don&apos;t record it.</p>
                  </>
                )}
              </div>
            )}

            {/* Now wearing */}
            <div className="absolute inset-x-0 bottom-0 z-10 p-3">
              <div className="flex items-center gap-3 bg-black/55 p-2 pr-3 text-white backdrop-blur-xl">
                <img src={garment.modelImageUrl ?? garment.imageUrl} alt="" className="h-12 w-10 shrink-0 object-cover" />
                <Link href={`/p/${garment.id}`} onClick={() => full && setView("dock")} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{garment.name}</p>
                  <p className="text-xs text-white/60">{inr(garment.pricePaise)} · View product</p>
                </Link>
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50">{photoMode ? "Photo AI" : "Live AI"}</span>
              </div>
            </div>
          </div>

          {full && (
            <aside className="hidden flex-col gap-4 overflow-y-auto bg-white p-5 lg:flex">
              <p className="eyebrow">Tap to try on</p>
              <div className="grid grid-cols-3 gap-2">
                {rail.map((p) => (
                  <button key={p.id} onClick={() => m.tryOn(p)} aria-pressed={p.id === garment.id} title={p.name}
                    className={`relative aspect-[3/4] overflow-hidden bg-cloud transition ${p.id === garment.id ? "ring-2 ring-ink ring-offset-2" : "hover:opacity-85"}`}>
                    <img src={p.modelImageUrl ?? p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                    {photoMode && m.pendingId === p.id && <span className="absolute inset-0 grid place-items-center bg-black/40"><span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /></span>}
                  </button>
                ))}
              </div>
              <Link href={`/p/${garment.id}`} onClick={() => setView("dock")} className="btn btn-primary mt-auto">Shop {garment.name}</Link>
            </aside>
          )}
        </div>

        {!full && view !== "closed" && (
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-t border-white/10 bg-black p-2">
            {rail.map((p) => (
              <button key={p.id} onClick={() => m.tryOn(p)} aria-pressed={p.id === garment.id} title={`Try on ${p.name}`}
                className={`relative h-16 w-12 shrink-0 overflow-hidden bg-cloud transition ${p.id === garment.id ? "ring-2 ring-white" : "opacity-60 hover:opacity-100"}`}>
                <img src={p.modelImageUrl ?? p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                {photoMode && m.pendingId === p.id && <span className="absolute inset-0 grid place-items-center bg-black/50"><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /></span>}
              </button>
            ))}
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) m.uploadPhoto(f); e.target.value = ""; }} />
      </section>
    </>
  );
}
