// The tracked golf club: procedural meshes, head geometry in world space, and
// swept club-ball collision between tracking frames.
//
// Club frame (child of the hand pose): the grip is at the origin and the shaft
// runs down local -Y to the hosel. With the face square, the unlofted face
// normal is local +Z; the toe and the sole follow from the lie angle. The
// frame is mapped onto the controller with a pitch offset (shaft vs. the
// controller's pointing axis) and a roll (face square calibration).

import * as THREE from 'three';

const DEG = Math.PI / 180;
const BALL_R = 0.021335;

const HEADS = {
  wood: { len: 0.112, height: 0.056, depth: 0.105 },
  hybrid: { len: 0.098, height: 0.044, depth: 0.07 },
  iron: { len: 0.078, height: 0.046, depth: 0.02 },
  wedge: { len: 0.08, height: 0.05, depth: 0.02 },
};

function grooveTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d9dde2';
  ctx.fillRect(0, 0, 128, 64);
  ctx.strokeStyle = '#8f969e';
  ctx.lineWidth = 2;
  for (let y = 8; y < 60; y += 6) {
    ctx.beginPath();
    ctx.moveTo(14, y);
    ctx.lineTo(114, y);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let sharedMats = null;
function mats() {
  if (sharedMats) return sharedMats;
  sharedMats = {
    grip: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.9 }),
    shaft: new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.9, roughness: 0.25 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xb9bec5, metalness: 0.85, roughness: 0.3 }),
    face: new THREE.MeshStandardMaterial({ map: grooveTexture(), metalness: 0.6, roughness: 0.35 }),
    crown: new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.4, roughness: 0.35 }),
    accent: new THREE.MeshStandardMaterial({ color: 0xff6d2e, roughness: 0.5 }),
  };
  return sharedMats;
}

export class Club {
  constructor() {
    this.root = new THREE.Object3D(); // follows the hand
    this.frame = new THREE.Object3D(); // club frame, offset from the hand
    this.root.add(this.frame);
    this.visual = new THREE.Group();
    this.frame.add(this.visual);
    this.pitchDeg = 0;
    this.rollDeg = 0;
    this.spec = null;
    // local geometry (club frame)
    this.local = {
      face: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      toe: new THREE.Vector3(),
      up: new THREE.Vector3(),
      sole: new THREE.Vector3(),
    };
    this.updateOffset();
  }

