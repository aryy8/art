import { Camera, type View } from "./camera";
import type { PieceDefinition, PieceInstance, PieceContext } from "../pieces/types";

interface PieceState {
  def: PieceDefinition;
  el: HTMLElement;
  surface: HTMLElement;
  instance: PieceInstance | null;
  loading: boolean;
  failed: boolean;
  onScreen: boolean;
  running: boolean;
  resolution: number;
  mountedAt: number;
}

const CLICK_SLOP = 6;

export class App {
  private root: HTMLElement;
  private world: HTMLElement;
  private camera: Camera;
  private states: PieceState[] = [];
  private focused: PieceState | null = null;
  private returnView: View | null = null;
  private reducedMotion: boolean;
  private dpr = Math.min(window.devicePixelRatio || 1, 2);
  private lastFrame = performance.now();
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private velocity: { x: number; y: number; t: number }[] = [];
  private pinch: { dist: number; mid: { x: number; y: number } } | null = null;
  private dragging = false;
  private focusWheel = 0;
  private appliedStamp = NaN;

  constructor(mount: HTMLElement, private defs: PieceDefinition[]) {
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.camera = new Camera(this.reducedMotion);
    this.root = mount;
    this.root.classList.add("art-root");
    this.root.innerHTML = `
      <div class="world"></div>
      <h1 class="title"><a href="#" data-home>Art</a></h1>
      <button class="close" aria-label="Back to the canvas"></button>
      <button class="recenter" aria-label="Recenter the canvas" title="Recenter"></button>
    `;
    this.world = this.root.querySelector(".world")!;

    this.buildPieces();
    this.bindInput();

    this.onResize();
    this.camera.view = this.homeView();
    this.camera.touch();
    window.addEventListener("resize", () => this.onResize());
    this.watchDpr();

    const slug = decodeURIComponent(location.hash.replace(/^#/, ""));
    const target = this.states.find((s) => s.def.slug === slug);
    if (target) {
      this.focus(target, true);
    }
    requestAnimationFrame(() => this.root.classList.add("is-ready"));
    requestAnimationFrame(this.loop);
    (window as unknown as { __art: App }).__art = this;
  }

  // ---------- setup ----------

  private buildPieces() {
    this.defs.forEach((def) => {
      const el = document.createElement("article");
      el.className = "piece";
      el.dataset.slug = def.slug;
      el.style.transform = `translate(${def.x}px, ${def.y}px)`;
      el.style.width = `${def.width}px`;
      el.style.height = `${def.height}px`;
      el.setAttribute("aria-label", def.title);
      el.innerHTML = `<div class="piece-surface" tabindex="-1"></div>`;
      this.world.appendChild(el);
      this.states.push({
        def,
        el,
        surface: el.querySelector(".piece-surface")!,
        instance: null,
        loading: false,
        failed: false,
        onScreen: false,
        running: false,
        resolution: 0,
        mountedAt: 0,
      });
    });
  }

  private watchDpr() {
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const on = () => {
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.states.forEach((s) => (s.resolution = 0));
      this.watchDpr();
    };
    mq.addEventListener("change", on, { once: true });
  }

  private onResize() {
    this.camera.resize(window.innerWidth, window.innerHeight);
    if (this.focused) {
      this.camera.stop();
      this.camera.view = this.fitView(this.focused.def);
    }
    this.camera.touch();
    this.applyView();
  }

  // ---------- views ----------

  private insets() {
    const w = window.innerWidth;
    const small = w < 700;
    return { top: small ? 70 : 92, bottom: small ? 40 : 64, side: small ? 18 : 64 };
  }

  /** Open on the headline piece at a comfortable size; the others wait further out on the page. */
  private homeView(): View {
    const head = this.defs.find((d) => d.slug === "sunset-sea") ?? this.defs[0];
    const v = this.fitView(head);
    return { ...v, s: v.s * 0.88 };
  }

  private fitView(d: PieceDefinition): View {
    const W = window.innerWidth, H = window.innerHeight;
    const ins = this.insets();
    const aw = W - ins.side * 2;
    const ah = H - ins.top - ins.bottom;
    const s = Math.min(aw / d.width, ah / d.height);
    const cy = d.y + d.height / 2 - (ins.top - ins.bottom) / 2 / s;
    return { cx: d.x + d.width / 2, cy, s };
  }

  goHome() {
    if (this.focused) this.unfocus(false);
    this.camera.flyTo(this.homeView());
  }

  focus(st: PieceState, instant = false) {
    if (this.focused === st) return;
    if (!this.focused) this.returnView = { ...this.camera.view };
    if (this.focused) this.setFocusedState(this.focused, false);
    this.focused = st;
    this.setFocusedState(st, true);
    this.root.classList.add("is-focused");
    history.replaceState(null, "", `#${st.def.slug}`);
    const target = this.fitView(st.def);
    if (instant) {
      this.camera.view = target;
      this.camera.touch();
    } else {
      this.camera.flyTo(target);
    }
  }

  unfocus(flyBack = true) {
    const st = this.focused;
    if (!st) return;
    this.setFocusedState(st, false);
    this.focused = null;
    this.root.classList.remove("is-focused");
    history.replaceState(null, "", location.pathname + location.search);
    if (flyBack) {
      const back = this.returnView ?? this.homeView();
      // if we arrived straight from a deep link, step back far enough to see neighbours
      this.camera.flyTo(back.s >= this.fitView(st.def).s * 0.95 ? this.homeView() : back);
    }
    this.returnView = null;
  }

  private setFocusedState(st: PieceState, on: boolean) {
    st.el.classList.toggle("is-focused", on);
    st.instance?.setFocused?.(on);
    if (on) st.surface.focus({ preventScroll: true });
  }

  // ---------- input ----------

  private pieceAt(target: EventTarget | null): PieceState | null {
    const el = (target as HTMLElement | null)?.closest?.(".piece") as HTMLElement | null;
    if (!el) return null;
    return this.states.find((s) => s.el === el) ?? null;
  }

  private insideFocused(target: EventTarget | null) {
    return !!this.focused && this.focused.surface.contains(target as Node);
  }

  private bindInput() {
    const r = this.root;
    r.addEventListener("pointerdown", (e) => this.onDown(e));
    window.addEventListener("pointermove", (e) => this.onMove(e));
    window.addEventListener("pointerup", (e) => this.onUp(e));
    window.addEventListener("pointercancel", (e) => this.onUp(e, true));
    r.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });

    // Safari trackpad pinch
    let gScale = 1;
    r.addEventListener("gesturestart", ((e: Event & { scale: number }) => {
      e.preventDefault();
      gScale = e.scale;
    }) as EventListener);
    r.addEventListener("gesturechange", ((e: Event & { scale: number; clientX: number; clientY: number }) => {
      e.preventDefault();
      if (this.focused) return;
      this.camera.zoomAt(e.scale / gScale, e.clientX, e.clientY);
      gScale = e.scale;
    }) as EventListener);

    window.addEventListener("keydown", (e) => this.onKey(e));
    r.querySelectorAll("[data-home]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.preventDefault();
        this.goHome();
      }),
    );
    r.querySelector(".close")!.addEventListener("click", () => this.unfocus());
    r.querySelector(".recenter")!.addEventListener("click", () => this.goHome());
    r.addEventListener("contextmenu", (e) => {
      if (this.insideFocused(e.target)) e.preventDefault();
    });
  }

  private isUi(t: EventTarget | null) {
    return !!(t as HTMLElement | null)?.closest?.(".title, .close, .recenter");
  }

  private onDown(e: PointerEvent) {
    if (this.isUi(e.target)) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (this.insideFocused(e.target) && this.pointers.size === 0) return; // the piece owns this gesture
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    this.camera.stop();
    this.velocity = [];
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      this.dragging = true;
    }
  }

  private onMove(e: PointerEvent) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (!this.dragging && Math.hypot(p.x - p.sx, p.y - p.sy) > CLICK_SLOP) {
      this.dragging = true;
      this.root.classList.add("is-dragging");
      if (this.focused) this.unfocus(false); // user took the wheel
    }
    if (!this.dragging) return;
    if (this.pointers.size >= 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.camera.panBy(mid.x - this.pinch.mid.x, mid.y - this.pinch.mid.y);
      if (this.pinch.dist > 0) this.camera.zoomAt(dist / this.pinch.dist, mid.x, mid.y);
      this.pinch = { dist, mid };
      return;
    }
    this.camera.panBy(dx, dy);
    const now = performance.now();
    this.velocity.push({ x: dx, y: dy, t: now });
    while (this.velocity.length && now - this.velocity[0].t > 90) this.velocity.shift();
  }

  private onUp(e: PointerEvent, cancelled = false) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 1) {
      // pinch ended into a one-finger pan; rebase the remaining pointer
      const rest = [...this.pointers.values()][0];
      rest.sx = rest.x;
      rest.sy = rest.y;
      this.pinch = null;
      this.velocity = [];
      return;
    }
    if (this.pointers.size > 0) return;
    this.pinch = null;
    const wasDrag = this.dragging;
    this.dragging = false;
    this.root.classList.remove("is-dragging");
    if (cancelled) return;
    if (wasDrag) {
      const now = performance.now();
      const v = this.velocity.filter((s) => now - s.t < 90);
      if (v.length >= 2) {
        const span = Math.max(16, now - v[0].t);
        const sx = v.reduce((a, s) => a + s.x, 0);
        const sy = v.reduce((a, s) => a + s.y, 0);
        if (now - v[v.length - 1].t < 50) this.camera.fling(sx / span, sy / span);
      }
      return;
    }
    // a click
    const hit = this.pieceAt(e.target);
    if (hit && hit !== this.focused) this.focus(hit);
    else if (!hit && this.focused) this.unfocus();
  }

  private onWheel(e: WheelEvent) {
    if (this.isUi(e.target)) return;
    e.preventDefault();
    if (this.focused) {
      // in focus the wheel belongs to the piece; a firm zoom-out gesture steps back
      const out = e.ctrlKey ? e.deltaY > 0 : e.deltaY > 0 && e.deltaMode !== 0;
      this.focusWheel = out ? this.focusWheel + Math.abs(e.deltaY) * (e.ctrlKey ? 6 : 1) : 0;
      if (this.focusWheel > 240) {
        this.focusWheel = 0;
        this.unfocus();
      }
      return;
    }
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
    const dx = e.deltaX * scale;
    const dy = e.deltaY * scale;
    if (e.ctrlKey || e.metaKey) {
      // trackpad pinch arrives as ctrl+wheel with small fractional deltas
      this.camera.zoomAt(Math.exp(-dy * 0.0095), e.clientX, e.clientY);
      return;
    }
    const looksLikeMouse = e.deltaMode !== 0 || (dx === 0 && Math.abs(dy) >= 40 && Math.abs(dy) % 1 === 0 && Math.abs(dy) !== Math.abs(this.lastWheel));
    this.lastWheel = dy;
    if (looksLikeMouse && !e.shiftKey) {
      this.camera.zoomSmooth(Math.exp(-dy * 0.0021), e.clientX, e.clientY);
    } else {
      this.camera.panBy(e.shiftKey && dx === 0 ? -dy : -dx, e.shiftKey && dx === 0 ? 0 : -dy);
    }
  }
  private lastWheel = 0;

  private onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.closest?.("input, textarea")) return;
    const W = window.innerWidth, H = window.innerHeight;
    switch (e.key) {
      case "Escape":
        this.unfocus();
        break;
      case "0":
        this.goHome();
        break;
      case "+":
      case "=":
        if (!this.focused) this.camera.zoomSmooth(1.35, W / 2, H / 2);
        break;
      case "-":
      case "_":
        if (!this.focused) this.camera.zoomSmooth(1 / 1.35, W / 2, H / 2);
        break;
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown": {
        if (this.focused) return;
        const k = 0.9;
        const vx = e.key === "ArrowLeft" ? k : e.key === "ArrowRight" ? -k : 0;
        const vy = e.key === "ArrowUp" ? k : e.key === "ArrowDown" ? -k : 0;
        this.camera.fling(vx, vy);
        if (this.reducedMotion) this.camera.panBy(vx * 120, vy * 120);
        break;
      }
      default:
        return;
    }
  }

  // ---------- frame ----------

  private applyView() {
    const { cx, cy, s } = this.camera.view;
    const W = this.camera.width, H = this.camera.height;
    const tx = W / 2 - cx * s;
    const ty = H / 2 - cy * s;
    this.world.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${s})`;
    this.root.style.setProperty("--s", String(s));

  }

  private loop = (now: number) => {
    const dt = Math.min(64, now - this.lastFrame);
    this.lastFrame = now;
    const moved = this.camera.update(now, dt);
    const stamp = this.camera.stamp;
    if (moved || stamp !== this.appliedStamp) {
      this.appliedStamp = stamp;
      this.applyView();
    }
    this.updatePieces(now, dt / 1000);
    requestAnimationFrame(this.loop);
  };

  private updatePieces(now: number, dt: number) {
    const { cx, cy, s } = this.camera.view;
    const W = this.camera.width, H = this.camera.height;
    const idle = this.camera.idleFor(now);
    for (const st of this.states) {
      const d = st.def;
      const x0 = (d.x - cx) * s + W / 2;
      const y0 = (d.y - cy) * s + H / 2;
      const x1 = x0 + d.width * s;
      const y1 = y0 + d.height * s;
      const margin = Math.max(W, H) * 0.6;
      const near = x1 > -margin && x0 < W + margin && y1 > -margin && y0 < H + margin;
      const visible = x1 > 0 && x0 < W && y1 > 0 && y0 < H && d.width * s > 24;

      if (near && !st.instance && !st.loading && !st.failed) this.mountPiece(st);
      if (!st.instance) continue;

      if (visible !== st.running) {
        st.running = visible;
        if (visible) st.instance.resume?.();
        else st.instance.pause?.();
      }
      if (!visible) continue;

      // resolution follows zoom, but only re-allocates once the camera settles
      const want = Math.min(d.maxResolution ?? 2, Math.max(0.3, s * this.dpr));
      const q = Math.pow(2, Math.round(Math.log2(want) * 3) / 3);
      const ratio = st.resolution ? q / st.resolution : Infinity;
      const settled = idle > 220 && !this.camera.busy;
      if (st.resolution === 0 || (settled && Math.abs(Math.log(ratio)) > 0.05) || ratio > 2.2) {
        st.resolution = q;
        st.instance.setResolution(q);
      }
      try {
        st.instance.frame((now - st.mountedAt) / 1000, dt);
      } catch (err) {
        console.error(`[art] ${d.slug} crashed`, err);
        st.failed = true;
        st.instance.dispose();
        st.instance = null;
        st.el.classList.add("is-failed");
      }
    }
  }

  private async mountPiece(st: PieceState) {
    st.loading = true;
    st.el.classList.add("is-loading");
    const ctx: PieceContext = {
      el: st.surface,
      width: st.def.width,
      height: st.def.height,
      reducedMotion: this.reducedMotion,
      isFocused: () => this.focused === st,
      toLocal: (e) => {
        const r = st.surface.getBoundingClientRect();
        return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
      },
    };
    try {
      const mod = await st.def.load();
      st.instance = await mod.default(ctx);
      st.mountedAt = performance.now();
      st.resolution = 0;
      if (this.focused === st) st.instance.setFocused?.(true);
      st.el.classList.remove("is-loading");
      st.el.classList.add("is-live");
    } catch (err) {
      console.error(`[art] failed to mount ${st.def.slug}`, err);
      st.failed = true;
      st.el.classList.add("is-failed");
    } finally {
      st.loading = false;
    }
  }

  /** for screenshots / debugging */
  status() {
    return this.states.map((s) => ({ slug: s.def.slug, live: !!s.instance, running: s.running, res: s.resolution }));
  }
}
