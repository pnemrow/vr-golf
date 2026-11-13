// Ball mesh, tracer, ground shadow, and landing markers.
import * as THREE from 'three';
import { dimpleTexture } from '../world/textures.js';
import { BALL } from '../physics/flight.js';

const MAX_TRACE = 1200;

export class BallView {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.SphereGeometry(BALL.radius, 24, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.35, bumpMap: dimpleTexture(), bumpScale: 0.6,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    // a soft glow halo so the ball is findable at distance
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(BALL.radius, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.halo = halo;
    this.mesh.add(halo);
    scene.add(this.mesh);

    // tee peg (shown for teed clubs)
    this.tee = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0035, 0.0018, 0.06, 8),
      new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.6 }),
    );
    scene.add(this.tee);

    // tracer
    const tGeo = new THREE.BufferGeometry();
    this.tracePos = new Float32Array(MAX_TRACE * 3);
    tGeo.setAttribute('position', new THREE.BufferAttribute(this.tracePos, 3));
    tGeo.setDrawRange(0, 0);
    this.tracer = new THREE.Line(tGeo, new THREE.LineBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.95 }));
    this.tracer.frustumCulled = false;
    scene.add(this.tracer);
    this.traceCount = 0;

    // previous shot tracers (faded)
    this.ghosts = [];

    // blob shadow
    const sc = document.createElement('canvas');
    sc.width = sc.height = 64;
    const ctx = sc.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.09, 0.09),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);

    // landing markers
    this.markers = [];
    this.markerGeo = new THREE.RingGeometry(0.5, 0.75, 24);
    this.markerGeo.rotateX(-Math.PI / 2);
  }

  setPosition(p, groundH, cameraPos) {
    this.mesh.position.set(p.x, p.y, p.z);
    this.shadow.position.set(p.x, groundH + 0.003, p.z);
    const height = p.y - groundH;
    const s = 1 + height * 0.4;
    this.shadow.scale.set(s, s, s);
    this.shadow.material.opacity = Math.max(0.15, 1 - height / 30);
    // halo grows with distance so the ball stays visible
    if (cameraPos) {
      const d = cameraPos.distanceTo(this.mesh.position);
      const k = Math.min(Math.max(1, d / 6), 14);
      this.halo.scale.setScalar(k);
      this.halo.visible = d > 4;
    } else {
      this.halo.visible = false;
    }
  }

  setSpin(spin, dt) {
    const w = Math.hypot(spin.x, spin.y, spin.z);
    if (w < 1e-3) return;
    // visual spin is capped so it reads as rotation, not strobe
    const axis = new THREE.Vector3(spin.x / w, spin.y / w, spin.z / w);
    this.mesh.rotateOnWorldAxis(axis, Math.min(w, 40) * dt);
  }

  // top: height of the ball's bottom; the peg is pushed 2 cm into the turf
  showTee(show, x, z, groundH, top) {
    this.tee.visible = show;
    if (!show) return;
    const len = Math.max(0.01, top - groundH + 0.02);
    this.tee.scale.y = len / 0.06;
    this.tee.position.set(x, groundH - 0.02 + len / 2, z);
  }

  clearTrace() {
    if (this.traceCount > 2) {
      // keep the last few shots as faint ghosts
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(this.tracePos.slice(0, this.traceCount * 3), 3));
      const ghost = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 }));
      ghost.frustumCulled = false;
      this.scene.add(ghost);
      this.ghosts.push(ghost);
      if (this.ghosts.length > 4) {
        const old = this.ghosts.shift();
        this.scene.remove(old);
        old.geometry.dispose();
      }
      this.ghosts.forEach((g, i) => {
        g.material.opacity = 0.1 + 0.08 * i;
      });
    }
    this.traceCount = 0;
    this.tracer.geometry.setDrawRange(0, 0);
  }

  addTrace(p) {
    if (this.traceCount >= MAX_TRACE) return;
    this.tracePos.set([p.x, p.y, p.z], this.traceCount * 3);
    this.traceCount++;
    this.tracer.geometry.setDrawRange(0, this.traceCount);
    this.tracer.geometry.attributes.position.needsUpdate = true;
  }

  addLandingMarker(p, groundH, color = 0xffe14d) {
    const m = new THREE.Mesh(this.markerGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
    m.position.set(p.x, groundH + 0.05, p.z);
    this.scene.add(m);
    this.markers.push(m);
    if (this.markers.length > 12) {
      const old = this.markers.shift();
      this.scene.remove(old);
    }
    this.markers.forEach((mk, i) => {
      mk.material.opacity = i === this.markers.length - 1 ? 0.9 : 0.35;
      mk.material.color.set(i === this.markers.length - 1 ? color : 0xffffff);
    });
  }
}
