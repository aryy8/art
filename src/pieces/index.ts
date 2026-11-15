import type { PieceDefinition } from "./types";

/**
 * The one list. To add a piece:
 *   1. create src/pieces/<slug>/index.ts that default-exports a MountPiece
 *   2. add an entry here with a world position and size
 * That's it. Coordinates are world units (1 unit == 1 CSS px at 100% zoom).
 */
export const pieces: PieceDefinition[] = [
  {
    slug: "pond",
    title: "Pond, early morning",
    date: "Nov 2026",
    description:
      "Procedural watercolour over a live ripple simulation. Move across the water; tap to drop a pebble.",
    x: -720,
    y: -480,
    width: 1440,
    height: 960,
    maxResolution: 1.6,
    load: () => import("./pond"),
  },
  {
    slug: "sunset-sea",
    title: "Sunset sea",
    date: "Nov 2026",
    description:
      "Wet-on-wet sky, broken light on the water. Drag across the sea to scatter glints; tap for a ripple.",
    x: -1440,
    y: -560,
    width: 600,
    height: 1060,
    maxResolution: 1.8,
    load: () => import("./sunset-sea"),
  },
  {
    slug: "ink-breath",
    title: "Ink, breathing",
    date: "Nov 2026",
    description: "A small study. One line of ink, redrawn as it breathes. Hold to slow it down.",
    x: 860,
    y: -40,
    width: 420,
    height: 420,
    maxResolution: 2,
    load: () => import("./ink-breath"),
  },
];
