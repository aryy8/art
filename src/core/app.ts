import { Camera, type View } from "./camera";
import { makeGrainDataURL } from "./grain";
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
const pad2 = (n: number) => String(n).padStart(2, "0");

export class App {
  private root: HTMLElement;
  private world: HTMLElement;
  private grainA: HTMLElement;
  private grainB: HTMLElement;
  private hud: HTMLElement;
  private hint: HTMLElement;
  private focusBar: HTMLElement;
  private indexPanel: HTMLElement;
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
  private interacted = false;
  private focusWheel = 0;
  private hudText = "";

  constructor(mount: HTMLElement, private defs: PieceDefinition[]) {
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.camera = new Camera(this.reducedMotion);
    this.root = mount;
    this.root.classList.add("art-root");
    this.root.innerHTML = `
      <div class="grain grain-a"></div>
      <div class="grain grain-b"></div>
      <div class="world"></div>
      <header class="wordmark" aria-label="art"><a href="#" data-home>art</a><span class="by">by Aryan Rastogi</span></header>
      <div class="focusbar" aria-live="polite">
        <div class="fb-meta"><span class="fb-num"></span><span class="fb-title"></span><span class="fb-date"></span></div>
        <button class="fb-close" aria-label="Back to canvas"><span>esc</span> back to canvas</button>
      </div>
      <nav class="dock">
        <span class="hud" aria-hidden="true"></span>
        <button class="dock-btn" data-index aria-expanded="false">index</button>
        <button class="dock-btn" data-home title="Back to overview (0)">overview</button>
      </nav>
      <div class="index-panel" role="dialog" aria-label="Index of pieces"><ol></ol></div>
      <p class="hint">drag to wander &nbsp;·&nbsp; scroll or pinch to zoom &nbsp;·&nbsp; click a piece to step inside</p>
    `;
    this.world = this.root.querySelector(".world")!;
    this.grainA = this.root.querySelector(".grain-a")!;
    this.grainB = this.root.querySelector(".grain-b")!;
    this.hud = this.root.querySelector(".hud")!;
    this.hint = this.root.querySelector(".hint")!;
    this.focusBar = this.root.querySelector(".focusbar")!;
    this.indexPanel = this.root.querySelector(".index-panel")!;

    const grain = `url(${makeGrainDataURL(256)})`;
    this.grainA.style.backgroundImage = grain;
    this.grainB.style.backgroundImage = grain;

    this.buildPieces();
    this.buildIndex();
    this.bindInput();

    this.onResize();
    this.camera.view = this.homeView();
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
    this.defs.forEach((def, i) => {
      const el = document.createElement("article");
      el.className = "piece";
      el.dataset.slug = def.slug;
      el.style.transform = `translate(${def.x}px, ${def.y}px)`;
      el.style.width = `${def.width}px`;
      el.style.height = `${def.height}px`;
      el.innerHTML = `
        <div class="piece-surface" tabindex="-1"></div>
        <div class="caption">
          <span class="cap-num">${pad2(i + 1)}</span>
          <h2 class="cap-title"></h2>
          <span class="cap-date"></span>
          ${def.description ? `<p class="cap-desc"></p>` : ""}
        </div>`;
      el.querySelector(".cap-title")!.textContent = def.title;
      el.querySelector(".cap-date")!.textContent = def.date;
      if (def.description) el.querySelector(".cap-desc")!.textContent = def.description;
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

  private buildIndex() {
    const ol = this.indexPanel.querySelector("ol")!;
    this.states.forEach((st, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<button><span class="ix-num">${pad2(i + 1)}</span><span class="ix-title"></span><span class="ix-date"></span></button>`;
      li.querySelector(".ix-title")!.textContent = st.def.title;
      li.querySelector(".ix-date")!.textContent = st.def.date;
      li.querySelector("button")!.addEventListener("click", () => {
        this.toggleIndex(false);
        this.focus(st);
      });
      ol.appendChild(li);
    });
  }

  private toggleIndex(open?: boolean) {
    const next = open ?? !this.root.classList.contains("index-open");
    this.root.classList.toggle("index-open", next);
    this.root.querySelector("[data-index]")!.setAttribute("aria-expanded", String(next));
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
    return { top: small ? 64 : 84, bottom: small ? 72 : 84, side: small ? 14 : 56 };
  }

  private homeView(): View {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const d of this.defs) {
      x0 = Math.min(x0, d.x);
      y0 = Math.min(y0, d.y);
      x1 = Math.max(x1, d.x + d.width);
      y1 = Math.max(y1, d.y + d.height + 150);
    }
    const W = window.innerWidth, H = window.innerHeight;
    const ins = this.insets();
    const s = Math.min((W - ins.side * 2) / (x1 - x0), (H - ins.top - ins.bottom) / (y1 - y0));
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 - (ins.top - ins.bottom) / 2 / s, s: s * 0.92 };
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
    const i = this.states.indexOf(st);
    this.focusBar.querySelector(".fb-num")!.textContent = pad2(i + 1);
    this.focusBar.querySelector(".fb-title")!.textContent = st.def.title;
    this.focusBar.querySelector(".fb-date")!.textContent = st.def.date;
    history.replaceState(null, "", `#${st.def.slug}`);
    this.dismissHint();
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

  private dismissHint() {
    if (this.interacted) return;
    this.interacted = true;
    this.hint.classList.add("gone");
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
      this.dismissHint();
    }) as EventListener);

    window.addEventListener("keydown", (e) => this.onKey(e));
    r.querySelectorAll("[data-home]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.preventDefault();
        this.toggleIndex(false);
        this.goHome();
      }),
    );
    r.querySelector("[data-index]")!.addEventListener("click", () => this.toggleIndex());
    r.querySelector(".fb-close")!.addEventListener("click", () => this.unfocus());
    r.addEventListener("contextmenu", (e) => {
      if (this.insideFocused(e.target)) e.preventDefault();
    });
  }

  private isUi(t: EventTarget | null) {
    return !!(t as HTMLElement | null)?.closest?.(".dock, .wordmark, .focusbar, .index-panel");
  }

  private onDown(e: PointerEvent) {
    if (this.isUi(e.target)) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (this.root.classList.contains("index-open")) this.toggleIndex(false);
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
      this.dismissHint();
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
    if (this.isUi(e.target) && !(e.target as HTMLElement).closest(".dock")) return;
    e.preventDefault();
    this.dismissHint();
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
        if (this.root.classList.contains("index-open")) this.toggleIndex(false);
        else this.unfocus();
        break;
      case "0":
        this.goHome();
        break;
      case "i":
        this.toggleIndex();
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
    this.dismissHint();
  }

  // ---------- frame ----------

  private applyView() {
    const { cx, cy, s } = this.camera.view;
    const W = this.camera.width, H = this.camera.height;
    const tx = W / 2 - cx * s;
    const ty = H / 2 - cy * s;
    this.world.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${s})`;
    this.root.style.setProperty("--s", String(s));

    // grain: two octaves cross-faded so it never visibly scales
    const l = Math.log2(Math.max(s, 1e-3));
    const f = l - Math.floor(l);
    const base = 256 * Math.pow(2, f) * 0.5; // 128..256 css px
    const setGrain = (el: HTMLElement, size: number, op: number) => {
      el.style.backgroundSize = `${size}px ${size}px`;
      el.style.backgroundPosition = `${((tx % size) + size) % size}px ${((ty % size) + size) % size}px`;
      el.style.opacity = op.toFixed(3);
    };
    setGrain(this.grainA, base, 1 - f);
    setGrain(this.grainB, base * 2, f);

    const text = `${Math.round(cx)}, ${Math.round(cy)}  ·  ${Math.round(s * 100)}%`;
    if (text !== this.hudText) {
      this.hudText = text;
      this.hud.textContent = text;
    }
  }

  private loop = (now: number) => {
    const dt = Math.min(64, now - this.lastFrame);
    this.lastFrame = now;
    if (this.camera.update(now, dt)) this.applyView();
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
