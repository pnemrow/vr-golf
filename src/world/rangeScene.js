// Builds the driving range visuals from the analytic layout.
import * as THREE from 'three';
import {
  heightAt, surfaceAt, TARGETS, RANGE_BOUNDS, YARDS,
} from './rangeLayout.js';
import { SURFACES } from '../physics/flight.js';
import { fbm, mulberry32 } from './noise.js';
import { grassDetailTexture, labelTexture } from './textures.js';

const SURFACE_COLORS = new Map([
  [SURFACES.tee, new THREE.Color(0x5f9e3c)],
  [SURFACES.fairway, new THREE.Color(0x5c9a38)],
  [SURFACES.rough, new THREE.Color(0x4a7f2c)],
  [SURFACES.deepRough, new THREE.Color(0x56762f)],
  [SURFACES.green, new THREE.Color(0x63ad42)],
  [SURFACES.fringe, new THREE.Color(0x5ba03b)],
  [SURFACES.sand, new THREE.Color(0xe3d3a4)],
]);
const MOWN = new Set([SURFACES.tee, SURFACES.fairway, SURFACES.green, SURFACES.fringe]);

function terrainMaterial() {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: grassDetailTexture() });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float mow;\nvarying float vMow;\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMow = mow;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vMow;\nvarying vec3 vWPos;')
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          // two scales of detail to hide tiling
          vec4 t1 = texture2D(map, vWPos.xz * 0.35);
          vec4 t2 = texture2D(map, vWPos.xz * 0.045);
          diffuseColor.rgb *= t1.rgb * t2.rgb * 1.25;
        #endif
        // mowing stripes: alternate bands across the target line, plus
        // diagonal checks on greens (vMow > 1.5)
        float band = step(0.5, fract(vWPos.z / 9.0));
        float check = step(0.5, fract((vWPos.x + vWPos.z) / 3.0));
        float stripe = vMow > 1.5 ? check : band;
        diffuseColor.rgb *= 1.0 + (stripe - 0.5) * 0.14 * min(vMow, 1.0);`,
      );
  };
  return mat;
}

function buildTerrain() {
  const { xMin, xMax, zMin, zMax } = RANGE_BOUNDS;
  const step = 2;
  const nx = Math.round((xMax - xMin) / step);
  const nz = Math.round((zMax - zMin) / step);
  const geo = new THREE.PlaneGeometry(xMax - xMin, zMax - zMin, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.translate((xMin + xMax) / 2, 0, (zMin + zMax) / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const mow = new Float32Array(pos.count);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    const s = surfaceAt(x, z);
    c.copy(SURFACE_COLORS.get(s) ?? SURFACE_COLORS.get(SURFACES.rough));
    // natural variation
    const n = fbm(x / 25, z / 25, { octaves: 2, seed: 9 });
    if (s === SURFACES.sand) c.offsetHSL(0, 0, n * 0.03);
    else c.offsetHSL(n * 0.015, 0, n * 0.04);
    colors.set([c.r, c.g, c.b], i * 3);
    mow[i] = s === SURFACES.green ? 2 : MOWN.has(s) ? 1 : 0;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('mow', new THREE.BufferAttribute(mow, 1));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, terrainMaterial());
  mesh.receiveShadow = true;
  return mesh;
}

function buildOuterGround() {
  const geo = new THREE.RingGeometry(150, 3200, 64, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({ color: 0x4c7a30 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 3.5, -160);
  return mesh;
}

function buildMountains() {
  const segs = 160;
  const positions = [];
  const colors = [];
  const near = new THREE.Color(0x6f8f9c);
  const far = new THREE.Color(0xa9c2d3);
  const snow = new THREE.Color(0xeef3f7);
  for (let ring = 0; ring < 2; ring++) {
    const r = ring ? 2900 : 2300;
    const base = ring ? far : near;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const h = (a) => {
        const n = fbm(Math.cos(a) * 3 + ring * 7, Math.sin(a) * 3, { octaves: 4, seed: 21 + ring });
        return Math.max(40, 160 + n * 380 + (ring ? 160 : 0));
      };
      const p0 = [Math.cos(a0) * r, -20, Math.sin(a0) * r];
      const p1 = [Math.cos(a1) * r, -20, Math.sin(a1) * r];
      const h0 = h(a0);
      const h1 = h(a1);
      const t0 = [p0[0], h0, p0[2]];
      const t1 = [p1[0], h1, p1[2]];
      positions.push(...p0, ...t0, ...p1, ...p1, ...t0, ...t1);
      const col = (y) => (y > 380 ? snow : base);
      for (const y of [-20, h0, -20, -20, h0, h1]) {
        const cc = col(y);
        colors.push(cc.r, cc.g, cc.b);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
  return new THREE.Mesh(geo, mat);
}

function buildTrees() {
  const rand = mulberry32(7);
  const spots = [];
  const tryAdd = (x, z) => {
    if (surfaceAt(x, z) !== SURFACES.deepRough) return;
    spots.push({ x, z, y: heightAt(x, z), s: 0.7 + rand() * 0.7, kind: rand() < 0.55 ? 0 : 1 });
  };
  for (let i = 0; i < 900 && spots.length < 380; i++) {
    const side = rand() < 0.5 ? -1 : 1;
    tryAdd(side * (70 + rand() * 95), 50 - rand() * 420);
  }
  for (let i = 0; i < 120; i++) tryAdd(-160 + rand() * 320, -345 - rand() * 30);
  for (let i = 0; i < 60; i++) tryAdd(-120 + rand() * 240, 30 + rand() * 25);

  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 3, 6);
  trunkGeo.translate(0, 1.5, 0);
  const pineGeo = new THREE.ConeGeometry(2.4, 8, 7);
  pineGeo.translate(0, 6.5, 0);
  const oakGeo = new THREE.IcosahedronGeometry(3.2, 1);
  oakGeo.scale(1, 0.85, 1);
  oakGeo.translate(0, 5.4, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x5a4030 }), spots.length);
  const pines = spots.filter((s) => s.kind === 0);
  const oaks = spots.filter((s) => s.kind === 1);
  const pineMesh = new THREE.InstancedMesh(pineGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), pines.length);
  const oakMesh = new THREE.InstancedMesh(oakGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), oaks.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  spots.forEach((s, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
    m.compose(new THREE.Vector3(s.x, s.y - 0.2, s.z), q, new THREE.Vector3(s.s, s.s, s.s));
    trunks.setMatrixAt(i, m);
  });
  pines.forEach((s, i) => {
    m.compose(new THREE.Vector3(s.x, s.y - 0.2, s.z), q, new THREE.Vector3(s.s, s.s * (0.9 + rand() * 0.4), s.s));
    pineMesh.setMatrixAt(i, m);
    pineMesh.setColorAt(i, col.setHSL(0.3 + rand() * 0.05, 0.45, 0.2 + rand() * 0.08));
  });
  oaks.forEach((s, i) => {
    m.compose(new THREE.Vector3(s.x, s.y - 0.2, s.z), q, new THREE.Vector3(s.s, s.s, s.s));
    oakMesh.setMatrixAt(i, m);
    oakMesh.setColorAt(i, col.setHSL(0.22 + rand() * 0.08, 0.45, 0.26 + rand() * 0.1));
  });
  const g = new THREE.Group();
  g.add(trunks, pineMesh, oakMesh);
  return g;
}

const FLAG_COLORS = [0xe53935, 0xfdd835, 0x1e88e5, 0xffffff, 0xfb8c00, 0x8e24aa];

function buildTargets() {
  const g = new THREE.Group();
  const flags = [];
  const poleGeo = new THREE.CylinderGeometry(0.012, 0.012, 2.3, 6);
  poleGeo.translate(0, 1.15, 0);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0xf5f5f5 });
  const cupGeo = new THREE.CircleGeometry(0.054, 16);
  cupGeo.rotateX(-Math.PI / 2);
  const cupMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
  TARGETS.forEach((t, i) => {
    const y = heightAt(t.x, t.z);
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(t.x, y, t.z);
    const cup = new THREE.Mesh(cupGeo, cupMat);
    cup.position.set(t.x, y + 0.01, t.z);
    // flag: subdivided plane so it can ripple
    const flagGeo = new THREE.PlaneGeometry(0.75, 0.5, 8, 2);
    flagGeo.translate(0.375, 0, 0);
    const flag = new THREE.Mesh(flagGeo, new THREE.MeshLambertMaterial({ color: FLAG_COLORS[i % FLAG_COLORS.length], side: THREE.DoubleSide }));
    flag.position.set(t.x, y + 2.03, t.z);
    flag.userData.base = flagGeo.attributes.position.array.slice();
    flags.push(flag);
    // yardage board beside the green, facing the tee
    const { texture, aspect } = labelTexture(`${t.yards}`, { bg: '#1d3b2a', fg: '#ffffff', font: 'bold 120px system-ui, sans-serif' });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.4 * aspect, 1.4), new THREE.MeshBasicMaterial({ map: texture }));
    const bx = t.x + (t.x > 0 ? -1 : 1) * (t.r + 6);
    board.position.set(bx, heightAt(bx, t.z) + 2.2, t.z - 2);
    board.lookAt(0, 1.7, 0);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), new THREE.MeshLambertMaterial({ color: 0x3b2a1e }));
    post.position.set(bx, heightAt(bx, t.z) + 1.1, t.z - 2);
    g.add(pole, cup, flag, board, post);
  });
  // yardage posts every 25 yards along both sides of the fairway
  const postGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.9, 8);
  postGeo.translate(0, 0.45, 0);
  const colorFor = (yd) => (yd % 100 === 0 ? 0xd32f2f : yd % 50 === 0 ? 0xffffff : 0xfbc02d);
  for (let yd = 25; yd <= 325; yd += 25) {
    for (const side of [-1, 1]) {
      const z = -yd * YARDS;
      const x = side * (40 + yd * 0.08);
      const p = new THREE.Mesh(postGeo, new THREE.MeshLambertMaterial({ color: colorFor(yd) }));
      p.position.set(x, heightAt(x, z), z);
      g.add(p);
    }
  }
  return { group: g, flags };
}

function buildTeeArea() {
  const g = new THREE.Group();
  // hitting mat
  const mat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.012, 1.5), new THREE.MeshLambertMaterial({ color: 0x2f6b34 }));
  mat.position.set(-0.35, 0.0, 0);
  mat.receiveShadow = true;
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.014, 1.5), new THREE.MeshLambertMaterial({ color: 0x3f8a44 }));
  strip.position.set(0, 0.0, 0);
  strip.receiveShadow = true;
  g.add(mat, strip);
  // neighbouring bays: dividers and mats for a sense of place
  const divMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
  // bays sit side by side along X (everyone hits toward -Z)
  // only behind the player: the space in front of them stays open for the swing
  for (const x of [-2.1, -6.1]) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 1.6), divMat);
    d.position.set(x, 0.275, 0.15);
    d.castShadow = true;
    g.add(d);
  }
  for (const x of [-4.35]) {
    const m2 = mat.clone();
    m2.position.x = x;
    const s2 = strip.clone();
    s2.position.x = x + 0.35;
    g.add(m2, s2);
  }
  // a bucket of balls
  const bucket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.12, 0.26, 16, 1, true),
    new THREE.MeshLambertMaterial({ color: 0x2b5ca8, side: THREE.DoubleSide }),
  );
  bucket.position.set(-1.0, 0.13, 0.9);
  g.add(bucket);
  const ballGeo = new THREE.SphereGeometry(0.0213, 10, 8);
  const ballMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const rand = mulberry32(3);
  for (let i = 0; i < 24; i++) {
    const b = new THREE.Mesh(ballGeo, ballMat);
    const a = rand() * Math.PI * 2;
    const r = rand() * 0.11;
    b.position.set(-1.0 + Math.cos(a) * r, 0.24 + rand() * 0.03, 0.9 + Math.sin(a) * r);
    g.add(b);
  }
  return g;
}

export function buildRange(scene) {
  scene.add(buildTerrain());
  scene.add(buildOuterGround());
  scene.add(buildMountains());
  scene.add(buildTrees());
  const targets = buildTargets();
  scene.add(targets.group);
  scene.add(buildTeeArea());

  // Flags ripple in the wind and point downwind.
  function update(time, wind) {
    const speed = Math.hypot(wind.x, wind.z);
    const yaw = Math.atan2(-wind.z, wind.x);
    for (const f of targets.flags) {
      f.rotation.y = speed > 0.2 ? yaw : 0.6;
      const pos = f.geometry.attributes.position;
      const base = f.userData.base;
      const amp = 0.03 + Math.min(speed, 10) * 0.012;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        pos.setZ(i, Math.sin(x * 9 - time * (3 + speed)) * amp * x * 2);
        pos.setY(i, base[i * 3 + 1] - (speed < 1 ? x * 0.35 : 0));
      }
      pos.needsUpdate = true;
    }
  }
  return { update };
}
