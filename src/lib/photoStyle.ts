"use client";

// On-device style read of a shopper's photo: the outfit's dominant colours (named), plus whether the
// look is warm/cool and light/dark. Runs entirely in the browser; only this small profile leaves it.

export type StyleProfile = {
  outfitColors: { name: string; hex: string; share: number }[];
  temperature: "warm" | "cool" | "neutral";
  brightness: "light" | "mid" | "dark";
  contrast: "low" | "high";
};

const NAMED: [string, [number, number, number]][] = [
  ["black", [20, 20, 22]], ["charcoal", [60, 60, 64]], ["grey", [128, 128, 130]], ["white", [240, 240, 236]],
  ["cream", [236, 226, 204]], ["beige", [210, 190, 160]], ["tan", [180, 130, 90]], ["brown", [110, 70, 45]],
  ["navy", [30, 40, 80]], ["blue", [50, 90, 180]], ["sky blue", [150, 190, 225]], ["teal", [30, 120, 120]],
  ["olive", [100, 105, 55]], ["green", [50, 130, 70]], ["mustard", [200, 160, 40]], ["yellow", [235, 210, 60]],
  ["orange", [230, 120, 50]], ["red", [200, 40, 40]], ["maroon", [110, 25, 40]], ["pink", [230, 150, 170]],
  ["purple", [110, 60, 140]], ["plum", [90, 30, 60]],
];

const hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const dist = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const nameOf = (c: number[]) => NAMED.reduce((best, n) => (dist(c, n[1]) < dist(c, best[1]) ? n : best))[0];

/** Small k-means over pixels from the torso region (where the outfit usually is). */
function clusters(px: number[][], k = 4, iters = 8) {
  let centers = px.filter((_, i) => i % Math.max(1, Math.floor(px.length / k)) === 0).slice(0, k);
  let assign: number[] = [];
  for (let it = 0; it < iters; it++) {
    assign = px.map((p) => centers.reduce((bi, c, i) => (dist(p, c) < dist(p, centers[bi]) ? i : bi), 0));
    centers = centers.map((c, i) => {
      const mine = px.filter((_, j) => assign[j] === i);
      if (!mine.length) return c;
      return [0, 1, 2].map((d) => mine.reduce((s, p) => s + p[d], 0) / mine.length);
    });
  }
  return centers.map((c, i) => ({ c, n: assign.filter((a) => a === i).length })).sort((a, b) => b.n - a.n);
}

export async function analyzePhoto(file: Blob): Promise<StyleProfile> {
  const bmp = await createImageBitmap(file);
  const W = 72;
  const H = Math.max(1, Math.round((bmp.height / bmp.width) * W));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, W, H);
  bmp.close?.();
  const { data } = ctx.getImageData(0, 0, W, H);

  // torso box: middle 60% horizontally, 32%–92% vertically
  const px: number[][] = [];
  let lumSum = 0, lumSq = 0, warm = 0, cool = 0;
  for (let y = Math.floor(H * 0.32); y < Math.floor(H * 0.92); y++) {
    for (let x = Math.floor(W * 0.2); x < Math.floor(W * 0.8); x++) {
      const i = (y * W + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      px.push([r, g, b]);
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      lumSum += l;
      lumSq += l * l;
      if (r - b > 18) warm++;
      else if (b - r > 18) cool++;
    }
  }
  const n = px.length || 1;
  const mean = lumSum / n;
  const sd = Math.sqrt(Math.max(0, lumSq / n - mean * mean));

  const merged = new Map<string, { name: string; hex: string; n: number }>();
  for (const { c, n: count } of clusters(px)) {
    const name = nameOf(c);
    const prev = merged.get(name);
    merged.set(name, prev ? { ...prev, n: prev.n + count } : { name, hex: hex(c[0], c[1], c[2]), n: count });
  }
  const outfitColors = [...merged.values()]
    .map((m) => ({ name: m.name, hex: m.hex, share: Math.round((m.n / n) * 100) }))
    .filter((m) => m.share >= 8)
    .sort((a, b) => b.share - a.share)
    .slice(0, 3);

  return {
    outfitColors,
    temperature: warm > cool * 1.3 ? "warm" : cool > warm * 1.3 ? "cool" : "neutral",
    brightness: mean > 165 ? "light" : mean < 85 ? "dark" : "mid",
    contrast: sd > 55 ? "high" : "low",
  };
}

export const describeProfile = (p: StyleProfile) =>
  `Outfit colours: ${p.outfitColors.map((c) => `${c.name} (${c.share}%)`).join(", ") || "unclear"}; overall ${p.temperature}, ${p.brightness} tones, ${p.contrast} contrast.`;