  updateOffset() {
    const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (90 + this.pitchDeg) * DEG);
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rollDeg * DEG);
    this.frame.quaternion.copy(qx).multiply(qy);
  }

  setSpec(spec) {
    this.spec = spec;
    this.visual.clear();
    const m = mats();
    const kind = spec.kind;
    const dims = HEADS[kind];
    this.dims = dims;
    const L = spec.length - 0.07; // hand to hosel
    this.shaftLength = L;
    const lie = spec.lie * DEG;
    const loft = spec.loft * DEG;
    const s = Math.sin(lie);
    const c = Math.cos(lie);
    const toe = new THREE.Vector3(-s, -c, 0);
    const up = new THREE.Vector3(-c, s, 0);
    const z = new THREE.Vector3(0, 0, 1);
    const hosel = new THREE.Vector3(0, -L, 0);
    const face = hosel.clone().addScaledVector(toe, dims.len * 0.5);
    const normal = z.clone().multiplyScalar(Math.cos(loft)).addScaledVector(up, Math.sin(loft));
    this.local.face.copy(face);
    this.local.normal.copy(normal);
    this.local.toe.copy(toe);
    this.local.up.copy(up);
    // leading edge / sole: half the face height down the lofted face
    const faceUp = new THREE.Vector3().crossVectors(toe, normal).normalize();
    this.local.sole.copy(face).addScaledVector(faceUp, -dims.height * 0.5);

    // grip + shaft
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0105, 0.27, 12), m.grip);
    grip.position.y = -0.06;
    const shaftLen = L - 0.19;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0045, shaftLen, 10), m.shaft);
    shaft.position.y = -0.19 - shaftLen / 2;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0128, 0.0128, 0.012, 12), m.accent);
    band.position.y = -0.19;
    this.visual.add(grip, shaft, band);

    // head in its own frame: x = toe, y = up, z = face (unlofted)
    const head = new THREE.Group();
    const basis = new THREE.Matrix4().makeBasis(toe, up, z);
    head.quaternion.setFromRotationMatrix(basis);
    head.position.copy(face);
    const lofted = new THREE.Group();
    lofted.rotation.x = -loft; // tilts the face back by the loft
    head.add(lofted);
    if (kind === 'wood' || kind === 'hybrid') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 14), m.crown);
      body.scale.set(dims.len, dims.height, dims.depth);
      body.position.z = -dims.depth * 0.47;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(dims.len * 0.86, dims.height * 0.8, 0.004), m.face);
      plate.position.z = -0.001;
      const sole = new THREE.Mesh(new THREE.CylinderGeometry(dims.len * 0.42, dims.len * 0.42, 0.004, 20), m.steel);
      sole.scale.z = dims.depth / dims.len;
      sole.position.set(0, -dims.height * 0.47, -dims.depth * 0.47);
      lofted.add(body, plate, sole);
    } else {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(dims.len, dims.height, dims.depth), m.steel);
      blade.position.z = -dims.depth / 2;
      const facePlate = new THREE.Mesh(new THREE.PlaneGeometry(dims.len * 0.94, dims.height * 0.9), m.face);
      facePlate.position.z = 0.0005;
      const cavity = new THREE.Mesh(new THREE.BoxGeometry(dims.len * 0.98, dims.height * 0.35, 0.014), m.steel);
      cavity.position.set(0, -dims.height * 0.32, -dims.depth - 0.006);
      lofted.add(blade, facePlate, cavity);
    }
    // hosel
    const hoselMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0085, 0.05, 10), m.steel);
    hoselMesh.position.copy(hosel).add(new THREE.Vector3(0, 0.02, 0));
    this.visual.add(head, hoselMesh);
    this.visual.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
  }

  setPose(position, quaternion) {
    this.root.position.copy(position);
    this.root.quaternion.copy(quaternion);
  }

  // World-space head state for a given hand pose (does not touch the scene).
  headStateFor(position, quaternion, out = {}) {
    const q = out._q ?? (out._q = new THREE.Quaternion());
    q.copy(quaternion).multiply(this.frame.quaternion);
    out.face = (out.face ?? new THREE.Vector3()).copy(this.local.face).applyQuaternion(q).add(position);
    out.normal = (out.normal ?? new THREE.Vector3()).copy(this.local.normal).applyQuaternion(q);
    out.toe = (out.toe ?? new THREE.Vector3()).copy(this.local.toe).applyQuaternion(q);
    out.up = (out.up ?? new THREE.Vector3()).crossVectors(out.toe, out.normal).normalize();
    out.sole = (out.sole ?? new THREE.Vector3()).copy(this.local.sole).applyQuaternion(q).add(position);
    return out;
  }

  // Roll the club about its shaft so the face points at the target at the
  // current hand pose (horizontal component). Brute force + refine.
  squareFace(handQuat, target) {
    const tmp = {};
    const zero = new THREE.Vector3();
    const score = (roll) => {
      this.rollDeg = roll;
      this.updateOffset();
      const st = this.headStateFor(zero, handQuat, tmp);
      const h = new THREE.Vector3(st.normal.x, 0, st.normal.z).normalize();
      return h.dot(target);
    };
    let best = this.rollDeg;
    let bestS = -Infinity;
    for (let r = -180; r < 180; r += 2) {
      const sc = score(r);
      if (sc > bestS) {
        bestS = sc;
        best = r;
      }
    }
    for (let r = best - 2; r <= best + 2; r += 0.1) {
      const sc = score(r);
      if (sc > bestS) {
        bestS = sc;
        best = r;
      }
    }
    this.rollDeg = best;
    this.updateOffset();
    return best;
  }
}

// Detects the club striking a resting ball between two tracked hand poses.
export class SwingDetector {
  constructor(club) {
    this.club = club;
    this.prevPos = new THREE.Vector3();
    this.prevQuat = new THREE.Quaternion();
    this.prev2Pos = new THREE.Vector3();
    this.prev2Quat = new THREE.Quaternion();
    this.hasPrev = false;
    this.hasPrev2 = false;
    this.soleTrail = []; // recent sole positions for fat-shot detection
    this.headSpeed = 0;
    this._a = {};
    this._b = {};
    this._s = {};
  }

  reset() {
    this.hasPrev = false;
    this.hasPrev2 = false;
    this.soleTrail.length = 0;
  }

