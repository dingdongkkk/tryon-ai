"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealTimeClient } from "@decartai/sdk";
import { garmentBlob, prefetchGarment } from "@/lib/garment";

// Decart Lucy VTON realtime try-on.
// Camera → Decart (WebRTC) → transformed stream. The browser only ever holds a short-lived,
// model- and origin-scoped client token minted by /api/decart/token.
// Docs: https://docs.platform.decart.ai/models/realtime/virtual-try-on

export type DecartPhase = "idle" | "starting" | "queued" | "live" | "reconnecting" | "ended" | "error";
export type Garment = { imageUrl: string; prompt: string };

// Access code for reserved (paid) Live AI sessions; sent with every token request.
let accessCode = "";
export function setDecartAccessCode(code: string) {
  accessCode = code.trim();
  try {
    sessionStorage.setItem("tryonai.decartCode", accessCode);
  } catch {}
}
function getAccessCode() {
  if (!accessCode) {
    try {
      accessCode = sessionStorage.getItem("tryonai.decartCode") ?? "";
    } catch {}
  }
  return accessCode;
}
const tokenRequest = () => fetch("/api/decart/token", { method: "POST", headers: { "x-access-code": getAccessCode() } });
/** Tell the server a key ran dry so the next token comes from a backup key. */
const reportExhausted = (keyIndex: number) =>
  fetch("/api/decart/exhausted", { method: "POST", headers: { "content-type": "application/json", "x-access-code": getAccessCode() }, body: JSON.stringify({ keyIndex }) }).catch(() => undefined);
const isCreditProblem = (msg: string) => /credit|quota|insufficient|payment required|402/i.test(msg);

// ── Warm-up ──────────────────────────────────────────────────────────────
// Starting a session needs: a token (a cold server can take ~10 s), the SDK chunk, the camera and the
// garment image. We prefetch the slow parts as soon as the mirror opens and run the rest in parallel.
type TokenReply = { ok: boolean; at: number; apiKey?: string; keyIndex?: number; model?: string; maxSessionSeconds?: number; code?: string; error?: string };
const TOKEN_TTL_MS = 40_000; // server tokens live 60 s; keep a safety margin
let warmToken: Promise<TokenReply> | null = null;
let sdkModule: Promise<typeof import("@decartai/sdk")> | null = null;
const loadSdk = () => (sdkModule ??= import("@decartai/sdk"));
const fetchToken = async (): Promise<TokenReply> => {
  const r = await tokenRequest();
  const j = await r.json().catch(() => ({}));
  return { ...j, ok: r.ok, at: Date.now() };
};
/** Use the prefetched token if it's still fresh, otherwise fetch a new one. */
const takeToken = (): Promise<TokenReply> => {
  const w = warmToken;
  warmToken = null;
  return w ? w.then((t) => (t.ok && Date.now() - t.at < TOKEN_TTL_MS ? t : fetchToken())).catch(fetchToken) : fetchToken();
};
/** Call when Live AI is about to be used: warms the server, the SDK and the garment image. */
export function prewarmDecart(garmentUrl?: string) {
  loadSdk().catch(() => (sdkModule = null));
  warmToken ??= fetchToken().catch(() => ({ ok: false, at: 0 }));
  if (garmentUrl) prefetchGarment(garmentUrl);
}

const END_REASONS: Record<string, string> = {
  insufficient_credits: "Your Decart credits ran out.",
  session_limit: "The try-on session reached its time limit.",
  moderation_violation: "The session was ended by content moderation.",
  policy_violation: "The session was ended by Decart's usage policy.",
};

