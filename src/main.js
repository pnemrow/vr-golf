import * as THREE from 'three';
import { createSky } from './world/sky.js';
import { buildRange } from './world/rangeScene.js';
import { rangeWorld } from './world/rangeLayout.js';
import { BallSim, BALL, simulateShot } from './physics/flight.js';
import { computeLaunch } from './physics/impact.js';
import { CLUBS } from './physics/clubs.js';
import { M_TO_YD, MPS_TO_MPH } from './physics/vec.js';
import { Club, SwingDetector } from './game/club.js';
import { BallView } from './game/ballView.js';
import { ShotPanel } from './ui/shotPanel.js';
import { SyntheticSwing } from './game/syntheticSwing.js';
import { unlockAudio, playStrike, playThud } from './game/audio.js';

// ---------------------------------------------------------------------------
// Settings (persisted per device)
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(`vrgolf.${k}`);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`vrgolf.${k}`, JSON.stringify(v));
    } catch {
      /* private mode */
    }
  },
};

const TARGET = new THREE.Vector3(0, 0, -1);
const PHYS_DT = 1 / 240;
const TEE_HEIGHT = { D: 0.028, '3W': 0.012, '4H': 0.004 }; // ball bottom above ground

// ---------------------------------------------------------------------------
// Renderer, scene, camera
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(0.6);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const horizon = new THREE.Color(0xbcd8ee);
scene.fog = new THREE.Fog(horizon, 260, 2600);
scene.background = horizon;

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.02, 6000);
const rig = new THREE.Group(); // the player's tracked space
rig.add(camera);
scene.add(rig);

const sunDir = new THREE.Vector3(-0.45, 0.75, 0.35).normalize();
const sky = createSky({ sunDir });
scene.add(sky.mesh);

scene.add(new THREE.HemisphereLight(0xd6e8ff, 0x52703a, 1.1));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
sun.position.copy(sunDir).multiplyScalar(30);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
const sc = sun.shadow.camera;
sc.left = -3;
sc.right = 3;
sc.top = 3;
sc.bottom = -3;
sc.near = 1;
sc.far = 70;
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

const range = buildRange(scene);

// ---------------------------------------------------------------------------
// Game objects
const club = new Club();
club.pitchDeg = store.get('pitchDeg', 0);
club.rollDeg = store.get('rollDeg', 0);
club.updateOffset();
scene.add(club.root);
const detector = new SwingDetector(club);
const ballView = new BallView(scene);
const panel = new ShotPanel();
scene.add(panel.mesh);

// preview line for swing assist
const previewGeo = new THREE.BufferGeometry();
const previewPos = new Float32Array(600 * 3);
previewGeo.setAttribute('position', new THREE.BufferAttribute(previewPos, 3));
const previewLine = new THREE.Line(
  previewGeo,
  new THREE.LineDashedMaterial({ color: 0x7cf5ff, dashSize: 1.2, gapSize: 0.8, transparent: true, opacity: 0.85 }),
);
previewLine.frustumCulled = false;
previewLine.visible = false;
scene.add(previewLine);
const previewRing = new THREE.Mesh(
  new THREE.RingGeometry(2.2, 3.0, 32).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x7cf5ff, transparent: true, opacity: 0.6, depthWrite: false }),
);
previewRing.visible = false;
scene.add(previewRing);

// aim line on the ground from the ball toward the target
const aimLine = new THREE.Mesh(
  new THREE.PlaneGeometry(0.012, 3).rotateX(-Math.PI / 2).translate(0, 0, -1.6),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }),
);
scene.add(aimLine);

// simple controller stubs so you can see your hands
const stubGeo = new THREE.CapsuleGeometry(0.018, 0.07, 4, 8).rotateX(Math.PI / 2);
const stubMat = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.6 });

const state = {
  clubIndex: Math.min(store.get('clubIndex', 5), CLUBS.length - 1),
  assist: store.get('assist', false),
  windOn: store.get('windOn', false),
  wind: new THREE.Vector3(),
  tee: { x: 0, z: 0 },
  phase: 'ready', // ready | flight | done
  sim: null,
  metrics: null,
  result: null,
  doneAt: 0,
  clubHand: store.get('clubHand', 'right'),
  avgSpeed: store.get('avgSpeed', {}),
  previewAt: 0,
  synthetic: null,
  shotResolvers: [],
};

