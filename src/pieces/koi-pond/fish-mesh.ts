import * as THREE from "three";
import { KOI_LEN, SPINE_N, type Fish, W, H } from "./sim";

/**
 * The koi is the koi.png sprite itself (pastel strokes, scales, feathery veil), mapped onto a
 * ribbon that bends along the simulated spine. No procedural silhouette: the sprite's own alpha
 * gives the shape, so what you see is exactly the painted fish, just swimming.
 */

const ALONG = 72;
const ACROSS = 12;
const VERTS = (ALONG + 1) * (ACROSS + 1);
/** koi.png alpha bbox = 1014 × 510 of 1024 × 512 → ribbon half-height in body lengths */
const SPRITE_U1 = 1014 / 1024;
const HALF_H = (510 / 1014) * 0.5;

function toNdc(x: number, y: number): [number, number] {
  return [(x / W) * 2 - 1, 1 - (y / H) * 2];
}

function sampleSpine(f: Fish, s: number) {
  const fi = Math.max(0, Math.min(1, s)) * (SPINE_N - 1);
  let i = Math.floor(fi);
  if (i > SPINE_N - 2) i = SPINE_N - 2;
  const t = fi - i;
  // Catmull-Rom through spine points for a smooth, kink-free centreline
  const i0 = Math.max(0, i - 1);
  const i3 = Math.min(SPINE_N - 1, i + 2);
  const cr = (p0: number, p1: number, p2: number, p3: number) =>
    0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  const x = cr(f.spineX[i0], f.spineX[i], f.spineX[i + 1], f.spineX[i3]);
  const y = cr(f.spineY[i0], f.spineY[i], f.spineY[i + 1], f.spineY[i3]);
  let tx = f.tanX[i] + (f.tanX[i + 1] - f.tanX[i]) * t;
  let ty = f.tanY[i] + (f.tanY[i + 1] - f.tanY[i]) * t;
  const l = Math.hypot(tx, ty) || 1;
  tx /= l;
  ty /= l;
  const k = f.curv[i] + (f.curv[i + 1] - f.curv[i]) * t;
  return { x, y, tx, ty, k };
}

function spriteMat(tex: THREE.Texture) {
  return new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export type FishBody = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; pos: Float32Array; restS: Float32Array; restV: Float32Array };

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
      uvs[vi * 2] = SPRITE_U1 * (1 - s); // head is at the right of the sprite
      uvs[vi * 2 + 1] = 0.5 + v * 0.5;
      vi++;
    }
  }
  const stride = ALONG + 1;
  for (let j = 0; j < ACROSS; j++) {
    for (let i = 0; i < ALONG; i++) {
      const a = j * stride + i;
      indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
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
  const hh = L * HALF_H;
  const { pos, restS, restV } = body;
  const stride = ALONG + 1;
  for (let i = 0; i <= ALONG; i++) {
    const sp = sampleSpine(f, restS[i]);
    // koi.png is slimmer than the plump koi in the painting: fatten the body, flare the veil a bit
    const s = restS[i];
    const plump = s < 0.62 ? 1.45 - 0.25 * Math.max(0, (s - 0.45) / 0.17) : 1.2 + 0.15 * (s - 0.62) / 0.38;
    const nx = -sp.ty;
    const ny = sp.tx;
    // radius of curvature; the inner side of a bend is compressed smoothly so it never folds
    const R = 1 / Math.max(Math.abs(sp.k), 1e-5);
    const innerSign = sp.k > 0 ? -1 : 1;
    for (let j = 0; j <= ACROSS; j++) {
      const vi = j * stride + i;
      let w = restV[vi] * hh * plump;
      if (Math.sign(w) === innerSign && Math.abs(w) > 0) {
        const lim = R * 0.85;
        w = Math.sign(w) * lim * Math.tanh(Math.abs(w) / lim);
      }
      const hs = restS[i] < 0.12 ? f.headScale : 1;
      const [x, y] = toNdc(sp.x + nx * w * hs, sp.y + ny * w * hs);
      pos[vi * 3] = x;
      pos[vi * 3 + 1] = y;
      pos[vi * 3 + 2] = 0;
    }
  }
  (body.mesh.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  // painted colours as-is; only a whisper of water tint when the fish drifts deeper
  const d = Math.max(0, f.depth - 0.1) * 0.25;
  body.mat.color.setRGB(1 - d * 0.5, 1 - d * 0.25, 1 - d * 0.15);
}

export type FinFan = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; pos: Float32Array };

/** Pectoral fin cut from koi-pair-pose.png (root on the left, tip to the right). */
const FIN_ASPECT = 72 / 153;
export function createFinFan(tex: THREE.Texture): FinFan {
  const cols = 6;
  const rows = 2;
  const pos = new Float32Array((cols + 1) * (rows + 1) * 3);
  const uvs = new Float32Array((cols + 1) * (rows + 1) * 2);
  const indices: number[] = [];
  let vi = 0;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      uvs[vi * 2] = i / cols;
      uvs[vi * 2 + 1] = j / rows;
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
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, mat, pos };
}

/**
 * side = +1 / -1. open 0 (folded against the body) → 1 (spread ~70°).
 * The fin is rooted on the body edge just behind the head and sweeps back and out,
 * with a slight curl along its length.
 */
export function updateFinFan(fan: FinFan, f: Fish, side: number, open: number) {
  const L = KOI_LEN * f.scale * (1 - f.depth * 0.06);
  const sp = sampleSpine(f, 0.24);
  const nx = -sp.ty * side;
  const ny = sp.tx * side;
  const rootOff = L * 0.06;
  const rx = sp.x + nx * rootOff;
  const ry = sp.y + ny * rootOff;
  const len = L * 0.27;
  const wid = len * FIN_ASPECT * 1.3;
  const ang = 0.3 + 0.75 * Math.max(0, Math.min(1, open)); // from the tail direction
  const cols = 6;
  const rows = 2;
  let vi = 0;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const v = j / rows - 0.5;
      const a = ang * (1 - 0.25 * u); // tip curls back toward the tail
      // direction: rotate the backward tangent (-t) toward the fin's side
      const dx = -sp.tx * Math.cos(a) + nx * Math.sin(a);
      const dy = -sp.ty * Math.cos(a) + ny * Math.sin(a);
      const px = -dy * side;
      const py = dx * side;
      const x = rx + dx * u * len + px * v * wid * (0.5 + 0.5 * u);
      const y = ry + dy * u * len + py * v * wid * (0.5 + 0.5 * u);
      const [ndx, ndy] = toNdc(x, y);
      fan.pos[vi * 3] = ndx;
      fan.pos[vi * 3 + 1] = ndy;
      fan.pos[vi * 3 + 2] = 0;
      vi++;
    }
  }
  (fan.mesh.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  fan.mat.opacity = 0.8;
}

export function spineAt(f: Fish, s: number) {
  return sampleSpine(f, s);
}
