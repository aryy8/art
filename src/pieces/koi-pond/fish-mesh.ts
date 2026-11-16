import * as THREE from "three";
import { KOI_LEN, S_TAIL_ROOT, SPINE_N, TAIL_N, type Fish, W, H } from "./sim";

const ALONG = 48;
const ACROSS = 8;
const VERTS = (ALONG + 1) * (ACROSS + 1);

function toNdc(x: number, y: number): [number, number] {
  return [(x / W) * 2 - 1, 1 - (y / H) * 2];
}

function catmull(
  p0x: number, p0y: number, p1x: number, p1y: number,
  p2x: number, p2y: number, p3x: number, p3y: number, t: number,
): [number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    0.5 * (2 * p1x + (-p0x + p2x) * t + (2 * p0x - 5 * p1x + 4 * p2x - p3x) * t2 + (-p0x + 3 * p1x - 3 * p2x + p3x) * t3),
    0.5 * (2 * p1y + (-p0y + p2y) * t + (2 * p0y - 5 * p1y + 4 * p2y - p3y) * t2 + (-p0y + 3 * p1y - 3 * p2y + p3y) * t3),
  ];
}

function sampleSpine(f: Fish, s: number) {
  const fIdx = Math.max(0, Math.min(1, s)) * (SPINE_N - 1);
  let i = Math.floor(fIdx);
  const t = fIdx - i;
  if (i > SPINE_N - 2) i = SPINE_N - 2;
  const i0 = Math.max(0, i - 1);
  const i1 = i;
  const i2 = Math.min(SPINE_N - 1, i + 1);
  const i3 = Math.min(SPINE_N - 1, i + 2);
  const [x, y] = catmull(
    f.spineX[i0], f.spineY[i0], f.spineX[i1], f.spineY[i1],
    f.spineX[i2], f.spineY[i2], f.spineX[i3], f.spineY[i3], t,
  );
  let tx = f.tanX[i1] + (f.tanX[i2] - f.tanX[i1]) * t;
  let ty = f.tanY[i1] + (f.tanY[i2] - f.tanY[i1]) * t;
  const len = Math.hypot(tx, ty) || 1;
  tx /= len;
  ty /= len;
  const lat = f.lat[i1] + (f.lat[i2] - f.lat[i1]) * t;
  return { x, y, tx, ty, lat };
}

function sampleTail(f: Fish, s: number, v: number): [number, number] {
  const ts = Math.max(0, Math.min(1, (s - S_TAIL_ROOT) / Math.max(1e-4, 1 - S_TAIL_ROOT)));
  const fIdx = ts * (TAIL_N - 1);
  let i = Math.floor(fIdx);
  const t = fIdx - i;
  if (i > TAIL_N - 2) i = TAIL_N - 2;
  const ux = f.tailUX[i] + (f.tailUX[i + 1] - f.tailUX[i]) * t;
  const uy = f.tailUY[i] + (f.tailUY[i + 1] - f.tailUY[i]) * t;
  const lx = f.tailLX[i] + (f.tailLX[i + 1] - f.tailLX[i]) * t;
  const ly = f.tailLY[i] + (f.tailLY[i + 1] - f.tailLY[i]) * t;
  const w = (v + 1) * 0.5;
  return [lx + (ux - lx) * w, ly + (uy - ly) * w];
}

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function profileHalf(s: number) {
  // fat shoulders just behind the head, taper to peduncle, then mesh width
  // for the veil is driven mostly by the Verlet lobes
  if (s < 0.1) return 0.65 + s * 3.2;
  if (s < 0.32) return 1.05;
  if (s < S_TAIL_ROOT) return lerp(1.05, 0.42, (s - 0.32) / (S_TAIL_ROOT - 0.32));
  return lerp(0.7, 1.35, (s - S_TAIL_ROOT) / Math.max(1e-4, 1 - S_TAIL_ROOT));
}

function spriteMat(tex: THREE.Texture) {
  return new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    alphaTest: 0.03,
    side: THREE.DoubleSide,
  });
}

export type FishBody = {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  pos: Float32Array;
  restS: Float32Array;
  restV: Float32Array;
};

