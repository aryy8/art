import * as THREE from "three";
import type { MountPiece, PieceInstance } from "../types";
import { FULLSCREEN_VERT, GLSurface, PingPong } from "../../lib/glpiece";
import {
  createSim,
  feedAt,
  pokeAt,
  setPointer,
  stepSim,
  W,
  H,
  MAX_PELLETS,
  type SimState,
} from "./sim";
import {
  createFinFan,
  createFishBody,
  updateFinFan,
  updateFishBody,
  type FinFan,
  type FishBody,
} from "./fish-mesh";
import { COMPOSITE_FRAG, MAX_DROPS, SIM_FRAG } from "./shaders";

import waterUrl from "./assets/water-plate.webp?url";
import floraUrl from "./assets/flora-plate.webp?url";
import waterMaskUrl from "./assets/water-mask.webp?url";
import koiUrl from "./assets/koi.webp?url";
import finUrl from "./assets/fin.webp?url";

/**
 * Koi pond — layered oil pastel.
 * Water plate distorts. Flora plate (pads + lotus) stays still.
 * Torn edge is alpha so the page paper shows through — no off-white box.
 */

const SIM_W = 200;
const SIM_H = 150;
const FLOW_W = 64;
const FLOW_H = 48;
const RIPPLE_HZ = 120;
const FLOW_STRENGTH = 1.5 / 800;
const FLOW_STRENGTH_RM = 0.4 / 800;

async function loadTex(url: string, label: string): Promise<THREE.Texture | null> {
  try {
    const tex = await new THREE.TextureLoader().loadAsync(url);
    tex.colorSpace = THREE.NoColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    tex.generateMipmaps = true;
    return tex;
  } catch (e) {
    console.warn(`[koi-pond] missing asset: ${label}`, e);
    return null;
  }
}

