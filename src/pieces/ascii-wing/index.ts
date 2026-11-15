import type { MountPiece, PieceInstance } from "../types";
import wingSrcUrl from "./wing-src.jpg?url";
import wingMaskUrl from "./wing-mask.png?url";

/**
 * ASCII wing.
 * Dense coloured ASCII of a wing photo: the plane holds still while sky and
 * clouds drift past — the same render used on the life page banner.
 */

const RAMP = " .'`,:;!i<+?|1tfjxnuczXUJCLQ0Zmwqpbhao#MW8B@";
const COLS = 240;
const Y0 = 0.11;
const YSPAN = 0.89;
const HORIZON = 0.42;
const CLEAN_W = 0.66;

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

const mount: MountPiece = async (ctx): Promise<PieceInstance> => {
  const canvas = document.createElement("canvas");
  ctx.el.appendChild(canvas);
  const g = canvas.getContext("2d")!;

  const [img, maskImg] = await Promise.all([loadImage(wingSrcUrl), loadImage(wingMaskUrl)]);

  const SW = COLS;
  const SH = Math.round(COLS * (9 / 16) * (6 / 10));
  const px = shrink(img, img.naturalWidth, img.naturalHeight, SW, SH);
  const md = shrink(maskImg, maskImg.naturalWidth, maskImg.naturalHeight, SW, SH);
  const mask = new Uint8Array(SW * SH);
  for (let i = 0; i < mask.length; i++) mask[i] = md[i * 4];

  const hist = new Float64Array(256);
  for (let i = 0; i < px.length; i += 4) {
    hist[(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) | 0]++;
  }
  const cdf = new Float64Array(256);
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    cdf[i] = acc / (SW * SH);
  }
  const cleanW = Math.floor(SW * CLEAN_W);

  let ppu = 1;
  let drift = 0;
  let drawAcc = 0;
  const lerp = (a: number, b: number, q: number) => a + (b - a) * q;

  const paint = () => {
    const W = ctx.width;
    const H = ctx.height;
    g.setTransform(ppu, 0, 0, ppu, 0, 0);
    g.clearRect(0, 0, W, H);

    const cw = W / COLS;
    const ch = cw * (10 / 6);
    const rows = Math.ceil(H / ch);
    g.font = `bold ${cw * 1.5}px "DejaVu Sans Mono", Menlo, ui-monospace, monospace`;
    g.textBaseline = "top";

    const t = drift;

    for (let r = 0; r < rows; r++) {
      const ny = Y0 + (r / rows) * YSPAN;
      const sy = Math.min(SH - 1, (ny * SH) | 0);

      for (let c = 0; c < COLS; c++) {
        const nx = c / COLS;
        const sxi = Math.min(SW - 1, (nx * SW) | 0);
        const plane = mask[sy * SW + sxi] > 127;

        let R: number;
        let G: number;
        let B: number;

        if (ny > HORIZON - 0.03 && !plane) {
          const BL = 24;
          const P = cleanW - BL;
          let u = ((nx * SW - t) % P + P) % P;
          const tap = (x: number, ch: number) => {
            const x0 = Math.floor(x);
            const f = x - x0;
            const a = px[(sy * SW + Math.min(SW - 1, x0)) * 4 + ch];
            const b = px[(sy * SW + Math.min(SW - 1, x0 + 1)) * 4 + ch];
            return a + (b - a) * f;
          };
          const T = (ch: number) =>
            u < BL ? tap(u + P, ch) + (tap(u, ch) - tap(u + P, ch)) * (u / BL) : tap(u, ch);
          R = T(0);
          G = T(1);
          B = T(2);
        } else {
          const i = (sy * SW + sxi) * 4;
          R = px[i];
          G = px[i + 1];
          B = px[i + 2];
        }

        let v = cdf[Math.min(255, (0.299 * R + 0.587 * G + 0.114 * B) | 0)];

        if (ny < HORIZON && !plane) {
          const sx2 = nx * 9 - t * 0.012;
          const sy2 = ny * 22;
          const wisp =
            Math.max(0, Math.sin(sx2 + Math.sin(sy2 * 0.7 + sx2 * 0.3) * 1.6) * Math.sin(sy2 + sx2 * 0.4) - 0.55) *
            1.6;
          const shimmer = 0.04 * Math.sin(nx * 14 + ny * 30 - t * 0.05);
          v = Math.min(1, v + wisp * 0.5 + shimmer);
        }

        // Light page: ink-on-paper (matches the art canvas)
        let cr: number;
        let cg: number;
        let cb: number;
        let ci: number;

        const lv = Math.pow(v, 2.4);
        ci = Math.max(2, Math.min(RAMP.length - 1, Math.floor((1 - lv * 0.8) * RAMP.length)));

        if (plane) {
          const pv = Math.pow(v, 1.7);
          cr = lerp(8, 165, pv);
          cg = lerp(16, 180, pv);
          cb = lerp(44, 215, pv);
          ci = Math.max(4, Math.min(RAMP.length - 1, Math.floor((1 - pv * 0.85) * RAMP.length)));
        } else if (ny < HORIZON) {
          cr = lerp(35, 120, lv);
          cg = lerp(95, 165, lv);
          cb = lerp(215, 240, lv);
        } else {
          cr = lerp(18, 135, lv);
          cg = lerp(45, 172, lv);
          cb = lerp(125, 235, lv);
        }

        g.fillStyle = `rgb(${Math.min(255, cr) | 0},${Math.min(255, cg) | 0},${Math.min(255, cb) | 0})`;
        g.fillText(RAMP[ci], c * cw, r * ch);
      }
    }
  };

  // First paint once images are ready
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
      // Match the original ~30ms cadence so 240×rows fillText stays affordable
      if (drawAcc < 0.03) return;
      drift += 0.3 * (drawAcc / 0.03);
      drawAcc = 0;
      paint();
    },
    dispose() {
      canvas.remove();
    },
  };
};

export default mount;
