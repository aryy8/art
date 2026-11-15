import type { MountPiece, PieceInstance } from "../types";

/**
 * Pixel sea.
 * The 16-bit calm ocean from a site footer, cut into an uneven bleeding-pixel
 * silhouette so it sits on the white page like a spilled puddle of light.
 */

interface Ripple {
  x: number;
  z: number;
  time: number;
  strength: number;
}

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const PIXEL = 4;

/** Tiny value-noise helpers for the silhouette (deterministic, no deps). */
function hash2(ix: number, iy: number): number {
  const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0);
  const b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1);
  const d = hash2(x0 + 1, y0 + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    sum += valueNoise(x * freq, y * freq) * amp;
    amp *= 0.5;
    freq *= 2.05;
  }
  return sum;
}

/**
 * Build an irregular pixel mask: a squarish slab with a jagged bleeding edge
 * and sparse pixels that drip outward onto the white page.
 */
function buildBleedMask(cols: number, rows: number): Uint8Array {
  const mask = new Uint8Array(cols * rows);
  const cx = (cols - 1) * 0.5;
  const cy = (rows - 1) * 0.5;
  // Leave a thin margin so edge bleed stays inside the piece rect
  const halfW = cols * 0.42;
  const halfH = rows * 0.42;
  // High power → square; noise only chews the perimeter
  const P = 6;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dx = Math.abs(c - cx) / halfW;
      const dy = Math.abs(r - cy) / halfH;
      const base = Math.pow(dx, P) + Math.pow(dy, P);
      const warp = fbm(c * 0.09 + 2.1, r * 0.09 + 0.7) * 0.28;
      const warp2 = fbm(c * 0.2 - 1.3, r * 0.2 + 4.2) * 0.12;
      const edge = 1.02 + warp + warp2;
      // Slight bottom-heavy bleed so it feels like paint settling
      const settle = 1 + Math.max(0, (r - cy) / halfH) * 0.06;
      if (base * settle < edge) {
        mask[r * cols + c] = 1;
      }
    }
  }

  // Outward bleeding pixels: near-edge cells that sporadically stick out
  const bleed: { c: number; r: number }[] = [];
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const i = r * cols + c;
      if (mask[i]) continue;
      let neigh = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (mask[(r + dy) * cols + (c + dx)]) neigh++;
        }
      }
      if (neigh === 0) continue;
      const chance = hash2(c * 17 + 3, r * 29 + 5);
      // More likely next to a dense edge; rarer further out
      if (neigh >= 3 && chance > 0.42) bleed.push({ c, r });
      else if (neigh >= 2 && chance > 0.72) bleed.push({ c, r });
      else if (neigh >= 1 && chance > 0.9) bleed.push({ c, r });
    }
  }
  for (const { c, r } of bleed) mask[r * cols + c] = 1;

  // A few tiny 1–2px drip clusters hanging below the main mass
  const drips = 14;
  for (let i = 0; i < drips; i++) {
    const seed = hash2(i * 41 + 9, i * 13 + 2);
    const c0 = Math.floor(cols * (0.12 + seed * 0.76));
    // Find the bottom-most filled pixel in this column (or nearby)
    let bottom = -1;
    for (let r = rows - 1; r >= 0; r--) {
      if (mask[r * cols + c0] || mask[r * cols + Math.min(cols - 1, c0 + 1)]) {
        bottom = r;
        break;
      }
    }
    if (bottom < 0 || bottom >= rows - 2) continue;
    const len = 1 + Math.floor(hash2(i + 7, c0) * 3);
    for (let k = 1; k <= len; k++) {
      const rr = bottom + k;
      if (rr >= rows) break;
      const cc = Math.min(cols - 1, Math.max(0, c0 + (hash2(rr, i) > 0.55 ? 1 : 0)));
      if (hash2(cc * 3, rr * 5 + i) > 0.28) mask[rr * cols + cc] = 1;
    }
  }

  return mask;
}

const LIGHT_PALETTE = [
  "rgba(240, 249, 255, 0.88)",
  "rgba(186, 230, 253, 0.92)",
  "rgba(56, 189, 248, 0.96)",
  "rgba(2, 132, 199, 0.98)",
  "rgba(3, 105, 161, 1.0)",
  "rgba(7, 89, 133, 1.0)",
];

