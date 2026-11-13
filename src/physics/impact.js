// Club-ball impact: turns the tracked club state at impact into ball launch.
//
// Uses the D-plane model: the ball starts mostly where the face points
// (club.faceDom) and partly along the club path; the spin axis is
// perpendicular to the plane containing the club path and the face normal, so
// a face closed to the path tilts the axis left (draw/hook for a right-hander)
// and open tilts it right (fade/slice). Ball speed scales with the smash
// factor and how square the strike is (spin loft), and off-centre strikes lose
// speed and gain gear-effect spin.

import {
  v3, add, scale, dot, cross, len, norm, rotateAxis, DEG, RAD2DEG, RADS_TO_RPM,
} from './vec.js';

const UP = v3(0, 1, 0);

export function angleBetween(a, b) {
  const d = dot(norm(a), norm(b));
  return Math.acos(Math.max(-1, Math.min(1, d)));
}

// Signed horizontal angle of vector a relative to target t (deg, + = right).
export function horizAngle(a, target) {
  const right = cross(target, UP);
  return Math.atan2(dot(a, right), dot(a, target)) * RAD2DEG;
}

export function computeLaunch({
  clubVel,
  faceNormal,
  club,
  target = v3(0, 0, -1),
  toeOffset = 0,
  faceHeightOffset = 0,
  fatFactor = 1,
  faceHalfHeight = 0.023,
  forgiveness = 0,
}) {
  let v = clubVel;
  let n = norm(faceNormal);
  const clubSpeed = len(v);
  if (clubSpeed < 0.05) return null;

  // Forgiveness (swing assist): pull face and path toward the target line.
  if (forgiveness > 0) {
    const pathDeg = horizAngle(v, target);
    v = rotateAxis(v, UP, pathDeg * DEG * forgiveness);
    const faceDeg = horizAngle(n, target);
    n = rotateAxis(n, UP, faceDeg * DEG * forgiveness);
  }
  const vhat = norm(v);

  const spinLoft = angleBetween(v, n); // rad
  const nominal = (club.loft + 1) * DEG;

  // --- strike quality ---------------------------------------------------
  const toeCm = toeOffset * 100;
  const isWood = club.kind === 'wood' || club.kind === 'hybrid';
  // ~4% (woods) / 6% (irons) speed loss for a 2 cm miss, growing quadratically
  const toePenalty = (isWood ? 0.01 : 0.015) * toeCm * toeCm;
  let speedFactor = Math.max(0.55, 1 - toePenalty);
  speedFactor *= fatFactor;
  // thin/topped: contact within ~5 mm of the leading edge (or below it)
  const belowCm = -faceHeightOffset * 100; // + = contact below face centre
  const edgeCm = faceHalfHeight * 100 - 0.5;
  let thin = 0;
  if (belowCm > edgeCm) {
    thin = Math.min(1, (belowCm - edgeCm) / 1.5);
    speedFactor *= 1 - 0.25 * thin;
  }

  // --- ball speed -------------------------------------------------------
  const squareness = Math.cos(spinLoft) / Math.cos(nominal);
  const smash = club.smash * Math.min(1.04, Math.max(0.3, squareness)) * speedFactor;
  const ballSpeed = clubSpeed * smash;

  // --- launch direction (face-dominant blend) ---------------------------
  let launch = norm(add(scale(n, club.faceDom), scale(vhat, 1 - club.faceDom)));
  // strike height: high on face => higher launch, low => lower
  const launchAdj = faceHeightOffset * 100 * (isWood ? 0.8 : 0.4) - thin * 8;
  {
    const horiz = norm(v3(launch.x, 0, launch.z));
    const axis = norm(cross(horiz, UP)); // positive rotation raises launch
    launch = rotateAxis(launch, axis, launchAdj * DEG);
  }
  // A ball cannot launch into the ground.
  if (launch.y < -0.05) launch = norm(v3(launch.x, -0.05, launch.z));
  const ballVel = scale(launch, ballSpeed);

  // --- spin ------------------------------------------------------------
  let rpm = club.spinK * clubSpeed * Math.sin(spinLoft) * speedFactor;
  rpm *= 1 - faceHeightOffset * 100 * (isWood ? 0.09 : 0.05); // high on face => less spin
  rpm *= 1 - 0.6 * thin;
  rpm = Math.max(150, Math.min(rpm, 13000));
  let axis = cross(vhat, n);
  if (len(axis) < 1e-6) axis = norm(cross(launch, UP));
  axis = norm(axis);
  // gear effect: toe strike tilts the axis toward a draw for woods
  const gearDeg = -club.gear * toeCm;
  axis = rotateAxis(axis, launch, gearDeg * DEG);
  const spin = scale(axis, rpm / RADS_TO_RPM);

  // --- metrics -----------------------------------------------------------
  const spinAxisTilt = Math.asin(Math.max(-1, Math.min(1, dot(axis, UP)))) * RAD2DEG;
  const metrics = {
    club: club.id,
    clubSpeed,
    ballSpeed,
    smash: ballSpeed / clubSpeed,
    launchAngle: Math.asin(launch.y) * RAD2DEG,
    launchDir: horizAngle(launch, target),
    attackAngle: Math.asin(Math.max(-1, Math.min(1, vhat.y))) * RAD2DEG,
    clubPath: horizAngle(v, target),
    faceAngle: horizAngle(n, target),
    dynamicLoft: Math.asin(Math.max(-1, Math.min(1, n.y))) * RAD2DEG,
    spinLoft: spinLoft * RAD2DEG,
    spinRate: rpm,
    // + = axis tilted right (fade/slice for RH), - = left (draw/hook)
    spinAxis: -spinAxisTilt,
    toeOffset,
    faceHeightOffset,
    strike: thin > 0.3 ? 'Thin' : fatFactor < 0.9 ? 'Fat' : Math.abs(toeCm) > 1.5 ? (toeCm > 0 ? 'Toe' : 'Heel') : 'Pure',
  };
  metrics.faceToPath = metrics.faceAngle - metrics.clubPath;
  return { ballVel, spin, metrics };
}
