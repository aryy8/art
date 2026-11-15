/**
 * The contract between the infinite canvas (the "shell") and a piece.
 *
 * A piece is a folder in src/pieces/<slug>/ whose index.ts default-exports a
 * `mount` function. The shell calls it lazily, the first time the piece comes
 * near the viewport, so heavy code (Three.js, shaders, assets) is split into its
 * own chunk and never loaded until someone wanders close.
 */

export interface PieceContext {
  /** Element that occupies the piece's rectangle on the canvas (CSS px == world units). */
  readonly el: HTMLElement;
  /** Size of the piece in world units. */
  readonly width: number;
  readonly height: number;
  /** True when the user prefers reduced motion. Pieces should calm down, not disappear. */
  readonly reducedMotion: boolean;
  /** Is the piece currently focused (zoomed into, interactive)? */
  isFocused(): boolean;
  /** Convert a pointer event into piece-local coordinates, 0..1 on both axes (y down). */
  toLocal(e: { clientX: number; clientY: number }): { x: number; y: number };
}

export interface PieceInstance {
  /**
   * Called every animation frame while the piece is on screen.
   * `time` is seconds since the piece was mounted, `dt` is seconds since last frame (clamped).
   */
  frame(time: number, dt: number): void;
  /**
   * Device pixels per world unit. The shell raises this when you zoom in and lowers it
   * when you zoom out, so the piece always renders at roughly screen resolution.
   */
  setResolution(pixelsPerUnit: number): void;
  /** Optional: react to being focused / unfocused. */
  setFocused?(focused: boolean): void;
  /** Optional: called when the piece goes offscreen (after which `frame` stops being called). */
  pause?(): void;
  /** Optional: called when the piece comes back on screen. */
  resume?(): void;
  /** Free GPU resources and listeners. */
  dispose(): void;
}

export type MountPiece = (ctx: PieceContext) => PieceInstance | Promise<PieceInstance>;

export interface PieceDefinition {
  /** Folder name, used in the URL hash (#sunset-sea). */
  slug: string;
  /** Not shown on the page; used as the piece's accessible name. */
  title: string;
  /** Free-form, e.g. "Nov 2026". Kept for the record, not shown. */
  date: string;
  /** World position of the piece's top-left corner and its size, in world units. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Highest device-pixels-per-unit the piece wants to render at (default 2). */
  maxResolution?: number;
  /** Lazy loader. Use `() => import("./<slug>")` so the piece gets its own chunk. */
  load: () => Promise<{ default: MountPiece }>;
}
