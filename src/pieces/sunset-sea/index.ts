import * as THREE from "three";
import type { MountPiece, PieceInstance } from "../types";
import { FULLSCREEN_VERT, GLSurface, PingPong } from "../../lib/glpiece";
import { ASP, COMPOSITE_FRAG, HORIZON, MAX_DROPS, MAX_GLINTS, PAINT_FRAG, SIM_FRAG } from "./shaders";

/**
 * Sunset sea.
 * A wet-on-wet sky whose clouds drift, a sea built from horizontal brush strokes that
 * swell and slide, and a sun path of broken, twinkling lifts of bare paper.
 * Move across the water to scatter glints; tap for a ripple.
 */

const SIM_W = 200;
const SIM_H = 300;
const SKY_EVERY = 3; // re-paint the slow sky every N frames

const mount: MountPiece = (ctx): PieceInstance => {
  const gl = new GLSurface(ctx.el);
  const motion = ctx.reducedMotion ? 0.2 : 1;

  const paintMat = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: PAINT_FRAG,
    uniforms: {
      uPaperScale: { value: new THREE.Vector2(ctx.width, ctx.height) },
      uTime: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const sim = new PingPong(SIM_W, SIM_H);
  const drops = Array.from({ length: MAX_DROPS }, () => new THREE.Vector4());
  const simMat = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: SIM_FRAG,
    uniforms: {
      uState: { value: sim.a.texture },
      uTexel: { value: new THREE.Vector2(1 / SIM_W, 1 / SIM_H) },
      uDamping: { value: ctx.reducedMotion ? 0.97 : 0.984 },
      uDrops: { value: drops },
      uDropCount: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const glints = Array.from({ length: MAX_GLINTS }, () => new THREE.Vector4(0, 0, 0, 0.01));
  const glintBirth = new Float32Array(MAX_GLINTS).fill(-99);
  const glintLife = new Float32Array(MAX_GLINTS).fill(1);
  let glintNext = 0;
  const compMat = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: COMPOSITE_FRAG,
    uniforms: {
      uPaint: { value: null },
      uSim: { value: sim.a.texture },
      uSimTexel: { value: new THREE.Vector2(1 / SIM_W, 1 / SIM_H) },
      uPaperScale: { value: new THREE.Vector2(ctx.width, ctx.height) },
      uTime: { value: 0 },
      uGlints: { value: glints },
    },
    depthTest: false,
    depthWrite: false,
  });

  let paintRT: THREE.WebGLRenderTarget | null = null;
  let frameNo = 0;
  let forcePaint = true;
  let clock = 0;
  let paintClock = 0;

  const queue: { x: number; y: number; r: number; s: number }[] = [];
  const toSea = (u: { x: number; y: number }) => ({ x: u.x, y: (u.y - HORIZON) / (1 - HORIZON) });
  const addDrop = (u: { x: number; y: number }, r: number, s: number) => {
    if (u.y <= HORIZON + 0.005 || queue.length >= MAX_DROPS) return;
    const sv = toSea(u);
    queue.push({ x: sv.x, y: sv.y, r: r * (0.35 + sv.y), s });
  };
  const addGlint = (u: { x: number; y: number }, len: number, life: number) => {
    if (u.y <= HORIZON + 0.004) return;
    const i = glintNext++ % MAX_GLINTS;
    const s = (u.y - HORIZON) / (1 - HORIZON);
    glints[i].set(u.x * ASP, u.y, 0.001, len * (0.35 + 0.9 * s));
    glintBirth[i] = clock;
    glintLife[i] = life;
  };

  let last: { x: number; y: number } | null = null;
  const onMove = (e: PointerEvent) => {
    const u = ctx.toLocal(e);
    if (u.x < 0 || u.x > 1 || u.y < 0 || u.y > 1) {
      last = null;
      return;
    }
    if (last) {
      const dx = (u.x - last.x) * ASP, dy = u.y - last.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.002) {
        addDrop(u, 0.03, Math.min(0.05, len * 0.8));
        const n = Math.min(3, Math.floor(len / 0.01) + (Math.random() < 0.5 ? 1 : 0));
        for (let i = 0; i < n; i++) {
          const jx = (Math.random() - 0.5) * 0.06, jy = (Math.random() - 0.5) * 0.02;
          addGlint({ x: u.x + jx, y: u.y + jy }, 0.008 + Math.random() * 0.012, 0.9 + Math.random() * 0.9);
        }
      }
    }
    last = u;
  };
  const onLeave = () => (last = null);
  const onDown = (e: PointerEvent) => {
    if (!ctx.isFocused()) return;
    const u = ctx.toLocal(e);
    addDrop(u, 0.05, 0.25);
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.02 + Math.random() * 0.07;
      addGlint({ x: u.x + (Math.cos(a) * r) / ASP * 0.6, y: u.y + Math.sin(a) * r * 0.25 }, 0.01 + Math.random() * 0.016, 1.2 + Math.random());
    }
  };
  ctx.el.addEventListener("pointermove", onMove);
  ctx.el.addEventListener("pointerleave", onLeave);
  ctx.el.addEventListener("pointerdown", onDown);

  if (location.search.includes("debug")) {
    (window as unknown as Record<string, unknown>).__sunsetPoke = (x: number, y: number) => {
      addDrop({ x, y }, 0.05, 0.25);
      for (let i = 0; i < 9; i++) addGlint({ x: x + (Math.random() - 0.5) * 0.15, y: y + (Math.random() - 0.5) * 0.03 }, 0.015, 3);
    };
  }

  return {
    setResolution(ppu) {
      gl.setSize(ctx.width * ppu, ctx.height * ppu);
      paintRT?.dispose();
      paintRT = new THREE.WebGLRenderTarget(gl.width, gl.height, {
        type: THREE.UnsignedByteType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
      });
      compMat.uniforms.uPaint.value = paintRT.texture;
      forcePaint = true;
    },
    frame(time, dt) {
      if (!paintRT) return;
      clock = time;
      const t = time * motion;
      frameNo++;
      if (forcePaint || frameNo % SKY_EVERY === 0) {
        paintClock = t;
        paintMat.uniforms.uTime.value = paintClock;
        gl.draw(paintMat, paintRT);
        forcePaint = false;
      }
      // ambient: the sea breathes a little on its own
      if (!ctx.reducedMotion && Math.random() < dt * 0.6) {
        addDrop({ x: 0.1 + Math.random() * 0.8, y: HORIZON + 0.1 + Math.random() * 0.5 }, 0.025, 0.02);
      }
      for (let i = 0; i < MAX_GLINTS; i++) {
        const age = (time - glintBirth[i]) / glintLife[i];
        glints[i].z = age > 0 && age < 1 ? age : 0;
      }
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
      void dt;
    },
    dispose() {
      ctx.el.removeEventListener("pointermove", onMove);
      ctx.el.removeEventListener("pointerleave", onLeave);
      ctx.el.removeEventListener("pointerdown", onDown);
      paintRT?.dispose();
      sim.dispose();
      paintMat.dispose();
      simMat.dispose();
      compMat.dispose();
      gl.dispose();
    },
  };
};

export default mount;
