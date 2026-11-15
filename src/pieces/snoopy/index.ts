import type { MountPiece, PieceInstance } from "../types";
import snoopyUrl from "./sleeping-snoopy.png?url";
import flyingUrl from "./woodstock-flying.png?url";
import sittingUrl from "./woodstock-sitting.png?url";

/**
 * Sleeping Snoopy.
 * Snoopy dozes on the page; Woodstock glides a Peanuts-style dotted loop in the
 * open sky to his right. Click (when focused) to call Woodstock down — or send
 * him soaring again.
 */

interface TrailDot {
  id: number;
  x: number;
  y: number;
  angle: number;
  createdAt: number;
  el: SVGEllipseElement;
}

const SCALE = 2;

const FLIGHT_TOTAL_LEN = 984.7 * SCALE;
const FLIGHT_PTS: [number, number][] = (
  [
    [130.0, -50.0], [135.1, -56.4], [140.8, -62.3], [146.7, -68.1], [152.5, -73.8], [158.5, -79.5],
    [164.4, -85.1], [170.3, -90.8], [176.2, -96.5], [182.1, -102.2], [188.0, -108.0], [193.8, -113.8],
    [199.5, -119.7], [205.2, -125.6], [210.8, -131.5], [216.4, -137.5], [222.1, -143.5], [227.7, -149.4],
    [233.4, -155.3], [239.1, -161.2], [244.9, -167.1], [250.7, -172.9], [256.5, -178.6], [262.5, -184.3],
    [268.5, -189.9], [274.6, -195.4], [280.8, -200.7], [287.1, -206.0], [293.3, -211.3], [299.6, -216.7],
    [305.8, -222.0], [312.1, -227.2], [318.5, -232.4], [324.9, -237.6], [331.4, -242.6], [338.0, -247.5],
    [344.7, -252.2], [351.5, -256.7], [358.5, -261.0], [365.8, -264.8], [373.4, -268.0], [381.2, -270.3],
    [389.4, -271.3], [397.6, -271.1], [405.6, -269.8], [413.5, -267.4], [421.0, -264.2], [428.2, -260.1],
    [434.9, -255.4], [441.1, -250.1], [446.7, -244.1], [451.7, -237.6], [455.5, -230.3], [458.3, -222.6],
    [460.5, -214.7], [462.0, -206.6], [462.9, -198.5], [463.3, -190.3], [463.2, -182.1], [462.6, -173.9],
    [461.3, -165.8], [459.4, -157.8], [456.7, -150.1], [453.3, -142.6], [449.4, -135.4], [445.1, -128.4],
    [440.4, -121.6], [435.4, -115.1], [430.1, -108.9], [424.5, -102.9], [418.6, -97.2], [412.4, -91.9],
    [405.8, -86.9], [399.0, -82.4], [391.9, -78.2], [384.7, -74.4], [377.3, -70.8], [369.7, -67.6],
    [362.0, -64.8], [354.1, -62.4], [346.1, -60.6], [338.0, -59.6], [329.8, -60.0], [322.2, -62.9],
    [315.9, -68.2], [310.9, -74.6], [306.6, -81.6], [302.7, -88.8], [298.8, -96.1], [294.7, -103.2],
    [290.1, -109.9], [285.2, -116.5], [280.7, -123.4], [276.3, -130.4], [272.0, -137.3], [267.4, -144.1],
    [262.4, -150.6], [256.5, -156.3], [249.3, -160.2], [241.2, -161.3], [233.1, -160.3], [225.3, -157.9],
    [217.9, -154.3], [211.0, -149.9], [204.6, -144.7], [199.0, -138.8], [194.6, -131.9], [191.1, -124.4],
    [188.2, -116.7], [185.6, -108.9], [183.1, -101.1], [180.6, -93.3], [177.9, -85.6], [174.7, -78.0],
    [170.7, -70.9], [165.1, -64.9], [158.7, -59.8], [151.7, -55.5], [144.3, -51.9], [136.6, -49.0],
  ] as [number, number][]
).map(([x, y]) => [x * SCALE, y * SCALE]);

const LANDING = { x: 58 * SCALE, y: -10 * SCALE };
const SNOOPY_W = 120 * SCALE;
/** Origin of the original component coords inside the piece. */
const ORIGIN_X = 28 * SCALE;
const ORIGIN_Y = 290 * SCALE;
const FLIGHT_SPEED = 82 * SCALE;
const DOT_SPACING = 22 * SCALE;
const WOODSTOCK_W = 28 * SCALE;
const WOODSTOCK_H = 32 * SCALE;
const FLY_IMG_W = 27 * SCALE;
const SIT_IMG_W = 22 * SCALE;

