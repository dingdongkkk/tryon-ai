import "server-only";
import { createDecartClient } from "@decartai/sdk";
import { config } from "./config";
import { store } from "./store";

// Decart key rotation: use the primary key until it runs out of credits, then the backups in order.
// Exhausted keys are remembered in settings (shared across server instances) and retried after a cooldown.

const SETTING = "decart_exhausted";
const COOLDOWN_MS = 6 * 60 * 60 * 1000;
type Exhausted = Record<string, number>; // key fingerprint → when it was marked

const fingerprint = (k: string) => k.slice(0, 12);

async function exhausted(): Promise<Exhausted> {
  const all = (await store.getSetting<Exhausted>(SETTING)) ?? {};
  const t = Date.now();
  return Object.fromEntries(Object.entries(all).filter(([, at]) => t - at < COOLDOWN_MS));
}

export async function markExhausted(keyIndex: number) {
  const key = config.decart.apiKeys[keyIndex];
  if (!key) return;
  const all = await exhausted();
  all[fingerprint(key)] = Date.now();
  await store.setSetting(SETTING, all);
}

const isCreditOrAuthError = (e: unknown) => /credit|quota|payment|402|401|403|unauthori|invalid api key|forbidden/i.test(String((e as Error)?.message ?? e));

/** Mint a scoped client token, falling through to backup keys when one is out of credits or rejected. */
export async function mintToken() {
  const keys = config.decart.apiKeys;
  const skip = await exhausted();
  const order = keys.map((k, i) => ({ k, i })).sort((a, b) => Number(Boolean(skip[fingerprint(a.k)])) - Number(Boolean(skip[fingerprint(b.k)])) || a.i - b.i);
  let lastError: unknown;
  for (const { k, i } of order) {
    try {
      const token = await createDecartClient({ apiKey: k }).tokens.create({
        expiresIn: 60,
        allowedModels: [config.decart.model],
        allowedOrigins: [new URL(config.appUrl).origin],
        constraints: { realtime: { maxSessionDuration: config.decart.maxSessionSeconds } },
        metadata: { app: "tryon-ai" },
      });
      return { apiKey: token.apiKey, expiresAt: token.expiresAt, keyIndex: i, keysLeft: keys.length - Object.keys(skip).length };
    } catch (e) {
      lastError = e;
      if (isCreditOrAuthError(e)) await markExhausted(i);
      else throw e;
    }
  }
  throw new Error(`All Decart keys are unavailable: ${String((lastError as Error)?.message ?? lastError).slice(0, 160)}`);
}
