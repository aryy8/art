/**
 * Camera for the infinite canvas.
 * (cx, cy) is the world point at the centre of the screen; `s` is CSS px per world unit.
 */
export interface View {
  cx: number;
  cy: number;
  s: number;
}

export const MIN_SCALE = 0.08;
export const MAX_SCALE = 6;

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface Flight {
  from: View;
  to: View;
  start: number;
  duration: number;
  resolve: () => void;
}

export class Camera {
  view: View = { cx: 0, cy: 0, s: 1 };
  width = 1;
  height = 1;

  /** Pan inertia in screen px / ms. */
  private vx = 0;
  private vy = 0;
  /** Smoothed zoom target (wheel). */
  private zoomTarget: number | null = null;
  private zoomAnchor = { x: 0, y: 0 };
  private flight: Flight | null = null;
  private lastChange = 0;

  constructor(private reducedMotion: boolean) {}

  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
  }

  screenToWorld(x: number, y: number) {
    const { cx, cy, s } = this.view;
    return { x: cx + (x - this.width / 2) / s, y: cy + (y - this.height / 2) / s };
  }

  get busy() {
    return this.flight !== null || this.zoomTarget !== null || Math.hypot(this.vx, this.vy) > 0.01;
  }

  /** ms since the camera last moved. */
  idleFor(now: number) {
    return now - this.lastChange;
  }

  /** changes whenever the view changes */
  get stamp() {
    return this.version;
  }
  private version = 0;

  touch(now = performance.now()) {
    this.lastChange = now;
    this.version++;
  }

  stop() {
    this.vx = this.vy = 0;
    this.zoomTarget = null;
    if (this.flight) {
      this.flight.resolve();
      this.flight = null;
    }
  }

  panBy(dx: number, dy: number) {
    this.flightCancel();
    this.view.cx -= dx / this.view.s;
    this.view.cy -= dy / this.view.s;
    this.touch();
  }

  /** Zoom by factor keeping the screen point (ax, ay) fixed. */
  zoomAt(factor: number, ax: number, ay: number) {
    this.flightCancel();
    const before = this.screenToWorld(ax, ay);
    this.view.s = clampScale(this.view.s * factor);
    const after = this.screenToWorld(ax, ay);
    this.view.cx += before.x - after.x;
    this.view.cy += before.y - after.y;
    this.touch();
  }

  /** Smooth zoom (mouse wheel). Accumulates into a target that the camera eases toward. */
  zoomSmooth(factor: number, ax: number, ay: number) {
    this.flightCancel();
    const base = this.zoomTarget ?? this.view.s;
    this.zoomTarget = clampScale(base * factor);
    this.zoomAnchor = { x: ax, y: ay };
  }

  fling(vx: number, vy: number) {
    if (this.reducedMotion) return;
    const max = 4;
    const sp = Math.hypot(vx, vy);
    const k = sp > max ? max / sp : 1;
    this.vx = vx * k;
    this.vy = vy * k;
  }

  flyTo(to: View, duration?: number): Promise<void> {
    this.vx = this.vy = 0;
    this.zoomTarget = null;
    this.flightCancel();
    to = { ...to, s: clampScale(to.s) };
    const from = { ...this.view };
    if (this.reducedMotion) {
      this.view = to;
      this.touch();
      return Promise.resolve();
    }
    // duration scales with how far we travel in "zoom-adjusted" screen space
    const dz = Math.abs(Math.log(to.s / from.s));
    const ds = Math.hypot(to.cx - from.cx, to.cy - from.cy) * Math.min(from.s, to.s) / Math.max(this.width, 1);
    const d = duration ?? Math.min(1400, 620 + 260 * dz + 380 * Math.min(ds, 1.5));
    return new Promise((resolve) => {
      this.flight = { from, to, start: performance.now(), duration: d, resolve };
    });
  }

  private flightCancel() {
    if (this.flight) {
      this.flight.resolve();
      this.flight = null;
    }
  }

  /** Advance animations. Returns true if the view changed. */
  update(now: number, dt: number): boolean {
    let changed = false;
    if (this.flight) {
      const f = this.flight;
      const t = Math.min(1, (now - f.start) / f.duration);
      const e = easeInOutCubic(t);
      // interpolate zoom in log space; keep the path feeling like a single gesture
      const ls = Math.log(f.from.s) + (Math.log(f.to.s) - Math.log(f.from.s)) * e;
      const s = Math.exp(ls);
      // position eased in "screen space" so zooming in doesn't overshoot sideways
      const wFrom = 1 / f.from.s;
      const wTo = 1 / f.to.s;
      const w = 1 / s;
      const pe = Math.abs(wTo - wFrom) > 1e-6 ? (w - wFrom) / (wTo - wFrom) : e;
      const k = Math.min(1, Math.max(0, Number.isFinite(pe) ? pe * 0.65 + e * 0.35 : e));
      this.view = {
        s,
        cx: f.from.cx + (f.to.cx - f.from.cx) * k,
        cy: f.from.cy + (f.to.cy - f.from.cy) * k,
      };
      if (t >= 1) {
        this.view = { ...f.to };
        this.flight = null;
        f.resolve();
      }
      changed = true;
    }
    if (this.zoomTarget !== null) {
      const cur = this.view.s;
      const k = 1 - Math.exp(-dt / 55);
      let next = Math.exp(Math.log(cur) + (Math.log(this.zoomTarget) - Math.log(cur)) * k);
      if (Math.abs(Math.log(next / this.zoomTarget)) < 0.0015) {
        next = this.zoomTarget;
        this.zoomTarget = null;
      }
      const before = this.screenToWorld(this.zoomAnchor.x, this.zoomAnchor.y);
      this.view.s = next;
      const after = this.screenToWorld(this.zoomAnchor.x, this.zoomAnchor.y);
      this.view.cx += before.x - after.x;
      this.view.cy += before.y - after.y;
      changed = true;
    }
    if (this.vx !== 0 || this.vy !== 0) {
      this.view.cx -= (this.vx * dt) / this.view.s;
      this.view.cy -= (this.vy * dt) / this.view.s;
      const decay = Math.exp(-dt / 325);
      this.vx *= decay;
      this.vy *= decay;
      if (Math.hypot(this.vx, this.vy) < 0.012) this.vx = this.vy = 0;
      changed = true;
    }
    if (changed) {
      this.lastChange = now;
      this.version++;
    }
    return changed;
  }
}