  // pos/quat: current hand pose (world). dt: frame time.
  // xrVel: optional { linear, angular } world-space hand velocities.
  // Returns impact info or null.
  update(pos, quat, dt, ball, groundHeight, xrVel = null, substeps = 24) {
    const club = this.club;
    const cur = club.headStateFor(pos, quat, this._b);
    let result = null;
    if (this.hasPrev && dt > 0) {
      const prev = club.headStateFor(this.prevPos, this.prevQuat, this._a);
      const frameVel = cur.face.clone().sub(prev.face).divideScalar(dt);
      this.headSpeed = frameVel.length();
      if (ball) result = this.sweep(pos, quat, dt, ball, groundHeight, frameVel, xrVel, substeps);
    }
    // sole trail for fat detection
    this.soleTrail.push(cur.sole.clone());
    if (this.soleTrail.length > 12) this.soleTrail.shift();
    this.hasPrev2 = this.hasPrev;
    this.prev2Pos.copy(this.prevPos);
    this.prev2Quat.copy(this.prevQuat);
    this.prevPos.copy(pos);
    this.prevQuat.copy(quat);
    this.hasPrev = true;
    return result;
  }

  sweep(pos, quat, dt, ball, groundHeight, frameVel, xrVel, substeps) {
    const club = this.club;
    const dims = club.dims;
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const rel = new THREE.Vector3();
    let prevF = null;
    for (let k = 0; k <= substeps; k++) {
      const t = k / substeps;
      p.lerpVectors(this.prevPos, pos, t);
      q.slerpQuaternions(this.prevQuat, quat, t);
      const st = club.headStateFor(p, q, this._s);
      rel.subVectors(ball, st.face);
      const f = rel.dot(st.normal); // ball distance in front of the face
      if (prevF !== null && prevF > BALL_R && f <= BALL_R) {
        const along = rel.dot(st.toe);
        const upOff = rel.dot(st.up);
        const inToe = Math.abs(along) < dims.len * 0.5 + 0.012;
        const inHeight = upOff > -dims.height * 0.5 - 0.022 && upOff < dims.height * 0.5 + 0.012;
        if (inToe && inHeight) {
          // Head velocity at the moment of contact. A plain frame difference is
          // a chord of the arc (at 40 m/s the head turns ~15 deg per frame), so
          // fit a parabola through the last three frames instead.
          let vel = frameVel;
          if (this.hasPrev2) {
            const h = dt;
            const P0 = club.headStateFor(this.prev2Pos, this.prev2Quat, {}).face;
            const P1 = club.headStateFor(this.prevPos, this.prevQuat, {}).face;
            const P2 = club.headStateFor(pos, quat, {}).face;
            const c2 = P0.clone().addScaledVector(P1, -2).add(P2).divideScalar(2 * h * h);
            const b = P2.clone().sub(P1).divideScalar(h).addScaledVector(c2, h);
            const tau = -h + t * h;
            const quad = b.addScaledVector(c2, 2 * tau);
            if (quad.length() < 2.5 * frameVel.length() + 1) vel = quad;
          }
          const fallbackVel = vel;
          if (xrVel && xrVel.linear) {
            const r = st.face.clone().sub(p);
            vel = xrVel.linear.clone().add(xrVel.angular.clone().cross(r));
            // guard against bad samples
            if (!(vel.length() > 0.3 * frameVel.length() && vel.length() < 3 * frameVel.length() + 1)) vel = fallbackVel;
          }
          // the club must be moving into the back of the ball
          if (vel.dot(st.normal) < 0.8) return null;
          return {
            clubVel: vel.clone(),
            normal: st.normal.clone(),
            toeOffset: along,
            // contact point (ball centre minus R along the normal) relative to face centre
            faceHeightOffset: upOff,
            faceHalfHeight: dims.height / 2,
            fatFactor: this.fatFactor(ball, groundHeight),
            face: st.face.clone(),
          };
        }
      }
      prevF = f;
    }
    return null;
  }

  // Sole digging into the ground just before the ball costs speed.
  fatFactor(ball, groundHeight) {
    let depth = 0;
    for (const s of this.soleTrail) {
      const dx = s.x - ball.x;
      const dz = s.z - ball.z;
      if (Math.hypot(dx, dz) < 0.45) depth = Math.max(depth, groundHeight - s.y);
    }
    const excess = depth - 0.015; // 1.5 cm grace for floor calibration
    return excess > 0 ? Math.max(0.45, 1 - excess * 14) : 1;
  }
}
