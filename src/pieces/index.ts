import type { PieceDefinition } from "./types";

/**
 * The one list. To add a piece:
 *   1. create src/pieces/<slug>/index.ts that default-exports a MountPiece
 *   2. add an entry here with a world position and size
 * That's it. Coordinates are world units (1 unit == 1 CSS px at 100% zoom).
 * Leave generous white page between pieces; the canvas opens centred on sunset-sea.
 */
export const pieces: PieceDefinition[] = [
  {
    slug: "sunset-sea",
    title: "Sunset sea",
    date: "Nov 2026",
    x: -300,
    y: -530,
    width: 600,
    height: 1060,
    maxResolution: 1.8,
    load: () => import("./sunset-sea"),
  },
  {
    slug: "pond",
    title: "Pond, early morning",
    date: "Nov 2026",
    x: 980,
    y: -480,
    width: 1440,
    height: 960,
    maxResolution: 1.6,
    load: () => import("./pond"),
  },
  {
    slug: "ink-breath",
    title: "Ink, breathing",
    date: "Nov 2026",
    x: -1460,
    y: -210,
    width: 420,
    height: 420,
    maxResolution: 2,
    load: () => import("./ink-breath"),
  },
];
