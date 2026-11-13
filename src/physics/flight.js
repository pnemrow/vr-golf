// Golf ball flight, bounce and roll.
//
// Flight: gravity + quadratic drag + Magnus lift, with drag/lift coefficients
// that depend on the spin factor S = r*omega/|v| and a low-Reynolds drag rise.
// Spin decays exponentially. Wind is a boundary-layer profile (stronger aloft).
// Ground: impulse-based bounce with friction that couples to spin (so backspin
// can check or pull the ball back), then rolling with surface-specific rolling
// resistance and gravity along the slope.

import {
  v3, clone, add, sub, scale, dot, cross, len, norm, addScaled,
} from './vec.js';

export const BALL = {
  mass: 0.04593, // kg
  radius: 0.021335, // m
};
const AREA = Math.PI * BALL.radius * BALL.radius;
const RHO = 1.204; // kg/m^3 at 20C sea level
const G = 9.81;
const SPIN_TAU = 24; // s, spin decay time constant in flight

export function aeroCoefficients(speed, spinRate) {
  const S = speed > 0.1 ? (BALL.radius * spinRate) / speed : 0;
  // Drag: ~0.22 for a fast low-spin ball, rising with spin factor and at low
  // speed (below the drag crisis of a dimpled ball, Re ~ 5e4 => ~13 m/s).
  const lowSpeed = 0.22 / (1 + Math.exp((speed - 13) / 2.5));
  const cd = 0.21 + 0.3 * S + lowSpeed;
  // Lift: rises with spin factor and saturates.
  const cl = 0.34 * (1 - Math.exp(-S / 0.16));
  return { cd, cl, S };
}

// Wind profile: wind is specified at 10 m, falls off near the ground.
export function windAt(wind, height) {
  if (!wind) return v3();
  const h = Math.max(height, 0.5);
  const f = Math.min(Math.pow(h / 10, 0.16), 1.25);
  return scale(wind, f);
}

export function flightAcceleration(vel, spin, wind, height) {
  const u = sub(vel, windAt(wind, height)); // air-relative velocity
  const speed = len(u);
  const w = len(spin);
  const { cd, cl } = aeroCoefficients(speed, w);
  const q = (0.5 * RHO * AREA * speed) / BALL.mass;
  // drag opposes air-relative velocity
  let a = scale(u, -q * cd);
  // Magnus lift perpendicular to u along (omega x u)
  if (w > 1e-6 && speed > 1e-6) {
    const dir = norm(cross(spin, u));
    a = addScaled(a, dir, q * cl * speed);
  }
  a.y -= G;
  return a;
}

// A flat world used by tests and the preview when no terrain is supplied.
export const FLAT_FAIRWAY = {
  groundAt() {
    return { h: 0, n: v3(0, 1, 0), surface: SURFACES.fairway };
  },
};

// Surface properties:
//  e    - normal coefficient of restitution at low impact speed
//  mu   - sliding friction during a bounce
//  bite - turf deformation: tangential speed is divided by (1 + bite*|vn|)
//  roll - rolling resistance deceleration (m/s^2); green ~0.55 is stimp ~10
//  soft - how much impact speed reduces restitution (soft turf absorbs)
export const SURFACES = {
  tee: { name: 'Tee', e: 0.42, mu: 0.45, bite: 0.05, roll: 1.5, soft: 0.012 },
  fairway: { name: 'Fairway', e: 0.42, mu: 0.45, bite: 0.05, roll: 1.5, soft: 0.012 },
  rough: { name: 'Rough', e: 0.3, mu: 0.6, bite: 0.12, roll: 4.0, soft: 0.016 },
  deepRough: { name: 'Deep rough', e: 0.2, mu: 0.7, bite: 0.25, roll: 7.0, soft: 0.02 },
  green: { name: 'Green', e: 0.38, mu: 0.42, bite: 0.06, roll: 0.55, soft: 0.014 },
  fringe: { name: 'Fringe', e: 0.38, mu: 0.5, bite: 0.07, roll: 1.4, soft: 0.014 },
  sand: { name: 'Bunker', e: 0.08, mu: 0.8, bite: 0.6, roll: 9, soft: 0.03 },
  path: { name: 'Path', e: 0.62, mu: 0.3, bite: 0.01, roll: 0.5, soft: 0.004 },
};

export const PHASE = { FLIGHT: 'flight', ROLL: 'roll', REST: 'rest' };

export class BallSim {
  constructor(pos, vel, spin, { world = FLAT_FAIRWAY, wind = null } = {}) {
    this.pos = clone(pos);
    this.vel = clone(vel);
    this.spin = clone(spin); // rad/s vector
    this.world = world;
    this.wind = wind;
    this.phase = PHASE.FLIGHT;
    this.time = 0;
    this.apex = this.pos.y;
    this.carryPoint = null; // first ground contact
    this.flightTime = 0;
    this.bounces = 0;
    this.lastSurface = null;
  }

  step(dt) {
    if (this.phase === PHASE.REST) return;
    this.time += dt;
    if (this.phase === PHASE.FLIGHT) this.stepFlight(dt);
    else this.stepRoll(dt);
    if (this.time > 40) this.phase = PHASE.REST;
  }

