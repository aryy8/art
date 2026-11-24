import { Reverb, SplendidGrandPiano } from "smplr";
import type { MountPiece, PieceInstance } from "../types";
import coverUrl from "./cover.png?url";

/**
 * Jingle Bells — public domain (Pierpont, 1857).
 * Select the lyrics: a pixelated cover clips into the highlight, and a real
 * sampled grand piano follows how far the selection has reached.
 */

type Row = { syl: string; midi: number; beats: number; br?: boolean; join?: boolean };

/**
 * C major — Keyloro / Piano Lessons App / Playable Notes (beginner).
 * One row = one sung syllable. `midi` is what the sampler plays.
 *
 * Chorus (E4…G4):
 *   E E E  E E E  E G C D E
 *   F F F F F  E E E E E  D D E D G
 *   E E E  E E E  E G C D E
 *   F F F F F  E E E E  G G F D C
 * Verse (starts on G3 below middle C):
 *   G E D C G   G G G E D C A
 *   A F E D B   G G F D E
 */
const SCORE: Row[] = [
  // Jingle bells, jingle bells, Jingle all the way
  { syl: "Jin", midi: 64, beats: 1, join: true }, // E4
  { syl: "gle", midi: 64, beats: 1 },
  { syl: "bells,", midi: 64, beats: 2 },
  { syl: "jin", midi: 64, beats: 1, join: true },
  { syl: "gle", midi: 64, beats: 1 },
  { syl: "bells", midi: 64, beats: 2 },
  { syl: "Jin", midi: 64, beats: 1, join: true },
  { syl: "gle", midi: 67, beats: 1 }, // G4
  { syl: "all", midi: 60, beats: 1.5 }, // C4
  { syl: "the", midi: 62, beats: 0.5 }, // D4
  { syl: "way", midi: 64, beats: 4, br: true },
  // Oh what fun it is to ride / in a one-horse open sleigh, hey
  { syl: "Oh,", midi: 65, beats: 1 }, // F4
  { syl: "what", midi: 65, beats: 1 },
  { syl: "fun", midi: 65, beats: 1 },
  { syl: "it", midi: 65, beats: 1 },
  { syl: "is", midi: 65, beats: 1 },
  { syl: "to", midi: 64, beats: 1 }, // E4
  { syl: "ride", midi: 64, beats: 1 },
  { syl: "In", midi: 64, beats: 0.5 },
  { syl: "a", midi: 64, beats: 0.5 },
  { syl: "one-", midi: 64, beats: 1, join: true },
  { syl: "horse", midi: 62, beats: 1 }, // D4
  { syl: "o", midi: 62, beats: 1, join: true },
  { syl: "pen", midi: 64, beats: 1 },
  { syl: "sleigh,", midi: 62, beats: 2 },
  { syl: "hey!", midi: 67, beats: 2, br: true }, // G4
  // Jingle bells, jingle bells, Jingle all the way
  { syl: "Jin", midi: 64, beats: 1, join: true },
  { syl: "gle", midi: 64, beats: 1 },
  { syl: "bells,", midi: 64, beats: 2 },
  { syl: "jin", midi: 64, beats: 1, join: true },
  { syl: "gle", midi: 64, beats: 1 },
  { syl: "bells", midi: 64, beats: 2 },
  { syl: "Jin", midi: 64, beats: 1, join: true },
  { syl: "gle", midi: 67, beats: 1 },
  { syl: "all", midi: 60, beats: 1.5 },
  { syl: "the", midi: 62, beats: 0.5 },
  { syl: "way", midi: 64, beats: 4, br: true },
  // Oh what fun it is to ride / in a one-horse open sleigh (2nd ending)
  { syl: "Oh,", midi: 65, beats: 1 },
  { syl: "what", midi: 65, beats: 1 },
  { syl: "fun", midi: 65, beats: 1 },
  { syl: "it", midi: 65, beats: 1 },
  { syl: "is", midi: 65, beats: 1 },
  { syl: "to", midi: 64, beats: 1 },
  { syl: "ride", midi: 64, beats: 1 },
  { syl: "In", midi: 64, beats: 0.5 },
  { syl: "a", midi: 64, beats: 0.5 },
  { syl: "one-", midi: 67, beats: 1, join: true }, // G4
  { syl: "horse", midi: 67, beats: 1 },
  { syl: "o", midi: 65, beats: 1, join: true }, // F4
  { syl: "pen", midi: 62, beats: 1 }, // D4
  { syl: "sleigh", midi: 60, beats: 4, br: true }, // C4
  // Dashing through the snow — verse starts on G3 (below middle C)
  { syl: "Dash", midi: 55, beats: 1, join: true }, // G3
  { syl: "ing", midi: 64, beats: 1 }, // E4
  { syl: "through", midi: 62, beats: 1 }, // D4
  { syl: "the", midi: 60, beats: 1 }, // C4
  { syl: "snow", midi: 55, beats: 2 }, // G3
  { syl: "In", midi: 55, beats: 1 },
  { syl: "a", midi: 55, beats: 1 },
  { syl: "one-", midi: 55, beats: 1, join: true },
  { syl: "horse", midi: 64, beats: 1 },
  { syl: "o", midi: 62, beats: 1, join: true },
  { syl: "pen", midi: 60, beats: 1 },
  { syl: "sleigh", midi: 57, beats: 4, br: true }, // A3
  // O'er the fields we go / Laughing all the way
  { syl: "O'er", midi: 57, beats: 1 }, // A3
  { syl: "the", midi: 65, beats: 1 }, // F4
  { syl: "fields", midi: 64, beats: 1 },
  { syl: "we", midi: 62, beats: 1 },
  { syl: "go", midi: 59, beats: 2 }, // B3
  { syl: "Laugh", midi: 67, beats: 1, join: true }, // G4
  { syl: "ing", midi: 67, beats: 1 },
  { syl: "all", midi: 65, beats: 1 },
  { syl: "the", midi: 62, beats: 1 },
  { syl: "way", midi: 64, beats: 4 },
];

