// In-world launch monitor screen, drawn to a canvas texture.
import * as THREE from 'three';
import { M_TO_YD, MPS_TO_MPH } from '../physics/vec.js';

const W = 1024;
const H = 720;

export class ShotPanel {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, (1.1 * H) / W), mat);
    // frame
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(1.14, (1.14 * H) / W, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.6 }),
    );
    frame.position.z = -0.012;
    this.mesh.add(frame);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.2, 8), frame.material);
    leg.position.set(0, -0.85, -0.03);
    this.mesh.add(leg);
  }

  draw(s) {
    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(14, 20, 28, 0.92)';
    roundRect(c, 0, 0, W, H, 28);
    c.fill();

    // header: club + modes
    c.fillStyle = '#ffffff';
    c.font = 'bold 54px system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText(s.clubName, 36, 70);
    c.font = '30px system-ui, sans-serif';
    c.fillStyle = '#9fb3c8';
    c.fillText(`◀ ▶ change club   ·   ${s.clubIndex + 1}/${s.clubCount}`, 36, 112);
    c.textAlign = 'right';
    pill(c, W - 36, 44, s.assist ? 'ASSIST ON' : 'ASSIST OFF', s.assist ? '#2e7d32' : '#37474f');
    const windTxt = s.windSpeed > 0.2 ? `WIND ${s.windMph.toFixed(0)} mph ${s.windArrow}` : 'NO WIND';
    pill(c, W - 36, 96, windTxt, '#1565c0');

    const m = s.metrics;
    const r = s.result;
    // big numbers
    const big = [
      ['CARRY', r ? `${r.carryYd.toFixed(1)}` : '—', 'yd'],
      ['TOTAL', r && r.done ? `${r.totalYd.toFixed(1)}` : '—', 'yd'],
      ['OFFLINE', r ? offline(r.offlineYd) : '—', ''],
    ];
    big.forEach(([label, val, unit], i) => {
      const x = 36 + i * 330;
      c.textAlign = 'left';
      c.fillStyle = '#ffd54f';
      c.font = 'bold 26px system-ui, sans-serif';
      c.fillText(label, x, 180);
      c.fillStyle = '#ffffff';
      c.font = 'bold 76px system-ui, sans-serif';
      c.fillText(val, x, 252);
      if (unit && val !== '—') {
        const w = c.measureText(val).width;
        c.font = '30px system-ui, sans-serif';
        c.fillStyle = '#9fb3c8';
        c.fillText(unit, x + w + 8, 252);
      }
    });

    // detail grid
    const rows = m
      ? [
        ['Club speed', `${(m.clubSpeed * MPS_TO_MPH).toFixed(1)} mph`],
        ['Ball speed', `${(m.ballSpeed * MPS_TO_MPH).toFixed(1)} mph`],
        ['Smash', m.smash.toFixed(2)],
        ['Launch', `${m.launchAngle.toFixed(1)}°`],
        ['Spin', `${Math.round(m.spinRate)} rpm`],
        ['Spin axis', lr(m.spinAxis)],
        ['Face', lr(m.faceAngle, 'open', 'closed')],
        ['Path', lr(m.clubPath, 'in-out', 'out-in')],
        ['Face to path', lr(m.faceToPath, 'open', 'closed')],
        ['Attack', `${m.attackAngle.toFixed(1)}°`],
        ['Apex', r ? `${(r.apexM * M_TO_YD).toFixed(0)} yd` : '—'],
        ['Strike', m.strike],
      ]
      : [];
    c.font = '30px system-ui, sans-serif';
    rows.forEach(([k, v], i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 36 + col * 330;
      const y = 330 + row * 66;
      c.textAlign = 'left';
      c.fillStyle = '#9fb3c8';
      c.font = '26px system-ui, sans-serif';
      c.fillText(k, x, y);
      c.fillStyle = '#ffffff';
      c.font = 'bold 34px system-ui, sans-serif';
      c.fillText(v, x, y + 34);
    });
    if (!m) {
      c.textAlign = 'left';
      c.fillStyle = '#cfd8dc';
      c.font = '32px system-ui, sans-serif';
      const lines = [
        'Stand side-on, target to your left.',
        'Rest the club behind the ball, press A (or X)',
        'to tee up there and square the face.',
        'Then swing!',
      ];
      lines.forEach((l, i) => c.fillText(l, 36, 340 + i * 46));
    }

    // shot shape label
    if (r && r.shape) {
      c.textAlign = 'left';
      c.fillStyle = '#80cbc4';
      c.font = 'bold 30px system-ui, sans-serif';
      c.fillText(r.shape, 36, 625);
    }
    // footer hints
    c.textAlign = 'left';
    c.fillStyle = '#78909c';
    c.font = '22px system-ui, sans-serif';
    c.fillText('A/X tee up + square face · B/Y swing assist · stick ▲▼ club angle · stick click wind · grip: switch hands', 36, 690);
    if (s.version) {
      c.textAlign = 'right';
      c.fillStyle = '#546e7a';
      c.font = '20px system-ui, sans-serif';
      c.fillText(s.version, W - 24, H - 6);
    }
    this.texture.needsUpdate = true;
  }
}

function offline(yd) {
  if (Math.abs(yd) < 0.5) return '0';
  return `${Math.abs(yd).toFixed(1)}${yd > 0 ? 'R' : 'L'}`;
}

function lr(deg, pos = 'R', neg = 'L') {
  if (Math.abs(deg) < 0.25) return '0.0°';
  return `${Math.abs(deg).toFixed(1)}° ${deg > 0 ? pos : neg}`;
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function pill(c, right, y, text, color) {
  c.font = 'bold 26px system-ui, sans-serif';
  const w = c.measureText(text).width + 32;
  c.fillStyle = color;
  roundRect(c, right - w, y - 2, w, 42, 21);
  c.fill();
  c.fillStyle = '#ffffff';
  c.textAlign = 'center';
  c.fillText(text, right - w / 2, y + 29);
  c.textAlign = 'left';
}
