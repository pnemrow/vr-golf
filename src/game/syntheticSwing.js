// A scripted golf swing for desktop testing: rigidly rotates the address pose
// of the hands + club about a pivot (the sternum), so the head returns to the
// ball along a chosen path with a chosen speed and face angle. It drives the
// same SwingDetector as real tracking, so it exercises the full pipeline.
import * as THREE from 'three';

const DEG = Math.PI / 180;

export class SyntheticSwing {
  constructor(club, ball, { mph = 85, faceDeg = 0, pathDeg = 0, attackDeg = -3 } = {}) {
    const spec = club.spec;
    const speed = mph / 2.23694;
    const lie = spec.lie * DEG;
    const s = Math.sin(lie);
    const c = Math.cos(lie);
    // club frame for a square face aimed at -Z, golfer standing on the -X side
    const X = new THREE.Vector3(-s, -c, 0);
    const Y = new THREE.Vector3(-c, s, 0);
    const Z = new THREE.Vector3(0, 0, -1);
    const qClub = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    // open/close the face about vertical (positive = open = face right)
    const qFace = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -faceDeg * DEG);
    qClub.premultiply(qFace);
    const qHand = qClub.clone().multiply(club.frame.quaternion.clone().invert());

    // put the face centre just behind the ball at ball height
    const ballV = new THREE.Vector3(ball.x, ball.y, ball.z);
    const faceLocal = club.local.face.clone().applyQuaternion(qClub);
    const normal = club.local.normal.clone().applyQuaternion(qClub);
    // centred strike: the face centre sits R (+ a few mm) back along the normal
    const faceAt = ballV.clone().addScaledVector(normal, -(0.0215 + 0.004));
    // but never with the sole below the turf: off the ground, contact is low on the face
    const minY = (ball.ground ?? 0) + (club.dims.height / 2) * Math.cos(spec.loft * DEG) + 0.001;
    if (faceAt.y < minY) {
      faceAt.y = minY;
      // raising a lofted face moves it toward the ball; back it off along the line
      const f = ballV.clone().sub(faceAt).dot(normal);
      faceAt.z += (0.0215 + 0.004 - f) / Math.max(0.2, -normal.z);
    }
    const handPos = faceAt.clone().sub(faceLocal);

    // path direction at impact
    const d = new THREE.Vector3(Math.sin(pathDeg * DEG), Math.sin(attackDeg * DEG), -Math.cos(pathDeg * DEG)).normalize();
    // pivot roughly at the sternum, above the hands, toward the golfer
    const pivot = new THREE.Vector3(ballV.x - 0.75, 1.3, ballV.z);
    // shift the pivot so the radius is perpendicular to d: impact velocity is then exactly along d
    pivot.addScaledVector(d, faceAt.clone().sub(pivot).dot(d));
    const r = faceAt.clone().sub(pivot);
    const axis = new THREE.Vector3().crossVectors(r, d).normalize();
    const omega = speed / r.length();

    this.handPos = handPos;
    this.qHand = qHand;
    this.pivot = pivot;
    this.axis = axis;
    this.omega = omega;
    // timing
    this.top = 2.3; // rad of backswing
    this.backTime = 0.85;
    this.pause = 0.12;
    this.downTime = (2 * this.top) / omega; // theta = -top + top*(t/Td)^2
    this.followDecel = omega / 0.35;
    this.duration = this.backTime + this.pause + this.downTime + 0.6;
  }

  angleAt(t) {
    const { top, backTime, pause, downTime, omega, followDecel } = this;
    if (t < 0) return 0;
    if (t < backTime) {
      const u = t / backTime;
      return -top * (u * u * (3 - 2 * u));
    }
    if (t < backTime + pause) return -top;
    const td = t - backTime - pause;
    if (td < downTime) return -top + top * (td / downTime) ** 2;
    const tf = Math.min(td - downTime, omega / followDecel);
    return omega * tf - 0.5 * followDecel * tf * tf;
  }

  poseAt(t, outPos, outQuat) {
    const a = this.angleAt(t);
    const q = new THREE.Quaternion().setFromAxisAngle(this.axis, a);
    outPos.copy(this.handPos).sub(this.pivot).applyQuaternion(q).add(this.pivot);
    outQuat.copy(q).multiply(this.qHand);
  }
}
