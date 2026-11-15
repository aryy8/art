import * as THREE from "three";
import type { MountPiece, PieceInstance } from "../types";
import { FULLSCREEN_VERT, GLSurface, PingPong } from "../../lib/glpiece";
import { COMPOSITE_FRAG, HORIZON, MAX_DROPS, SIM_FRAG } from "./shaders";
import paintingUrl from "./sunset.webp?url";

/**
 * Sunset sea.
 * Aryan's watercolour, brought to life the way kayak.whimsy.land animates its painting:
 * the painted sea is sampled every frame through a moving water surface. Swells roll
 * the strokes (smaller and slower toward the horizon), the sun path shimmers, and the
 * pointer leaves ripples that bend the paint. The sky only breathes.
 */

const SIM_W = 200;
const SIM_H = 300;

const mount: MountPiece = async (ctx): Promise<PieceInstance> => {
  const gl = new GLSurface(ctx.el);
  const baseTex = await new THREE.TextureLoader().loadAsync(paintingUrl);
  baseTex.colorSpace = THREE.NoColorSpace;
  baseTex.minFilter = THREE.LinearMipmapLinearFilter;
  baseTex.magFilter = THREE.LinearFilter;
  baseTex.anisotropy = 4;

  const sim = new PingPong(SIM_W, SIM_H);
  const drops = Array.from({ length: MAX_DROPS }, () => new THREE.Vector4());
  const simMat = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: SIM_FRAG,
    uniforms: {
      uState: { value: sim.a.texture },
      uTexel: { value: new THREE.Vector2(1 / SIM_W, 1 / SIM_H) },
      uDamping: { value: ctx.reducedMotion ? 0.97 : 0.988 },
      uDrops: { value: drops },
      uDropCount: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const compMat = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: COMPOSITE_FRAG,
    uniforms: {
      uBase: { value: baseTex },
      uSim: { value: sim.a.texture },
      uSimTexel: { value: new THREE.Vector2(1 / SIM_W, 1 / SIM_H) },
      uTime: { value: 0 },
      uAmp: { value: ctx.reducedMotion ? 0.25 : 1 },
    },
    depthTest: false,
    depthWrite: false,
  });

  const queue: { x: number; y: number; r: number; s: number }[] = [];
  const addDrop = (u: { x: number; y: number }, r: number, s: number) => {
    if (u.y <= HORIZON + 0.005 || queue.length >= MAX_DROPS) return;
    const sy = (u.y - HORIZON) / (1 - HORIZON);
    queue.push({ x: u.x, y: sy, r: r * (0.3 + sy), s });
  };

  // hover: a soft, continuous wake that follows the pointer; tap: a ring
  let last: { x: number; y: number } | null = null;
  const onMove = (e: PointerEvent) => {
    const u = ctx.toLocal(e);
    if (u.x < 0 || u.x > 1 || u.y < 0 || u.y > 1) {
      last = null;
      return;
    }
    if (last) {
      const len = Math.hypot((u.x - last.x) * 0.57, u.y - last.y);
      const steps = Math.min(4, Math.ceil(len / 0.012));
      for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        addDrop({ x: last.x + (u.x - last.x) * k, y: last.y + (u.y - last.y) * k }, 0.04, (0.04 + Math.min(0.06, len * 4)) / steps);
      }
    }
    last = u;
  };
  const onLeave = () => (last = null);
  const onDown = (e: PointerEvent) => {
    if (!ctx.isFocused()) return;
    addDrop(ctx.toLocal(e), 0.06, 0.45);
  };
  ctx.el.addEventListener("pointermove", onMove);
  ctx.el.addEventListener("pointerleave", onLeave);
  ctx.el.addEventListener("pointerdown", onDown);

  if (location.search.includes("debug")) {
    (window as unknown as Record<string, unknown>).__sunsetPoke = (x: number, y: number) => addDrop({ x, y }, 0.06, 0.25);
  }

  return {
    setResolution(ppu) {
      gl.setSize(ctx.width * ppu, ctx.height * ppu);
    },
    frame(time) {
      const t = time * (ctx.reducedMotion ? 0.3 : 1);
      for (let step = 0; step < 2; step++) {
        const n = step === 0 ? queue.length : 0;
        if (step === 0) queue.forEach((d, i) => drops[i].set(d.x, d.y, d.r, d.s));
        simMat.uniforms.uDropCount.value = n;
        simMat.uniforms.uState.value = sim.a.texture;
        gl.draw(simMat, sim.b);
        sim.swap();
      }
      queue.length = 0;
      compMat.uniforms.uSim.value = sim.a.texture;
      compMat.uniforms.uTime.value = t;
      gl.draw(compMat, null);
    },
    dispose() {
      ctx.el.removeEventListener("pointermove", onMove);
      ctx.el.removeEventListener("pointerleave", onLeave);
      ctx.el.removeEventListener("pointerdown", onDown);
      sim.dispose();
      baseTex.dispose();
      simMat.dispose();
      compMat.dispose();
      gl.dispose();
    },
  };
};

export default mount;