const SONG = SCORE.length;
/** Quarter-note ≈ 108 BPM; BEAT is an eighth. */
const BEAT = 60 / 108 / 2;
/** How many times to stamp the song into the page (trimmed to fit). */
const MAX_REPEATS = 3;
/** Soft pixel size for the cover reveal. */
const COVER_PIXEL = 6;

/** MIDI notes in the carol — load only these Steinway samples. */
const PIANO_NOTES = [55, 57, 59, 60, 62, 64, 65, 67]; // G3 A3 B3 C4 D4 E4 F4 G4

const STYLE_ID = "art-christmas-tree";

function ensureStyles() {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = `
[data-carol] {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  overflow: hidden;
  color: #1d242b;
  font-family: "Instrument Serif", Georgia, serif;
  cursor: inherit;
}
[data-carol] .cover-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  display: block;
}
[data-carol] .carol-text {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  padding: 5% 7%;
  margin: 0;
  font-size: 20px;
  line-height: 1.28;
  letter-spacing: 0.01em;
  white-space: pre-wrap;
  overflow: hidden;
  text-align: center;
  color: rgba(29, 36, 43, 0.78);
  user-select: text;
  -webkit-user-select: text;
  cursor: text;
  -webkit-user-drag: none;
}
.piece.is-focused [data-carol] .carol-text {
  touch-action: auto;
}
[data-carol] .carol-text .line {
  user-select: text;
  -webkit-user-select: text;
}
[data-carol] .carol-text .line.is-lit {
  color: #fff;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.45);
}
[data-carol] .carol-text::selection,
[data-carol] .carol-text *::selection {
  background: transparent !important;
  background-color: transparent !important;
  color: inherit !important;
}
`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("cover"));
    img.src = src;
  });
}

type StopFn = (time?: number) => void;

/**
 * Real sampled Steinway grand (smplr SplendidGrandPiano).
 * All velocity layers loaded so soft/loud hits use different original samples.
 */
class Piano {
  private ctx: AudioContext | null = null;
  private instrument: SplendidGrandPiano | null = null;
  private ready: Promise<void> | null = null;
  private chain: Promise<void> = Promise.resolve();
  private stops: StopFn[] = [];
  private peak = 0;
  private nextTime = 0;
  private gesturing = false;
  private gen = 0;

  preload() {
    void this.ensure(false);
  }

  resume() {
    void this.ensure(true);
  }