export function createFishBody(tex: THREE.Texture): FishBody {
  const pos = new Float32Array(VERTS * 3);
  const uvs = new Float32Array(VERTS * 2);
  const restS = new Float32Array(VERTS);
  const restV = new Float32Array(VERTS);
  const indices: number[] = [];
  let vi = 0;
  for (let j = 0; j <= ACROSS; j++) {
    for (let i = 0; i <= ALONG; i++) {
      const s = i / ALONG;
      const v = (j / ACROSS) * 2 - 1;
      restS[vi] = s;
      restV[vi] = v;
      pos[vi * 3] = 0;
      pos[vi * 3 + 1] = 0;
      pos[vi * 3 + 2] = 0;
      // head at +x (right) → u reversed; v covers body + the wide veil in the sprite
      uvs[vi * 2] = 1 - s;
      uvs[vi * 2 + 1] = 0.5 + v * 0.34;
      vi++;
    }
  }
  const stride = ALONG + 1;
  for (let j = 0; j < ACROSS; j++) {
    for (let i = 0; i < ALONG; i++) {
      const a = j * stride + i;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  const mat = spriteMat(tex);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, mat, pos, restS, restV };
}

export function updateFishBody(body: FishBody, f: Fish) {
  const L = KOI_LEN * f.scale * (1 - f.depth * 0.06);
  // pair-pose / koi.png: thick body (~1/4–1/5 of length), not a shrimp stick
  const halfW0 = L * 0.2;
  const bank = Math.max(-1, Math.min(1, f.turnRate / 1.6));
  const { pos, restS, restV } = body;

  for (let i = 0; i < VERTS; i++) {
    const s = restS[i];
    const v = restV[i];
    const sp = sampleSpine(f, Math.min(s, S_TAIL_ROOT));
    const nx = -sp.ty;
    const ny = sp.tx;
    const inner =
      Math.sign(bank) === Math.sign(v) && Math.abs(bank) > 0.01
        ? 1 - Math.abs(bank) * 0.08
        : 1;
    const halfW = halfW0 * profileHalf(s) * inner;
    let bx = sp.x + nx * (v * halfW + sp.lat);
    let by = sp.y + ny * (v * halfW + sp.lat);
    if (s < 0.08) {
      bx = sp.x + (bx - sp.x) * f.headScale;
      by = sp.y + (by - sp.y) * f.headScale;
    }
    let wx = bx;
    let wy = by;
    if (s >= S_TAIL_ROOT - 0.02) {
      const [tx, ty] = sampleTail(f, s, v);
      const blend = 1 - smoothstep(S_TAIL_ROOT - 0.02, S_TAIL_ROOT + 0.1, s);
      wx = tx + (bx - tx) * blend;
      wy = ty + (by - ty) * blend;
    }
    const [ndx, ndy] = toNdc(wx, wy);
    pos[i * 3] = ndx;
    pos[i * 3 + 1] = ndy;
    pos[i * 3 + 2] = 0;
  }
  (body.mesh.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  body.mesh.geometry.computeBoundingSphere();

  const d = f.depth;
  const red = f.tint;
  let r = 1.1 + red * 0.1;
  let g = 1.0 - red * 0.04;
  let b = 0.94 - red * 0.03;
  const tm = d * 0.06;
  r = r * (1 - tm) + 0.22 * tm;
  g = g * (1 - tm) + 0.42 * tm;
  b = b * (1 - tm) + 0.48 * tm;
  if (Math.abs(bank) > 0.05) {
    const shade = 1 - Math.abs(bank) * 0.04;
    r *= shade;
    g *= shade;
    b *= shade;
  }
  body.mat.color.setRGB(r, g, b);
  body.mat.opacity = 1;
}

export type FinFan = {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  pos: Float32Array;
};

/** Pectoral fin from fin.webp (base on left edge, fans right) — 4×3 strip. */
export function createFinFan(tex: THREE.Texture): FinFan {
  const cols = 4;
  const rows = 3;
  const pos = new Float32Array((cols + 1) * (rows + 1) * 3);
  const uvs = new Float32Array((cols + 1) * (rows + 1) * 2);
  const indices: number[] = [];
  let vi = 0;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const v = j / rows;
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
      pos[vi * 3] = 0;
      pos[vi * 3 + 1] = 0;
      pos[vi * 3 + 2] = 0;
      vi++;
    }
  }
  const stride = cols + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * stride + i;
      indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  const mat = spriteMat(tex);
  mat.opacity = 0.82;
  mat.alphaTest = 0.02;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, mat, pos };
}

export function updateFinFan(fan: FinFan, f: Fish, side: number, open: number) {
  const L = KOI_LEN * f.scale * (1 - f.depth * 0.06);
  const sp = sampleSpine(f, 0.2);
  const nx = -sp.ty * side;
  const ny = sp.tx * side;
  const len = L * 0.16;
  const spread = open; // 0 folded → ~0.96 (~55°)
  const cols = 4;
  const rows = 3;
  let vi = 0;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const u = i / cols; // 0 at body → 1 at tip
      const v = (j / rows) * 2 - 1; // -1..1 across fan
      const fanW = (0.25 + 0.75 * u) * len * 0.45 * (0.35 + spread);
      // root at spine, tip swings out with spread; width grows toward tip
      const x =
        sp.x +
        sp.tx * (-u * len * 0.12) +
        nx * (Math.sin(spread) * u * len) +
        nx * (v * fanW * 0.5);
      const y =
        sp.y +
        sp.ty * (-u * len * 0.12) +
        ny * (Math.sin(spread) * u * len) +
        ny * (v * fanW * 0.5);
      const [ndx, ndy] = toNdc(x, y);
      fan.pos[vi * 3] = ndx;
      fan.pos[vi * 3 + 1] = ndy;
      fan.pos[vi * 3 + 2] = 0;
      vi++;
    }
  }
  (fan.mesh.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  fan.mat.opacity = 0.82 * (1 - f.depth * 0.08);
  const red = f.tint;
  fan.mat.color.setRGB(1.04 + red * 0.05, 0.98 - red * 0.03, 0.92);
}

export function spineAt(f: Fish, s: number) {
  return sampleSpine(f, s);
}