function currentClub() {
  return CLUBS[state.clubIndex];
}

function randomWind() {
  const speed = 1.5 + Math.random() * 5; // m/s at 10 m
  const dir = Math.random() * Math.PI * 2;
  state.wind.set(Math.cos(dir) * speed, 0, Math.sin(dir) * speed);
}
if (state.windOn) randomWind();

function ballRestPosition() {
  const g = rangeWorld.groundAt(state.tee.x, state.tee.z);
  const tee = TEE_HEIGHT[currentClub().id] ?? 0;
  return { x: state.tee.x, y: g.h + tee + BALL.radius + 0.002, z: state.tee.z, ground: g.h, teeTop: g.h + tee };
}

function placeBall() {
  const p = ballRestPosition();
  state.ball = p;
  ballView.setPosition(p, p.ground, null);
  ballView.showTee((TEE_HEIGHT[currentClub().id] ?? 0) > 0, p.x, p.z, p.ground, p.teeTop + 0.004);
  aimLine.position.set(p.x, p.ground + 0.012, p.z);
  state.phase = 'ready';
  state.sim = null;
  detector.reset();
}

function setClub(i) {
  state.clubIndex = (i + CLUBS.length) % CLUBS.length;
  store.set('clubIndex', state.clubIndex);
  club.setSpec(currentClub());
  if (state.phase === 'ready') placeBall();
  redrawPanel();
}

function windArrow() {
  // relative to the target line, as seen looking at the target
  const a = Math.atan2(state.wind.x, -state.wind.z); // 0 = blowing toward target
  const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  const idx = Math.round(((a / (Math.PI * 2)) * 8 + 8)) % 8;
  return arrows[idx];
}

function shotShape(m) {
  const start = m.launchDir;
  const curve = m.spinAxis;
  const startName = start > 2.5 ? 'Push' : start < -2.5 ? 'Pull' : '';
  let curveName = 'Straight';
  if (curve > 9) curveName = 'Slice';
  else if (curve > 2) curveName = 'Fade';
  else if (curve < -9) curveName = 'Hook';
  else if (curve < -2) curveName = 'Draw';
  if (!startName) return curveName;
  return curveName === 'Straight' ? startName : `${startName} ${curveName.toLowerCase()}`;
}

function redrawPanel() {
  const wind = state.windOn ? state.wind : new THREE.Vector3();
  panel.draw({
    clubName: `${currentClub().name}  ·  ${club.pitchDeg >= 0 ? '+' : ''}${club.pitchDeg.toFixed(0)}° grip`,
    clubIndex: state.clubIndex,
    clubCount: CLUBS.length,
    assist: state.assist,
    windSpeed: wind.length(),
    windMph: wind.length() * MPS_TO_MPH,
    windArrow: windArrow(),
    metrics: state.metrics,
    result: state.result,
    version: state.version,
  });
}

// ---------------------------------------------------------------------------
// Tee up: put the ball in front of the club face and square the face.
function teeUpAtClub(handPos, handQuat) {
  club.squareFace(handQuat, TARGET);
  store.set('rollDeg', club.rollDeg);
  const st = club.headStateFor(handPos, handQuat);
  // ball just in front of the face, centred on it
  const p = st.face.clone().addScaledVector(st.normal, BALL.radius + 0.012);
  state.tee = { x: p.x, z: p.z };
  ballView.clearTrace();
  placeBall();
  redrawPanel();
}

