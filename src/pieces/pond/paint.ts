import { Painter, blob, brushStroke, mixRGB, mulberry32, noise1, type RGB, type Shape } from "../../lib/brush";
import { ASPECT, POND, pondR } from "./shape";

/**
 * The pond, painted once at load onto white: a few large, intentional washes with a
 * clear light-to-dark structure. Pale ochre/sap ground around the water, the water
 * itself in three glazes (pale cerulean, cobalt, deep ultramarine where the trees
 * shade it), lifted sky reflections, dark tree canopies with their reflections, and
 * a small raft of lily pads. No ink lines.
 */

const C = {
  ochre: [244, 222, 160] as RGB,
  sap: [176, 196, 110] as RGB,
  olive: [140, 160, 80] as RGB,
  hooker: [70, 120, 70] as RGB,
  deepGreen: [40, 84, 62] as RGB,
  sienna: [214, 160, 110] as RGB,
  cerulean: [150, 205, 228] as RGB,
  cobalt: [96, 150, 214] as RGB,
  ultra: [72, 100, 196] as RGB,
  indigo: [48, 64, 128] as RGB,
  teal: [70, 150, 160] as RGB,
  grey: [150, 140, 130] as RGB,
};

export function paintPond(W: number, H: number, seed = 11): HTMLCanvasElement {
  const rng = mulberry32(seed);
  const r = (a = 0, b = 1) => a + (b - a) * rng();
  const pt = new Painter(W, H, rng);
  const g = pt.g;
  // q-space (x in [-ASPECT/2, ASPECT/2], y in [-.5, .5]) to px
  const X = (qx: number) => (qx / ASPECT + 0.5) * W;
  const Y = (qy: number) => (qy + 0.5) * H;
  const S = H; // px per q unit

  /** The pond outline scaled by k, with an extra organic wobble. */
  const pondShape = (k: number, wob: number, dx = 0, dy = 0): Shape => {
    const n = noise1(rng);
    const sd = rng() * 100;
    const path = new Path2D();
    const N = 220;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const rr = pondR(a) * k * (1 + wob * (n(sd + Math.cos(a) * 3 + 5) * 0.6 + n(sd + 30 + Math.sin(a) * 3) * 0.5)) + n(sd + 60 + i * 0.7) * 0.0012;
      const x = X(POND.cx + dx + Math.cos(a) * rr * POND.sx), y = Y(POND.cy + dy + Math.sin(a) * rr);
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    path.closePath();
    const rx = POND.r * k * POND.sx * 1.4 * S, ry = POND.r * k * 1.4 * S;
    return { path, box: [X(POND.cx + dx) - rx, Y(POND.cy + dy) - ry, rx * 2, ry * 2] };
  };

  // ---------- the land: a pale ground, then two big hard-edged green glazes ----------
  const ring = (outer: Shape, inner: Shape): Shape => {
    const p = new Path2D(outer.path);
    p.addPath(inner.path);
    return { path: p, box: outer.box, evenodd: true };
  };
  const land = ring(pondShape(1.33, 0.16), pondShape(0.985, 0.01));
  pt.wash(land, { color: C.ochre, alpha: 0.6, rim: 0.5, rimW: 2.5, pool: 0.2 });
  for (const [k, c, a, dx, dy] of [
    [1.2, [150, 196, 120], 0.45, -0.03, 0.02],
  ] as [number, RGB, number, number, number][]) {
    const s = ring(pondShape(k, 0.22, dx, dy), pondShape(0.99, 0.012));
    pt.wash(s, { color: c, alpha: a, rim: 0.7, rimW: 2.5, gran: 0.1, pool: 0.3, bleed: { color: C.ochre, alpha: 0.6, side: "top", extent: 0.35 } });
  }
  // a few dry-brush grass flicks and warm earth notes along the bank
  for (let i = 0; i < 26; i++) {
    const a = r(0, Math.PI * 2);
    const rr = pondR(a) * r(1.05, 1.3);
    const x = X(POND.cx + Math.cos(a) * rr * POND.sx), y = Y(POND.cy + Math.sin(a) * rr);
    if (i < 5) pt.wash(blob(x, y, r(40, 90), r(14, 30), rng, 0.3), { color: i < 3 ? C.olive : C.sienna, alpha: r(0.25, 0.4), rim: 0.7, rimW: 1.8, gran: 0.3 });
    else pt.dryFlick(x, y, rng() < 0.5 ? 1 : -1, r(30, 70), r(8, 16), C.olive, 0.4);
  }

  // ---------- water: light to dark ----------
  const water = pondShape(1.0, 0.025);
  pt.wash(water, { color: C.cerulean, alpha: 0.75, rim: 0.8, rimW: 3, pool: 0.2 });
  // cobalt over most of it, leaving the near-left shallows pale
  const mid = pondShape(0.86, 0.14, 0.035, 0.02);
  pt.wash(mid, { color: C.cobalt, alpha: 0.42, rim: 0.85, rimW: 2.5, gran: 0.12, bleed: { color: C.teal, alpha: 0.4, side: "left", extent: 0.3 } });
  // deep water under the far bank and the trees
  // following the far shore, darkest where the bank and trees shade it
  pt.wash(pondShape(0.62, 0.2, 0.1, 0.05), { color: C.ultra, alpha: 0.32, rim: 0.9, rimW: 2.5, gran: 0.25, pool: 0.3 });
  pt.wash(pondShape(0.36, 0.25, 0.2, 0.08), { color: C.indigo, alpha: 0.22, rim: 0.9, rimW: 2, gran: 0.35 });
  // sky reflections lifted out with a damp brush: soft-sided, a few hard
  for (let i = 0; i < 5; i++) {
    const cx = POND.cx + r(-0.3, 0.3), cy = POND.cy + r(-0.15, 0.15);
    const len = r(0.1, 0.24) * S;
    const shp = brushStroke({ x0: X(cx) - len / 2, x1: X(cx) + len / 2, y: Y(cy), th: r(18, 40), crest: r(0.3, 0.8), sag: r(-20, 20), jitter: 1.5, pressure: 0.6 }, rng);
    pt.lift(shp, r(0.3, 0.5), r(3, 6));
  }

  // ---------- trees: dark canopies seen from above, and their reflections ----------
  const trees: [number, number, number][] = [
    [-0.55, -0.3, 0.085],
    [-0.47, -0.36, 0.06],
    [-0.6, -0.2, 0.05],
    [0.52, -0.25, 0.075],
    [0.5, 0.27, 0.08],
    [0.42, 0.33, 0.06],
    [-0.5, 0.3, 0.07],
  ];
  for (const [tx, ty, tr] of trees) {
    const cx = X(tx), cy = Y(ty), R = tr * S;
    pt.wash(blob(cx, cy, R, R * 0.92, rng, 0.2, 2.5), { color: C.sap, alpha: 0.7, rim: 0.6, rimW: 2, pool: 0.4 });
    pt.wash(blob(cx + R * 0.15, cy + R * 0.18, R * 0.78, R * 0.7, rng, 0.25, 2), { color: C.hooker, alpha: 0.6, rim: 0.8, rimW: 2, gran: 0.2, pool: 0.4 });
    pt.wash(blob(cx + R * 0.32, cy + R * 0.34, R * 0.45, R * 0.4, rng, 0.3, 2), { color: C.deepGreen, alpha: 0.55, rim: 0.9, rimW: 1.8, gran: 0.25 });
    // a lit top-left edge, lifted
    pt.lift(blob(cx - R * 0.38, cy - R * 0.4, R * 0.22, R * 0.14, rng, 0.3), 0.35, 2);
  }

  // ---------- lily pads ----------
  const pads: [number, number][] = [];
  for (let i = 0; i < 13; i++) {
    const cl = i < 8 ? { x: -0.27, y: 0.13 } : { x: 0.3, y: -0.16 };
    pads.push([cl.x + r(-0.08, 0.08), cl.y + r(-0.04, 0.04)]);
  }
  for (const [px, py] of pads) {
    const R = r(16, 30);
    const cx = X(POND.cx + px), cy = Y(POND.cy + py);
    const a0 = r(0, Math.PI * 2);
    const path = new Path2D();
    path.moveTo(cx, cy);
    for (let i = 0; i <= 24; i++) {
      const a = a0 + 0.35 + (i / 24) * (Math.PI * 2 - 0.5);
      path.lineTo(cx + Math.cos(a) * R * (1 + r(-0.04, 0.04)), cy + Math.sin(a) * R * 0.92);
    }
    path.closePath();
    pt.wash({ path, box: [cx - R, cy - R, R * 2, R * 2] }, { color: rng() < 0.6 ? C.sap : mixRGB(C.sap, C.olive, 0.5), alpha: 0.7, rim: 0.9, rimW: 1.6, pool: 0.4, gran: 0.2 });
  }
  void g;
  return pt.canvas;
}
