import type { MountPiece, PieceInstance } from "../types";
import wingSrcUrl from "./wing-src.jpg?url";
import wingMaskUrl from "./wing-mask.png?url";

/**
 * ASCII wing, seen through a cabin window.
 * Each cell is filled with colour (so the white page never bleaches the view)
 * and a glyph sits on top for the texture. Sky is deep blue, the horizon burns
 * orange, cloud tops are gold over blue shadow, and the engine holds still.
 */

const RAMP = " .:o*O#%@";
const COLS = 120;
const SRC_W = 240;
const Y0 = 0.04;
const YSPAN = 0.94;
const HORIZON = 0.4;
const CLEAN_W = 0.66;
/** Most of the photo, so the cloud sea and the engine both sit in the window. */
const CROP0 = 0.16;
const CROP1 = 0.99;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

/** Area-average down to one pixel per character cell (smooth curves, not jagged). */
function shrink(src: CanvasImageSource, w0: number, h0: number, sw: number, sh: number): Uint8ClampedArray {
  let cur: CanvasImageSource = src;
  let w = w0;
  let h = h0;
  while (w / 2 > sw) {
    const c = document.createElement("canvas");
    w = Math.round(w / 2);
    h = Math.round(h / 2);
    c.width = w;
    c.height = h;
    const x = c.getContext("2d")!;
    x.imageSmoothingQuality = "high";
    x.drawImage(cur, 0, 0, w, h);
    cur = c;
  }
  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  const ox = out.getContext("2d", { willReadFrequently: true })!;
  ox.imageSmoothingQuality = "high";
  ox.drawImage(cur, 0, 0, sw, sh);
  return ox.getImageData(0, 0, sw, sh).data;
}

const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const lerp = (a: number, b: number, q: number) => a + (b - a) * q;

type RGB = { r: number; g: number; b: number };

function mix(a: RGB, b: RGB, q: number): RGB {
  const t = clamp(q);
  return {
    r: lerp(a.r, b.r, t) | 0,
    g: lerp(a.g, b.g, t) | 0,
    b: lerp(a.b, b.b, t) | 0,
  };
}

function sdRoundBox(x: number, y: number, hx: number, hy: number, r: number): number {
  const radius = Math.min(r, hx, hy);
  const qx = Math.abs(x) - hx + radius;
  const qy = Math.abs(y) - hy + radius;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - radius;
}

/** Saturate and contrast a photo pixel so cloud puffs, sky, and the engine stay themselves. */
function punch(R: number, G: number, B: number, sat: number, contrast: number): RGB {
  const lum = 0.299 * R + 0.587 * G + 0.114 * B;
  const mid = (lum - 128) * contrast + 128;
  return {
    r: clamp(mid + (R - lum) * sat, 0, 255) | 0,
    g: clamp(mid + (G - lum) * sat, 0, 255) | 0,
    b: clamp(mid + (B - lum) * sat, 0, 255) | 0,
  };
}

function grade(R: number, G: number, B: number, ny: number, plane: boolean): { ink: RGB; weight: number } {
  const lum = (0.299 * R + 0.587 * G + 0.114 * B) / 255;

  if (plane) {
    const ink = punch(R, G, B, 1.65, 1.2);
    return { ink, weight: lerp(0.9, 0.28, lum) };
  }

  if (ny < HORIZON) {
    const k = clamp(ny / HORIZON);
    const photo = punch(R, G, B, 1.7, 1.28);
    const deep: RGB = { r: 2, g: 22, b: 150 };
    // Upper sky goes deep cobalt; the photo keeps the warm horizon.
    let ink = mix(deep, photo, Math.pow(k, 0.45) * 0.72 + 0.1);
    if (k > 0.8) ink = mix(ink, { r: 255, g: 150, b: 46 }, ((k - 0.8) / 0.2) * 0.62);
    return { ink, weight: lerp(0.66, 0.26, k) };
  }

  // Clouds: the photo already has gold tops and blue shadows. Just make that louder.
  let ink = punch(R, G, B, 1.9, 1.35);
  // Sunlit tops blow out to white. Warm them toward gold without flattening the puffs.
  if (lum > 0.6) {
    const up = clamp((0.88 - ny) / 0.42);
    const lift = clamp((lum - 0.6) / 0.35) * (0.35 + up * 0.65);
    ink = {
      r: clamp(ink.r + 48 * lift, 0, 255) | 0,
      g: clamp(ink.g * (1 - 0.22 * lift) + 20 * lift, 0, 255) | 0,
      b: clamp(ink.b * (1 - 0.72 * lift), 0, 255) | 0,
    };
  }
  return { ink, weight: lerp(0.9, 0.24, lum) };
}

