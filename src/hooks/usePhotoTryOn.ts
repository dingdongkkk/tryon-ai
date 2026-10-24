"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Product } from "@/lib/types";

// Free photo try-on: take or upload one photo, then every "Try on" renders a photoreal still via
// /api/tryon/free (IDM-VTON). Results are cached per product for the current photo.

export type PhotoPhase = "idle" | "camera" | "ready" | "generating" | "error";

export function usePhotoTryOn(camRef: RefObject<HTMLVideoElement | null>) {
  const [phase, setPhase] = useState<PhotoPhase>("idle");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const photo = useRef<Blob | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const seq = useRef(0);
  const urls = useRef<string[]>([]);
  const track = (u: string) => (urls.current.push(u), u);

  const stopCamera = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (camRef.current) camRef.current.srcObject = null;
  }, [camRef]);

  const openCamera = useCallback(async () => {
    setError("");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1600 } }, audio: false });
      if (camRef.current) {
        camRef.current.srcObject = stream.current;
        await camRef.current.play().catch(() => undefined);
      }
      setPhase("camera");
    } catch (e) {
      const err = e as DOMException;
      setError(err?.name === "NotAllowedError" ? "Camera access is blocked. Allow it in your browser, or upload a photo instead." : err?.name === "NotFoundError" ? "No camera found. Upload a photo instead." : err?.message || "Couldn't open the camera");
      setPhase("error");
    }
  }, [camRef]);

  const adoptPhoto = useCallback((blob: Blob) => {
    photo.current = blob;
    setPhotoUrl(track(URL.createObjectURL(blob)));
    setResults({});
    setError("");
    setPhase("ready");
  }, []);

  /** Capture the current camera frame (un-mirrored: the model wants the real orientation). */
  const capture = useCallback(async () => {
    const v = camRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    const scale = Math.min(1, 1024 / v.videoHeight);
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.9));
    stopCamera();
    if (blob) adoptPhoto(blob);
  }, [camRef, stopCamera, adoptPhoto]);

  const upload = useCallback((file: File) => {
    stopCamera();
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setError("Please choose a JPEG, PNG or WebP photo");
      setPhase("error");
      return;
    }
    adoptPhoto(file);
  }, [stopCamera, adoptPhoto]);

  const generate = useCallback(async (p: Product) => {
    if (!photo.current) return;
    const id = ++seq.current; // latest pick wins
    setPending(p.id);
    setStartedAt(Date.now());
    setPhase("generating");
    setError("");
    try {
      const body = new FormData();
      body.append("person", photo.current, "person.jpg");
      body.append("productId", p.id);
      const r = await fetch("/api/tryon/free", { method: "POST", body });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Try-on failed");
      const url = track(URL.createObjectURL(await r.blob()));
      setResults((m) => ({ ...m, [p.id]: url }));
      if (id === seq.current) setPhase("ready");
    } catch (e) {
      if (id === seq.current) {
        setError((e as Error).message);
        setPhase("error");
      }
    } finally {
      if (id === seq.current) {
        setPending(null);
        setStartedAt(null);
      }
    }
  }, []);

  const reset = useCallback(() => {
    stopCamera();
    photo.current = null;
    seq.current++;
    setPhotoUrl(null);
    setResults({});
    setPending(null);
    setError("");
    setPhase("idle");
  }, [stopCamera]);

  useEffect(() => {
    const all = urls.current;
    window.addEventListener("pagehide", stopCamera);
    return () => {
      window.removeEventListener("pagehide", stopCamera);
      stopCamera();
      all.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [stopCamera]);

  return { phase, photoUrl, hasPhoto: Boolean(photoUrl), results, pending, error, startedAt, openCamera, capture, upload, generate, reset, stopCamera };
}
