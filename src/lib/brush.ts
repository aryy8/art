/**
 * A small procedural watercolour painter for Canvas2D.
 *
 * Pieces paint a static base once at load onto an opaque white canvas with
 * `multiply` glazes (overlaps darken like transparent pigment), then animate it on
 * the GPU by displacing how it is sampled. Each laid wash gets:
 *   - a hard, slightly wobbly wet edge with a darker dried rim (pigment migrates there),
 *   - pooling toward one side and optional wet-in-wet bleeds of a second colour,
 *   - granulation (clumpy specks that settle in the paper) for the heavier pigments.
 * Brush strokes vary in pressure, width and length, start bluntly, lift off with a
 * taper and now and then break into a dry-brush flick.
 */

export type RGB = [number, number, number];
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1D value noise in -1..1. */
export function noise1(rng: Rng): (x: number) => number {
  const v = Float32Array.from({ length: 512 }, () => rng() * 2 - 1);
  return (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    const a = v[((i % 512) + 512) % 512];
    const b = v[(((i + 1) % 512) + 512) % 512];
    return a + (b - a) * u;
  };
}

export const rgb = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export interface Shape {
  path: Path2D;
  /** bounding box x, y, w, h */
  box: [number, number, number, number];
  /** fill with the even-odd rule (rings, washes painted around a reserved shape) */
  evenodd?: boolean;
}

export interface WashOpts {
  color: RGB;
  alpha: number;
  /** strength of the dried dark rim, 0..1 (relative to alpha) */
  rim?: number;
  /** rim width in px */
  rimW?: number;
  /** granulation strength 0..1 */
  gran?: number;
  /** blur radius in px for a soft, wet-into-wet edge (disables the hard rim) */
  soft?: number;
  /** pigment settling toward an edge: positive = bottom, negative = top */
  pool?: number;
  /** a second colour bleeding in from one side */
  bleed?: { color: RGB; alpha: number; side: "left" | "right" | "top" | "bottom"; extent: number };
}

