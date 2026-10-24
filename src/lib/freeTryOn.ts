import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client, handle_file } from "@gradio/client";
import { config } from "./config";
import type { Product } from "./types";

// Free photo try-on: IDM-VTON (https://huggingface.co/spaces/yisol/IDM-VTON) on Hugging Face ZeroGPU.
// Person photo + garment photo → photoreal try-on image (~15–60 s). Free, but quota-limited per
// caller; a free HF_TOKEN raises the quota. Decart stays the real-time option.

let client: Promise<Client> | null = null;
function getClient() {
  client ??= Client.connect(config.freeTryOn.space, config.freeTryOn.hfToken ? { token: config.freeTryOn.hfToken as `hf_${string}` } : undefined).catch((e) => {
    client = null;
    throw e;
  });
  return client;
}

async function garmentBytes(p: Product) {
  const url = p.tryOnImageUrl;
  if (url.startsWith("/")) return readFile(path.join(process.cwd(), "public", url));
  const res = await fetch(url);
  if (!res.ok) throw new Error("Couldn't load the garment image");
  return Buffer.from(await res.arrayBuffer());
}

const mime = (u: string) => (u.endsWith(".png") ? "image/png" : u.endsWith(".webp") ? "image/webp" : "image/jpeg");

export class FreeTryOnError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export async function runFreeTryOn(person: Blob, product: Product): Promise<{ bytes: Buffer; type: string }> {
  const garment = await garmentBytes(product);
  const app = await getClient();
  const job = app.predict("/tryon", {
    dict: { background: handle_file(person), layers: [], composite: null },
    garm_img: handle_file(new Blob([new Uint8Array(garment)], { type: mime(product.tryOnImageUrl) })),
    garment_des: `${product.color.name} ${product.name}`.toLowerCase(),
    is_checked: true, // auto-mask the clothing region
    is_checked_crop: false, // keep the full frame (cropping leaves a seam)
    denoise_steps: 30,
    seed: 42,
  });
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new FreeTryOnError("The free try-on took too long. Please try again.", 504)), 150_000));
  let res: { data: unknown };
  try {
    res = (await Promise.race([job, timeout])) as { data: unknown };
  } catch (e) {
    const msg = String((e as { message?: string })?.message ?? e);
    if (/quota|exceeded|GPU|ZeroGPU/i.test(msg)) throw new FreeTryOnError("The free try-on is busy or its daily GPU quota is used up. Please try again in a little while.", 429);
    if (e instanceof FreeTryOnError) throw e;
    throw new FreeTryOnError(`Free try-on failed: ${msg.slice(0, 200)}`);
  }
  const out = (res.data as { url?: string }[])?.[0]?.url;
  if (!out) throw new FreeTryOnError("The free try-on returned no image");
  const img = await fetch(out);
  if (!img.ok) throw new FreeTryOnError("Couldn't download the try-on image");
  return { bytes: Buffer.from(await img.arrayBuffer()), type: img.headers.get("content-type") ?? "image/png" };
}