  beginGesture() {
    this.gen += 1;
    void this.ensure(true);
    this.stopVoices();
    this.peak = 0;
    this.nextTime = 0;
    this.gesturing = true;
  }

  endGesture() {
    this.gesturing = false;
  }

  stop() {
    this.gen += 1;
    this.stopVoices();
    this.peak = 0;
    this.nextTime = 0;
    this.gesturing = false;
  }

  followAmount(amount: number) {
    if (amount <= 0) return;
    const needed = Math.max(1, Math.min(SONG, Math.round(amount * SONG) || 1));
    if (!this.gesturing && needed < this.peak) {
      this.stopVoices();
      this.peak = 0;
      this.nextTime = 0;
    }
    if (needed <= this.peak) return;
    const from = this.peak;
    this.peak = needed;
    const ids = Array.from({ length: needed - from }, (_, i) => from + i);
    const stamp = this.gen;
    this.chain = this.chain.catch(() => undefined).then(() => this.schedule(ids, stamp));
  }

  dispose() {
    this.stop();
    try {
      this.instrument?.dispose();
    } catch {
      /* gone */
    }
    this.instrument = null;
    this.ready = null;
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) void ctx.close();
  }

  private stopVoices() {
    const at = this.ctx?.currentTime;
    for (const stop of this.stops) {
      try {
        stop(at);
      } catch {
        /* ended */
      }
    }
    this.stops = [];
    try {
      this.instrument?.stop();
    } catch {
      /* idle */
    }
  }

  private async ensure(resume: boolean) {
    if (!this.ctx) this.ctx = new AudioContext();
    if (resume && this.ctx.state !== "running") await this.ctx.resume();
    if (!this.instrument) {
      const reverb = Reverb(this.ctx);
      // Real Steinway samples — every velocity layer so timbre changes with touch
      this.instrument = SplendidGrandPiano(this.ctx, {
        volume: 100,
        velocity: 90,
        decayTime: 0.9,
        notesToLoad: {
          notes: PIANO_NOTES,
          velocityRange: [1, 127],
          fallback: "nearest",
        },
      });
      this.instrument.output.addEffect("reverb", reverb, 0.28);
      this.ready = Promise.all([this.instrument.ready, reverb.ready()]).then(() => {
        const decay = reverb.getParam("decay");
        if (decay) decay.value = 0.55;
      });
    }
    if (this.ready) await this.ready;
  }

  private velocityFor(i: number, beats: number): number {
    // Spread across PP / MP / MF / FF sample layers so it doesn't sound one-note
    let v = 72;
    if (beats >= 3) v = 108;
    else if (beats >= 2) v = 96;
    else if (beats >= 1.5) v = 86;
    else v = 68 + (i % 4) * 5;
    if (i === 0 || SCORE[i - 1]?.br) v += 10;
    v += Math.round(Math.sin(i * 1.9) * 4);
    return Math.max(48, Math.min(118, v));
  }

  private async schedule(ids: number[], stamp: number) {
    await this.ensure(true);
    if (stamp !== this.gen) return;
    const ctx = this.ctx;
    const inst = this.instrument;
    if (!ctx || !inst || ids.length === 0) return;
    const now = ctx.currentTime;
    let t = this.nextTime > now + 0.02 ? this.nextTime : now + 0.04;
    for (const i of ids) {
      if (stamp !== this.gen) break;
      const row = SCORE[i];
      const dur = row.beats * BEAT;
      const stop = inst.start({
        note: row.midi,
        time: t,
        duration: Math.max(dur * 1.25, 0.28),
        velocity: this.velocityFor(i, row.beats),
      });
      this.stops.push(stop);
      t += dur;
    }
    if (stamp === this.gen) this.nextTime = t;
  }
}

/** Build one song as a few line spans (smooth native select — not per-syllable). */
function appendSong(el: HTMLElement) {
  const block = document.createElement("span");
  block.className = "song";
  let buf = "";
  const flush = (last: boolean) => {
    const span = document.createElement("span");
    span.className = "line";
    span.textContent = buf.replace(/\s+$/, "");
    block.appendChild(span);
    if (!last) block.appendChild(document.createTextNode("\n"));
    buf = "";
  };
  for (let s = 0; s < SONG; s++) {
    const row = SCORE[s];
    buf += row.syl;
    if (!row.join) buf += " ";
    if (row.br || s === SONG - 1) flush(s === SONG - 1);
  }
  el.appendChild(block);
}