export class Painter {
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  private granCache = new Map<string, CanvasPattern>();
  constructor(readonly W: number, readonly H: number, readonly rng: Rng) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext("2d", { willReadFrequently: false })!;
    this.g.fillStyle = "#fff";
    this.g.fillRect(0, 0, W, H);
  }

  /** A tinted, clumpy granulation tile for `c`. */
  private granPattern(c: RGB): CanvasPattern {
    const key = c.map((v) => v >> 3).join(",");
    let p = this.granCache.get(key);
    if (p) return p;
    const S = 384;
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const g = cv.getContext("2d")!;
    const img = g.createImageData(S, S);
    const r = mulberry32(key.length * 977 + c[0] * 31 + c[1] * 7 + c[2]);
    // value noise lattice at a few scales, tileable
    const lat = (n: number) => {
      const v = Float32Array.from({ length: n * n }, () => r());
      return (x: number, y: number) => {
        const fx = (x / S) * n, fy = (y / S) * n;
        const ix = Math.floor(fx), iy = Math.floor(fy);
        const ux = fx - ix, uy = fy - iy;
        const sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy);
        const at = (i: number, j: number) => v[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
        const a = at(ix, iy), b = at(ix + 1, iy), cc = at(ix, iy + 1), d = at(ix + 1, iy + 1);
        return a + (b - a) * sx + (cc - a) * sy + (a - b - cc + d) * sx * sy;
      };
    };
    const n1 = lat(96), n2 = lat(48), n3 = lat(12), n4 = lat(192);
    const dark: RGB = [c[0] * 0.55, c[1] * 0.55, c[2] * 0.62];
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const v = n4(x, y) * 0.5 + n1(x, y) * 0.3 + n2(x, y) * 0.12 + n3(x, y) * 0.08;
        const speck = smooth(0.52, 0.74, v + (n3(x, y) - 0.5) * 0.45 + (r() - 0.5) * 0.1);
        const k = (y * S + x) * 4;
        img.data[k] = 255 + (dark[0] - 255) * speck;
        img.data[k + 1] = 255 + (dark[1] - 255) * speck;
        img.data[k + 2] = 255 + (dark[2] - 255) * speck;
        img.data[k + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    p = this.g.createPattern(cv, "repeat")!;
    this.granCache.set(key, p);
    return p;
  }

  /** Lay a transparent wash in `shape`. */
  wash(shape: Shape, o: WashOpts) {
    const g = this.g;
    const [bx, by, bw, bh] = shape.box;
    g.save();
    g.globalCompositeOperation = "multiply";
    if (o.soft) g.filter = `blur(${o.soft}px)`;
    g.globalAlpha = o.alpha;
    g.fillStyle = rgb(o.color);
    const rule: CanvasFillRule = shape.evenodd ? "evenodd" : "nonzero";
    g.fill(shape.path, rule);
    g.filter = "none";
    g.clip(shape.path, rule);
    if (o.pool) {
      const top = o.pool > 0;
      const lg = g.createLinearGradient(0, by, 0, by + bh);
      lg.addColorStop(top ? 0.35 : 0, rgb(o.color, top ? 0 : 1));
      lg.addColorStop(top ? 1 : 0.65, rgb(o.color, top ? 1 : 0));
      g.globalAlpha = o.alpha * Math.abs(o.pool);
      g.fillStyle = lg;
      g.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    }
    if (o.bleed) {
      const b = o.bleed;
      const horiz = b.side === "left" || b.side === "right";
      const from = b.side === "left" ? bx : b.side === "right" ? bx + bw : b.side === "top" ? by : by + bh;
      const len = (horiz ? bw : bh) * b.extent * (b.side === "left" || b.side === "top" ? 1 : -1);
      const lg = horiz ? g.createLinearGradient(from, 0, from + len, 0) : g.createLinearGradient(0, from, 0, from + len);
      lg.addColorStop(0, rgb(b.color, 1));
      lg.addColorStop(0.45, rgb(b.color, 0.55));
      lg.addColorStop(1, rgb(b.color, 0));
      g.globalAlpha = b.alpha;
      g.fillStyle = lg;
      g.fillRect(bx - 4, by - 4, bw + 8, bh + 8);
    }
    if (o.gran) {
      const pat = this.granPattern(o.color);
      pat.setTransform(new DOMMatrix().translateSelf(this.rng() * 384, this.rng() * 384));
      g.globalAlpha = o.gran;
      g.fillStyle = pat;
      g.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    }
    if (!o.soft && (o.rim ?? 0) > 0) {
      const w = o.rimW ?? 2.2;
      g.strokeStyle = rgb(o.color);
      g.lineJoin = "round";
      g.globalAlpha = o.alpha * o.rim! * 0.25;
      g.lineWidth = w * 5;
      g.stroke(shape.path);
      g.globalAlpha = o.alpha * o.rim! * 0.3;
      g.lineWidth = w * 3.2;
      g.stroke(shape.path);
      g.globalAlpha = o.alpha * o.rim!;
      g.lineWidth = w * 2; // half of it falls outside the clip
      g.stroke(shape.path);
    }
    g.restore();
  }

  /** Lift / reserve paper: paint pure white back in (sun, glints). */
  lift(shape: Shape, alpha = 1, soft = 0) {
    const g = this.g;
    g.save();
    g.globalCompositeOperation = "source-over";
    if (soft) g.filter = `blur(${soft}px)`;
    g.globalAlpha = alpha;
    g.fillStyle = "#fff";
    g.fill(shape.path);
    g.restore();
  }

  /** A broken dry-brush flick: several thin dashed bristle lines. */
  dryFlick(x: number, y: number, dir: number, len: number, th: number, c: RGB, alpha: number) {
    const g = this.g, r = this.rng;
    g.save();
    g.globalCompositeOperation = "multiply";
    g.strokeStyle = rgb(c);
    g.lineCap = "round";
    const n = 3 + Math.floor(r() * 5);
    for (let k = 0; k < n; k++) {
      const yy = y + (k / Math.max(1, n - 1) - 0.5) * th * 0.9 + (r() - 0.5) * 2;
      const l = len * (0.35 + r() * 0.75);
      const dash: number[] = [];
      for (let i = 0; i < 6; i++) dash.push(4 + r() * 26, 2 + r() * 10);
      g.setLineDash(dash);
      g.lineDashOffset = r() * 40;
      g.lineWidth = 0.8 + r() * th * 0.18;
      g.globalAlpha = alpha * (0.5 + r() * 0.5);
      g.beginPath();
      g.moveTo(x, yy);
      g.quadraticCurveTo(x + dir * l * 0.5, yy + (r() - 0.5) * th * 0.3, x + dir * l, yy + (r() - 0.5) * th * 0.6);
      g.stroke();
    }
    g.restore();
  }
}

export interface StrokeOpts {
  x0: number;
  x1: number;
  y: number;
  /** thickness in px */
  th: number;
  /** how much the top edge humps up into a crest, 0..1 */
  crest?: number;
  /** where along the stroke the crest peaks, 0..1 */
  crestAt?: number;
  /** blunt landing length / taper lift-off length as fractions of the stroke */
  taperIn?: number;
  taperOut?: number;
  /** vertical sag of the whole stroke in px (+ down) */
  sag?: number;
  /** paper-tooth edge jitter in px */
  jitter?: number;
  /** pressure variation 0..1 */
  pressure?: number;
}

