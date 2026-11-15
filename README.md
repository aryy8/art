# art

A quiet, infinite, pure-white canvas for pieces made with code — by Aryan Rastogi.

Pan by dragging (or two-finger scroll on a trackpad), zoom with the wheel or a pinch,
and click a piece to step inside it. `Esc`, a click on the paper, or a firm zoom-out
steps back. `0` returns to the opening view, arrow keys drift. The only chrome is the
"Art" title and a small close mark while a piece is focused.

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # type-check + static build into dist/
npm run preview   # serve dist/ on http://localhost:4173
npm run shots     # headless screenshots into shots/ (needs `npm run preview` running)
```

Deep links work: `/#pond`, `/#sunset-sea`, `/#ink-breath` open straight into a piece.

## Deploying

It is a plain static Vite site. On **Vercel**, import the repo and keep the detected
preset (Framework: Vite, build `npm run build`, output `dist`) — no `vercel.json` needed.
On **Cloudflare Pages** use the same build command and `dist` as the output directory.

## How it is built

- `src/core/camera.ts` — the view (`cx`, `cy`, scale): smooth wheel zoom, fling inertia, fly-to with
  log-space zoom.
- `src/core/app.ts` — the shell: input (mouse, trackpad, touch, Safari gestures, keyboard), focus mode,
  lazy-mounting pieces as they come near, pausing them offscreen, and re-rendering them at the
  resolution the current zoom needs (DPR aware).
- `src/lib/watercolor.glsl.ts` — shared GLSL: noise/fbm, paper height, Beer–Lambert glazes with edge
  darkening and granulation, and `deckle()`, the hand-painted edge.
- `src/lib/brush.ts` — a Canvas2D watercolour painter (glazes, dried rims, granulation, varied brush
  strokes) for painting a static base once at load.
- `src/lib/glpiece.ts` — a transparent Three.js surface, fullscreen-quad drawing and float ping-pong targets.

Pieces render onto transparent canvases straight onto the white page: no frames, cards or shadows.

## Adding a piece

1. Create `src/pieces/<slug>/index.ts` that default-exports a `MountPiece`:

   ```ts
   import type { MountPiece } from "../types";

   const mount: MountPiece = (ctx) => {
     const canvas = document.createElement("canvas");
     ctx.el.appendChild(canvas);          // ctx.el fills the piece's rectangle
     const g = canvas.getContext("2d")!;   // keep it transparent: the page is the paper
     return {
       setResolution(ppu) {               // device px per world unit, follows zoom
         canvas.width = ctx.width * ppu;
         canvas.height = ctx.height * ppu;
       },
       frame(time, dt) { /* draw; only called while on screen */ },
       setFocused(on) { /* optional */ },
       dispose() { canvas.remove(); },
     };
   };
   export default mount;
   ```

2. Register it in `src/pieces/index.ts` with a world position, size, title and date:

   ```ts
   { slug: "my-piece", title: "My piece", date: "Dec 2026",
     x: 1500, y: 0, width: 600, height: 600, load: () => import("./my-piece") },
   ```

That's all: the shell lazy-loads it as its own chunk when someone wanders close, pauses it offscreen,
handles focus, and adds it to the index. Useful bits of `ctx`: `width`/`height` (world units),
`reducedMotion`, `isFocused()` and `toLocal(event)` (pointer → 0..1 piece coordinates).
Pieces should listen for their own pointer events on `ctx.el`; only treat `pointerdown` as an
interaction when `ctx.isFocused()` is true (otherwise the click is the shell's, to focus the piece).

## The pieces

- **Pond, early morning** (`src/pieces/pond`) — a few large hard-edged washes painted once at load
  (`paint.ts`, light to dark, no ink lines), brought to
  life by a GPU ping-pong height-field ripple simulation that refracts the pigment, lifts it on crests
  and pools it in troughs. A kayak paddles a loop and a duck family drifts, shies from the cursor and
  leaves wakes. Inspired by the feel of kayak.whimsy.land; all code and visuals are original.
- **Sunset sea** (`src/pieces/sunset-sea`) — Aryan's own watercolour (`sunset.webp`) brought to life
  the way kayak.whimsy.land animates its painting: below the horizon the painting is sampled through
  perspective swells (smaller and slower toward the horizon), the sun path shimmers on the facing
  slopes, and a GPU ripple sim lets the pointer bend the paint. The sky only breathes, and a soft
  irregular mask gives the sheet a hand-cut edge. (The earlier fully procedural version is in git history.)
- **Ink, breathing** (`src/pieces/ink-breath`) — a tiny Canvas2D study proving the system.

`prefers-reduced-motion` slows everything to a near-stillness (pieces still respond to you), camera
moves become instant, and UI transitions are removed.
