// Spray and mist particles: board spray, lip spray, offshore spray off the
// crest and barrel spit. One pooled Points object with a soft sprite shader.

import * as THREE from 'three';

const MAX = 5000;

export function createSpray() {
  const pos = new Float32Array(MAX * 3);
  const vel = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);      // remaining
  const maxLife = new Float32Array(MAX);
  const size = new Float32Array(MAX);
  const alpha = new Float32Array(MAX);
  const drag = new Float32Array(MAX);
  const base = new Float32Array(MAX);
  let cursor = 0;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));

  const uniforms = {
    uColor: { value: new THREE.Color(1, 1, 1) },
    uScale: { value: 600 },
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0.0004 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */`
      uniform float uScale;
      attribute float aSize;
      attribute float aAlpha;
      varying float vAlpha;
      varying float vDist;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDist = -mv.z;
        gl_PointSize = aSize * uScale / max(-mv.z, 0.1);
        gl_PointSize = min(gl_PointSize, 160.0);
        vAlpha = aAlpha;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying float vAlpha;
      varying float vDist;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = dot(d, d) * 4.0;
        if (r > 1.0) discard;
        float a = (1.0 - r) * (1.0 - r) * vAlpha * smoothstep(1.5, 9.0, vDist);
        vec3 c = mix(uColor, uFogColor, clamp(1.0 - exp(-(vDist * uFogDensity) * (vDist * uFogDensity)), 0.0, 1.0));
        gl_FragColor = vec4(c, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  for (let i = 0; i < MAX; i++) pos[i * 3 + 1] = -1000;

  function emit(x, y, z, vx, vy, vz, sz, lifeT, a = 0.8, dr = 0.6) {
    const i = cursor;
    cursor = (cursor + 1) % MAX;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    life[i] = maxLife[i] = lifeT;
    size[i] = sz;
    alpha[i] = 0;
    base[i] = a;
    drag[i] = dr;
  }

  function update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { pos[i * 3 + 1] = -1000; alpha[i] = 0; continue; }
      const k = 1 - drag[i] * dt;
      vel[i * 3] *= k; vel[i * 3 + 2] *= k;
      vel[i * 3 + 1] = vel[i * 3 + 1] * k - 9.0 * dt * (1 - drag[i] * 0.8);
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const t = life[i] / maxLife[i];
      alpha[i] = Math.min(1, t * 2.5) * Math.min(1, (1 - t) * 8) * base[i];
      size[i] *= 1 + dt * 0.9;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
  }

  function clear() { life.fill(0); for (let i = 0; i < MAX; i++) pos[i * 3 + 1] = -1000; }

  return { points, uniforms, emit, update, clear };
}
