import { NextResponse } from "next/server";
import { concierge } from "@/lib/agenticorg";
import { assertSameOrigin, rateLimit } from "@/lib/access";
import { jsonError } from "@/lib/http";
import type { PhotoProfile } from "@/lib/agenticorg";

const WORD = /^[a-z ]{1,20}$/;
/** Accept only the small on-device colour profile (never the image itself). */
function parsePhoto(p: unknown): PhotoProfile | undefined {
  if (!p || typeof p !== "object") return undefined;
  const o = p as Record<string, unknown>;
  const colors = (Array.isArray(o.outfitColors) ? o.outfitColors : [])
    .slice(0, 4)
    .map((c) => ({ name: String((c as { name?: unknown }).name ?? "").toLowerCase(), share: Math.round(Number((c as { share?: unknown }).share) || 0) }))
    .filter((c) => WORD.test(c.name) && c.share > 0 && c.share <= 100);
  const pick = (v: unknown, ok: string[]) => (ok.includes(String(v)) ? String(v) : ok[ok.length - 1]);
  return {
    outfitColors: colors,
    temperature: pick(o.temperature, ["warm", "cool", "neutral"]),
    brightness: pick(o.brightness, ["light", "dark", "mid"]),
    contrast: pick(o.contrast, ["high", "low"]),
  };
}

// AI Stylist Concierge (AgenticOrg). Read-only advice grounded in the local catalog.
export async function POST(req: Request) {
  try {
    await assertSameOrigin();
    await rateLimit("concierge", 20, 60_000);
    const body = await req.json();
    const photo = parsePhoto(body?.photo);
    const message = String(body?.message ?? "").trim().slice(0, 500) || (photo ? "What would go well with this look?" : "");
    if (!message) throw new Error("Say something to the stylist");
    const history = (Array.isArray(body?.history) ? body.history : [])
      .slice(-8)
      .map((h: { role?: string; text?: string }) => ({ role: h.role === "assistant" ? "assistant" : "user", text: String(h.text ?? "").slice(0, 500) }));
    return NextResponse.json(await concierge(message, history, photo));
  } catch (err) {
    return jsonError(err);
  }
}