  stepFlight(dt) {
    const { pos, vel, spin, wind } = this;
    // RK2 (midpoint) on position/velocity; spin treated as constant over step
    const a1 = flightAcceleration(vel, spin, wind, pos.y);
    const vMid = addScaled(vel, a1, dt / 2);
    const pMid = addScaled(pos, vel, dt / 2);
    const a2 = flightAcceleration(vMid, spin, wind, pMid.y);
    this.pos = addScaled(pos, vMid, dt);
    this.vel = addScaled(vel, a2, dt);
    this.spin = scale(spin, Math.exp(-dt / SPIN_TAU));
    if (this.pos.y > this.apex) this.apex = this.pos.y;

    const g = this.world.groundAt(this.pos.x, this.pos.z);
    if (this.pos.y - BALL.radius <= g.h) {
      this.pos.y = g.h + BALL.radius;
      if (!this.carryPoint) {
        this.carryPoint = clone(this.pos);
        this.flightTime = this.time;
      }
      this.bounce(g);
    }
  }

  bounce(g) {
    const n = g.n;
    const s = g.surface;
    this.lastSurface = s;
    this.bounces++;
    const vn = dot(this.vel, n);
    if (vn >= 0) return; // moving away already
    const vt = addScaled(this.vel, n, -vn);
    // impact-speed dependent restitution (turf absorbs hard landings)
    const e = Math.max(0.04, s.e - s.soft * Math.abs(vn));
    const vnAfter = -e * vn;
    // velocity of the contact point (slip)
    const r = BALL.radius;
    const rc = scale(n, -r);
    const slip = add(vt, cross(this.spin, rc));
    const slipSpeed = len(slip);
    let dvt = v3();
    if (slipSpeed > 1e-6) {
      // friction impulse, capped at the amount that reaches rolling (2/7)
      const k = Math.min((s.mu * (1 + e) * Math.abs(vn)) / slipSpeed, 2 / 7);
      dvt = scale(slip, -k);
    }
    const vtAfter = scale(add(vt, dvt), 1 / (1 + (s.bite ?? 0) * Math.abs(vn)));
    // angular impulse from friction: dw = (rc x m*dvt) / I, I = 2/5 m r^2
    const dw = scale(cross(rc, dvt), 5 / (2 * r * r));
    this.spin = add(this.spin, dw);
    // turf also scrubs spin on soft surfaces
    this.spin = scale(this.spin, 1 - Math.min(0.5, s.soft * 8));
    this.vel = addScaled(vtAfter, n, vnAfter);

    if (vnAfter < 0.6) {
      // too little bounce left: settle into rolling
      this.phase = PHASE.ROLL;
      this.vel = vtAfter;
    }
  }

  stepRoll(dt) {
    const g = this.world.groundAt(this.pos.x, this.pos.z);
    const n = g.n;
    const s = g.surface;
    this.lastSurface = s;
    // keep velocity tangent to the surface
    let v = addScaled(this.vel, n, -dot(this.vel, n));
    const gravity = v3(0, -G, 0);
    // rolling sphere: 5/7 of the tangential gravity
    const gt = scale(addScaled(gravity, n, -dot(gravity, n)), 5 / 7);
    const speed = len(v);
    const gtMag = len(gt);
    // static friction holds the ball on gentler slopes than rolling resistance
    if (speed < 0.04 && gtMag < s.roll * 0.45) {
      this.vel = v3();
      this.phase = PHASE.REST;
      return;
    }
    v = addScaled(v, gt, dt);
    const sp = len(v);
    // resistance eases at creeping speed so steep slopes keep a ball moving
    const dec = s.roll * Math.min(1, 0.45 + sp / 1.2) * dt;
    v = sp > dec ? scale(v, (sp - dec) / sp) : v3();
    this.vel = v;
    this.pos = addScaled(this.pos, v, dt);
    const g2 = this.world.groundAt(this.pos.x, this.pos.z);
    this.pos.y = g2.h + BALL.radius;
    // spin matches rolling (for visuals)
    const vs = len(v);
    this.spin = vs > 1e-6 ? scale(norm(cross(g2.n, v)), vs / BALL.radius) : v3();
  }

  get resting() {
    return this.phase === PHASE.REST;
  }
}

// Simulate a whole shot quickly. Returns summary and a sampled path.
export function simulateShot(pos, vel, spin, opts = {}) {
  const dt = opts.dt ?? 1 / 240;
  const sampleEvery = opts.sampleEvery ?? 6;
  const flightOnly = opts.flightOnly ?? false;
  const sim = new BallSim(pos, vel, spin, opts);
  const path = [clone(sim.pos)];
  let i = 0;
  while (!sim.resting) {
    sim.step(dt);
    if (++i % sampleEvery === 0) path.push(clone(sim.pos));
    if (flightOnly && sim.carryPoint) break;
  }
  path.push(clone(sim.pos));
  const carry = sim.carryPoint ?? sim.pos;
  return {
    path,
    carryPoint: carry,
    restPoint: clone(sim.pos),
    apex: sim.apex - pos.y,
    hangTime: sim.flightTime || sim.time,
    surface: sim.lastSurface,
  };
}
