"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useDecartTryOn, setDecartAccessCode, prewarmDecart, type DecartPhase } from "@/hooks/useDecartTryOn";
import { usePhotoTryOn, type PhotoPhase } from "@/hooks/usePhotoTryOn";
import { catalog } from "@/lib/catalog";
import type { Product } from "@/lib/types";

// One try-on session for the whole app, living in the root layout so it survives navigation.
//  - "photo": free photo try-on (IDM-VTON). Default for everyone.
//  - "decart": real-time Live AI (Decart). Paid; optionally gated by an access code.

export type MirrorMode = "decart" | "photo";
export type MirrorView = "closed" | "dock" | "full";

type Ctx = {
  garment: Product;
  tried: Product[];
  mode: MirrorMode;
  view: MirrorView;
  decartAvailable: boolean;
  freeAvailable: boolean;
  /** something is showing the shopper wearing the garment (live video or a generated still) */
  live: boolean;
  busy: boolean;
  failed: boolean;
  error: string;
  // decart
  decartPhase: DecartPhase;
  needsCode: boolean;
  queue: { position: number; queueSize: number } | null;
  secondsLeft: number | null;
  applying: boolean;
  remoteStream: MediaStream | null;
  // photo
  photoPhase: PhotoPhase;
  photoUrl: string | null;
  resultUrl: string | null;
  pendingId: string | null;
  generatingSince: number | null;
  openCamera: () => void;
  capturePhoto: () => void;
  uploadPhoto: (f: File) => void;
  resetPhoto: () => void;
  // actions
  tryOn: (p: Product, opts?: { open?: MirrorView }) => void;
  start: () => void;
  stop: () => void;
  submitAccessCode: (code: string) => void;
  setMode: (m: MirrorMode) => void;
  setView: (v: MirrorView) => void;
  captureFrame: () => string | undefined;
  hint: () => Record<string, number> | undefined;
  bagOpen: boolean;
  setBagOpen: (b: boolean) => void;
  stylistOpen: boolean;
  setStylistOpen: (b: boolean) => void;
};

const TryOnContext = createContext<Ctx | null>(null);
export const useTryOn = () => {
  const c = useContext(TryOnContext);
  if (!c) throw new Error("useTryOn must be used inside <TryOnProvider>");
  return c;
};

type Refs = { videoRef: RefObject<HTMLVideoElement | null>; camRef: RefObject<HTMLVideoElement | null> };
const RefsContext = createContext<Refs | null>(null);
/** The mirror's media elements, kept apart from render state (only MirrorDock attaches them). */
export const useMirrorRefs = () => useContext(RefsContext)!;

