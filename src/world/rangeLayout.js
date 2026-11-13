// Driving range layout: an analytic height field and surface map shared by
// the physics (groundAt) and the mesh builder, so what you see is what the
// ball feels. Target line is world -Z; the tee is at the origin.

import { fbm, smoothstep } from './noise.js';
import { SURFACES } from '../physics/flight.js';

const YD = 0.9144;

export const TARGETS = [
  { yards: 50, x: -10 },
  { yards: 100, x: 16 },
  { yards: 150, x: -18 },
  { yards: 200, x: 14 },
  { yards: 250, x: -6 },
  { yards: 300, x: 22 },
].map((t) => ({ ...t, z: -t.yards * YD, r: 7 + t.yards / 28 }));

export const BUNKERS = TARGETS.flatMap((t, i) => {
  void i;
  // bunkers guard the outside of each green, keeping the centre line clear
  const side = Math.sign(t.x) || (i % 2 ? -1 : 1);
  return [
    // greenside bunker, front-left/right
    { x: t.x + side * (t.r + 3.5), z: t.z + t.r * 0.5, rx: 4.5 + t.yards / 80, rz: 3, rot: 0.5 * side },
    // short of the green
    ...(t.yards >= 150 ? [{ x: t.x + side * 5, z: t.z + t.r + 7, rx: 6, rz: 2.4, rot: -0.2 * side }] : []),
  ];
});

export const RANGE_BOUNDS = { xMin: -170, xMax: 170, zMin: -380, zMax: 60 };

function fairwayHalfWidth(z) {
  const d = Math.max(0, -z);
  return 32 + d * 0.09 + 5 * fbm(z / 60, 3.7, { octaves: 2, seed: 11 });
}

function bunkerField(x, z) {
  // > 0 inside a bunker, value is depth fraction (0..1)
  let best = -1;
  // wobbly organic edge
  const wob = 0.12 * fbm(x / 3, z / 3, { octaves: 2, seed: 5 });
  for (const b of BUNKERS) {
    if (Math.abs(x - b.x) > 12 || Math.abs(z - b.z) > 12) continue;
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    const dx = x - b.x;
    const dz = z - b.z;
    const lx = (dx * c - dz * s) / b.rx;
    const lz = (dx * s + dz * c) / b.rz;
    const v = 1 - Math.sqrt(lx * lx + lz * lz) + wob;
    if (v > best) best = v;
  }
  return best;
}

function greenField(x, z) {
  let best = { d: Infinity, t: null };
  for (const t of TARGETS) {
    const d = Math.hypot(x - t.x, z - t.z) / t.r;
    if (d < best.d) best = { d, t };
  }
  return best;
}

export function heightAt(x, z) {
  const d = -z;
  const ax = Math.abs(x);
  const hw = fairwayHalfWidth(z);
  let h = 0;
  // rolling undulation, absent near the tee
  h += fbm(x / 85, z / 85, { octaves: 3, seed: 3 }) * 2.6 * smoothstep(12, 70, d);
  // the range rises gently into banks on the sides and behind the tee
  h += smoothstep(hw + 10, hw + 90, ax) * 7;
  h += smoothstep(12, 60, z) * 5;
  // far end rises into a backstop
  h += smoothstep(300, 380, d) * 9;
  // target greens: raised, smooth tops
  const g = greenField(x, z);
  if (g.t) {
    const mound = 0.7 * Math.exp(-((g.d / 1.5) ** 2));
    h += mound;
    // greens have a gentle back-to-front tilt
    if (g.d < 1.3) h += (1 - smoothstep(1.0, 1.3, g.d)) * ((g.t.z - z) * 0.015);
  }
  // bunkers: dished
  const b = bunkerField(x, z);
  if (b > -0.3) h -= 0.55 * smoothstep(-0.3, 0.35, b);
  // the tee area is dead flat
  const teeBlend = smoothstep(9, 16, Math.hypot(x * 0.7, z));
  return h * teeBlend;
}

export function surfaceAt(x, z) {
  if (Math.abs(x) < 9 && z > -4 && z < 6) return SURFACES.tee;
  if (bunkerField(x, z) > 0) return SURFACES.sand;
  const g = greenField(x, z);
  if (g.d < 1) return SURFACES.green;
  if (g.d < 1 + 1.6 / g.t.r) return SURFACES.fringe;
  const hw = fairwayHalfWidth(z);
  const ax = Math.abs(x);
  if (ax < hw && z < 6) return SURFACES.fairway;
  if (ax < hw + 28) return SURFACES.rough;
  return SURFACES.deepRough;
}

// Numeric normal from the height field.
export function normalAt(x, z) {
  const e = 0.2;
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  const nx = -hx / (2 * e);
  const nz = -hz / (2 * e);
  const l = Math.hypot(nx, 1, nz);
  return { x: nx / l, y: 1 / l, z: nz / l };
}

export const rangeWorld = {
  groundAt(x, z) {
    return { h: heightAt(x, z), n: normalAt(x, z), surface: surfaceAt(x, z) };
  },
};

export const YARDS = YD;
