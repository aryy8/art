import type { MountPiece, PieceInstance } from "../types";
import aryanPhoto from "./aryan.jpg";

/**
 * Agent Swarm Portrait
 * A swarm of tiny agent cursors flies in, each carrying one pixel color from
 * Aryan's photo. They click pixels into place to paint a live pixelated portrait.
 * After painting, some cursors keep drifting around, touching up pixels.
 */

interface Cursor {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  color: string;
  name: string;
  speed: number;
  placed: boolean;
  drifting: boolean;
  pixelX: number;
  pixelY: number;
  delay: number;
  startTime: number;
}

const PIXEL_SIZE = 10;
const PORTRAIT_WIDTH = 40;
const PORTRAIT_HEIGHT = 40;
const CURSOR_NAMES = [
  "Ana", "Ben", "Chi", "Dev", "Eve", "Fin", "Gia", "Han",
  "Ivy", "Jay", "Kim", "Leo", "Mia", "Nik", "Ora", "Paz",
  "Qin", "Ray", "Sam", "Tai", "Uma", "Vic", "Wei", "Xia",
  "Yun", "Zoe", "Ari", "Blu", "Cam", "Dex", "Eli", "Fox",
];

const TAG_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e",
];

function randomName(): string {
  return CURSOR_NAMES[Math.floor(Math.random() * CURSOR_NAMES.length)];
}

function randomTagColor(): string {
  return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
}