// ---------------------------------------------------------------------------
// Launch
function launch(hit) {
  const spec = currentClub();
  const L = computeLaunch({
    clubVel: hit.clubVel,
    faceNormal: hit.normal,
    club: spec,
    target: TARGET,
    toeOffset: hit.toeOffset,
    faceHeightOffset: hit.faceHeightOffset,
    faceHalfHeight: hit.faceHalfHeight,
    fatFactor: hit.fatFactor,
    forgiveness: state.assist ? 0.5 : 0,
  });
  if (!L) return;
  state.metrics = L.metrics;
  // remember typical speed per club for the assist preview
  const prev = state.avgSpeed[spec.id];
  state.avgSpeed[spec.id] = prev ? prev * 0.7 + L.metrics.clubSpeed * 0.3 : L.metrics.clubSpeed;
  store.set('avgSpeed', state.avgSpeed);

  const start = { x: state.ball.x, y: state.ball.y, z: state.ball.z };
  state.sim = new BallSim(start, L.ballVel, L.spin, { world: rangeWorld, wind: state.windOn ? state.wind : null });
  state.phase = 'flight';
  state.result = { carryYd: 0, totalYd: 0, offlineYd: 0, apexM: 0, done: false, shape: shotShape(L.metrics) };
  state.landed = false;
  ballView.clearTrace();
  ballView.showTee(false);
  ballView.addTrace(start);
  previewLine.visible = false;
  previewRing.visible = false;
  aimLine.visible = false;

  const quality = L.metrics.strike === 'Pure' ? 1 : 0.45;
  playStrike(L.metrics.clubSpeed, quality, spec.kind);
  pulse(state.clubHand, 0.9 * quality + 0.1, 40 + 40 * (1 - quality));
  redrawPanel();
}

function updateFlight(dt) {
  const sim = state.sim;
  state.physAcc = (state.physAcc ?? 0) + dt;
  let steps = 0;
  while (state.physAcc >= PHYS_DT && steps < 40 * (state.timeScale ?? 1)) {
    sim.step(PHYS_DT);
    state.physAcc -= PHYS_DT;
    steps++;
    if (sim.resting) break;
  }
  const p = sim.pos;
  const g = rangeWorld.groundAt(p.x, p.z);
  ballView.setPosition(p, g.h, camera.getWorldPosition(new THREE.Vector3()));
  ballView.setSpin(sim.spin, dt);
  if (!state.landed) ballView.addTrace(p);

  const tee = state.tee;
  const r = state.result;
  r.apexM = sim.apex - state.ball.y;
  if (sim.carryPoint && !state.landed) {
    state.landed = true;
    const c = sim.carryPoint;
    r.carryYd = Math.hypot(c.x - tee.x, c.z - tee.z) * M_TO_YD;
    r.offlineYd = (c.x - tee.x) * M_TO_YD;
    ballView.addLandingMarker(c, rangeWorld.groundAt(c.x, c.z).h);
    playThud(0.2);
    redrawPanel();
  }
  if (!state.landed) {
    r.carryYd = Math.hypot(p.x - tee.x, p.z - tee.z) * M_TO_YD;
    r.offlineYd = (p.x - tee.x) * M_TO_YD;
  }
  if (sim.resting && !r.done) {
    r.done = true;
    r.totalYd = Math.hypot(p.x - tee.x, p.z - tee.z) * M_TO_YD;
    r.offlineYd = (p.x - tee.x) * M_TO_YD;
    r.surface = sim.lastSurface?.name;
    state.phase = 'done';
    state.doneAt = performance.now();
    redrawPanel();
    const res = { metrics: state.metrics, result: { ...r } };
    state.shotResolvers.splice(0).forEach((fn) => fn(res));
  }
}

let lastPanelDraw = 0;

// ---------------------------------------------------------------------------
// Swing assist preview: a stock shot from the current face aim and the
// player's typical speed with this club.
const previewTmp = {};
function updatePreview(handPos, handQuat, now) {
  const show = state.assist && state.phase === 'ready' && handPos;
  if (!show) {
    previewLine.visible = false;
    previewRing.visible = false;
    return;
  }
  if (now - state.previewAt < 250) return;
  state.previewAt = now;
  const st = club.headStateFor(handPos, handQuat, previewTmp);
  const ball = state.ball;
  if (st.face.distanceTo(new THREE.Vector3(ball.x, ball.y, ball.z)) > 0.35) {
    previewLine.visible = false;
    previewRing.visible = false;
    return;
  }
  const spec = currentClub();
  const speed = state.avgSpeed[spec.id] ?? (30 + 14 * (spec.length - 0.89) / 0.25);
  const attack = spec.kind === 'wood' && spec.id === 'D' ? 2 : -3;
  const vel = { x: 0, y: Math.sin((attack * Math.PI) / 180) * speed, z: -Math.cos((attack * Math.PI) / 180) * speed };
  const L = computeLaunch({ clubVel: vel, faceNormal: st.normal, club: spec, target: TARGET, forgiveness: 0.5 });
  if (!L) return;
  const r = simulateShot(ball, L.ballVel, L.spin, {
    world: rangeWorld, wind: state.windOn ? state.wind : null, dt: 1 / 120, sampleEvery: 3, flightOnly: true,
  });
  const n = Math.min(r.path.length, 600);
  for (let i = 0; i < n; i++) previewPos.set([r.path[i].x, r.path[i].y, r.path[i].z], i * 3);
  previewGeo.setDrawRange(0, n);
  previewGeo.attributes.position.needsUpdate = true;
  previewLine.computeLineDistances();
  previewLine.visible = true;
  const c = r.carryPoint;
  previewRing.position.set(c.x, rangeWorld.groundAt(c.x, c.z).h + 0.06, c.z);
  previewRing.visible = true;
}

