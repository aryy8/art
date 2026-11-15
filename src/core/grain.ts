/**
 * A tileable paper-grain texture generated once at startup.
 * Fibrous, low-contrast, mostly-transparent noise; it's laid over the white as a
 * multiply-ish overlay at very low opacity so the canvas reads as paper, not as noise.
 */
function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

function valueNoiseTile(size: number, cells: number, seed: number) {
  const out = new Float32Array(size * size);
  const step = size / cells;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x / step;
      const fy = y / step;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const x0 = ix % cells;
      const y0 = iy % cells;
      const x1 = (ix + 1) % cells;
      const y1 = (iy + 1) % cells;
      const a = hash(x0, y0, seed);
      const b = hash(x1, y0, seed);
      const c = hash(x0, y1, seed);
      const d = hash(x1, y1, seed);
      out[y * size + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

export function makeGrainDataURL(size = 256): string {
  const octaves = [
    { cells: 128, w: 0.45 },
    { cells: 64, w: 0.3 },
    { cells: 32, w: 0.15 },
    { cells: 8, w: 0.1 },
  ];
  const acc = new Float32Array(size * size);
  octaves.forEach((o, i) => {
    const n = valueNoiseTile(size, o.cells, 17 + i * 31);
    for (let k = 0; k < acc.length; k++) acc[k] += n[k] * o.w;
  });
  // fibres: a few faint elongated strands
  const fib = valueNoiseTile(size, 16, 91);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let k = 0; k < acc.length; k++) {
    const x = k % size;
    const y = (k / size) | 0;
    // emboss: compare with neighbour to get a lit-paper feel
    const n = acc[k];
    const nb = acc[((y + 1) % size) * size + ((x + 1) % size)];
    const relief = (n - nb) * 2.2;
    const fibre = Math.max(0, Math.abs(fib[k] - 0.5) < 0.012 ? 0.5 : 0);
    const dark = Math.max(0, (0.5 - n) * 0.9 + relief * 0.6 + fibre * 0.3);
    const light = Math.max(0, -relief * 0.6);
    const i = k * 4;
    if (dark >= light) {
      img.data[i] = 92;
      img.data[i + 1] = 84;
      img.data[i + 2] = 70;
      img.data[i + 3] = Math.min(255, dark * 255);
    } else {
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, light * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}