export default function TryOnProvider({ children, decartAvailable, freeAvailable }: { children: ReactNode; decartAvailable: boolean; freeAvailable: boolean }) {
  const [garment, setGarment] = useState<Product>(catalog[0]);
  const [tried, setTried] = useState<Product[]>([]);
  const [mode, setModeState] = useState<MirrorMode>(freeAvailable || !decartAvailable ? "photo" : "decart");
  const [view, setView] = useState<MirrorView>("closed");
  const [bagOpen, setBagOpen] = useState(false);
  const [stylistOpen, setStylistOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const camRef = useRef<HTMLVideoElement>(null);

  const decart = useDecartTryOn();
  const photo = usePhotoTryOn(camRef);
  const resultUrl = photo.results[garment.id] ?? null;

  const live = mode === "decart" ? decart.phase === "live" : Boolean(resultUrl);
  const busy = mode === "decart" ? ["starting", "queued", "reconnecting"].includes(decart.phase) : photo.phase === "generating";
  const failed = mode === "decart" ? ["error", "ended"].includes(decart.phase) : photo.phase === "error";
  const error = mode === "decart" ? decart.error : photo.error;

  const liveRef = useRef(false);
  const busyRef = useRef(busy);
  useEffect(() => {
    liveRef.current = mode === "decart" && decart.phase === "live";
    busyRef.current = busy;
  }, [mode, decart.phase, busy]);

  const start = useCallback(() => {
    if (mode === "decart") {
      if (decartAvailable) decart.start({ imageUrl: garment.tryOnImageUrl, prompt: garment.tryOnPrompt });
    } else if (photo.hasPhoto) photo.generate(garment);
    else photo.openCamera();
  }, [mode, decartAvailable, decart, photo, garment]);

  const stop = useCallback(() => {
    decart.stop();
    photo.stopCamera();
  }, [decart, photo]);

  // Warm Decart (server token, SDK, garment image) as soon as Live AI is in view
  useEffect(() => {
    if (view !== "closed" && mode === "decart" && decartAvailable) prewarmDecart(garment.tryOnImageUrl);
  }, [view, mode, decartAvailable, garment.tryOnImageUrl]);

  const tryOn = useCallback(
    (p: Product, opts?: { open?: MirrorView }) => {
      setGarment(p);
      setTried((t) => [p, ...t.filter((x) => x.id !== p.id)].slice(0, 8));
      setView((v) => (opts?.open ? opts.open : v === "closed" ? "dock" : v));
      if (mode === "decart") {
        if (liveRef.current) decart.changeGarment({ imageUrl: p.tryOnImageUrl, prompt: p.tryOnPrompt });
        else if (!busyRef.current && decartAvailable && !decart.needsCode) decart.start({ imageUrl: p.tryOnImageUrl, prompt: p.tryOnPrompt });
      } else if (photo.hasPhoto && !photo.results[p.id]) {
        photo.generate(p);
      }
    },
    [mode, decart, decartAvailable, photo],
  );

  const submitAccessCode = useCallback(
    (code: string) => {
      setDecartAccessCode(code);
      decart.start({ imageUrl: garment.tryOnImageUrl, prompt: garment.tryOnPrompt });
    },
    [decart, garment],
  );

  const setMode = useCallback(
    (m: MirrorMode) => {
      if (m === mode) return;
      decart.stop();
      photo.stopCamera();
      setModeState(m);
    },
    [mode, decart, photo],
  );

  /** Still image of the current look, for the stylist (only sent with consent). */
  const captureFrame = useCallback(() => {
    const draw = (src: CanvasImageSource, w: number, h: number) => {
      const c = document.createElement("canvas");
      c.width = 480;
      c.height = Math.round((h / w) * 480);
      c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
      try {
        return c.toDataURL("image/jpeg", 0.8);
      } catch {
        return undefined;
      }
    };
    if (mode === "photo") {
      const img = document.querySelector<HTMLImageElement>("img[data-tryon-result]");
      return img?.naturalWidth ? draw(img, img.naturalWidth, img.naturalHeight) : undefined;
    }
    const v = videoRef.current;
    return v?.videoWidth && live ? draw(v, v.videoWidth, v.videoHeight) : undefined;
  }, [mode, live]);

  const hint = useCallback(() => undefined, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setBagOpen(false);
      setStylistOpen(false);
      setView((v) => (v === "full" ? "dock" : v));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      garment, tried, mode, view, decartAvailable, freeAvailable, live, busy, failed, error,
      decartPhase: decart.phase, needsCode: decart.needsCode, queue: decart.queue, secondsLeft: decart.secondsLeft, applying: decart.applying, remoteStream: decart.remoteStream,
      photoPhase: photo.phase, photoUrl: photo.photoUrl, resultUrl, pendingId: photo.pending, generatingSince: photo.startedAt,
      openCamera: photo.openCamera, capturePhoto: photo.capture, uploadPhoto: photo.upload, resetPhoto: photo.reset,
      tryOn, start, stop, submitAccessCode, setMode, setView, captureFrame, hint, bagOpen, setBagOpen, stylistOpen, setStylistOpen,
    }),
    [garment, tried, mode, view, decartAvailable, freeAvailable, live, busy, failed, error, decart.phase, decart.needsCode, decart.queue, decart.secondsLeft, decart.applying, decart.remoteStream, photo.phase, photo.photoUrl, resultUrl, photo.pending, photo.startedAt, photo.openCamera, photo.capture, photo.upload, photo.reset, tryOn, start, stop, submitAccessCode, setMode, captureFrame, hint, bagOpen, stylistOpen],
  );
  const refs = useMemo(() => ({ videoRef, camRef }), []);

  return (
    <RefsContext.Provider value={refs}>
      <TryOnContext.Provider value={value}>{children}</TryOnContext.Provider>
    </RefsContext.Provider>
  );
}