function solidTex(rgb: [number, number, number]): THREE.DataTexture {
  const data = new Uint8Array([rgb[0], rgb[1], rgb[2], 255]);
  const t = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function makeFallbackFishTex(): THREE.DataTexture {
  const w = 256;
  const h = 128;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const u = x / w;
      const v = (y / h) * 2 - 1;
      const body = Math.abs(v) < 0.35 * (0.3 + 0.7 * Math.sin(u * Math.PI));
      if (body) {
        data[i] = 230;
        data[i + 1] = 120;
        data[i + 2] = 40;
        data[i + 3] = 255;
      }
    }
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.needsUpdate = true;
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function buildFlowTexture(plate: THREE.Texture | null): THREE.DataTexture {
  const data = new Uint8Array(FLOW_W * FLOW_H * 4);
  let lum: Float32Array | null = null;
  const img = plate?.image as HTMLImageElement | ImageBitmap | undefined;
  if (img && "width" in img) {
    const c = document.createElement("canvas");
    c.width = FLOW_W;
    c.height = FLOW_H;
    const c2d = c.getContext("2d")!;
    c2d.drawImage(img as CanvasImageSource, 0, 0, FLOW_W, FLOW_H);
    const px = c2d.getImageData(0, 0, FLOW_W, FLOW_H).data;
    lum = new Float32Array(FLOW_W * FLOW_H);
    for (let i = 0; i < lum.length; i++) {
      lum[i] = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.5 + px[i * 4 + 2] * 0.2) / 255;
    }
  }
  for (let y = 0; y < FLOW_H; y++) {
    for (let x = 0; x < FLOW_W; x++) {
      const i = y * FLOW_W + x;
      let fx = Math.sin(x * 0.2 + y * 0.13) * Math.cos(y * 0.17);
      let fy = Math.sin(x * 0.11 - y * 0.19 + 2.1);
      if (lum) {
        const x0 = Math.max(0, x - 1);
        const x1 = Math.min(FLOW_W - 1, x + 1);
        const y0 = Math.max(0, y - 1);
        const y1 = Math.min(FLOW_H - 1, y + 1);
        const gx = lum[y * FLOW_W + x1] - lum[y * FLOW_W + x0];
        const gy = lum[y1 * FLOW_W + x] - lum[y0 * FLOW_W + x];
        fx = fx * 0.3 + -gy * 10;
        fy = fy * 0.3 + gx * 10;
      }
      const cx = x / FLOW_W - 0.45;
      const cy = y / FLOW_H - 0.5;
      fx += -cy * 0.55;
      fy += cx * 0.55;
      const l = Math.hypot(fx, fy) || 1;
      data[i * 4] = ((fx / l) * 0.5 + 0.5) * 255;
      data[i * 4 + 1] = ((fy / l) * 0.5 + 0.5) * 255;
      data[i * 4 + 2] = 0;
      data[i * 4 + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, FLOW_W, FLOW_H, THREE.RGBAFormat);
  t.needsUpdate = true;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

const mount: MountPiece = async (ctx): Promise<PieceInstance> => {
  const gl = new GLSurface(ctx.el);
  gl.setSize(ctx.width, ctx.height);

  const [water0, flora0, mask0, koi0, fin0] = await Promise.all([
    loadTex(waterUrl, "water-plate.webp"),
    loadTex(floraUrl, "flora-plate.webp"),
    loadTex(waterMaskUrl, "water-mask.webp"),
    loadTex(koiUrl, "koi.webp"),
    loadTex(finUrl, "fin.webp"),
  ]);

  const waterTex = water0 ?? solidTex([20, 70, 90]);
  const floraTex = flora0 ?? waterTex;
  const waterMask = mask0 ?? solidTex([255, 255, 255]);
  const koiTex = koi0 ?? makeFallbackFishTex();
  const finTex = fin0 ?? koiTex;

  const flowTex = buildFlowTexture(waterTex);
  const ripple = new PingPong(SIM_W, SIM_H);
  const drops = Array.from({ length: MAX_DROPS }, () => new THREE.Vector4());
  const simMat = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: SIM_FRAG,
    uniforms: {
      uState: { value: ripple.a.texture },
      uTexel: { value: new THREE.Vector2(1 / SIM_W, 1 / SIM_H) },
      uDamping: { value: ctx.reducedMotion ? 0.97 : 0.978 },
      uDrops: { value: drops },
      uDropCount: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
  });

  const makeRT = (w: number, h: number) =>
    new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });

  let fishRT = makeRT(ctx.width, ctx.height);

  const fishBodies: FishBody[] = [createFishBody(koiTex), createFishBody(koiTex)];
  const fins: FinFan[] = [
    createFinFan(finTex),
    createFinFan(finTex),
    createFinFan(finTex),
    createFinFan(finTex),
  ];

  const state: SimState = createSim(ctx.reducedMotion);
  const fishScene = new THREE.Scene();
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const pelletUniforms = Array.from({ length: MAX_PELLETS }, () => new THREE.Vector4());
  const compMat = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: COMPOSITE_FRAG,
    uniforms: {
      uWater: { value: waterTex },
      uFlora: { value: floraTex },
      uWaterMask: { value: waterMask },
      uSim: { value: ripple.a.texture },
      uFish: { value: fishRT.texture },
      uFlow: { value: flowTex },
      uSimTexel: { value: new THREE.Vector2(1 / SIM_W, 1 / SIM_H) },
      uRes: { value: new THREE.Vector2(ctx.width, ctx.height) },
      uTime: { value: 0 },
      uAmp: { value: ctx.reducedMotion ? 0.25 : 1 },
      uFlowAmp: { value: ctx.reducedMotion ? FLOW_STRENGTH_RM : FLOW_STRENGTH },
      uPellets: { value: pelletUniforms },
      uPelletCount: { value: 0 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  let fishAcc = 0;
  let rippleAcc = 0;
  let paused = false;
  let disposed = false;

  const queue: { x: number; y: number; r: number; s: number }[] = [];
  const addDrop = (u: { x: number; y: number }, r: number, s: number) => {
    if (u.x < 0 || u.x > 1 || u.y < 0 || u.y > 1) return;
    if (queue.length >= MAX_DROPS) return;
    queue.push({ x: u.x, y: u.y, r, s });
  };

  let last: { x: number; y: number; t: number } | null = null;
  const onMove = (e: PointerEvent) => {
    const u = ctx.toLocal(e);
    if (u.x < 0 || u.x > 1 || u.y < 0 || u.y > 1) {
      last = null;
      setPointer(state, null, 0);
      return;
    }
    const now = performance.now() / 1000;
    let vel = 0;
    if (last) {
      const dx = (u.x - last.x) * W;
      const dy = (u.y - last.y) * H;
      const dtp = Math.max(1e-3, now - last.t);
      vel = Math.hypot(dx, dy) / dtp;
      if (!ctx.reducedMotion) {
        const lenN = Math.hypot((u.x - last.x) * (W / H) * 0.75, u.y - last.y);
        const steps = Math.min(4, Math.ceil(lenN / 0.012));
        for (let i = 1; i <= steps; i++) {
          const k = i / steps;
          addDrop(
            { x: last.x + (u.x - last.x) * k, y: last.y + (u.y - last.y) * k },
            0.035,
            (0.035 + Math.min(0.055, lenN * 3.5)) / steps,
          );
        }
      }
    }
    last = { x: u.x, y: u.y, t: now };
    setPointer(state, { x: u.x * W, y: u.y * H }, vel);
  };
  const onLeave = () => {
    last = null;
    setPointer(state, null, 0);
  };
  const onDown = (e: PointerEvent) => {
    if (!ctx.isFocused()) return;
    const u = ctx.toLocal(e);
    feedAt(state, u.x * W, u.y * H);
  };
  ctx.el.addEventListener("pointermove", onMove);
  ctx.el.addEventListener("pointerleave", onLeave);
  ctx.el.addEventListener("pointerdown", onDown);

  const debug = location.search.includes("debug");
  if (debug) {
    (window as unknown as Record<string, unknown>).__koi = {
      poke: (x: number, y: number) => pokeAt(state, x, y),
      feed: (x: number, y: number) => feedAt(state, x, y),
      fish: state.fish,
    };
  }

  const drawFishLayer = () => {
    while (fishScene.children.length) fishScene.remove(fishScene.children[0]);
    const order = [0, 1].sort((a, b) => state.fish[b].depth - state.fish[a].depth);
    for (const fi of order) {
      const f = state.fish[fi];
      updateFishBody(fishBodies[fi], f);
      for (let side = 0; side < 2; side++) {
        const mi = fi * 2 + side;
        updateFinFan(fins[mi], f, side === 0 ? 1 : -1, side === 0 ? f.finL : f.finR);
        fishScene.add(fins[mi].mesh);
      }
      fishScene.add(fishBodies[fi].mesh);
    }
    gl.renderer.setRenderTarget(fishRT);
    gl.renderer.setClearColor(0x000000, 0);
    gl.renderer.clear();
    gl.renderer.setViewport(0, 0, fishRT.width, fishRT.height);
    gl.renderer.render(fishScene, ortho);
  };

  return {
    setResolution(ppu) {
      const w = Math.max(1, Math.round(ctx.width * ppu));
      const h = Math.max(1, Math.round(ctx.height * ppu));
      gl.setSize(w, h);
      fishRT.setSize(w, h);
      compMat.uniforms.uRes.value.set(w, h);
    },
    setFocused(focused: boolean) {
      state.focused = focused;
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      fishAcc = 0;
      rippleAcc = 0;
    },
    frame(_time, dt) {
      if (disposed || paused) return;
      try {
        const dtc = Math.min(dt, 0.064);
        fishAcc = stepSim(state, dtc, fishAcc);

        for (const d of state.pendingDrops) addDrop({ x: d.x, y: d.y }, d.r, d.s);
        state.pendingDrops.length = 0;

        rippleAcc += dtc;
        const stepDt = 1 / RIPPLE_HZ;
        let steps = 0;
        let injected = false;
        while (rippleAcc >= stepDt && steps < 4) {
          const n = !injected ? Math.min(queue.length, MAX_DROPS) : 0;
          if (!injected) {
            for (let i = 0; i < n; i++) {
              const d = queue[i];
              drops[i].set(d.x, d.y, d.r, d.s);
            }
            injected = true;
          }
          simMat.uniforms.uDropCount.value = n;
          simMat.uniforms.uState.value = ripple.a.texture;
          gl.draw(simMat, ripple.b);
          ripple.swap();
          rippleAcc -= stepDt;
          steps++;
        }
        queue.length = 0;

        drawFishLayer();

        let pc = 0;
        for (let i = 0; i < MAX_PELLETS; i++) {
          const p = state.pellets[i];
          if (!p.alive) continue;
          pelletUniforms[pc].set(p.x / W, p.y / H, p.age / 12, 1);
          pc++;
        }
        for (let i = pc; i < MAX_PELLETS; i++) pelletUniforms[i].set(0, 0, 0, 0);
        compMat.uniforms.uPelletCount.value = pc;
        compMat.uniforms.uSim.value = ripple.a.texture;
        compMat.uniforms.uFish.value = fishRT.texture;
        compMat.uniforms.uTime.value = state.time * (ctx.reducedMotion ? 0.4 : 1);
        gl.draw(compMat, null);
      } catch (err) {
        console.error("[koi-pond] frame error", err);
        throw err;
      }
    },
    dispose() {
      disposed = true;
      ctx.el.removeEventListener("pointermove", onMove);
      ctx.el.removeEventListener("pointerleave", onLeave);
      ctx.el.removeEventListener("pointerdown", onDown);
      if (debug) delete (window as unknown as Record<string, unknown>).__koi;
      ripple.dispose();
      fishRT.dispose();
      simMat.dispose();
      compMat.dispose();
      for (const b of fishBodies) {
        b.mesh.geometry.dispose();
        b.mat.dispose();
      }
      for (const q of fins) {
        q.mesh.geometry.dispose();
        q.mat.dispose();
      }
      for (const t of [waterTex, floraTex, waterMask, koiTex, finTex, flowTex]) {
        t.dispose();
      }
      gl.dispose();
    },
  };
};

export default mount;
