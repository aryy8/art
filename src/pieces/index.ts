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
];