function fillLyrics(el: HTMLElement): number {
  el.replaceChildren();
  for (let v = 0; v < MAX_REPEATS; v++) {
    if (v > 0) el.appendChild(document.createTextNode("\n"));
    appendSong(el);
  }
  const limit = el.clientHeight;
  while (el.querySelectorAll(".song").length > 1 && el.scrollHeight > limit + 2) {
    el.lastChild?.remove();
    if (el.lastChild?.nodeType === Node.TEXT_NODE && el.lastChild.textContent === "\n") {
      el.lastChild.remove();
    }
  }
  const first = el.querySelector(".song");
  return first?.textContent?.length ?? 1;
}

/** Bake a pixelated cover once; blit from this during selection. */
function bakeCover(img: HTMLImageElement, dw: number, dh: number): HTMLCanvasElement {
  const pw = Math.max(1, Math.round(dw / COVER_PIXEL));
  const ph = Math.max(1, Math.round(dh / COVER_PIXEL));
  const small = document.createElement("canvas");
  small.width = pw;
  small.height = ph;
  const sg = small.getContext("2d")!;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const scale = Math.max(pw / iw, ph / ih);
  const sw = pw / scale;
  const sh = ph / scale;
  sg.imageSmoothingEnabled = true;
  sg.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, pw, ph);

  const full = document.createElement("canvas");
  full.width = dw;
  full.height = dh;
  const fg = full.getContext("2d")!;
  fg.imageSmoothingEnabled = false;
  fg.drawImage(small, 0, 0, dw, dh);
  return full;
}

