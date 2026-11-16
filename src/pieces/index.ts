import type { PieceDefinition } from "./types";

/**
 * The one list. To add a piece:
 *   1. create src/pieces/<slug>/index.ts that default-exports a MountPiece
 *   2. add an entry here with a world position and size
 * That's it. Coordinates are world units (1 unit == 1 CSS px at 100% zoom).
 * Layout: pieces sit on a plus-shaped grid of 1500-unit cells. Each piece is centred
 * on its cell (cell (i, j) has its centre at i*1500, j*1500), so the spacing is even.
 * The canvas opens centred on sunset-sea, which sits on the world origin (cell (0, 0)).
 * Fill the empty diagonal cells (±1, ±1) next.
 */
export const pieces: PieceDefinition[] = [
  {
    slug: "sunset-sea",
    title: "Sunset sea",
    date: "Nov 2026",
    // Centre of the grid, cell (0, 0)
    x: -300,
    y: -530,
    width: 600,
    height: 1060,
    maxResolution: 1.8,
    load: () => import("./sunset-sea"),
  },
  {
    slug: "koi-pond",
    title: "Koi pond",
    date: "Nov 2026",
    // Grid cell (+1, 0): right of sunset
    x: 1100,
    y: -300,
    width: 800,
    height: 600,
    maxResolution: 1.8,
    load: () => import("./koi-pond"),
  },
  // Hidden for now: pixel-sea needs a new frame shape before it goes back on the canvas.
  // {
  //   slug: "pixel-sea",
  //   title: "Pixel sea",
  //   date: "Nov 2026",
  //   // Grid cell (0, +1): below sunset
  //   x: -350,
  //   y: 1150,
  //   width: 700,
  //   height: 700,
  //   maxResolution: 2,
  //   load: () => import("./pixel-sea"),
  // },
  // {
  //   slug: "ascii-wing",
  //   title: "ASCII wing",
  //   date: "Nov 2026",
  //   // Grid cell (-1, 0): left of sunset
  //   x: -2000,
  //   y: -250,
  //   width: 1000,
  //   height: 500,
  //   maxResolution: 1.5,
  //   load: () => import("./ascii-wing"),
  // },
  // {
  //   slug: "snoopy",
  //   title: "Sleeping Snoopy",
  //   date: "Nov 2026",
  //   // Grid cell (0, -1): above sunset
  //   x: -520,
  //   y: -1900,
  //   width: 1040,
  //   height: 800,
  //   maxResolution: 2,
  //   load: () => import("./snoopy"),
  // },
];
