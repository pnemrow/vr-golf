import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateShot, SURFACES } from '../src/physics/flight.js';
import { computeLaunch } from '../src/physics/impact.js';
import { clubById } from '../src/physics/clubs.js';
import { v3, DEG, M_TO_YD, MPS_TO_MPH } from '../src/physics/vec.js';

const TEE = v3(0, 0.0213, 0);
const yd = (m) => m * M_TO_YD;

// Club delivered toward -Z with a given speed, attack angle, path, and a face
// with the given dynamic loft and face angle (deg, + = right/open).
function delivery(mph, attack, path, loft, face) {
  const s = mph / MPS_TO_MPH;
  const a = attack * DEG, p = path * DEG, l = loft * DEG, f = face * DEG;
  const clubVel = v3(s * Math.cos(a) * Math.sin(p), s * Math.sin(a), -s * Math.cos(a) * Math.cos(p));
  const faceNormal = v3(Math.cos(l) * Math.sin(f), Math.sin(l), -Math.cos(l) * Math.cos(f));
  return { clubVel, faceNormal };
}

function hit(clubId, d, opts = {}) {
  const club = clubById(clubId);
  const L = computeLaunch({ ...d, club, ...opts });
  const r = simulateShot(TEE, L.ballVel, L.spin, opts);
  return { ...L, ...r, carry: yd(-r.carryPoint.z), total: yd(-r.restPoint.z), side: yd(r.restPoint.x) };
}

test('tour-like driver launch and carry', () => {
  const r = hit('D', delivery(113, 3, 0, 13, 0));
  assert.ok(r.metrics.ballSpeed * MPS_TO_MPH > 160 && r.metrics.ballSpeed * MPS_TO_MPH < 172, `ball speed ${r.metrics.ballSpeed * MPS_TO_MPH}`);
  assert.ok(r.metrics.launchAngle > 10 && r.metrics.launchAngle < 14, `launch ${r.metrics.launchAngle}`);
  assert.ok(r.metrics.spinRate > 1800 && r.metrics.spinRate < 3200, `spin ${r.metrics.spinRate}`);
  assert.ok(r.carry > 250 && r.carry < 300, `carry ${r.carry}`);
  assert.ok(Math.abs(r.side) < 2, 'square face and path flies straight');
});

test('tour-like 7 iron carry', () => {
  const r = hit('7i', delivery(90, -4, 0, 24, 0));
  assert.ok(r.carry > 155 && r.carry < 185, `carry ${r.carry}`);
  assert.ok(r.metrics.spinRate > 5500 && r.metrics.spinRate < 8500, `spin ${r.metrics.spinRate}`);
});

test('longer clubs go further for the same swing', () => {
  // same body rotation: head speed scales with shaft length
  const carries = ['PW', '9i', '7i', '5i', '3W', 'D'].map((id) => hit(id, delivery(85 * clubById(id).length / 0.94, id === 'D' ? 1 : -3, 0, clubById(id).loft + (id === 'D' ? 3 : -3), 0)).carry);
  for (let i = 1; i < carries.length; i++) assert.ok(carries[i] > carries[i - 1], carries.join(', '));
});

test('open face to path slices right, closed draws left', () => {
  const fade = hit('7i', delivery(85, -3, 0, 28, 4));
  const draw = hit('7i', delivery(85, -3, 3, 28, -1)); // in-to-out, closed to path
  assert.ok(fade.metrics.spinAxis > 3, `fade axis ${fade.metrics.spinAxis}`);
  assert.ok(fade.side > 10, `fade side ${fade.side}`);
  assert.ok(draw.metrics.spinAxis < -3, `draw axis ${draw.metrics.spinAxis}`);
  // starts right of target (path + face) then curves back left
  assert.ok(draw.metrics.launchDir < 0.5 && draw.metrics.launchDir > -2);
  assert.ok(draw.side < fade.side);
});

test('ball starts mostly where the face points (D-plane)', () => {
  const r = hit('D', delivery(100, 0, -6, 12, 0)); // out-to-in path, face at target
  assert.ok(r.metrics.launchDir < 0 && r.metrics.launchDir > -1.5, `start ${r.metrics.launchDir}`);
  assert.ok(r.metrics.spinAxis > 5, 'face open to path => slice spin');
});

test('headwind shortens, tailwind lengthens', () => {
  const d = delivery(95, -2, 0, 28, 0);
  const calm = hit('7i', d).carry;
  const head = hit('7i', d, { wind: v3(0, 0, 8) }).carry;
  const tail = hit('7i', d, { wind: v3(0, 0, -8) }).carry;
  assert.ok(head < calm - 10 && tail > calm + 5, `${head} ${calm} ${tail}`);
});

test('crosswind pushes the ball sideways', () => {
  const r = hit('7i', delivery(95, -2, 0, 28, 0), { wind: v3(6, 0, 0) });
  assert.ok(r.side > 5, `side ${r.side}`);
});

test('ball rolls further on fairway than rough, and stops in sand', () => {
  const d = delivery(95, -2, 0, 28, 0);
  const world = (s) => ({ groundAt: () => ({ h: 0, n: v3(0, 1, 0), surface: s }) });
  const fw = hit('7i', d, { world: world(SURFACES.fairway) });
  const ro = hit('7i', d, { world: world(SURFACES.rough) });
  const sa = hit('7i', d, { world: world(SURFACES.sand) });
  const roll = (r) => r.total - r.carry;
  assert.ok(roll(fw) > roll(ro) && roll(ro) > roll(sa), `${roll(fw)} ${roll(ro)} ${roll(sa)}`);
  assert.ok(roll(sa) < 2);
});

test('ball rolls downhill on a slope', () => {
  const tilt = 3 * DEG; // ground falls away to +x
  const n = v3(Math.sin(tilt), Math.cos(tilt), 0);
  const world = { groundAt: (x) => ({ h: -x * Math.tan(tilt), n, surface: SURFACES.green }) };
  const r = simulateShot(v3(0, 0.0214, 0), v3(0, 0, -0.5), v3(), { world });
  assert.ok(r.restPoint.x > 0.5, `rest x ${r.restPoint.x}`);
});

test('toe strike loses ball speed', () => {
  const d = delivery(90, -3, 0, 28, 0);
  const pure = hit('7i', d);
  const toe = hit('7i', d, { toeOffset: 0.02 });
  assert.ok(toe.metrics.ballSpeed < pure.metrics.ballSpeed * 0.97);
});
