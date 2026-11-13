// Procedural sky dome: horizon-to-zenith gradient, sun disc with glow, and
// soft drifting clouds. Cheap enough for Quest (3 noise octaves per pixel).
import * as THREE from 'three';

export function createSky({ sunDir, radius = 4000 } = {}) {
  const uniforms = {
    sunDir: { value: sunDir.clone().normalize() },
    zenith: { value: new THREE.Color(0x2f6fc2) },
    horizon: { value: new THREE.Color(0xbcd8ee) },
    ground: { value: new THREE.Color(0x8fa98a) },
    time: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // at the far plane
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir; uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground;
      uniform float time;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.55));
        col = mix(col, ground, smoothstep(0.0, -0.08, h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += vec3(1.0, 0.9, 0.7) * pow(s, 8.0) * 0.25;
        col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9997, s) * 2.0;
        // clouds on a plane projected from the dome
        if (h > 0.02) {
          vec2 uv = d.xz / (h + 0.12) * 1.6 + vec2(time * 0.004, time * 0.0015);
          float n = noise(uv) * 0.55 + noise(uv * 2.3) * 0.3 + noise(uv * 5.1) * 0.15;
          float c = smoothstep(0.52, 0.8, n) * smoothstep(0.02, 0.25, h);
          vec3 cloudCol = mix(vec3(1.0), vec3(0.82, 0.86, 0.92), smoothstep(0.65, 0.95, n));
          col = mix(col, cloudCol, c * 0.85);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return { mesh, uniforms };
}