// ---------------------------------------------------------------------------
// XR input
const grips = [0, 1].map((i) => {
  const grip = renderer.xr.getControllerGrip(i);
  grip.add(new THREE.Mesh(stubGeo, stubMat));
  grip.addEventListener('connected', (e) => {
    grip.userData.source = e.data;
  });
  grip.addEventListener('disconnected', () => {
    grip.userData.source = null;
  });
  rig.add(grip);
  return grip;
});

const prevButtons = new Map();
function edge(source, idx) {
  const gp = source.gamepad;
  if (!gp || !gp.buttons[idx]) return false;
  const key = `${source.handedness}:${idx}`;
  const now = gp.buttons[idx].pressed;
  const was = prevButtons.get(key) ?? false;
  prevButtons.set(key, now);
  return now && !was;
}
const stickLatch = new Map();

function pulse(hand, intensity, ms) {
  for (const g of grips) {
    const s = g.userData.source;
    if (s && s.handedness === hand) s.gamepad?.hapticActuators?.[0]?.pulse?.(intensity, ms);
  }
}

function gripFor(hand) {
  return grips.find((g) => g.userData.source && g.userData.source.handedness === hand);
}

function handleXRInput(dt, handPos, handQuat) {
  for (const g of grips) {
    const s = g.userData.source;
    if (!s || !s.gamepad) continue;
    const hand = s.handedness;
    const gp = s.gamepad;
    if (edge(s, 1)) {
      // squeeze: hold the club in this hand
      state.clubHand = hand;
      store.set('clubHand', hand);
      detector.reset();
    }
    if (edge(s, 4) && handPos) teeUpAtClub(handPos, handQuat); // A / X
    if (edge(s, 5)) {
      // B / Y
      state.assist = !state.assist;
      store.set('assist', state.assist);
      redrawPanel();
    }
    if (edge(s, 3)) {
      state.windOn = !state.windOn;
      if (state.windOn) randomWind();
      store.set('windOn', state.windOn);
      redrawPanel();
    }
    const ax = gp.axes[2] ?? 0;
    const ay = gp.axes[3] ?? 0;
    const latched = stickLatch.get(hand) ?? false;
    if (!latched && Math.abs(ax) > 0.75) {
      stickLatch.set(hand, true);
      setClub(state.clubIndex + (ax > 0 ? 1 : -1));
    } else if (latched && Math.abs(ax) < 0.3) stickLatch.set(hand, false);
    if (hand === state.clubHand && Math.abs(ay) > 0.6 && Math.abs(ax) < 0.4) {
      club.pitchDeg = Math.max(-45, Math.min(45, club.pitchDeg - Math.sign(ay) * 20 * dt));
      club.updateOffset();
      store.set('pitchDeg', club.pitchDeg);
      if (performance.now() - lastPanelDraw > 150) {
        lastPanelDraw = performance.now();
        redrawPanel();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Desktop controls (testing without a headset)
const desktop = {
  yaw: 0,
  pitch: -0.08,
  dragging: false,
  pos: new THREE.Vector3(0.25, 1.55, 3.4),
};
function placeDesktopCamera() {
  camera.position.copy(desktop.pos);
  camera.rotation.set(desktop.pitch, desktop.yaw, 0, 'YXZ');
}
renderer.domElement.addEventListener('pointerdown', (e) => {
  desktop.dragging = true;
  desktop.lx = e.clientX;
  desktop.ly = e.clientY;
});
window.addEventListener('pointerup', () => {
  desktop.dragging = false;
});
window.addEventListener('pointermove', (e) => {
  if (!desktop.dragging) return;
  desktop.yaw -= (e.clientX - desktop.lx) * 0.004;
  desktop.pitch = Math.max(-1.2, Math.min(1.2, desktop.pitch - (e.clientY - desktop.ly) * 0.004));
  desktop.lx = e.clientX;
  desktop.ly = e.clientY;
});

function readSwingInputs() {
  const v = (id, d) => {
    const el = document.getElementById(id);
    return el ? parseFloat(el.value) : d;
  };
  return { mph: v('speed', 85), faceDeg: v('face', 0), pathDeg: v('path', 0), attackDeg: v('attack', -3) };
}

function startSyntheticSwing(params) {
  unlockAudio();
  if (state.phase !== 'ready') placeBall();
  const p = params ?? readSwingInputs();
  state.synthetic = { swing: new SyntheticSwing(club, state.ball, p), t: 0 };
  detector.reset();
  return new Promise((resolve) => state.shotResolvers.push(resolve));
}

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') {
    e.preventDefault();
    startSyntheticSwing();
  } else if (e.code === 'ArrowRight' || e.code === 'KeyE') setClub(state.clubIndex + 1);
  else if (e.code === 'ArrowLeft' || e.code === 'KeyQ') setClub(state.clubIndex - 1);
  else if (e.code === 'KeyA') {
    state.assist = !state.assist;
    store.set('assist', state.assist);
    redrawPanel();
  } else if (e.code === 'KeyW') {
    state.windOn = !state.windOn;
    if (state.windOn) randomWind();
    redrawPanel();
  } else if (e.code === 'KeyR') {
    ballView.clearTrace();
    placeBall();
  }
});

// desktop: club sits at address until a scripted swing runs
const desktopHand = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
function desktopAddressPose() {
  const s = new SyntheticSwing(club, state.ball, readSwingInputs());
  s.poseAt(0, desktopHand.pos, desktopHand.quat);
}

// ---------------------------------------------------------------------------
// XR session handling
function enterXRPose() {
  // player stands at the rig origin facing world +X: side-on, target to the left
  rig.position.set(-0.62, 0, 0);
  rig.rotation.set(0, -Math.PI / 2, 0);
  camera.position.set(0, 0, 0);
  camera.rotation.set(0, 0, 0);
  // reset the ball in front of the player
  state.tee = { x: 0, z: 0 };
  placeBall();
}
function exitXRPose() {
  rig.position.set(0, 0, 0);
  rig.rotation.set(0, 0, 0);
}

renderer.xr.addEventListener('sessionstart', () => {
  document.body.classList.add('in-xr');
  enterXRPose();
});
renderer.xr.addEventListener('sessionend', () => {
  document.body.classList.remove('in-xr');
  exitXRPose();
});

async function enterVR() {
  unlockAudio();
  if (!navigator.xr) return;
  const session = await navigator.xr.requestSession('immersive-vr', {
    optionalFeatures: ['local-floor', 'bounded-floor'],
  });
  await renderer.xr.setSession(session);
}

async function setupButtons() {
  const btn = document.getElementById('enter-vr');
  const note = document.getElementById('vr-note');
  let ok = false;
  try {
    ok = !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr'));
  } catch {
    ok = false;
  }
  if (ok) {
    btn.disabled = false;
    btn.textContent = 'Enter VR';
    btn.addEventListener('click', () => enterVR().catch((err) => {
      note.textContent = `Could not start VR: ${err.message}`;
    }));
  } else {
    btn.textContent = 'VR not available';
    note.textContent = window.isSecureContext
      ? 'Open this page in the Meta Quest browser to play in VR. On desktop you can test swings with the controls below.'
      : 'WebXR needs HTTPS. Open the GitHub Pages URL on your Quest.';
  }
  document.getElementById('swing')?.addEventListener('click', () => startSyntheticSwing());
}

// ---------------------------------------------------------------------------
// Main loop
const clock = new THREE.Clock();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const rigQuat = new THREE.Quaternion();

function loop(time) {
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();
  const inXR = renderer.xr.isPresenting;
  rig.updateMatrixWorld(true);

  let handPos = null;
  let handQuat = null;
  let xrVel = null;

  if (inXR) {
    const g = gripFor(state.clubHand) ?? gripFor(state.clubHand === 'right' ? 'left' : 'right');
    if (g && g.visible) {
      g.updateMatrixWorld(true);
      g.matrixWorld.decompose(tmpPos, tmpQuat, tmpScale);
      handPos = tmpPos;
      handQuat = tmpQuat;
      rig.getWorldQuaternion(rigQuat);
      if (g.hasLinearVelocity && g.hasAngularVelocity) {
        xrVel = {
          linear: g.linearVelocity.clone().applyQuaternion(rigQuat),
          angular: g.angularVelocity.clone().applyQuaternion(rigQuat),
        };
      }
    }
    handleXRInput(dt, handPos, handQuat);
    // panel stands in front of the player, beyond the ball, angled toward them
    panel.mesh.position.set(1.25, 1.4, 1.0);
    panel.mesh.lookAt(-0.62, 1.5, 0);
  } else {
    if (state.playerView) {
      // preview what the player sees in the headset (used for checks)
      camera.position.set(0, 1.62, 0);
      camera.rotation.set(-0.55, 0.25, 0, 'YXZ');
      panel.mesh.position.set(1.25, 1.4, 1.0);
      panel.mesh.lookAt(-0.62, 1.5, 0);
    } else {
      placeDesktopCamera();
      panel.mesh.position.set(-2.2, 1.6, -2.0);
      panel.mesh.lookAt(desktop.pos);
    }
    if (state.synthetic) {
      // run the scripted swing at a fixed 90 Hz "tracking rate"
      const s = state.synthetic;
      const step = 1 / 90;
      s.acc = (s.acc ?? 0) + dt;
      while (s.acc >= step && state.synthetic) {
        s.acc -= step;
        s.t += step;
        s.swing.poseAt(s.t, desktopHand.pos, desktopHand.quat);
        if (state.phase === 'ready') {
          const g = state.ball.ground;
          const hit = detector.update(desktopHand.pos, desktopHand.quat, step, new THREE.Vector3(state.ball.x, state.ball.y, state.ball.z), g);
          if (hit) launch(hit);
        }
        if (s.t > s.swing.duration) state.synthetic = null;
      }
    } else if (state.phase === 'ready') {
      desktopAddressPose();
    }
    handPos = desktopHand.pos;
    handQuat = desktopHand.quat;
  }

  if (handPos) {
    club.root.visible = true;
    club.setPose(handPos, handQuat);
    if (inXR && state.phase === 'ready') {
      const b = state.ball;
      const hit = detector.update(handPos, handQuat, dt, new THREE.Vector3(b.x, b.y, b.z), b.ground, xrVel);
      if (hit) launch(hit);
    } else if (inXR) {
      detector.update(handPos, handQuat, dt, null, 0);
    }
  } else {
    club.root.visible = false;
  }

  if (state.phase === 'flight') updateFlight(dt * (state.timeScale ?? 1));
  if (state.phase === 'done' && now - state.doneAt > 2500) {
    placeBall();
    aimLine.visible = true;
  }
  if (state.phase === 'ready') {
    const b = state.ball;
    ballView.setPosition(b, b.ground, null);
  }
  updatePreview(handPos, handQuat, now);

  sky.uniforms.time.value = time / 1000;
  range.update(time / 1000, state.windOn ? state.wind : new THREE.Vector3());
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
setClub(state.clubIndex);
placeBall();
redrawPanel();
setupButtons();
renderer.setAnimationLoop(loop);
// build stamp written by the deploy workflow, so you can tell which build is running
fetch('./version.txt', { cache: 'no-store' })
  .then((r) => (r.ok ? r.text() : ''))
  .then((v) => {
    state.version = v.trim().split(' ')[0];
    const el = document.getElementById('version');
    if (el && state.version) el.textContent = `build ${state.version}`;
    redrawPanel();
  })
  .catch(() => {});

// test hook (used by automated browser checks)
window.__golf = {
  swing: (p) => startSyntheticSwing({ mph: 85, faceDeg: 0, pathDeg: 0, attackDeg: -3, ...p }),
  setClub: (id) => setClub(CLUBS.findIndex((c) => c.id === id)),
  state,
  playerView(on = true) {
    state.playerView = on;
    if (on) {
      rig.position.set(-0.62, 0, 0);
      rig.rotation.set(0, -Math.PI / 2, 0);
    } else exitXRPose();
  },
};