const mount: MountPiece = async (ctx): Promise<PieceInstance> => {
  ensureStyles();

  const root = document.createElement("div");
  root.dataset.carol = "";

  const canvas = document.createElement("canvas");
  canvas.className = "cover-layer";
  root.appendChild(canvas);

  const text = document.createElement("div");
  text.className = "carol-text";
  root.appendChild(text);
  ctx.el.appendChild(root);

  const img = await loadImage(coverUrl);
  await document.fonts.ready;
  await new Promise<void>((r) => requestAnimationFrame(() => r()));

  const songChars = fillLyrics(text);
  const lineEls = () => text.querySelectorAll<HTMLElement>(".line");

  const g = canvas.getContext("2d");
  const piano = new Piano();
  const lit = new Set<HTMLElement>();
  let baked: HTMLCanvasElement | null = null;
  let bakedW = 0;
  let bakedH = 0;
  let raf = 0;
  let stopTimer = 0;
  let dragging = false;

  const ensureBake = () => {
    const w = Math.max(1, Math.round(ctx.width));
    const h = Math.max(1, Math.round(ctx.height));
    if (!baked || bakedW !== w || bakedH !== h) {
      baked = bakeCover(img, w, h);
      bakedW = w;
      bakedH = h;
    }
  };

  const sizeCanvas = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(ctx.width * dpr));
    const h = Math.max(1, Math.round(ctx.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ensureBake();
  };

  const clearCover = () => {
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
  };

  const clearLit = () => {
    for (const el of lit) el.classList.remove("is-lit");
    lit.clear();
  };

  const clearAll = () => {
    clearCover();
    clearLit();
    piano.stop();
  };

  const paintSelection = (range: Range) => {
    if (!g || !baked) return;
    sizeCanvas();
    const dpr = canvas.width / Math.max(1, ctx.width);
    clearCover();

    const rootBox = root.getBoundingClientRect();
    const scaleX = rootBox.width / Math.max(1, ctx.width);
    const scaleY = rootBox.height / Math.max(1, ctx.height);

    const raw = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
    if (raw.length === 0) return;

    type Band = { x: number; y: number; w: number; h: number };
    const local: Band[] = raw
      .map((r) => ({
        x: (r.left - rootBox.left) / scaleX,
        y: (r.top - rootBox.top) / scaleY,
        w: r.width / scaleX,
        h: r.height / scaleY,
      }))
      .sort((a, b) => a.y - b.y || a.x - b.x);

    const bands: Band[] = [];
    for (const r of local) {
      const line = bands.find((L) => Math.abs(L.y - r.y) < 3);
      if (line) {
        const right = Math.max(line.x + line.w, r.x + r.w);
        line.x = Math.min(line.x, r.x);
        line.w = right - line.x;
        line.h = Math.max(line.h, r.h);
        line.y = Math.min(line.y, r.y);
      } else {
        bands.push({ ...r });
      }
    }

    const lh = parseFloat(getComputedStyle(text).lineHeight) || 26;
    g.save();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.beginPath();
    for (const line of bands) {
      const padY = Math.min(Math.max(0, (lh - line.h) / 2), lh * 0.18);
      g.rect(line.x - 0.5, line.y - padY, line.w + 1, line.h + padY * 2);
    }
    g.clip();
    g.imageSmoothingEnabled = false;
    g.drawImage(baked, 0, 0, ctx.width, ctx.height);
    g.restore();
  };

  const lightLines = (range: Range) => {
    const next = new Set<HTMLElement>();
    for (const el of lineEls()) {
      if (range.intersectsNode(el)) next.add(el);
    }
    for (const el of lit) {
      if (!next.has(el)) el.classList.remove("is-lit");
    }
    for (const el of next) {
      if (!lit.has(el)) el.classList.add("is-lit");
    }
    lit.clear();
    for (const el of next) lit.add(el);
  };

  /** How much text is selected vs one full song — direction-agnostic. */
  const selectionAmount = (range: Range): number => {
    if (songChars < 1) return 0;
    return Math.min(1, Math.max(0, range.toString().length / songChars));
  };

  const sync = () => {
    if (!ctx.isFocused()) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) {
      if (stopTimer) window.clearTimeout(stopTimer);
      stopTimer = window.setTimeout(() => {
        stopTimer = 0;
        if (!ctx.isFocused()) return;
        const s = window.getSelection();
        if (!s || s.isCollapsed || s.rangeCount === 0 || !root.contains(s.anchorNode)) {
          piano.endGesture();
          clearAll();
        }
      }, 200);
      return;
    }
    if (stopTimer) {
      window.clearTimeout(stopTimer);
      stopTimer = 0;
    }

    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer) && !range.intersectsNode(text)) return;

    paintSelection(range);
    lightLines(range);
    piano.followAmount(selectionAmount(range));
  };

  /** One paint per frame — follows the caret without 64ms lag. */
  const requestSync = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      sync();
    });
  };

  const onPointer = () => {
    dragging = true;
    // Drop any leftover highlight so a second play isn't blocked by a stuck range.
    const sel = window.getSelection();
    if (sel && root.contains(sel.anchorNode)) sel.removeAllRanges();
    clearCover();
    clearLit();
    piano.beginGesture();
  };
  const onMove = () => {
    if (dragging) requestSync();
  };
  const onSelect = () => requestSync();
  const onUp = () => {
    dragging = false;
    piano.resume();
    piano.endGesture();
    requestSync();
  };

  root.addEventListener("pointerdown", onPointer);
  root.addEventListener("pointermove", onMove);
  root.addEventListener("pointerup", onUp);
  root.addEventListener("pointercancel", onUp);
  document.addEventListener("selectionchange", onSelect);

  sizeCanvas();
  piano.preload();

  return {
    frame() {},
    setResolution() {
      baked = null;
      sizeCanvas();
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && root.contains(sel.anchorNode) && sel.rangeCount > 0) {
        paintSelection(sel.getRangeAt(0));
      }
    },
    setFocused(on) {
      if (on) {
        piano.preload();
        piano.resume();
        return;
      }
      if (stopTimer) window.clearTimeout(stopTimer);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      dragging = false;
      clearAll();
      const sel = window.getSelection();
      if (sel && root.contains(sel.anchorNode)) sel.removeAllRanges();
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      if (stopTimer) window.clearTimeout(stopTimer);
      root.removeEventListener("pointerdown", onPointer);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerup", onUp);
      root.removeEventListener("pointercancel", onUp);
      document.removeEventListener("selectionchange", onSelect);
      piano.dispose();
      root.remove();
    },
  };
};

export default mount;
