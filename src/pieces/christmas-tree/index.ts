import { SplendidGrandPiano } from "smplr";
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
  { syl: "bells,", midi: 64, beats: 2 },
  { syl: "jin", midi: 64, beats: 1, join: true },
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
  { syl: "in", midi: 64, beats: 0.5 },
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
  { syl: "bells,", midi: 64, beats: 2 },
  { syl: "jin", midi: 64, beats: 1, join: true },
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
  { syl: "in", midi: 64, beats: 0.5 },
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
  { syl: "snow,", midi: 55, beats: 2 }, // G3
  { syl: "in", midi: 55, beats: 1 },
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
  { syl: "go,", midi: 59, beats: 2 }, // B3
  { syl: "laugh", midi: 67, beats: 1, join: true }, // G4
  { syl: "ing", midi: 67, beats: 1 },
  { syl: "all", midi: 65, beats: 1 },
  { syl: "the", midi: 62, beats: 1 },
  { syl: "way", midi: 64, beats: 4 },
];

const SONG = SCORE.length;
/** Quarter-note ≈ 108 BPM; BEAT is an eighth. */
const BEAT = 60 / 108 / 2;
/** Upper bound on songs stamped into the page (trimmed line-by-line to fit). */
const MAX_REPEATS = 8;
/** Soft pixel size for the cover reveal. */
const COVER_PIXEL = 6;

