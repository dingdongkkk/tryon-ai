"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { garmentTransform, measure, smooth, suggestSize, type Pt } from "@/lib/tryon";
import { inr, useCart } from "@/lib/cart";
import { DEFAULT_FIT, type Product } from "@/lib/types";

const MP_VERSION = "1.1.1";
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

type CamState = "idle" | "loading" | "live" | "denied" | "error";
type StylistState = { id: string; status: string; size?: string; note?: string; agentSummary?: string } | null;

export default function TryOnStudio({ products }: { products: Product[] }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const garmentImg = useRef<HTMLImageElement | null>(null);
  const smoothed = useRef<Pt[] | null>(null);
  const worldRef = useRef<Pt[] | undefined>(undefined);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  const [cam, setCam] = useState<CamState>("idle");
  const [camError, setCamError] = useState("");
  const [selected, setSelected] = useState<Product>(products[0]);
  const [size, setSize] = useState(products[0]?.sizes[0] ?? "M");
  const [sizeTouched, setSizeTouched] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [m, setM] = useState<{ shoulderCm?: number; torsoCm?: number }>({});
  const [question, setQuestion] = useState("");
  const [stylist, setStylist] = useState<StylistState>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const { add, items } = useCart();

  const suggested = suggestSize(m.shoulderCm, selected.sizes);

  // Load the garment image whenever the product changes
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = selected.tryOnImageUrl;
    img.onload = () => (garmentImg.current = img);
    return () => {
      img.onload = null;
    };
  }, [selected]);

  // Follow the camera's size suggestion until the shopper picks a size themselves
  useEffect(() => {
    if (!sizeTouched) setSize(suggested);
  }, [suggested, sizeTouched]);

  // keep the render loop reading the latest product without restarting the camera
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const startCamera = useCallback(async () => {
    setCam("loading");
    setCamError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      const landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      setCam("live");

      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      let lastTs = -1;
      let lastMeasure = 0;
      const loop = () => {
        rafRef.current = requestAnimationFrame(loop);
        if (video.readyState < 2) return;
        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        const ts = performance.now();
        if (ts <= lastTs) return;
        lastTs = ts;
        const res = landmarker.detectForVideo(video, ts);

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const lm = res.landmarks?.[0] as Pt[] | undefined;
        if (!lm) {
          smoothed.current = null;
          setTracking(false);
          return;
        }
        smoothed.current = smooth(smoothed.current, lm);
        worldRef.current = res.worldLandmarks?.[0] as Pt[] | undefined;
        const img = garmentImg.current;
        if (img) {
          const t = garmentTransform(smoothed.current, canvas.width, canvas.height, img.naturalWidth || 400, img.naturalHeight || 480, selectedRef.current.fit ?? DEFAULT_FIT);
          if (t) {
            ctx.setTransform(t.a, t.b, t.c, t.d, t.e, t.f);
            ctx.globalAlpha = 0.96;
            ctx.drawImage(img, 0, 0, img.naturalWidth || 400, img.naturalHeight || 480);
            ctx.globalAlpha = 1;
          }
          setTracking(Boolean(t));
        }
        if (ts - lastMeasure > 500) {
          lastMeasure = ts;
          setM(measure(worldRef.current));
        }
      };
      loop();
    } catch (err) {
      const e = err as DOMException;
      setCam(e?.name === "NotAllowedError" ? "denied" : "error");
      setCamError(e?.message ?? String(err));
    }
  }, []);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  // Poll the stylist review until a human answers
  useEffect(() => {
    if (!stylist || stylist.status !== "pending") return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/stylist/${stylist.id}`);
      if (r.ok) {
        const j = await r.json();
        setStylist({ id: stylist.id, ...j });
        if (j.status === "approved" && j.size && selected.sizes.includes(j.size)) {
          setSize(j.size);
          setSizeTouched(true);
        }
      }
    }, 3000);
    return () => clearInterval(t);
  }, [stylist, selected.sizes]);

  function snapshot(): string | undefined {
    const c = canvasRef.current;
    if (!c || cam !== "live") return undefined;
    try {
      const w = 480;
      const off = document.createElement("canvas");
      off.width = w;
      off.height = Math.round((c.height / c.width) * w);
      const octx = off.getContext("2d")!;
      octx.translate(w, 0);
      octx.scale(-1, 1); // store it the way the shopper saw it (mirrored)
      octx.drawImage(c, 0, 0, off.width, off.height);
      return off.toDataURL("image/jpeg", 0.75);
    } catch {
      return undefined; // cross-origin garment image without CORS taints the canvas
    }
  }

  async function askStylist() {
    setBusy(true);
    try {
      const r = await fetch("/api/stylist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: selected.id, suggestedSize: suggested, measurements: m, snapshot: snapshot(), question }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setStylist({ id: j.id, status: "pending" });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function addToCart() {
    add({ productId: selected.id, sku: selected.sku, name: selected.name, size, quantity: 1, unitPricePaise: selected.pricePaise });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  const cartCount = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      {/* Stage */}
      <section className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-neutral-900 shadow-lg">
        <video ref={videoRef} playsInline muted className="hidden" />
        <canvas ref={canvasRef} className="h-full w-full -scale-x-100 object-cover" />
        {cam !== "live" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-white">
            {cam === "loading" ? (
              <p className="animate-pulse text-lg">Starting camera and loading the pose model…</p>
            ) : (
              <>
                <p className="max-w-sm text-lg">
                  Stand back so your shoulders and hips are in frame, then see the garment move with you.
                </p>
                <button onClick={startCamera} className="rounded-full bg-white px-6 py-3 font-semibold text-neutral-900 hover:bg-neutral-200">
                  {cam === "idle" ? "Start live try-on" : "Try again"}
                </button>
                {cam === "denied" && <p className="text-sm text-red-300">Camera permission was blocked. Allow it in your browser&apos;s site settings.</p>}
                {cam === "error" && <p className="text-sm text-red-300">{camError}</p>}
                <p className="text-xs text-neutral-400">Video is processed on your device and never uploaded.</p>
              </>
            )}
          </div>
        )}
        {cam === "live" && (
          <div className="absolute left-3 top-3 flex gap-2 text-xs">
            <span className={`rounded-full px-3 py-1 font-medium ${tracking ? "bg-emerald-500 text-white" : "bg-amber-400 text-neutral-900"}`}>
              {tracking ? "Tracking" : "Step into frame"}
            </span>
            {m.shoulderCm && <span className="rounded-full bg-black/60 px-3 py-1 text-white">Shoulders ≈ {m.shoulderCm} cm</span>}
          </div>
        )}
      </section>

      {/* Panel */}
      <aside className="flex flex-col gap-5">
        <div className="grid grid-cols-4 gap-2">
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setSelected(p);
                setSizeTouched(false);
                setStylist(null);
              }}
              className={`rounded-xl border-2 bg-white p-1 transition ${p.id === selected.id ? "border-neutral-900" : "border-transparent hover:border-neutral-300"}`}
              title={p.name}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.imageUrl} alt={p.name} className="aspect-square w-full object-contain" />
            </button>
          ))}
        </div>

        <div>
          <h2 className="text-xl font-semibold">{selected.name}</h2>
          <p className="text-sm text-neutral-500">{selected.description}</p>
          <p className="mt-1 text-lg font-semibold">{inr(selected.pricePaise)}</p>
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-medium">Size</span>
            <span className="text-xs text-neutral-500">
              {m.shoulderCm ? `Camera suggests ${suggested}` : "Start try-on for a size suggestion"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {selected.sizes.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSize(s);
                  setSizeTouched(true);
                }}
                className={`min-w-12 rounded-lg border px-3 py-2 text-sm font-medium ${s === size ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white hover:border-neutral-500"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={addToCart} className="flex-1 rounded-xl bg-neutral-900 py-3 font-semibold text-white hover:bg-neutral-700">
            {added ? "Added ✓" : `Add ${size} to bag`}
          </button>
          <Link href="/checkout" className="rounded-xl border border-neutral-300 bg-white px-4 py-3 font-semibold hover:border-neutral-500">
            Bag ({cartCount})
          </Link>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <h3 className="font-semibold">Ask a stylist</h3>
          <p className="mb-3 text-xs text-neutral-500">
            An AgenticOrg agent drafts a fit recommendation from your measurements, and a human stylist confirms it.
          </p>
          {!stylist ? (
            <>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. I like a looser fit, should I size up?"
                className="mb-2 w-full rounded-lg border border-neutral-300 p-2 text-sm"
                rows={2}
              />
              <button disabled={busy} onClick={askStylist} className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
                {busy ? "Sending…" : cam === "live" ? "Send my try-on to a stylist" : "Ask without camera"}
              </button>
            </>
          ) : stylist.status === "pending" ? (
            <p className="animate-pulse text-sm text-neutral-600">Waiting for a stylist to review…</p>
          ) : stylist.status === "approved" ? (
            <div className="text-sm">
              <p className="font-semibold text-emerald-700">Stylist recommends size {stylist.size}</p>
              {stylist.note && <p className="mt-1 text-neutral-700">“{stylist.note}”</p>}
            </div>
          ) : (
            <div className="text-sm">
              <p className="font-semibold text-amber-700">The stylist suggests another option</p>
              {stylist.note && <p className="mt-1 text-neutral-700">“{stylist.note}”</p>}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