/** A horizontal brush stroke outline: blunt start, varying pressure, tapered end, wobbly edges. */
export function brushStroke(o: StrokeOpts, rng: Rng): Shape {
  const n = noise1(rng);
  const seed = rng() * 400;
  const len = Math.abs(o.x1 - o.x0);
  const dir = Math.sign(o.x1 - o.x0) || 1;
  const N = Math.max(10, Math.ceil(len / 5));
  const tIn = o.taperIn ?? 0.06 + rng() * 0.08;
  const tOut = o.taperOut ?? 0.2 + rng() * 0.35;
  const crest = o.crest ?? 0.3;
  const crestAt = o.crestAt ?? 0.3 + rng() * 0.4;
  const pres = o.pressure ?? 0.35;
  const jit = o.jitter ?? 0.7;
  const sag = o.sag ?? (rng() - 0.5) * o.th * 0.8;
  const top: [number, number][] = [];
  const bot: [number, number][] = [];
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = o.x0 + dir * len * t;
    const p = 1 + pres * n(seed + t * len / 140) * 0.9;
    const land = Math.sqrt(clamp01(t / tIn));
    const lift = Math.pow(clamp01((1 - t) / tOut), 0.7);
    const w = o.th * p * Math.min(land, lift);
    const yb = o.y + sag * 4 * t * (1 - t) + n(seed + 50 + t * len / 300) * o.th * 0.25;
    const hump = Math.exp(-Math.pow((t - crestAt) / 0.3, 2)) * 0.75 + 0.35 * Math.max(0, n(seed + 300 + (t * len) / (o.th * 5)));
    const jt = (k: number) => (n(seed + k + x / 7) * 0.7 + n(seed + k + 9 + x / 2.3) * 0.3) * jit;
    const yt = yb - w * (0.45 + crest * hump * 0.6) + jt(100);
    const ybt = yb + w * (0.55 - crest * 0.15) + jt(200);
    top.push([x, yt]);
    bot.push([x, Math.max(ybt, yt + 0.3)]);
    minY = Math.min(minY, yt);
    maxY = Math.max(maxY, ybt);
  }
  const path = new Path2D();
  path.moveTo(top[0][0], top[0][1]);
  for (const [x, y] of top) path.lineTo(x, y);
  for (let i = bot.length - 1; i >= 0; i--) path.lineTo(bot[i][0], bot[i][1]);
  path.closePath();
  const xa = Math.min(o.x0, o.x1), xb = Math.max(o.x0, o.x1);
  return { path, box: [xa, minY, xb - xa, maxY - minY] };
}

/** An irregular closed blob (wash patch, cloud puff, pad) from a jittered radius. */
export function blob(cx: number, cy: number, rx: number, ry: number, rng: Rng, rough = 0.12, jitter = 0.6): Shape {
  const n = noise1(rng);
  const seed = rng() * 300;
  const N = Math.max(24, Math.ceil(((rx + ry) * Math.PI) / 4));
  const path = new Path2D();
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const k = 1 + rough * (n(seed + Math.cos(a) * 2.2 + 3) * 0.7 + n(seed + 40 + Math.sin(a) * 2.2) * 0.6);
    const r = k + (n(seed + 90 + i * 0.9) * jitter) / Math.max(rx, ry);
    const x = cx + Math.cos(a) * rx * r, y = cy + Math.sin(a) * ry * r;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
  const m = 1 + rough * 1.4;
  return { path, box: [cx - rx * m, cy - ry * m, rx * 2 * m, ry * 2 * m] };
}

/**
 * A cumulus seen low at sunset: a run of scalloped puffs on a flat-ish base.
 * Built as one outline (top scallops traced left to right, base back), so its rim is continuous.
 */
export function cloud(cx: number, baseY: number, w: number, h: number, rng: Rng, opts: { puffs?: number; flat?: number } = {}): Shape {
  const n = noise1(rng);
  const seed = rng() * 300;
  const P = opts.puffs ?? 5 + Math.floor(rng() * 4);
  const flat = opts.flat ?? 0.15;
  const x0 = cx - w / 2;
  // puff centres and heights: taller in the middle, uneven
  const puffs = Array.from({ length: P }, (_, i) => {
    const f = (i + 0.5) / P;
    const env = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, f * 1.05 - 0.02))), 0.7);
    return { x: x0 + f * w + (rng() - 0.5) * (w / P) * 0.5, r: h * (0.35 + 0.65 * rng()) * (0.3 + 0.7 * env) };
  });
  const N = Math.ceil(w / 3);
  const top: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const x = x0 + (i / N) * w;
    let y = baseY - h * 0.05;
    for (const p of puffs) {
      const dx = (x - p.x) / (p.r * 1.25);
      if (Math.abs(dx) < 1) y = Math.min(y, baseY - p.r * 0.35 - p.r * Math.sqrt(1 - dx * dx));
    }
    const tt = i / N;
    const env = Math.sqrt(smooth(0, 0.1, tt) * smooth(1, 0.9, tt));
    y = baseY - (baseY - y) * env;
    y += n(seed + x / 16) * h * 0.05 + n(seed + 20 + x / 4) * 0.7;
    top.push([x, y]);
  }
  const path = new Path2D();
  path.moveTo(top[0][0], baseY);
  for (const [x, y] of top) path.lineTo(x, y);
  // the base: flat with a slight waver and a dragged, uneven underside
  for (let i = N; i >= 0; i--) {
    const x = x0 + (i / N) * w;
    const t = i / N;
    const y = baseY + h * flat * Math.sin(Math.PI * t) * (0.6 + 0.4 * n(seed + 70 + x / 40)) + n(seed + 90 + x / 5) * 1.0;
    path.lineTo(x, y);
  }
  path.closePath();
  return { path, box: [x0, baseY - h * 1.4, w, h * 1.4 + h * flat + 4] };
}
