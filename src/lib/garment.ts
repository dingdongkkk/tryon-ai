"use client";

// Decart accepts JPEG/PNG/WebP garment references (≥512px, plain background).
// We send a 576px JPEG on white (~50–80 KB): big enough for detail, small enough to upload fast.
// Results are cached per URL, and `prefetchGarment` lets the UI prepare them before they're needed.
const SIZE = 576;
const cache = new Map<string, Promise<Blob>>();

export function garmentBlob(url: string): Promise<Blob> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise<Blob>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = c.height = SIZE;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, SIZE, SIZE);
        const w = img.naturalWidth || SIZE;
        const h = img.naturalHeight || SIZE;
        const scale = Math.min((SIZE * 0.94) / w, (SIZE * 0.94) / h);
        ctx.drawImage(img, (SIZE - w * scale) / 2, (SIZE - h * scale) / 2, w * scale, h * scale);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not prepare garment image"))), "image/jpeg", 0.86);
      };
      img.onerror = () => reject(new Error("Could not load garment image"));
      img.src = url;
    });
    cache.set(url, p);
    p.catch(() => cache.delete(url));
  }
  return p;
}

/** Fire-and-forget warm-up (e.g. on hover or when the mirror opens). */
export function prefetchGarment(url: string) {
  garmentBlob(url).catch(() => undefined);
}
