import * as THREE from "three";
import type { MountPiece, PieceContext, PieceInstance } from "../types";
import { FULLSCREEN_VERT, GLSurface, PingPong } from "../../lib/glpiece";
import { PAINT_FRAG } from "./paint.glsl";
import { COMPOSITE_FRAG, MAX_DROPS, SIM_FRAG } from "./water.glsl";
import { ASPECT, POND, pondR, pondSDF } from "./shape";

/**
 * Pond, early morning.
 * A procedural watercolour painted once into a texture, then brought to life every
 * frame by a GPU height-field ripple simulation that refracts and lifts the pigment.
 */

const SIM_W = 360;
const SIM_H = 240;

type V2 = { x: number; y: number };
const toQ = (u: V2): V2 => ({ x: (u.x - 0.5) * ASPECT, y: u.y - 0.5 });
const toUV = (q: V2): V2 => ({ x: q.x / ASPECT + 0.5, y: q.y + 0.5 });

interface Duck {
  p: V2;
  v: V2;
  heading: number;
  size: number;
}

const mount: MountPiece = (ctx: PieceContext): PieceInstance => {
  const gl = new GLSurface(ctx.el);
  const motion = ctx.reducedMotion ? 0.25 : 1;

  // ----- materials -----
  const paintMat = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: PAINT_FRAG,
    uniforms: { uPaperScale: { value: new THREE.Vector2(ctx.width, ctx.height) } },
    depthTest: false,
    depthWrite: false,
  });
  const drops = Array.from({ length: MAX_DROPS }, () => new THREE.Vector4());
  const sim = new PingPong(SIM_W, SIM_H);
  const simMat = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: SIM_FRAG,
    uniforms: {
      uState: { value: sim.a.texture },
      uTexel: { value: new THREE.Vector2(1 / SIM_W, 1 / SIM_H) },
      uDamping: { value: ctx.reducedMotion ? 0.975 : 0.987 },
      uDrops: { value: drops },
      uDropCount: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const ducksU = Array.from({ length: 4 }, () => new THREE.Vector4(-9, -9, 0, 1));
  const compMat = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: COMPOSITE_FRAG,
    uniforms: {
      uPaint: { value: null },
      uSim: { value: sim.a.texture },
      uSimTexel: { value: new THREE.Vector2(1 / SIM_W, 1 / SIM_H) },
      uPaperScale: { value: new THREE.Vector2(ctx.width, ctx.height) },
      uTime: { value: 0 },
      uMotion: { value: motion },
      uBoat: { value: new THREE.Vector4(-9, -9, 0, 0) },
      uDucks: { value: ducksU },
    },
    depthTest: false,
    depthWrite: false,
  });

  let paintRT: THREE.WebGLRenderTarget | null = null;
  let dirtyPaint = true;

  // ----- drops queue -----
  const queue: { u: V2; r: number; s: number }[] = [];
  const addDrop = (u: V2, r: number, s: number) => {
    const q = toQ(u);
    if (pondSDF(q.x, q.y) > 0.01) return;
    if (queue.length < MAX_DROPS) queue.push({ u, r, s });
  };

  // ----- creatures -----
  const pathPoint = (theta: number, k: number): V2 => {
    const r = pondR(theta) * k;
    return { x: POND.cx + Math.cos(theta) * r * POND.sx, y: POND.cy + Math.sin(theta) * r };
  };
  const boat = { theta: 2.2, phase: 0, prev: pathPoint(2.2, 0.62) };
  const ducks: Duck[] = [];
  const startDuck = pathPoint(-0.6, 0.5);
  ducks.push({ p: { ...startDuck }, v: { x: 0, y: 0 }, heading: 0, size: 1.55 });
  for (let i = 1; i < 4; i++) {
    ducks.push({ p: { x: startDuck.x - 0.03 * i, y: startDuck.y + 0.01 * i }, v: { x: 0, y: 0 }, heading: 0, size: 0.9 });
  }
  let duckTheta = -0.6;
  let cursor: V2 | null = null;
  let lastCursorU: V2 | null = null;
  let lastMoveT = 0;
  let nextRise = 2;

  const updateCreatures = (time: number, dt: number) => {
    const m = motion;
    // boat glides along an inner loop, in rhythm with its paddle
    const stroke = 0.75 + 0.25 * Math.sin(boat.phase * 2);
    boat.theta -= dt * 0.035 * m * stroke;
    boat.phase += dt * 2.4 * m;
    const bp = pathPoint(boat.theta + 0.12 * Math.sin(boat.theta * 3), 0.6 + 0.05 * Math.sin(boat.theta * 2.3));
    const bdx = bp.x - boat.prev.x;
    const bdy = bp.y - boat.prev.y;
    const bsp = Math.hypot(bdx, bdy) / Math.max(dt, 1e-3);
    const heading = Math.atan2(bdy, bdx);
    boat.prev = bp;
    const bu = toUV(bp);
    (compMat.uniforms.uBoat.value as THREE.Vector4).set(bu.x, bu.y, heading, boat.phase);
    if (bsp > 0.002) {
      // wake: a bow wave and paddle splashes
      const fx = Math.cos(heading), fy = Math.sin(heading);
      addDrop(toUV({ x: bp.x + fx * 0.036, y: bp.y + fy * 0.036 }), 0.008, 0.014 * m);
      const sw = Math.sin(boat.phase);
      if (Math.abs(sw) > 0.97) {
        const side = sw > 0 ? 1 : -1;
        addDrop(toUV({ x: bp.x - fy * side * 0.028 - fx * 0.004, y: bp.y + fx * side * 0.028 - fy * 0.004 }), 0.007, 0.035 * m);
      }
    }

    // ducks: mother wanders, ducklings follow in a line, everyone shies from the cursor
    duckTheta += dt * 0.05 * m;
    const target = pathPoint(duckTheta + 0.4, 0.42 + 0.12 * Math.sin(time * 0.05));
    ducks.forEach((dk, i) => {
      let ax = 0, ay = 0;
      if (i === 0) {
        ax += (target.x - dk.p.x) * 0.6;
        ay += (target.y - dk.p.y) * 0.6;
      } else {
        const lead = ducks[i - 1];
        const dx = lead.p.x - dk.p.x, dy = lead.p.y - dk.p.y;
        const dist = Math.hypot(dx, dy) || 1;
        const want = 0.034;
        ax += (dx / dist) * (dist - want) * 4;
        ay += (dy / dist) * (dist - want) * 4;
      }
      if (cursor && time - lastMoveT < 1.5) {
        const dx = dk.p.x - cursor.x, dy = dk.p.y - cursor.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.09) {
          const k = ((0.09 - dist) / 0.09) * 1.4;
          ax += (dx / (dist || 1)) * k;
          ay += (dy / (dist || 1)) * k;
        }
      }
      // avoid the boat
      const bx = dk.p.x - bp.x, by = dk.p.y - bp.y;
      const bd = Math.hypot(bx, by);
      if (bd < 0.08) {
        ax += (bx / (bd || 1)) * (0.08 - bd) * 8;
        ay += (by / (bd || 1)) * (0.08 - bd) * 8;
      }
      // stay in the water
      const sd = pondSDF(dk.p.x, dk.p.y);
      if (sd > -0.04) {
        const h = 1e-3;
        const gx = (pondSDF(dk.p.x + h, dk.p.y) - sd) / h;
        const gy = (pondSDF(dk.p.x, dk.p.y + h) - sd) / h;
        ax -= gx * (sd + 0.04) * 30;
        ay -= gy * (sd + 0.04) * 30;
      }
      const damp = Math.exp(-dt * 1.6);
      dk.v.x = (dk.v.x + ax * dt * m) * damp;
      dk.v.y = (dk.v.y + ay * dt * m) * damp;
      const sp = Math.hypot(dk.v.x, dk.v.y);
      const max = 0.06 * m;
      if (sp > max) {
        dk.v.x *= max / sp;
        dk.v.y *= max / sp;
      }
      dk.p.x += dk.v.x * dt;
      dk.p.y += dk.v.y * dt;
      if (sp > 0.003) {
        const h = Math.atan2(dk.v.y, dk.v.x);
        let dh = h - dk.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        dk.heading += dh * Math.min(1, dt * 4);
      }
      const u = toUV(dk.p);
      ducksU[i].set(u.x, u.y, dk.heading, dk.size);
      if (sp > 0.004 && Math.random() < 0.5) {
        const fx = Math.cos(dk.heading), fy = Math.sin(dk.heading);
        addDrop(toUV({ x: dk.p.x + fx * 0.012 * dk.size, y: dk.p.y + fy * 0.012 * dk.size }), 0.005 * dk.size, 0.008 * dk.size * m);
      }
    });

    // now and then something rises beneath the surface
    if (!ctx.reducedMotion && time > nextRise) {
      nextRise = time + 2.5 + Math.random() * 5;
      for (let tries = 0; tries < 8; tries++) {
        const a = Math.random() * Math.PI * 2;
        const p = pathPoint(a, 0.2 + Math.random() * 0.65);
        if (pondSDF(p.x, p.y) < -0.03) {
          addDrop(toUV(p), 0.008, 0.02);
          break;
        }
      }
    }
  };

  // ----- pointer -----
  const onMove = (e: PointerEvent) => {
    const u = ctx.toLocal(e);
    if (u.x < 0 || u.x > 1 || u.y < 0 || u.y > 1) {
      lastCursorU = null;
      return;
    }
    cursor = toQ(u);
    lastMoveT = clock;
    if (lastCursorU) {
      const dx = (u.x - lastCursorU.x) * ASPECT, dy = u.y - lastCursorU.y;
      const len = Math.hypot(dx, dy);
      const steps = Math.min(6, Math.ceil(len / 0.012));
      const strength = Math.min(0.05, len * 0.6) * (ctx.isFocused() ? 1 : 0.7);
      for (let i = 1; i <= steps && strength > 0.0005; i++) {
        const t = i / steps;
        addDrop({ x: lastCursorU.x + (u.x - lastCursorU.x) * t, y: lastCursorU.y + (u.y - lastCursorU.y) * t }, 0.011, strength / Math.sqrt(steps));
      }
    }
    lastCursorU = u;
  };
  const onLeave = () => {
    lastCursorU = null;
    cursor = null;
  };
  const onDown = (e: PointerEvent) => {
    if (!ctx.isFocused()) return;
    const u = ctx.toLocal(e);
    addDrop(u, 0.016, 0.16);
    lastCursorU = u;
  };
  ctx.el.addEventListener("pointermove", onMove);
  ctx.el.addEventListener("pointerleave", onLeave);
  ctx.el.addEventListener("pointerdown", onDown);

  let clock = 0;
  if (import.meta.env.DEV || location.search.includes("debug")) {
    (window as unknown as Record<string, unknown>).__pondDebug = () => {
      const buf = new Uint16Array(SIM_W * SIM_H * 4);
      gl.renderer.readRenderTargetPixels(sim.a, 0, 0, SIM_W, SIM_H, buf);
      let mx = 0;
      for (let i = 0; i < buf.length; i += 4) mx = Math.max(mx, Math.abs(THREE.DataUtils.fromHalfFloat(buf[i])));
      return { max: mx, queue: queue.length, ext: !!gl.renderer.extensions.get("EXT_color_buffer_float") };
    };
  }

  const instance: PieceInstance = {
    setResolution(ppu) {
      gl.setSize(ctx.width * ppu, ctx.height * ppu);
      paintRT?.dispose();
      paintRT = new THREE.WebGLRenderTarget(gl.width, gl.height, {
        type: THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
      });
      compMat.uniforms.uPaint.value = paintRT.texture;
      dirtyPaint = true;
    },
    frame(time, dt) {
      clock = time;
      if (!paintRT) return;
      if (dirtyPaint) {
        gl.draw(paintMat, paintRT);
        dirtyPaint = false;
      }
      updateCreatures(time, dt);
      // two sim steps per frame; drops go in on the first
      for (let step = 0; step < 2; step++) {
        const n = step === 0 ? queue.length : 0;
        for (let i = 0; i < MAX_DROPS; i++) {
          const d = queue[i];
          if (d && step === 0) drops[i].set(d.u.x, d.u.y, d.r, d.s);
        }
        simMat.uniforms.uDropCount.value = n;
        simMat.uniforms.uState.value = sim.a.texture;
        gl.draw(simMat, sim.b);
        sim.swap();
      }
      queue.length = 0;
      compMat.uniforms.uSim.value = sim.a.texture;
      compMat.uniforms.uTime.value = time;
      gl.draw(compMat, null);
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
  return instance;
};

export default mount;
