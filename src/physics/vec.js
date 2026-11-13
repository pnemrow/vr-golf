// Minimal 3D vector helpers on plain {x, y, z} objects.
// The physics code avoids three.js so it can run (and be tested) in Node.

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const clone = (a) => ({ x: a.x, y: a.y, z: a.z });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const len = (a) => Math.hypot(a.x, a.y, a.z);
export const norm = (a) => {
  const l = len(a);
  return l > 1e-12 ? scale(a, 1 / l) : v3(0, 0, 0);
};
export const addScaled = (a, b, s) => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s });
export const lerp = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

// Rotate vector a about unit axis k by angle (radians), Rodrigues' formula.
export function rotateAxis(a, k, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const kxa = cross(k, a);
  const kda = dot(k, a);
  return {
    x: a.x * c + kxa.x * s + k.x * kda * (1 - c),
    y: a.y * c + kxa.y * s + k.y * kda * (1 - c),
    z: a.z * c + kxa.z * s + k.z * kda * (1 - c),
  };
}

export const DEG = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const M_TO_YD = 1.0936133;
export const MPS_TO_MPH = 2.2369363;
export const RADS_TO_RPM = 60 / (2 * Math.PI);