const STYLE_ID = "art-snoopy-keyframes";

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
@keyframes art-snoopy-zzz {
  0%, 100% { opacity: 0; transform: translateY(0) scale(0.7); }
  15% { opacity: 1; transform: translateY(-2px) scale(1); }
  60% { opacity: 0.5; transform: translateY(-8px) scale(1.05); }
  85% { opacity: 0; transform: translateY(-14px) scale(0.9); }
}
@keyframes art-woodstock-chirp {
  0% { opacity: 0; transform: translate(0, 0) scale(0.6); }
  30% { opacity: 1; transform: translate(2px, -3px) scale(1); }
  80% { opacity: 0.6; transform: translate(4px, -8px) scale(0.9); }
  100% { opacity: 0; transform: translate(6px, -12px) scale(0.7); }
}
`;
  document.head.appendChild(style);
}

const mount: MountPiece = (ctx): PieceInstance => {
  ensureStyles();
  const pts = FLIGHT_PTS;

  const root = document.createElement("div");
  root.style.cssText = `position:absolute;inset:0;overflow:visible;user-select:none;cursor:pointer;`;
  root.setAttribute("aria-label", "Sleeping Snoopy and Woodstock");
  root.title = "Click: Woodstock comes and sits — or flies freely";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(ctx.width));
  svg.setAttribute("height", String(ctx.height));
  svg.style.cssText = `position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:15;`;
  root.appendChild(svg);

  const woodstock = document.createElement("div");
  woodstock.style.cssText = `position:absolute;left:${ORIGIN_X}px;top:${ORIGIN_Y}px;width:${WOODSTOCK_W}px;height:${WOODSTOCK_H}px;z-index:20;will-change:transform;pointer-events:none;`;
  const flying = document.createElement("img");
  flying.src = flyingUrl;
  flying.alt = "";
  flying.draggable = false;
  flying.style.cssText = `position:absolute;top:0;left:0;width:${FLY_IMG_W}px;height:auto;display:block;pointer-events:none;`;
  const sitting = document.createElement("img");
  sitting.src = sittingUrl;
  sitting.alt = "";
  sitting.draggable = false;
  sitting.style.cssText = `position:absolute;top:${4 * SCALE}px;left:${2 * SCALE}px;width:${SIT_IMG_W}px;height:auto;display:block;opacity:0;pointer-events:none;`;
  const chirp = document.createElement("span");
  chirp.textContent = "♪";
  chirp.style.cssText = `position:absolute;top:${-12 * SCALE}px;right:0;font-size:${10 * SCALE}px;font-weight:700;color:#d97706;pointer-events:none;display:none;animation:art-woodstock-chirp 2.2s ease-out infinite;`;
  woodstock.append(flying, sitting, chirp);
  root.appendChild(woodstock);

  const snoopyWrap = document.createElement("div");
  snoopyWrap.style.cssText = `position:absolute;left:${ORIGIN_X}px;top:${ORIGIN_Y}px;width:${SNOOPY_W}px;`;
  const snoopy = document.createElement("img");
  snoopy.src = snoopyUrl;
  snoopy.alt = "Sleeping Snoopy";
  snoopy.draggable = false;
  snoopy.style.cssText = `display:block;width:100%;height:auto;pointer-events:none;`;
  const zzz = document.createElement("div");
  zzz.style.cssText = `position:absolute;top:${-4 * SCALE}px;left:40%;pointer-events:none;font-family:Georgia,serif;font-style:italic;`;
  zzz.innerHTML = `
    <span style="position:absolute;font-size:${10 * SCALE}px;font-weight:700;color:rgba(29,36,43,0.5);animation:art-snoopy-zzz 2.8s ease-in-out infinite">z</span>
    <span style="position:absolute;top:${-12 * SCALE}px;left:${8 * SCALE}px;font-size:${13 * SCALE}px;font-weight:700;color:rgba(29,36,43,0.4);animation:art-snoopy-zzz 2.8s ease-in-out infinite 0.5s">Z</span>
    <span style="position:absolute;top:${-28 * SCALE}px;left:${20 * SCALE}px;font-size:${16 * SCALE}px;font-weight:700;color:rgba(29,36,43,0.25);animation:art-snoopy-zzz 2.8s ease-in-out infinite 1s">Z</span>
  `;
  snoopyWrap.append(snoopy, zzz);
  root.appendChild(snoopyWrap);

  ctx.el.appendChild(root);

  let isSitting = false;
  let isLanded = false;
  const dots: TrailDot[] = [];
  let dotId = 0;

  const pos = { x: pts[0][0], y: pts[0][1] };
  const vel = { x: 1, y: 0 };
  let angle = 0;
  let scaleX = 1;
  const lastDotPos = { x: pts[0][0], y: pts[0][1] };
  let distProgress = 0;
  let lastDotSpawnTime = 0;
  let wallPrev = performance.now();

  type Landing = {
    p0: { x: number; y: number };
    p1: { x: number; y: number };
    p2: { x: number; y: number };
    p3: { x: number; y: number };
    startTime: number;
    duration: number;
  };
  type Takeoff = { startX: number; startY: number; startTime: number; duration: number };
  let landing: Landing | null = null;
  let takeoff: Takeoff | null = null;

  const beginSitOrFly = (sit: boolean) => {
    const now = performance.now();
    isLanded = false;
    chirp.style.display = "none";
    if (sit) {
      landing = {
        p0: { x: pos.x, y: pos.y },
        p1: { x: pos.x + vel.x * 0.35, y: pos.y + vel.y * 0.35 - 35 * SCALE },
        p2: { x: LANDING.x + 35 * SCALE, y: LANDING.y - 50 * SCALE },
        p3: { x: LANDING.x, y: LANDING.y },
        startTime: now,
        duration: 2600,
      };
      takeoff = null;
      root.title = "Click: Woodstock flies freely";
    } else {
      takeoff = { startX: pos.x, startY: pos.y, startTime: now, duration: 1400 };
      landing = null;
      root.title = "Click: Woodstock comes and sits";
    }
  };

  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (!ctx.isFocused()) return;
    isSitting = !isSitting;
    beginSitOrFly(isSitting);
  };
  root.addEventListener("click", onClick);

  const pruneDots = (nowMs: number) => {
    for (let i = dots.length - 1; i >= 0; i--) {
      if (nowMs - dots[i].createdAt >= 4500) {
        dots[i].el.remove();
        dots.splice(i, 1);
      } else {
        const opacity = Math.max(0, 1 - (nowMs - dots[i].createdAt) / 4500) * 0.85;
        dots[i].el.setAttribute("opacity", opacity.toFixed(3));
      }
    }
  };

  // Seed woodstock at start of loop
  woodstock.style.transform = `translate3d(${pts[0][0]}px, ${pts[0][1]}px, 0) scaleX(1) rotate(0deg)`;

  return {
    setResolution() {
      /* DOM/CSS piece — resolution follows the page zoom via the shell transform */
    },
    frame(_time, _dt) {
      const timestamp = performance.now();
      const dt = Math.min((timestamp - wallPrev) / 1000, 0.05);
      wallPrev = timestamp;
      const nowMs = Date.now();

      if (ctx.reducedMotion) {
        // Hold Woodstock at the loop start; still allow sit snap
        if (isSitting) {
          pos.x = LANDING.x;
          pos.y = LANDING.y;
          flying.style.opacity = "0";
          sitting.style.opacity = "1";
          chirp.style.display = "block";
        } else {
          pos.x = pts[0][0];
          pos.y = pts[0][1];
          flying.style.opacity = "1";
          sitting.style.opacity = "0";
          chirp.style.display = "none";
        }
        woodstock.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
        return;
      }

      let currX = pos.x;
      let currY = pos.y;
      let targetAngle = angle;
      let targetScaleX = scaleX;
      let sitOpacity = 0;

      if (isSitting) {
        if (landing) {
          const elapsed = timestamp - landing.startTime;
          const rawP = Math.min(elapsed / landing.duration, 1);
          const p = rawP < 0.5 ? 2 * rawP * rawP : 1 - Math.pow(-2 * rawP + 2, 2) / 2;
          const u = 1 - p;
          const { p0, p1, p2, p3 } = landing;
          currX = u * u * u * p0.x + 3 * u * u * p * p1.x + 3 * u * p * p * p2.x + p * p * p * p3.x;
          currY = u * u * u * p0.y + 3 * u * u * p * p1.y + 3 * u * p * p * p2.y + p * p * p * p3.y;
          const dx = p3.x - currX;
          const dy = p3.y - currY;
          targetScaleX = dx > 0 ? -1 : 1;
          targetAngle = (dy / (Math.abs(dx) + 10)) * 20 * (1 - p);
          if (rawP >= 0.75) {
            const morphT = (rawP - 0.75) / 0.25;
            sitOpacity = morphT * morphT * (3 - 2 * morphT);
          }
          if (rawP >= 1) {
            currX = LANDING.x;
            currY = LANDING.y;
            targetAngle = 0;
            targetScaleX = 1;
            sitOpacity = 1;
            landing = null;
            isLanded = true;
            chirp.style.display = "block";
          }
        } else {
          currX = LANDING.x;
          currY = LANDING.y;
          targetAngle = 0;
          targetScaleX = 1;
          sitOpacity = 1;
          if (isLanded) chirp.style.display = "block";
        }
      } else if (takeoff) {
        const elapsed = timestamp - takeoff.startTime;
        const p = Math.min(elapsed / takeoff.duration, 1);
        const ease = p * p * (3 - 2 * p);
        currX = (1 - ease) * takeoff.startX + ease * pts[0][0];
        currY = (1 - ease) * takeoff.startY + ease * pts[0][1];
        targetScaleX = -1;
        targetAngle = -20 * (1 - p);
        if (p <= 0.35) {
          const morphT = p / 0.35;
          sitOpacity = 1 - morphT * morphT * (3 - 2 * morphT);
        }
        if (p >= 1) {
          takeoff = null;
          distProgress = 0;
          sitOpacity = 0;
        }
      } else {
        distProgress = (distProgress + dt * FLIGHT_SPEED) % FLIGHT_TOTAL_LEN;
        const numPts = pts.length;
        const indexFloat = (distProgress / FLIGHT_TOTAL_LEN) * numPts;
        const i0 = Math.floor(indexFloat) % numPts;
        const i1 = (i0 + 1) % numPts;
        const frac = indexFloat - Math.floor(indexFloat);
        currX = pts[i0][0] + (pts[i1][0] - pts[i0][0]) * frac;
        currY = pts[i0][1] + (pts[i1][1] - pts[i0][1]) * frac;
        const vx = pts[i1][0] - pts[i0][0];
        const vy = pts[i1][1] - pts[i0][1];
        vel.x = vx;
        vel.y = vy;
        targetScaleX = vx > 0 ? -1 : 1;
        const rawAngle = Math.atan2(vy, Math.abs(vx)) * (180 / Math.PI);
        targetAngle = Math.max(-30, Math.min(30, rawAngle));
        sitOpacity = 0;
      }

      angle += (targetAngle - angle) * 0.08;
      scaleX += (targetScaleX - scaleX) * 0.12;
      pos.x = currX;
      pos.y = currY;

      woodstock.style.transform = `translate3d(${currX}px, ${currY}px, 0) scaleX(${scaleX}) rotate(${angle}deg)`;
      sitting.style.opacity = sitOpacity.toFixed(3);
      flying.style.opacity = (1 - sitOpacity).toFixed(3);

      const distFromLast = Math.hypot(currX - lastDotPos.x, currY - lastDotPos.y);
      if (sitOpacity < 0.5 && distFromLast >= DOT_SPACING && nowMs - lastDotSpawnTime > 80) {
        lastDotSpawnTime = nowMs;
        lastDotPos.x = currX;
        lastDotPos.y = currY;
        const dotAngle = angle * (scaleX < 0 ? -1 : 1);
        const dx = currX + (scaleX < 0 ? -8 : 8) * SCALE;
        const dy = currY + 4 * SCALE;
        const el = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
        el.setAttribute("cx", String(ORIGIN_X + dx));
        el.setAttribute("cy", String(ORIGIN_Y + dy));
        el.setAttribute("rx", String(3.8 * SCALE));
        el.setAttribute("ry", String(1.8 * SCALE));
        el.setAttribute("transform", `rotate(${dotAngle} ${ORIGIN_X + dx} ${ORIGIN_Y + dy})`);
        el.setAttribute("fill", "rgba(29,36,43,0.78)");
        el.setAttribute("opacity", "0.85");
        svg.appendChild(el);
        dots.push({ id: dotId++, x: dx, y: dy, angle: dotAngle, createdAt: nowMs, el });
        while (dots.length > 45) {
          const old = dots.shift()!;
          old.el.remove();
        }
      }

      pruneDots(nowMs);
    },
    dispose() {
      root.removeEventListener("click", onClick);
      root.remove();
      for (const d of dots) d.el.remove();
      dots.length = 0;
    },
  };
};

export default mount;