/** MIDI notes in the carol — load only these Steinway samples. */
/** Key release (s): how long a note takes to fade once it's let go. */
const RELEASE = 0.3;

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
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
}
[data-carol] .carol-text .line {
  white-space: nowrap; /* justified lines must never wrap */
}
/* Only selectable once the piece is open, so panning the canvas never highlights lyrics. */
.piece.is-focused [data-carol] .carol-text {
  touch-action: auto;
  user-select: text;
  -webkit-user-select: text;
  cursor: text;
}
[data-carol] .carol-text::selection,
[data-carol] .carol-text *::selection {
  background: transparent;
  background-color: transparent;
  color: inherit;
}
/* Just the highlighted words turn white over the cover, not the whole line. */
.piece.is-focused [data-carol] .carol-text::selection,
.piece.is-focused [data-carol] .carol-text *::selection {
  color: #fff;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.45);
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
  private loaded = false;
  /** Notes handed to the sampler for the current selection, in play order. */
  private voices: { g: number; t: number; end: number; stop: StopFn }[] = [];
  /** Lyric positions (global syllable index) already played for this selection. */
  private played = new Set<number>();
  /** The selected span of syllables we want to hear, inclusive. */
  private want: [number, number] | null = null;
  private gen = 0;

  preload() {
    void this.ensure(false);
  }

  resume() {
    void this.ensure(true);
  }

  /** A fresh press: silence the last run and start listening again. */
  beginGesture() {
    this.stop();
    void this.ensure(true);
  }

  stop() {
    this.gen += 1;
    this.want = null;
    const at = this.ctx?.currentTime;
    for (const v of this.voices) {
      try {
        v.stop(at);
      } catch {
        /* ended */
      }
    }
    this.voices = [];
    this.played.clear();
  }

  /**
   * Play the melody for syllables [from, to] (global indices, song order).
   * Newly covered syllables are queued in time; syllables that leave the selection
   * before they sound are cancelled, so the piano tracks the highlight.
   */
  follow(from: number, to: number) {
    if (to < from) return;
    if (to - from >= SONG) to = from + SONG - 1; // at most one full song per selection
    this.want = [from, to];
    if (this.loaded && this.ctx?.state === "running") {
      this.apply();
      return;
    }
    const stamp = this.gen;
    void this.ensure(true).then(() => {
      if (stamp === this.gen) this.apply();
    });
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

  private apply() {
    const ctx = this.ctx;
    const inst = this.instrument;
    const want = this.want;
    if (!ctx || !inst || !want) return;
    const [a, b] = want;
    const now = ctx.currentTime;

    // Drop notes that are no longer highlighted; ones already ringing finish naturally.
    const keep: typeof this.voices = [];
    for (const v of this.voices) {
      if (v.g < a || v.g > b) {
        this.played.delete(v.g);
        if (v.t > now + 0.005) {
          v.stop(now);
          continue;
        }
      }
      if (v.end > now - 1) keep.push(v);
    }
    this.voices = keep;

    const fresh: number[] = [];
    for (let g = a; g <= b; g++) if (!this.played.has(g)) fresh.push(g);
    if (fresh.length === 0) return;
    // Growing backwards (dragging up/left)? Walk outwards from the old edge, like a scrub.
    const lo = this.played.size ? Math.min(...this.played) : Infinity;
    const below = fresh.filter((g) => g < lo).reverse();
    const rest = fresh.filter((g) => g >= lo);
    const order = this.played.size ? [...rest, ...below] : fresh;

    let t = now + 0.04;
    for (const v of this.voices) {
      const slot = v.t + SCORE[v.g % SONG].beats * BEAT;
      if (v.t >= now - 2 && slot > t) t = slot;
    }
    for (const g of order) {
      const i = g % SONG;
      const row = SCORE[i];
      const dur = row.beats * BEAT;
      // Light, articulate touch: let go just before the next note, then a short natural release —
      // each note is clear, nothing smears into a wash.
      const hold = Math.max(dur * 0.9, 0.16);
      const at = t + (Math.random() - 0.5) * 0.006; // tiny human timing
      const stop = inst.start({ note: row.midi, time: at, duration: hold, velocity: this.velocityFor(i, row.beats) });
      this.voices.push({ g, t, end: at + hold + RELEASE + 0.2, stop });
      this.played.add(g);
      t += dur;
    }
  }

  private async ensure(resume: boolean) {
    if (!this.ctx) this.ctx = new AudioContext();
    if (resume && this.ctx.state !== "running") {
      try {
        await this.ctx.resume();
      } catch {
        /* needs a user gesture */
      }
    }
    if (!this.instrument) {
      const ac = this.ctx;
      // Dry and clean: trim → remove sub-rumble → peak catcher only (doesn't pump in normal play).
      const bus = ac.createGain();
      bus.gain.value = 1.1;
      const rumble = ac.createBiquadFilter();
      rumble.type = "highpass";
      rumble.frequency.value = 30;
      rumble.Q.value = 0.5;
      const limiter = ac.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.1;
      bus.connect(rumble).connect(limiter).connect(ac.destination);

      // Real Steinway samples — every velocity layer so timbre changes with touch
      this.instrument = SplendidGrandPiano(ac, {
        destination: bus,
        volume: 100,
        velocity: 80,
        decayTime: RELEASE,
        notesToLoad: {
          notes: PIANO_NOTES,
          velocityRange: [1, 127],
          fallback: "nearest",
        },
      });
      this.ready = this.instrument.ready.then(() => {
        this.loaded = true;
      });
    }
    if (this.ready) await this.ready;
  }

  private velocityFor(i: number, beats: number): number {
    // Firm, even touch (brighter sample layers = clearer tone); lean into phrase starts and
    // long notes, a hair of randomness so repeats aren't robotic.
    let v = 82;
    if (beats >= 3) v = 92;
    else if (beats >= 2) v = 88;
    else if (beats < 1) v = 76;
    if (i === 0 || SCORE[i - 1]?.br) v += 6;
    v += Math.round((Math.random() - 0.5) * 6);
    return Math.max(70, Math.min(104, v));
  }


}

/** Where each syllable sits inside a line's text, so a selection maps back to notes. */
type LineInfo = { g0: number; starts: number[]; ends: number[] };
const LINE_INFO = new WeakMap<HTMLElement, LineInfo>();

/** Build one song as a few line spans (smooth native select — not per-syllable). */
function appendSong(el: HTMLElement, songIndex: number) {
  const block = document.createElement("span");
  block.className = "song";
  let buf = "";
  let info: LineInfo = { g0: songIndex * SONG, starts: [], ends: [] };
  const flush = (last: boolean) => {
    const span = document.createElement("span");
    span.className = "line";
    span.textContent = buf.replace(/\s+$/, "");
    LINE_INFO.set(span, info);
    block.appendChild(span);
    if (!last) block.appendChild(document.createTextNode("\n"));
    buf = "";
  };
  for (let s = 0; s < SONG; s++) {
    const row = SCORE[s];
    if (info.starts.length === 0) info.g0 = songIndex * SONG + s;
    info.starts.push(buf.length);
    buf += row.syl;
    info.ends.push(buf.length);
    if (!row.join) buf += " ";
    if (row.br || s === SONG - 1) {
      flush(s === SONG - 1);
      info = { g0: 0, starts: [], ends: [] };
    }
  }
  el.appendChild(block);
}

/** Local (world-unit) width of an element, independent of the canvas zoom. */
function localWidth(node: Element, scale: number) {
  return node.getBoundingClientRect().width / scale;
}

/**
 * Stretch one line to exactly `target` wide by spreading the spare room over letters
 * (most) and word gaps (some), so every line shares the same left and right edge.
 */
function justifyLine(line: HTMLElement, target: number, scale: number) {
  line.style.letterSpacing = "";
  line.style.wordSpacing = "";
  line.style.marginRight = "";
  const txt = line.textContent ?? "";
  const gaps = Math.max(1, txt.length - 1);
  const spaces = (txt.match(/ /g) ?? []).length;
  const natural = localWidth(line, scale);
  const extra = target - natural;
  if (Math.abs(extra) <= 0.25) return;
  // Grow mostly through letters, a bit through word gaps; shrink (rare) through letters only.
  const ws = spaces && extra > 0 ? (extra * 0.45) / spaces : 0;
  let ls = (extra - ws * spaces) / gaps;
  const apply = () => {
    line.style.letterSpacing = `${ls}px`;
    line.style.wordSpacing = `${ws}px`;
    // Chrome/Safari add letter-spacing after the last glyph too; pull it back so the
    // visible ink is what gets centred.
    line.style.marginRight = `${-ls}px`;
  };
  apply();
  // One correction pass for kerning / rounding.
  const visible = localWidth(line, scale) - ls;
  ls += (target - visible) / gaps;
  apply();
}

function fillLyrics(el: HTMLElement): number {
  el.replaceChildren();
  el.style.paddingTop = "";
  el.style.fontSize = "";
  const limit = el.clientHeight;
  const cs = getComputedStyle(el);
  const inner = el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  const target = Math.floor(inner) - 1; // never quite touch the edge (no accidental wrap)
  const scale = el.getBoundingClientRect().width / Math.max(1, el.offsetWidth);

  // Size the type so the widest line fills the column; the rest get justified to it.
  appendSong(el, 0);
  // Biggest type whose widest line still fits. Glyph widths snap with hinting at some
  // sizes, so search by measuring instead of assuming width ∝ size.
  const widestAt = (px: number) => {
    el.style.fontSize = `${px}px`;
    let w = 0;
    for (const line of el.querySelectorAll<HTMLElement>(".line")) w = Math.max(w, localWidth(line, scale));
    return w;
  };
  let lo = 8;
  let hi = 64;
  for (let pass = 0; pass < 12; pass++) {
    const mid = (lo + hi) / 2;
    if (widestAt(mid) <= target) lo = mid;
    else hi = mid;
  }
  el.style.fontSize = `${Math.floor(lo * 100) / 100}px`;
  el.replaceChildren();

  // Stamp songs until the page is full, so the whole cover can be uncovered.
  for (let v = 0; v < MAX_REPEATS; v++) {
    if (v > 0) el.appendChild(document.createTextNode("\n"));
    appendSong(el, v);
    if (el.scrollHeight > limit + 2) break;
  }
  // Trim whole lines (not whole songs) so the text runs to the bottom margin.
  const lines = () => el.querySelectorAll<HTMLElement>(".line");
  while (lines().length > 1 && el.scrollHeight > limit + 2) {
    const all = lines();
    const last = all[all.length - 1];
    const song = last.parentElement!;
    const prev = last.previousSibling;
    last.remove();
    if (prev?.nodeType === Node.TEXT_NODE) prev.remove();
    if (!song.querySelector(".line")) {
      const gap = song.previousSibling;
      song.remove();
      if (gap?.nodeType === Node.TEXT_NODE) gap.remove();
    }
  }
  // Every line the same width → straight left and right edges.
  for (const line of lines()) justifyLine(line, target, scale);
  // Centre the block vertically inside the page.
  const all = lines();
  if (all.length > 0) {
    const top = all[0].getBoundingClientRect().top;
    const bottom = all[all.length - 1].getBoundingClientRect().bottom;
    const used = (bottom - top) / scale;
    const pad = parseFloat(cs.paddingTop) || 0;
    const pb = parseFloat(cs.paddingBottom) || 0;
    const spare = el.clientHeight - pad - pb - used;
    if (spare > 1) el.style.paddingTop = `${pad + spare / 2}px`;
  }
  return target;
}

/** Re-even the edges (glyph widths can shift slightly with zoom level). */
function rejustify(el: HTMLElement, target: number) {
  const scale = el.getBoundingClientRect().width / Math.max(1, el.offsetWidth);
  if (!(scale > 0)) return;
  for (const line of el.querySelectorAll<HTMLElement>(".line")) justifyLine(line, target, scale);
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
  // The lyrics are measured to justify them, so the real face must be in before layout.
  await document.fonts.load('20px "Instrument Serif"', "Jingle bells").catch(() => undefined);
  await document.fonts.ready;
  await new Promise<void>((r) => requestAnimationFrame(() => r()));

  const lineWidth = fillLyrics(text);

  const g = canvas.getContext("2d");
  const piano = new Piano();
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

  const clearAll = () => {
    clearCover();
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

  /** Which syllables (global index, song order) the selection covers, inclusive. */
  const selectedSyllables = (range: Range): [number, number] | null => {
    let first: HTMLElement | null = null;
    let last: HTMLElement | null = null;
    for (const el of text.querySelectorAll<HTMLElement>(".line")) {
      if (!range.intersectsNode(el)) continue;
      if (!first) first = el;
      last = el;
    }
    if (!first || !last) return null;
    const fi = LINE_INFO.get(first);
    const li = LINE_INFO.get(last);
    if (!fi || !li) return null;
    const offsetIn = (el: HTMLElement, node: Node, offset: number, outside: number) => {
      if (!el.contains(node)) return outside;
      if (node.nodeType === Node.TEXT_NODE) return offset;
      return offset > 0 ? (el.textContent?.length ?? 0) : 0;
    };
    const so = offsetIn(first, range.startContainer, range.startOffset, 0);
    const eo = offsetIn(last, range.endContainer, range.endOffset, last.textContent?.length ?? 0);
    let s = fi.ends.findIndex((e) => e > so);
    if (s < 0) s = fi.ends.length; // started in the trailing gap → next line
    let e = -1;
    for (let k = li.starts.length - 1; k >= 0; k--) {
      if (li.starts[k] < eo) {
        e = k;
        break;
      }
    }
    const from = fi.g0 + s;
    const to = li.g0 + e;
    return to >= from ? [from, to] : null;
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
    const span = selectedSyllables(range);
    if (span) piano.follow(span[0], span[1]);
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
    piano.beginGesture();
  };
  const onMove = () => {
    if (dragging) requestSync();
  };
  const onSelect = () => requestSync();
  const onUp = () => {
    dragging = false;
    piano.resume();
    requestSync();
  };

  root.addEventListener("pointerdown", onPointer);
  root.addEventListener("pointermove", onMove);
  root.addEventListener("pointerup", onUp);
  root.addEventListener("pointercancel", onUp);
  document.addEventListener("selectionchange", onSelect);

  sizeCanvas();
  // Audio waits until the piece is opened (no AudioContext on the overview).
  if (ctx.isFocused()) piano.preload();

  return {
    frame() {},
    setResolution() {
      baked = null;
      rejustify(text, lineWidth);
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