const mount: MountPiece = async (ctx): Promise<PieceInstance> => {
  const canvas = document.createElement("canvas");
  ctx.el.appendChild(canvas);
  const g = canvas.getContext("2d")!;

  const [img, maskImg] = await Promise.all([loadImage(wingSrcUrl), loadImage(wingMaskUrl)]);

  const SW = SRC_W;
  const SH = Math.round(SRC_W * (9 / 16) * (6 / 10));
  const px = shrink(img, img.naturalWidth, img.naturalHeight, SW, SH);
  const md = shrink(maskImg, maskImg.naturalWidth, maskImg.naturalHeight, SW, SH);
  const mask = new Uint8Array(SW * SH);
  for (let i = 0; i < mask.length; i++) mask[i] = md[i * 4];
  const cleanW = Math.floor(SW * CLEAN_W);

  let ppu = 1;
  let drift = 0;
  let drawAcc = 0;

  const paint = () => {
    const W = ctx.width;
    const H = ctx.height;
    g.setTransform(ppu, 0, 0, ppu, 0, 0);
    g.clearRect(0, 0, W, H);

    const cw = W / COLS;
    const ch = cw * (10 / 6);
    const rows = Math.ceil(H / ch);
    g.font = `700 ${cw * 1.55}px "JetBrains Mono", ui-monospace, Menlo, monospace`;
    g.textBaseline = "middle";
    g.textAlign = "center";

    const t = drift;
    const hx = W * 0.47;
    const hy = H * 0.478;
    const rad = W * 0.22;
    const bezel = Math.min(W, H) * 0.06;
    const ihx = hx - bezel;
    const ihy = hy - bezel;
    const irad = Math.max(12, rad - bezel * 0.35);
    const lip = Math.max(cw, ch) * 1.6;

    for (let r = 0; r < rows; r++) {
      const py = rows <= 1 ? 0.5 : r / (rows - 1);
      const ny = Y0 + py * YSPAN;
      const sy = Math.min(SH - 1, (ny * SH) | 0);
      const dy = (r + 0.5) * ch - H / 2;
      const y0 = r * ch;

      for (let c = 0; c < COLS; c++) {
        const dx = (c + 0.5) * cw - W / 2;
        const outer = sdRoundBox(dx, dy, hx, hy, rad);
        if (outer > 0) continue;

        const inner = sdRoundBox(dx, dy, ihx, ihy, irad);
        const nx = c / COLS;
        const x0 = c * cw;

        let ink: RGB;
        let weight: number;

        if (inner > 0) {
          const fromGlass = clamp(inner / bezel);
          const lipGlow = clamp(1 - inner / lip);
          const sunCatch = clamp((nx - 0.2) / 0.8);
          const plastic = mix({ r: 214, g: 210, b: 204 }, { r: 252, g: 250, b: 246 }, 1 - fromGlass * 0.35);
          const gold: RGB = { r: 255, g: 248, b: 232 };
          ink = mix(plastic, gold, lipGlow * sunCatch * 0.35);
          if (inner < lip * 0.45) ink = mix(ink, { r: 186, g: 182, b: 174 }, 0.4);
          weight = 0.64;
        } else {
          const srcNx = CROP0 + nx * (CROP1 - CROP0);
          const sxi = Math.min(SW - 1, (srcNx * SW) | 0);
          const plane = mask[sy * SW + sxi] > 127;

          let R: number;
          let G: number;
          let B: number;
          if (ny > HORIZON - 0.02 && !plane) {
            const BL = 16;
            const P = Math.max(8, cleanW - BL);
            let u = ((srcNx * SW - t) % P + P) % P;
            const tap = (x: number, chn: number) => {
              const x0s = Math.floor(x);
              const f = x - x0s;
              const a = px[(sy * SW + Math.min(SW - 1, x0s)) * 4 + chn];
              const b = px[(sy * SW + Math.min(SW - 1, x0s + 1)) * 4 + chn];
              return a + (b - a) * f;
            };
            const T = (chn: number) =>
              u < BL ? tap(u + P, chn) + (tap(u, chn) - tap(u + P, chn)) * (u / BL) : tap(u, chn);
            R = T(0);
            G = T(1);
            B = T(2);
          } else {
            const i = (sy * SW + sxi) * 4;
            R = px[i];
            G = px[i + 1];
            B = px[i + 2];
          }

          const graded = grade(R, G, B, ny, plane);
          ink = graded.ink;
          weight = graded.weight;
          // Seat the glass in the frame with a thin dark inner edge.
          if (inner > -lip * 0.7) ink = mix(ink, { r: 8, g: 10, b: 18 }, clamp(1 + inner / (lip * 0.7)) * 0.55);
        }

        g.fillStyle = `rgb(${ink.r},${ink.g},${ink.b})`;
        g.fillRect(x0, y0, cw + 0.75, ch + 0.75);

        const ci = Math.max(1, Math.min(RAMP.length - 1, Math.floor(weight * (RAMP.length - 0.01))));
        const lum = 0.299 * ink.r + 0.587 * ink.g + 0.114 * ink.b;
        const glyph =
          inner > 0
            ? mix(ink, { r: 236, g: 232, b: 226 }, 0.4)
            : lum > 150
              ? mix(ink, { r: 40, g: 22, b: 10 }, 0.22)
              : mix(ink, { r: 255, g: 244, b: 220 }, 0.2);
        g.fillStyle = `rgb(${glyph.r},${glyph.g},${glyph.b})`;
        g.fillText(RAMP[ci], dx + W / 2, dy + H / 2);
      }
    }
  };

  canvas.width = Math.round(ctx.width * ppu);
  canvas.height = Math.round(ctx.height * ppu);
  paint();

  return {
    setResolution(next) {
      ppu = next;
      canvas.width = Math.round(ctx.width * ppu);
      canvas.height = Math.round(ctx.height * ppu);
      paint();
    },
    frame(_time, dt) {
      if (ctx.reducedMotion) return;
      drawAcc += dt;
      if (drawAcc < 0.034) return;
      drift += 0.12 * (drawAcc / 0.034);
      drawAcc = 0;
      paint();
    },
    dispose() {
      canvas.remove();
    },
  };
};

export default mount;