const mount: MountPiece = async (ctx): Promise<PieceInstance> => {
  const canvas = document.createElement("canvas");
  canvas.style.cursor = "default";
  ctx.el.appendChild(canvas);
  const g = canvas.getContext("2d", { alpha: true })!;

  const W = ctx.width;
  const H = ctx.height;

  // Load and process the image
  const img = new Image();
  img.src = aryanPhoto;
  await new Promise((resolve) => {
    img.onload = resolve;
  });

  // Extract pixelated colors from the image
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = PORTRAIT_WIDTH;
  tempCanvas.height = PORTRAIT_HEIGHT;
  const tempCtx = tempCanvas.getContext("2d")!;
  tempCtx.drawImage(img, 0, 0, PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
  const imageData = tempCtx.getImageData(0, 0, PORTRAIT_WIDTH, PORTRAIT_HEIGHT);

  const pixelColors: string[][] = [];
  for (let y = 0; y < PORTRAIT_HEIGHT; y++) {
    pixelColors[y] = [];
    for (let x = 0; x < PORTRAIT_WIDTH; x++) {
      const i = (y * PORTRAIT_WIDTH + x) * 4;
      const r = imageData.data[i];
      const g = imageData.data[i + 1];
      const b = imageData.data[i + 2];
      pixelColors[y][x] = `rgb(${r}, ${g}, ${b})`;
    }
  }

  // Calculate portrait position (centered with generous spacing)
  const portraitPixelWidth = PORTRAIT_WIDTH * PIXEL_SIZE;
  const portraitPixelHeight = PORTRAIT_HEIGHT * PIXEL_SIZE;
  const portraitX = (W - portraitPixelWidth) / 2;
  const portraitY = (H - portraitPixelHeight) / 2;

  // Create cursors for each pixel
  const cursors: Cursor[] = [];
  const totalPixels = PORTRAIT_WIDTH * PORTRAIT_HEIGHT;

  for (let y = 0; y < PORTRAIT_HEIGHT; y++) {
    for (let x = 0; x < PORTRAIT_WIDTH; x++) {
      const targetX = portraitX + x * PIXEL_SIZE + PIXEL_SIZE / 2;
      const targetY = portraitY + y * PIXEL_SIZE + PIXEL_SIZE / 2;

      // Start cursors from random positions outside the viewport
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.max(W, H) * 1.5;
      const startX = W / 2 + Math.cos(angle) * dist;
      const startY = H / 2 + Math.sin(angle) * dist;

      cursors.push({
        x: startX,
        y: startY,
        targetX,
        targetY,
        color: pixelColors[y][x],
        name: randomName(),
        speed: 0.8 + Math.random() * 0.4,
        placed: false,
        drifting: false,
        pixelX: x,
        pixelY: y,
        delay: Math.random() * 1.5,
        startTime: 0,
      });
    }
  }

  // Select some cursors to keep drifting after painting (much fewer)
  const numDrifters = Math.min(8, Math.floor(totalPixels * 0.005));
  const drifterIndices = new Set<number>();
  while (drifterIndices.size < numDrifters) {
    drifterIndices.add(Math.floor(Math.random() * cursors.length));
  }
  drifterIndices.forEach((i) => {
    cursors[i].drifting = true;
  });

  // Track which pixels have been placed
  const placedPixels = new Set<string>();

  let ppu = 1;
  let startTime = performance.now() / 1000;

  function drawCursor(x: number, y: number, name: string, tagColor: string, scale = 1) {
    g.save();
    g.translate(x, y);
    g.scale(scale, scale);

    // Draw arrow cursor (simple black arrow with white outline)
    g.strokeStyle = "white";
    g.lineWidth = 2.5;
    g.lineCap = "round";
    g.lineJoin = "round";

    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, 10);
    g.lineTo(2.5, 7.5);
    g.lineTo(4, 11);
    g.lineTo(5.5, 10);
    g.lineTo(4, 6.5);
    g.lineTo(7.5, 6.5);
    g.closePath();
    g.stroke();

    g.fillStyle = "black";
    g.fill();

    // Draw name tag
    g.font = "9px Inter, sans-serif";
    g.textAlign = "left";
    g.textBaseline = "top";
    const textWidth = g.measureText(name).width;

    const tagX = 10;
    const tagY = 1;
    const tagPadding = 2.5;

    g.fillStyle = tagColor;
    g.fillRect(tagX, tagY, textWidth + tagPadding * 2, 14);

    g.fillStyle = "white";
    g.fillText(name, tagX + tagPadding, tagY + 2.5);

    g.restore();
  }

  return {
    setResolution(next) {
      ppu = next;
      canvas.width = Math.round(W * ppu);
      canvas.height = Math.round(H * ppu);
      g.setTransform(ppu, 0, 0, ppu, 0, 0);
    },

    frame(time) {
      const elapsed = time;

      g.clearRect(0, 0, W, H);

      // Draw placed pixels
      for (const key of placedPixels) {
        const [x, y] = key.split(",").map(Number);
        g.fillStyle = pixelColors[y][x];
        g.fillRect(
          portraitX + x * PIXEL_SIZE,
          portraitY + y * PIXEL_SIZE,
          PIXEL_SIZE,
          PIXEL_SIZE
        );
      }

      // Update and draw cursors
      const activeCursors: Cursor[] = [];
      const drifterCursors: Cursor[] = [];
      
      for (let i = 0; i < cursors.length; i++) {
        const cursor = cursors[i];

        if (elapsed < cursor.delay) continue;

        if (cursor.startTime === 0) {
          cursor.startTime = elapsed;
        }

        const cursorAge = elapsed - cursor.startTime;

        if (!cursor.placed) {
          // Move towards target
          const dx = cursor.targetX - cursor.x;
          const dy = cursor.targetY - cursor.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 3) {
            // Place the pixel
            cursor.placed = true;
            const key = `${cursor.pixelX},${cursor.pixelY}`;
            placedPixels.add(key);

            if (!cursor.drifting) {
              // Cursor disappears after placing
              continue;
            }
          } else {
            // Move towards target
            const speed = cursor.speed * 8;
            cursor.x += (dx / dist) * speed;
            cursor.y += (dy / dist) * speed;
            
            // Only show cursors that are actively approaching and in a reasonable distance
            const distToTarget = Math.sqrt(
              Math.pow(cursor.targetX - cursor.x, 2) + 
              Math.pow(cursor.targetY - cursor.y, 2)
            );
            
            if (distToTarget < Math.max(W, H) * 0.8) {
              activeCursors.push(cursor);
            }
          }
        } else if (cursor.drifting) {
          // Drifting behavior: wander around the portrait
          const wanderRadius = Math.min(W, H) * 0.25;
          const centerX = W / 2;
          const centerY = H / 2;

          // Gentle circular drift with noise
          const angle = cursorAge * 0.3 + i * 0.5;
          const radius = wanderRadius * (0.6 + Math.sin(cursorAge * 0.4 + i) * 0.25);
          const targetX = centerX + Math.cos(angle) * radius;
          const targetY = centerY + Math.sin(angle) * radius;

          const dx = targetX - cursor.x;
          const dy = targetY - cursor.y;
          cursor.x += dx * 0.015;
          cursor.y += dy * 0.015;

          drifterCursors.push(cursor);
        }
      }

      // Draw all active cursors (flying in)
      for (const cursor of activeCursors) {
        // Use a consistent tag color per cursor based on its index
        const tagColor = TAG_COLORS[cursors.indexOf(cursor) % TAG_COLORS.length];
        drawCursor(cursor.x, cursor.y, cursor.name, tagColor);
      }
      
      // Draw drifting cursors (after painting)
      for (const cursor of drifterCursors) {
        const tagColor = TAG_COLORS[cursors.indexOf(cursor) % TAG_COLORS.length];
        drawCursor(cursor.x, cursor.y, cursor.name, tagColor);
      }
    },

    dispose() {
      canvas.remove();
    },
  };
};

export default mount;