const mount: MountPiece = (ctx): PieceInstance => {
  const canvas = document.createElement("canvas");
  canvas.style.cursor = "crosshair";
  ctx.el.appendChild(canvas);
  const g = canvas.getContext("2d", { alpha: true })!;

  const W = ctx.width;
  const H = ctx.height;
  const cols = Math.ceil(W / PIXEL);
  const rows = Math.ceil(H / PIXEL);
  const mask = buildBleedMask(cols, rows);

  let ppu = 1;
  const pointer = { seaX: 0, seaZ: 0, active: false };
  const ripples: Ripple[] = [];
  const MAX_RIPPLES = 8;
  const raySlant = 0.65;

  const numMotes = ctx.reducedMotion ? 10 : 36;
  const motes = Array.from({ length: numMotes }, () => ({
    x: Math.random(),
    y: Math.random(),
    speed: 0.0004 + Math.random() * 0.0006,
    phase: Math.random() * Math.PI * 2,
  }));

  const pixelToSea = (px: number, py: number) => {
    const v = Math.max(0.01, Math.min(1, py / H));
    const depth = 2.4 + Math.pow(1 - v, 1.8) * 8;
    const seaX = ((px - W * 0.5) / H) * depth * 1.4;
    return { seaX, seaZ: depth };
  };

  const addRipple = (seaX: number, seaZ: number, strength = 0.8) => {
    if (ripples.length >= MAX_RIPPLES) ripples.shift();
    ripples.push({ x: seaX, z: seaZ, time: performance.now() * 0.001, strength });
  };

  const onMove = (e: PointerEvent) => {
    const u = ctx.toLocal(e);
    if (u.x < 0 || u.x > 1 || u.y < 0 || u.y > 1) {
      pointer.active = false;
      return;
    }
    const sea = pixelToSea(u.x * W, u.y * H);
    pointer.seaX = sea.seaX;
    pointer.seaZ = sea.seaZ;
    pointer.active = true;
  };
  const onLeave = () => {
    pointer.active = false;
  };
  const onDown = (e: PointerEvent) => {
    if (!ctx.isFocused()) return;
    const u = ctx.toLocal(e);
    const sea = pixelToSea(u.x * W, u.y * H);
    addRipple(sea.seaX, sea.seaZ, 1.3);
  };

  ctx.el.addEventListener("pointermove", onMove);
  ctx.el.addEventListener("pointerleave", onLeave);
  ctx.el.addEventListener("pointerdown", onDown);

  const startWall = performance.now() * 0.001;

  return {
    setResolution(next) {
      ppu = next;
      canvas.width = Math.round(W * ppu);
      canvas.height = Math.round(H * ppu);
      g.setTransform(ppu, 0, 0, ppu, 0, 0);
    },

    frame(time) {
      const nowSec = startWall + time;
      const t = time * (ctx.reducedMotion ? 0.18 : 0.36);

      for (let i = ripples.length - 1; i >= 0; i--) {
        if (nowSec - ripples[i].time > 3) ripples.splice(i, 1);
      }

      g.clearRect(0, 0, W, H);

      const rayCenters = [W * 0.1, W * 0.28, W * 0.48, W * 0.68, W * 0.88];
      const rayWidths = [15, 20, 18, 22, 16];
      const rayIntensities = [0.65, 0.85, 0.75, 0.85, 0.7];

      const getRayLineIntensity = (px: number, py: number) => {
        const u = px - py * raySlant;
        let total = 0;
        for (let i = 0; i < rayCenters.length; i++) {
          const sway = Math.sin(t * 0.35 + i * 1.6) * 6;
          const dist = Math.abs(u - (rayCenters[i] + sway));
          const w = rayWidths[i];
          if (dist < w * 1.8) {
            total += Math.exp(-Math.pow(dist / w, 2)) * rayIntensities[i];
          }
        }
        return Math.min(1, total);
      };

      const amp = ctx.reducedMotion ? 0.55 : 1;

      for (let r = 0; r < rows; r++) {
        const py = r * PIXEL;
        const v = Math.max(0.01, Math.min(1, py / H));
        const depth = 2.4 + Math.pow(1 - v, 1.8) * 8;
        const topFade = Math.sin(Math.min(1, py / 22) * Math.PI * 0.5);

        for (let c = 0; c < cols; c++) {
          if (!mask[r * cols + c]) continue;

          const px = c * PIXEL;
          const seaX = ((px - W * 0.5) / H) * depth * 1.4;
          const seaZ = depth;

          const phase1 = seaZ * 0.85 - t * 1.1 + Math.sin(seaX * 0.28) * 0.35;
          const s1 = Math.sin(phase1);
          const w1 = Math.pow((s1 + 1) * 0.5, 2.2) * 0.48;

          const phase2 = (seaX * 0.38 + seaZ * 0.88) * 1.35 - t * 1.2;
          const s2 = Math.sin(phase2);
          const w2 = Math.pow((s2 + 1) * 0.5, 2) * 0.26;

          const phase3 = (seaZ * 1.15 - seaX * 0.45) * 2.2 - t * 1.6;
          const w3 = Math.sin(phase3) * 0.09;

          let h = (w1 + w2 + w3 - 0.24) * amp;

          if (pointer.active) {
            const dx = seaX - pointer.seaX;
            const dz = seaZ - pointer.seaZ;
            const dist = Math.hypot(dx, dz);
            if (dist < 1.8) {
              h += Math.sin(dist * 6.5 - t * 4) * Math.exp(-dist * 1.5) * 0.18;
            }
          }

          for (let i = 0; i < ripples.length; i++) {
            const rip = ripples[i];
            const age = nowSec - rip.time;
            if (age <= 0 || age >= 3) continue;
            const dx = seaX - rip.x;
            const dz = seaZ - rip.z;
            const dist = Math.hypot(dx, dz);
            const wavefront = dist - age * 3.2;
            if (Math.abs(wavefront) < 1.1) {
              const wave =
                Math.sin(wavefront * 10) *
                Math.exp(-Math.abs(wavefront) * 2.5) *
                Math.exp(-age) *
                rip.strength;
              h += wave * 0.28;
            }
          }

          const rayIntensity = getRayLineIntensity(px, py);
          const bayerVal = BAYER_4X4[r % 4][c % 4] / 16;

          const isGlint =
            h > 0.42 && rayIntensity > 0.75 && bayerVal > 0.92 && topFade > 0.3;
          if (isGlint) {
            g.fillStyle = "#fef08a";
            g.fillRect(px, py, PIXEL, PIXEL);
            continue;
          }

          const inRayLine = rayIntensity > 0.6 && bayerVal > 0.86 && topFade > 0.25;
          if (inRayLine && h > 0.12) {
            g.fillStyle = "rgba(254, 240, 138, 0.40)";
            g.fillRect(px, py, PIXEL, PIXEL);
            continue;
          }

          const lum = Math.max(0, Math.min(1, 0.42 + h * 0.58 + rayIntensity * 0.16));
          const rawIndex = lum * (LIGHT_PALETTE.length - 1);
          const baseIndex = Math.floor(rawIndex);
          const frac = rawIndex - baseIndex;
          const finalIndex = Math.min(
            LIGHT_PALETTE.length - 1,
            frac > bayerVal ? baseIndex + 1 : baseIndex,
          );

          g.fillStyle = LIGHT_PALETTE[finalIndex];
          g.fillRect(px, py, PIXEL, PIXEL);
        }
      }

      // Falling pixel motes along the sunray lines (only inside the silhouette)
      if (!ctx.reducedMotion) {
        for (let i = 0; i < motes.length; i++) {
          const m = motes[i];
          m.y += m.speed;
          m.x += m.speed * (raySlant * (H / W));
          if (m.y > 1) {
            m.y = 0;
            m.x = Math.random();
          }
          if (m.x > 1) m.x = 0;

          const mx = m.x * W;
          const my = m.y * H;
          const mc = Math.floor(mx / PIXEL);
          const mr = Math.floor(my / PIXEL);
          if (mc < 0 || mr < 0 || mc >= cols || mr >= rows) continue;
          if (!mask[mr * cols + mc]) continue;

          const rayVal = getRayLineIntensity(mx, my);
          if (rayVal > 0.3) {
            const twinkle = (Math.sin(nowSec * 3 + m.phase) + 1) * 0.5;
            const alpha = Math.min(1, rayVal * twinkle * 0.9);
            const pixelX = Math.round(mx / PIXEL) * PIXEL;
            const pixelY = Math.round(my / PIXEL) * PIXEL;
            g.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
            g.fillRect(pixelX, pixelY, PIXEL, PIXEL);
          }
        }
      }
    },

    dispose() {
      ctx.el.removeEventListener("pointermove", onMove);
      ctx.el.removeEventListener("pointerleave", onLeave);
      ctx.el.removeEventListener("pointerdown", onDown);
      canvas.remove();
    },
  };
};

export default mount;
