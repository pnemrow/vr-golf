// Procedural canvas textures (no image assets).
import * as THREE from 'three';
import { mulberry32, fbm } from './noise.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Grayscale grass detail, tiling. Values around 0.8-1.0 so it modulates color.
export function grassDetailTexture(size = 256) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const rand = mulberry32(42);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // tileable: sample noise on a torus-like wrap by blending
      const u = x / size;
      const v = y / size;
      const n1 = fbm(u * 8, v * 8, { octaves: 3, seed: 1 });
      const n1w = fbm((u - 1) * 8, v * 8, { octaves: 3, seed: 1 });
      const n1h = fbm(u * 8, (v - 1) * 8, { octaves: 3, seed: 1 });
      const n1wh = fbm((u - 1) * 8, (v - 1) * 8, { octaves: 3, seed: 1 });
      const n = (n1 * (1 - u) + n1w * u) * (1 - v) + (n1h * (1 - u) + n1wh * u) * v;
      const blade = rand() * 0.18;
      const val = Math.max(0, Math.min(255, (0.86 + n * 0.1 - blade + 0.09) * 255));
      const i = (y * size + x) * 4;
      img.data[i] = val;
      img.data[i + 1] = val;
      img.data[i + 2] = val;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  return tex;
}

// Text label texture. Returns { texture, aspect }.
export function labelTexture(text, {
  font = 'bold 120px system-ui, sans-serif',
  fg = '#ffffff',
  bg = 'rgba(0,0,0,0)',
  pad = 24,
  height = 160,
} = {}) {
  const probe = canvas(8, 8).getContext('2d');
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width + pad * 2);
  const c = canvas(w, height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, height);
  ctx.font = font;
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, height / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { texture: tex, aspect: w / height };
}

// Fine dimple pattern for the ball (bump map).
export function dimpleTexture(size = 128) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  const step = size / 12;
  for (let row = 0; row < 13; row++) {
    for (let col = 0; col < 13; col++) {
      const x = col * step + (row % 2 ? step / 2 : 0);
      const y = row * step;
      const g = ctx.createRadialGradient(x, y, 0, x, y, step * 0.45);
      g.addColorStop(0, '#9a9a9a');
      g.addColorStop(1, '#ffffff');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, step * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  return tex;
}