export function useDecartTryOn() {
  const [phase, setPhase] = useState<DecartPhase>("idle");
  const [error, setError] = useState("");
  const [queue, setQueue] = useState<{ position: number; queueSize: number } | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);

  const rt = useRef<RealTimeClient | null>(null);
  const cam = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const garmentRef = useRef<Garment | null>(null);
  const setSeq = useRef(0);
  const keyIndex = useRef<number | null>(null);
  const creditRetries = useRef(0);
  const transientTried = useRef(false);
  const startRef = useRef<((g: Garment, isRetry?: boolean) => Promise<void>) | null>(null);

  const teardown = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    try {
      rt.current?.disconnect();
    } catch {}
    rt.current = null;
    cam.current?.getTracks().forEach((t) => t.stop());
    cam.current = null;
    setRemoteStream(null);
    setSecondsLeft(null);
    setQueue(null);
  }, []);

  const stop = useCallback(() => {
    teardown();
    setPhase("idle");
  }, [teardown]);

  const start = useCallback(
    async (garment: Garment, isRetry = false) => {
      teardown();
      if (!isRetry) {
        creditRetries.current = 0;
        transientTried.current = false;
      }
      garmentRef.current = garment;
      setError("");
      setPhase("starting");
      try {
        // Everything independent runs at once: token, SDK, garment image, then the camera.
        const tokenP = takeToken();
        const imageP = garmentBlob(garment.imageUrl);
        const { createDecartClient, models } = await loadSdk();
        const model = models.realtime("lucy-vton-latest");
        const fps = typeof model.fps === "number" ? model.fps : (model.fps.ideal ?? model.fps.max ?? 25);
        const camP = navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: "user", frameRate: fps, width: model.width, height: model.height },
        });
        const first = await tokenP;
        setNeedsCode(first.code === "ACCESS_CODE");
        if (!first.ok || !first.apiKey) {
          camP.then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => undefined);
          throw new Error(first.error ?? "Live try-on is unavailable");
        }
        let firstToken: string | null = first.apiKey;
        keyIndex.current = typeof first.keyIndex === "number" ? first.keyIndex : null;
        cam.current = await camP;

        const client = createDecartClient({
          // Fresh short-lived token for every connect/reconnect
          apiKeyProvider: async () => {
            if (firstToken) {
              const t = firstToken;
              firstToken = null;
              return t;
            }
            const r = await tokenRequest();
            const j = await r.json();
            if (!r.ok) throw new Error(j.error ?? "Could not get a try-on token");
            if (typeof j.keyIndex === "number") keyIndex.current = j.keyIndex;
            return j.apiKey;
          },
        });

        const image = await imageP;
        const session = await client.realtime.connect(cam.current, {
          model,
          // Don't let the SDK silently retry ~10× (≈6 s each): fail fast, then we switch key or retry once.
          retries: 0,
          mirror: "auto",
          initialState: { image, prompt: { text: garment.prompt, enhance: false } },
          onRemoteStream: (s) => setRemoteStream(s),
          onConnectionChange: (s) => {
            if (s === "generating" || s === "connected") setPhase("live");
            else if (s === "reconnecting") setPhase("reconnecting");
          },
          onQueuePosition: (q) => {
            setQueue(q);
            setPhase("queued");
          },
        });
        rt.current = session;
        session.on("error", (e) => {
          setError(e.message || "Live try-on hit a problem");
          setPhase("error");
        });
        session.on("sessionEnded", async (e) => {
          teardown();
          // Out of credits on this key: switch to a backup key and reconnect (up to 3 times)
          if (e.reason === "insufficient_credits" && keyIndex.current !== null && creditRetries.current < 3 && garmentRef.current) {
            creditRetries.current++;
            setPhase("reconnecting");
            await reportExhausted(keyIndex.current);
            startRef.current?.(garmentRef.current, true);
            return;
          }
          setError(END_REASONS[e.reason] ?? `Session ended (${e.reason}).`);
          setPhase("ended");
        });

        // Client-side session cap (the token also enforces it server-side)
        const limit = Number(first.maxSessionSeconds) || 300;
        setSecondsLeft(limit);
        timer.current = setInterval(() => {
          setSecondsLeft((s) => {
            if (s === null) return s;
            if (s <= 1) {
              teardown();
              setError(END_REASONS.session_limit);
              setPhase("ended");
              return null;
            }
            return s - 1;
          });
        }, 1000);
        setQueue(null);
        setPhase("live");
      } catch (e) {
        teardown();
        const err = e as DOMException;
        const msg = String(err?.message ?? "");
        if (isCreditProblem(msg) && keyIndex.current !== null && creditRetries.current < 3) {
          // This key is out of credits: tell the server, then reconnect on the next backup key
          creditRetries.current++;
          setPhase("reconnecting");
          await reportExhausted(keyIndex.current);
          return startRef.current?.(garment, true);
        }
        if (!isCreditProblem(msg) && err?.name !== "NotAllowedError" && err?.name !== "NotFoundError" && !transientTried.current) {
          // one quick retry for a flaky network/connect error
          transientTried.current = true;
          setPhase("reconnecting");
          return startRef.current?.(garment, true);
        }
        setError(
          err?.name === "NotAllowedError"
            ? "Camera permission is blocked. Allow camera access for this site and try again."
            : err?.name === "NotFoundError"
              ? "No camera was found on this device."
              : err?.message || "Couldn't start live try-on",
        );
        setPhase("error");
      }
    },
    [teardown],
  );

  useEffect(() => {
    startRef.current = start;
  }, [start]);

  /** Swap the garment on the running session, no reconnect. set() replaces state, so send everything. */
  const changeGarment = useCallback(async (garment: Garment) => {
    garmentRef.current = garment;
    if (!rt.current) return;
    const seq = ++setSeq.current;
    setApplying(true);
    try {
      const image = await garmentBlob(garment.imageUrl);
      if (seq !== setSeq.current || !rt.current) return; // a newer pick superseded this one
      await rt.current.set({ prompt: garment.prompt, image, enhance: false });
    } catch (e) {
      setError((e as Error).message || "Couldn't switch garment");
    } finally {
      if (seq === setSeq.current) setApplying(false);
    }
  }, []);

  // Cleanup on unmount, tab close and bfcache navigation
  useEffect(() => {
    const onHide = () => teardown();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      teardown();
    };
  }, [teardown]);

  return { phase, error, queue, remoteStream, secondsLeft, applying, needsCode, start, stop, changeGarment };
}
