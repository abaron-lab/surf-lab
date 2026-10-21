// Water rendering: the breaking wave mesh (displaced on the GPU from the wave
// table) and the flat ocean around it. Both share one fragment shader with
// sky reflection, sun glitter, subsurface glow in thin lips and foam.

import * as THREE from 'three';
import { COLS, ROWS, S_MIN, DS, COL } from './wave.js';

const HALF_X = 240;
const NX = 280;

const common = /* glsl */`
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyZenith;
  uniform vec3 uSkyHorizon;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uWaveH;

  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float a = 0.5, s = 0.0;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = m * p; a *= 0.5; }
    return s;
  }
`;

const fragment = /* glsl */`
  ${common}
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vTx;
  varying vec3 vTu;
  varying vec2 vUv;
  varying float vFoam;
  varying float vTrans;
  varying float vHeight;
  varying float vAO;

  vec3 sky(vec3 r) {
    float h = max(r.y, 0.0);
    vec3 c = mix(uSkyHorizon, uSkyZenith, pow(h, 0.45));
    // ocean seen in reflection below the horizon
    c = mix(c, uDeep * 0.6, smoothstep(0.0, -0.25, r.y));
    return c;
  }

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vN);
    if (dot(N, V) < 0.0) N = -N;
    float dist = length(cameraPosition - vWorld);

    // detail ripples in the surface frame; water flows up the face
    vec2 p = vUv * vec2(0.55, 0.55) + vec2(0.0, uTime * 0.35);
    vec2 q = vUv * vec2(1.9, 1.7) + vec2(uTime * 0.2, uTime * 0.6);
    float e = 0.08;
    float h0 = fbm(p) + 0.45 * fbm(q);
    float hx = fbm(p + vec2(e, 0.0)) + 0.45 * fbm(q + vec2(e, 0.0));
    float hu = fbm(p + vec2(0.0, e)) + 0.45 * fbm(q + vec2(0.0, e));
    float fade = 1.0 / (1.0 + dist * 0.012);
    float bump = 0.55 * fade;
    N = normalize(N - (normalize(vTx) * (hx - h0) + normalize(vTu) * (hu - h0)) / e * bump * 0.25);

    vec3 L = normalize(uSunDir);
    vec3 R = reflect(-V, N);
    float NdV = max(dot(N, V), 0.0);
    float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);

    // water body colour: deep at the base, glowing turquoise up the face
    float hf = clamp(vHeight / max(uWaveH, 0.5), 0.0, 1.2);
    vec3 body = mix(uDeep, uShallow, clamp(hf * hf * 0.6 + vTrans * 0.45, 0.0, 1.0));
    float diff = max(dot(N, L), 0.0) * 0.4 + 0.6;
    body *= diff * (uSkyHorizon * 0.32 + uSunColor * 0.12);
    // light shining through thin water towards the viewer
    float back = pow(clamp(dot(V, -L) * 0.5 + 0.5, 0.0, 1.0), 3.0);
    vec3 sss = uShallow * uSunColor * vTrans * (0.06 + 0.7 * back) * (0.4 + 0.6 * hf);
    body += sss;

    body *= 1.0 - 0.45 * vAO;
    vec3 refl = sky(R) * (1.0 - 0.55 * vAO);
    float spec = pow(max(dot(R, L), 0.0), 900.0) * 22.0 + pow(max(dot(R, L), 0.0), 90.0) * 0.6;
    vec3 col = mix(body, refl, F) + uSunColor * spec * (0.3 + 0.7 * F);

    // foam with broken-up edges
    float fn = fbm(vUv * 0.9 + vec2(0.0, uTime * 0.8)) * 0.6 + fbm(vUv * 3.1 - vec2(uTime * 0.3, 0.0)) * 0.4;
    float foam = smoothstep(0.35, 0.75, vFoam + (fn - 0.5) * 0.7);
    foam = max(foam, smoothstep(0.82, 1.0, vFoam) * 0.9);
    float foamLight = max(dot(normalize(vN), L), 0.0) * 0.5 + 0.55;
    vec3 foamCol = (uSunColor * 0.55 + uSkyHorizon * 0.65) * foamLight * (0.85 + 0.25 * fn);
    col = mix(col, foamCol * (1.0 - 0.4 * vAO), foam);

    float fog = 1.0 - exp(-(dist * uFogDensity) * (dist * uFogDensity));
    col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const waveVertex = /* glsl */`
  ${common}
  uniform sampler2D uProfile;
  uniform float uCenterX;
  uniform float uPeelX;
  uniform float uHScale;
  attribute vec2 aGrid;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vTx;
  varying vec3 vTu;
  varying vec2 vUv;
  varying float vFoam;
  varying float vTrans;
  varying float vHeight;
  varying float vAO;

  vec4 prof(float col, float s) {
    float r = clamp((s - ${S_MIN.toFixed(1)}) / ${DS.toFixed(2)}, 0.0, ${(ROWS - 1.001).toFixed(3)});
    float r0 = floor(r);
    int c = int(clamp(col, 0.0, ${(COLS - 1).toFixed(1)}));
    vec4 a = texelFetch(uProfile, ivec2(c, int(r0)), 0);
    vec4 b = texelFetch(uProfile, ivec2(c, int(r0) + 1), 0);
    vec4 v = mix(a, b, r - r0);
    v.y *= uHScale;
    return v;
  }

  void main() {
    float x = uCenterX + aGrid.x;
    float col = aGrid.y;
    float s = x - uPeelX;
    vec4 p = prof(col, s);
    vec4 pa = prof(col - 1.0, s), pb = prof(col + 1.0, s);
    vec4 px0 = prof(col, s - 0.5), px1 = prof(col, s + 0.5);
    vec3 T = vec3(0.0, pb.y - pa.y, pb.x - pa.x);
    vec3 X = vec3(1.0, px1.y - px0.y, px1.x - px0.x);
    vec3 n = cross(T, X);
    if (length(n) < 1e-5) n = vec3(0.0, 1.0, 0.0);

    vec3 pos = vec3(x, p.y, p.x);
    // gentle ambient chop
    float chop = sin(x * 0.21 + uTime * 1.3 + p.x * 0.17) * 0.06 + sin(x * 0.07 - p.x * 0.31 + uTime * 0.8) * 0.08;
    pos += normalize(n) * chop * (1.0 - p.w * 0.8);

    vec4 w = modelMatrix * vec4(pos, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * n);
    vTx = mat3(modelMatrix) * X;
    vTu = mat3(modelMatrix) * (-T);
    vUv = vec2(x, p.y - p.x);
    vFoam = p.z;
    vTrans = p.w;
    vHeight = p.y;
    // inside of a barrel: ceiling, inner lip and the wall under it get less sky light
    float inside = smoothstep(${COL.tip - 4}.0, ${COL.tip + 6}.0, col) * (1.0 - smoothstep(${COL.mid}.0, ${COL.trough - 4}.0, col));
    vAO = inside * clamp((p.w - 0.45) / 0.5, 0.0, 1.0);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const flatVertex = /* glsl */`
  ${common}
  uniform float uCenterX;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vTx;
  varying vec3 vTu;
  varying vec2 vUv;
  varying float vFoam;
  varying float vTrans;
  varying float vHeight;
  varying float vAO;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vAO = 0.0;
    vWorld = w.xyz;
    vN = vec3(0.0, 1.0, 0.0);
    vTx = vec3(1.0, 0.0, 0.0);
    vTu = vec3(0.0, 0.0, -1.0);
    vUv = vec2(position.x + uCenterX, -position.z);
    vFoam = 0.0;
    vTrans = 0.0;
    vHeight = 0.0;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

export function createWater(field) {
  const uniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uSkyZenith: { value: new THREE.Color(0.2, 0.4, 0.8) },
    uSkyHorizon: { value: new THREE.Color(0.7, 0.8, 0.9) },
    uDeep: { value: new THREE.Color() },
    uShallow: { value: new THREE.Color() },
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0.0004 },
    uWaveH: { value: field.H0 },
    uProfile: { value: field.texture },
    uCenterX: { value: 0 },
    uPeelX: { value: 0 },
    uHScale: { value: 1 },
  };

  // Wave mesh: x offsets dense near the centre, one vertex column per profile sample.
  const count = (NX + 1) * COLS;
  const grid = new Float32Array(count * 2);
  const pos = new Float32Array(count * 3);
  let i = 0;
  for (let ix = 0; ix <= NX; ix++) {
    const t = ix / NX * 2 - 1;
    const x = HALF_X * (0.32 * t + 0.68 * t * t * t);
    for (let c = 0; c < COLS; c++) { grid[i * 2] = x; grid[i * 2 + 1] = c; i++; }
  }
  const index = [];
  for (let ix = 0; ix < NX; ix++) {
    for (let c = 0; c < COLS - 1; c++) {
      const a = ix * COLS + c, b = a + COLS;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aGrid', new THREE.BufferAttribute(grid, 2));
  geo.setIndex(index);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const waveMat = new THREE.ShaderMaterial({
    uniforms, vertexShader: waveVertex, fragmentShader: fragment, side: THREE.DoubleSide,
  });
  const wave = new THREE.Mesh(geo, waveMat);
  wave.frustumCulled = false;

  // Flat ocean: a huge plane with a hole where the wave mesh sits.
  const shape = new THREE.Shape();
  const R = 9000;
  shape.moveTo(-R, -R); shape.lineTo(R, -R); shape.lineTo(R, R); shape.lineTo(-R, R); shape.lineTo(-R, -R);
  const hole = new THREE.Path();
  const hx = HALF_X - 0.5, z0 = -69.5, z1 = 94.5;
  hole.moveTo(-hx, z0); hole.lineTo(-hx, z1); hole.lineTo(hx, z1); hole.lineTo(hx, z0); hole.lineTo(-hx, z0);
  shape.holes.push(hole);
  const fgeo = new THREE.ShapeGeometry(shape);
  // ShapeGeometry is in the xy plane; map shape y -> world z
  const fp = fgeo.attributes.position;
  for (let k = 0; k < fp.count; k++) { const yv = fp.getY(k); fp.setXYZ(k, fp.getX(k), -0.01, yv); }
  fgeo.computeBoundingSphere();
  const flatMat = new THREE.ShaderMaterial({
    uniforms, vertexShader: flatVertex, fragmentShader: fragment, side: THREE.DoubleSide,
  });
  const flat = new THREE.Mesh(fgeo, flatMat);
  flat.frustumCulled = false;

  const group = new THREE.Group();
  group.add(wave, flat);

  return {
    group, uniforms,
    update(time, centerX, peelX, hScale) {
      uniforms.uTime.value = time;
      uniforms.uCenterX.value = centerX;
      uniforms.uPeelX.value = peelX;
      uniforms.uHScale.value = hScale;
      flat.position.x = centerX;
    },
    setField(f) { uniforms.uProfile.value = f.texture; uniforms.uWaveH.value = f.H0; },
    dispose() { geo.dispose(); fgeo.dispose(); waveMat.dispose(); flatMat.dispose(); },
  };
}
