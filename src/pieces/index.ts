import type { PieceDefinition } from "./types";

/**
 * The one list. To add a piece:
 *   1. create src/pieces/<slug>/index.ts that default-exports a MountPiece
 *   2. add an entry here with a world position and size
 * That's it. Coordinates are world units (1 unit == 1 CSS px at 100% zoom).
 * Leave generous white page between pieces; the canvas opens centred on sunset-sea,
 * which sits at the world origin.
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
    slug: "pixel-sea",
    title: "Pixel sea",
    date: "Nov 2026",
    // Further right of sunset-sea, with more white page between them
    x: 1400,
    y: 280,
    width: 700,
    height: 700,
    maxResolution: 2,
    load: () => import("./pixel-sea"),
  },
  {
    slug: "ascii-wing",
    title: "ASCII wing",
    date: "Nov 2026",
    // Nearby but off-axis, with more white page from sunset
    x: -1180,
    y: 1100,
    width: 1000,
    height: 500,
    maxResolution: 1.5,
    load: () => import("./ascii-wing"),
  },
  {
    slug: "snoopy",
    title: "Sleeping Snoopy",
    date: "Nov 2026",
    // Above-right of sunset, not aligned with pixel-sea or ascii-wing
    x: 680,
    y: -1180,
    width: 1040,
    height: 800,
    maxResolution: 2,
    load: () => import("./snoopy"),
  },
];
