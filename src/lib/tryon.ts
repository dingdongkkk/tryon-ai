import type { GarmentFit } from "./types";

// Pure geometry for the live overlay. MediaPipe Pose indices:
// 0 nose, 11 L shoulder, 12 R shoulder, 23 L hip, 24 R hip (person's left/right).
export type Pt = { x: number; y: number; z?: number; visibility?: number };

export const LM = { nose: 0, lShoulder: 11, rShoulder: 12, lHip: 23, rHip: 24 } as const;

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

/** Exponential smoothing to stop the garment jittering frame to frame. */
export function smooth(prev: Pt[] | null, next: Pt[], alpha = 0.45): Pt[] {
  if (!prev || prev.length !== next.length) return next;
  return next.map((p, i) => ({
    x: prev[i].x + (p.x - prev[i].x) * alpha,
    y: prev[i].y + (p.y - prev[i].y) * alpha,
    z: (prev[i].z ?? 0) + ((p.z ?? 0) - (prev[i].z ?? 0)) * alpha,
    visibility: p.visibility,
  }));
}

export type GarmentTransform = { a: number; b: number; c: number; d: number; e: number; f: number };

/**
 * Affine transform mapping garment-image pixels onto the video frame so that the garment's
 * shoulder anchors land on the person's shoulders and its hip line lands on their hips.
 * The person faces the camera, so their RIGHT shoulder is on the image's LEFT.
 */
export function garmentTransform(
  lm: Pt[],
  frameW: number,
  frameH: number,
  imgW: number,
  imgH: number,
  fit: GarmentFit,
  ease = 1.12, // garments sit slightly wider than the shoulder joints
): GarmentTransform | null {
  const ls = lm[LM.lShoulder], rs = lm[LM.rShoulder], lh = lm[LM.lHip], rh = lm[LM.rHip];
  if (!ls || !rs || (ls.visibility ?? 1) < 0.5 || (rs.visibility ?? 1) < 0.5) return null;

  const px = (p: Pt) => ({ x: p.x * frameW, y: p.y * frameH });
  const L = px(rs); // image-left
  const R = px(ls); // image-right
  const S = { x: (L.x + R.x) / 2, y: (L.y + R.y) / 2 };
  const shoulderPx = Math.hypot(R.x - L.x, R.y - L.y);
  const angle = Math.atan2(R.y - L.y, R.x - L.x);

  // Torso length: use hips when visible, otherwise assume a typical 1.45x shoulder width.
  const hipsVisible = lh && rh && (lh.visibility ?? 1) > 0.4 && (rh.visibility ?? 1) > 0.4;
  let torsoPx = shoulderPx * 1.45;
  if (hipsVisible) {
    const H = mid(px(lh), px(rh));
    // project hip midpoint onto the axis perpendicular to the shoulders
    torsoPx = Math.abs((H.x - S.x) * -Math.sin(angle) + (H.y - S.y) * Math.cos(angle));
  }

  const gShoulderSpan = (fit.shoulderRX - fit.shoulderLX) * imgW;
  const gTorso = (fit.hipY - fit.shoulderY) * imgH;
  const sx = (shoulderPx * ease) / gShoulderSpan;
  const sy = torsoPx / gTorso;
  const anchorX = ((fit.shoulderLX + fit.shoulderRX) / 2) * imgW;
  const anchorY = fit.shoulderY * imgH;

  // M = T(S) · R(angle) · Scale(sx, sy) · T(-anchor)
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const a = cos * sx, b = sin * sx, c = -sin * sy, d = cos * sy;
  return { a, b, c, d, e: S.x - (a * anchorX + c * anchorY), f: S.y - (b * anchorX + d * anchorY) };
}

/**
 * Rough body measurements from MediaPipe world landmarks (metres, hip-centred).
 * Biacromial (joint-to-joint) shoulder width is what MediaPipe tracks, so sizes are tuned to that.
 */
export function measure(world: Pt[] | undefined): { shoulderCm?: number; torsoCm?: number } {
  if (!world?.length) return {};
  const ls = world[LM.lShoulder], rs = world[LM.rShoulder], lh = world[LM.lHip], rh = world[LM.rHip];
  if (!ls || !rs) return {};
  const shoulderCm = Math.round(dist(ls, rs) * 1000) / 10;
  const torsoCm = lh && rh ? Math.round(dist(mid(ls, rs), mid(lh, rh)) * 1000) / 10 : undefined;
  return { shoulderCm, torsoCm };
}

const SIZE_BANDS: [number, string][] = [
  [30, "XS"],
  [33, "S"],
  [36, "M"],
  [39, "L"],
  [42, "XL"],
  [Infinity, "XXL"],
];

export function suggestSize(shoulderCm: number | undefined, available: string[]) {
  if (!shoulderCm) return available[Math.floor(available.length / 2)] ?? "M";
  const want = SIZE_BANDS.find(([max]) => shoulderCm < max)?.[1] ?? "M";
  if (available.includes(want)) return want;
  const order = SIZE_BANDS.map(([, s]) => s);
  const idx = order.indexOf(want);
  // nearest available size, preferring one up
  for (let off = 1; off < order.length; off++) {
    if (available.includes(order[idx + off])) return order[idx + off];
    if (available.includes(order[idx - off])) return order[idx - off];
  }
  return available[0];
}
