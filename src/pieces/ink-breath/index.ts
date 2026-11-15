import type { MountPiece, PieceInstance } from "../types";

/**
 * Ink, breathing — the tiny second piece that proves the system.
 * Plain Canvas2D, no WebGL: a single loop of ink that slowly breathes, leaving
 * fading ghosts of its earlier selves on the paper.
 */
function noise1(x: number) {
  // smooth 1D value noise from a few sines (deterministic, cheap)
  return Math.sin(x * 1.3 + 1.7) * 0.5 + Math.sin(x * 2.7 + 0.3) * 0.3 + Math.sin(x * 5.1 + 4.1) * 0.2;
}

const mount: MountPiece = (ctx) => {
  const canvas = document.createElement("canvas");
  ctx.el.appendChild(canvas);
  const g = canvas.getContext("2d")!; // transparent: drawn straight onto the page's paper
  let ppu = 1;
  let slow = 0;
  let holding = false;
  let t = 0;

  const clear = () => {
    g.clearRect(0, 0, canvas.width, canvas.height);
  };

  const onDown = () => {
    if (ctx.isFocused()) holding = true;
  };
  const onUp = () => (holding = false);
  ctx.el.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);

  const draw = () => {
    const W = canvas.width;
    const H = canvas.height;
    const s = Math.min(W, H);
    // the paper slowly forgets
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = "rgba(0,0,0,0.035)";
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "source-over";

    const breath = Math.sin(t * 0.55) * 0.5 + 0.5;
    const R = s * (0.27 + 0.05 * breath);
    g.beginPath();
    const N = 220;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const n = noise1(Math.cos(a) * 1.6 + t * 0.21) * 0.6 + noise1(Math.sin(a) * 1.6 - t * 0.17 + 9) * 0.4;
      const r = R * (1 + 0.09 * n + 0.015 * Math.sin(a * 7 + t));
      const x = W / 2 + Math.cos(a) * r;
      const y = H / 2 + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokeStyle = `rgba(29, 36, 43, ${0.16 + 0.12 * (1 - breath)})`;
    g.lineWidth = Math.max(0.6, 1.1 * ppu);
    g.lineJoin = "round";
    g.stroke();
  };

  const inst: PieceInstance = {
    setResolution(p) {
      ppu = p;
      canvas.width = Math.round(ctx.width * p);
      canvas.height = Math.round(ctx.height * p);
      clear();
      // pre-roll so the piece never starts empty
      for (let i = 0; i < 90; i++) {
        t += 0.05;
        draw();
      }
    },
    frame(_time, dt) {
      slow += ((holding ? 1 : 0) - slow) * Math.min(1, dt * 3);
      const speed = (ctx.reducedMotion ? 0.25 : 1) * (1 - 0.88 * slow);
      t += dt * speed;
      draw();
    },
    dispose() {
      ctx.el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      canvas.remove();
    },
  };
  return inst;
};

export default mount;
