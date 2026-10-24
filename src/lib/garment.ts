"use client";

// Decart accepts JPEG/PNG/WebP garment references (≥512px, plain background).
// Rasterize any catalog image (including SVG illustrations) onto a white square PNG.
const cache = new Map<string, Promise<Blob>>();

export function garmentBlob(url: string, size = 768): Promise<Blob> {
  if (!cache.has(url)) {
    cache.set(
      url,
      new Promise<Blob>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = c.height = size;
          const ctx = c.getContext("2d")!;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, size, size);
          const w = img.naturalWidth || size;
          const h = img.naturalHeight || size;
          const scale = Math.min((size * 0.9) / w, (size * 0.9) / h);
          ctx.drawImage(img, (size - w * scale) / 2, (size - h * scale) / 2, w * scale, h * scale);
          c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not prepare garment image"))), "image/png");
        };
        img.onerror = () => reject(new Error("Could not load garment image"));
        img.src = url;
      }),
    );
    cache.get(url)!.catch(() => cache.delete(url));
  }
  return cache.get(url)!;
}
