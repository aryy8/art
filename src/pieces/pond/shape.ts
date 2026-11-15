/**
 * The pond's outline, shared by the shaders (GLSL) and the creatures (TS) so boats
 * and ducks know where the water is. q-space: x in [-ASPECT/2, ASPECT/2], y in [-0.5, 0.5], y down.
 */
export const ASPECT = 1.5;
export const POND = { cx: 0.02, cy: 0.015, sx: 1.42, r: 0.305 };

export function pondR(a: number) {
  return (
    POND.r *
    (1 + 0.085 * Math.sin(a + 1.3) + 0.07 * Math.sin(2 * a + 0.4) + 0.045 * Math.sin(3 * a + 2.1) + 0.025 * Math.sin(5 * a + 0.7))
  );
}

/** approximate signed distance (negative inside the water) */
export function pondSDF(x: number, y: number) {
  const cx = (x - POND.cx) / POND.sx;
  const cy = y - POND.cy;
  const a = Math.atan2(cy, cx);
  return (Math.hypot(cx, cy) - pondR(a)) * 0.82;
}

export const POND_GLSL = /* glsl */ `
const float ASPECT = ${ASPECT.toFixed(4)};
float pondR(float a) {
  return ${POND.r.toFixed(4)} * (1.0 + 0.085 * sin(a + 1.3) + 0.07 * sin(2.0 * a + 0.4) + 0.045 * sin(3.0 * a + 2.1) + 0.025 * sin(5.0 * a + 0.7));
}
float pondSDF(vec2 q) {
  vec2 c = vec2((q.x - ${POND.cx.toFixed(4)}) / ${POND.sx.toFixed(4)}, q.y - ${POND.cy.toFixed(4)});
  return (length(c) - pondR(atan(c.y, c.x))) * 0.82;
}
`;
