// Shared building blocks for spot scenery: terrain, palms, houses, rocks,
// crowds, towers, boats, clouds. All coordinates are wave-local metres:
// x along the wave, z towards the shore, y up.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// value noise
const PERM = new Uint8Array(512);
{
  const r = rng(1337);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}
const fade = (t) => t * t * (3 - 2 * t);
function hash2(x, y) { return PERM[(PERM[x & 255] + y) & 255] / 255; }
export function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = fade(xf), v = fade(yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}
export function ridged(x, y, oct = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(noise(x * f, y * f) * 2 - 1); s += a * n * n; f *= 2.1; a *= 0.5; }
  return s;
}
export const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts }));
  return matCache.get(key);
}

// Heightfield terrain with per-vertex colours.
export function terrain({ x0, x1, z0, z1, nx = 160, nz = 80, height, color, flat = true }) {
  const g = new THREE.PlaneGeometry(1, 1, nx, nz);
  const p = g.attributes.position;
  const cols = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5, v = 0.5 - p.getY(i);
    const x = x0 + (x1 - x0) * u;
    const z = z0 + (z1 - z0) * v;
    p.setXYZ(i, x, height(x, z), z);
  }
  g.computeVertexNormals();
  const n = g.attributes.normal;
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    color(p.getX(i), p.getY(i), p.getZ(i), n.getY(i), c);
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: flat }));
  m.receiveShadow = true;
  return m;
}

export function col(hex) { return new THREE.Color(hex); }
export function mix(out, a, b, t) { return out.copy(a).lerp(b, Math.min(1, Math.max(0, t))); }

// Generic instanced placement. items: [{x,y,z, sx,sy,sz, ry, rx, rz, color}]
export function instanced(geo, material, items) {
  const m = new THREE.InstancedMesh(geo, material, items.length);
  const o = new THREE.Object3D();
  items.forEach((it, i) => {
    o.position.set(it.x, it.y ?? 0, it.z);
    o.rotation.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0);
    o.scale.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
    if (it.color) m.setColorAt(i, it.color instanceof THREE.Color ? it.color : new THREE.Color(it.color));
  });
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.castShadow = true;
  return m;
}

// ---------- props ----------

let palmGeo = null;
function palmGeometries() {
  if (palmGeo) return palmGeo;
  // slightly curved trunk
  const pts = [];
  for (let i = 0; i <= 8; i++) pts.push(new THREE.Vector3(Math.sin(i / 8 * 1.2) * 0.9, i / 8 * 10, 0));
  const trunk = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.22, 6, false);
  const fronds = [];
  for (let k = 0; k < 9; k++) {
    const leaf = new THREE.PlaneGeometry(4.2, 0.9, 6, 1);
    const lp = leaf.attributes.position;
    for (let i = 0; i < lp.count; i++) {
      const x = lp.getX(i) + 2.1;
      lp.setXYZ(i, x, -0.09 * x * x + 0.25 * x, lp.getY(i) * (1 - x / 4.6));
    }
    leaf.rotateY(k / 9 * Math.PI * 2 + (k % 2) * 0.2);
    leaf.rotateZ(0);
    leaf.translate(Math.sin(1.2) * 0.9, 10, 0);
    fronds.push(leaf);
  }
  const crown = mergeGeometries(fronds);
  crown.computeVertexNormals();
  palmGeo = { trunk, crown };
  return palmGeo;
}

export function palms(list, seed = 3) {
  const r = rng(seed);
  const { trunk, crown } = palmGeometries();
  const items = list.map((p) => ({ x: p.x, y: p.y ?? 0, z: p.z, s: p.s ?? (0.8 + r() * 0.5), ry: r() * Math.PI * 2 }));
  const g = new THREE.Group();
  g.add(instanced(trunk, mat('#7a6650'), items));
  const leafMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, side: THREE.DoubleSide });
  g.add(instanced(crown, leafMat, items.map((it) => ({ ...it, color: new THREE.Color().setHSL(0.24 + r() * 0.06, 0.45, 0.22 + r() * 0.08) }))));
  return g;
}

export function trees(list, seed = 5, kind = 'round') {
  const r = rng(seed);
  const g = new THREE.Group();
  const trunk = new THREE.CylinderGeometry(0.2, 0.3, 3, 6).translate(0, 1.5, 0);
  const crownGeo = kind === 'pine'
    ? mergeGeometries([0, 1, 2, 3].map((i) => new THREE.ConeGeometry(2.6 - i * 0.5, 2.2, 7).translate(0, 4 + i * 2.3, 0)))
    : new THREE.IcosahedronGeometry(2.4, 1).translate(0, 4.3, 0);
  const items = list.map((p) => ({ x: p.x, y: p.y ?? 0, z: p.z, s: p.s ?? (0.7 + r() * 0.7), ry: r() * 6 }));
  g.add(instanced(trunk, mat('#5b4634'), items));
  const cm = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
  g.add(instanced(crownGeo, cm, items.map((it) => ({ ...it, color: new THREE.Color(kind === 'pine' ? '#2e4b2c' : '#3d5a2c').offsetHSL(r() * 0.04 - 0.02, 0, r() * 0.08 - 0.04) }))));
  return g;
}

export function houses(list, seed = 9, palette = ['#f4efe6', '#e9e1d2', '#d9cdb8']) {
  const r = rng(seed);
  const body = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const roof = new THREE.ConeGeometry(0.75, 0.5, 4, 1).rotateY(Math.PI / 4).translate(0, 0.25, 0);
  const bi = [], ri = [];
  const roofCols = ['#9c4a33', '#6d6f73', '#8a3f2e', '#3f5566', '#b5653f'];
  for (const h of list) {
    const w = h.w ?? 7 + r() * 6, d = h.d ?? 6 + r() * 5, ht = h.h ?? 3 + r() * 3.5;
    const ry = h.ry ?? (r() - 0.5) * 0.4;
    bi.push({ x: h.x, y: h.y ?? 0, z: h.z, sx: w, sy: ht, sz: d, ry, color: h.color ?? palette[Math.floor(r() * palette.length)] });
    ri.push({ x: h.x, y: (h.y ?? 0) + ht, z: h.z, sx: w * 1.0, sy: 2.4 + r(), sz: d * 1.0, ry, color: h.roof ?? roofCols[Math.floor(r() * roofCols.length)] });
  }
  const g = new THREE.Group();
  g.add(instanced(body, new THREE.MeshStandardMaterial({ roughness: 0.8 }), bi));
  g.add(instanced(roof, new THREE.MeshStandardMaterial({ roughness: 0.7, flatShading: true }), ri));
  return g;
}

export function rocks(list, color = '#3b3632', seed = 11) {
  const r = rng(seed);
  const geo = new THREE.DodecahedronGeometry(1, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 0.75 + noise(p.getX(i) * 3 + 10, p.getZ(i) * 3 + p.getY(i) * 2) * 0.5;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const base = new THREE.Color(color);
  const items = list.map((q) => ({
    x: q.x, y: q.y ?? 0, z: q.z, sx: q.s * (0.8 + r() * 0.5), sy: q.s * (0.6 + r() * 0.6), sz: q.s * (0.8 + r() * 0.5),
    ry: r() * 6, rx: (r() - 0.5) * 0.5, color: base.clone().offsetHSL(0, 0, (r() - 0.5) * 0.08),
  }));
  return instanced(geo, new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), items);
}

// Beach crowd: people + umbrellas.
export function crowd({ x0, x1, z0, z1, y = 0, count = 300, seed = 21, flags = null, umbrellas = 0.12 }) {
  const r = rng(seed);
  const g = new THREE.Group();
  const person = new THREE.CapsuleGeometry(0.22, 1.0, 2, 6).translate(0, 0.72, 0);
  const shirts = ['#e94f37', '#f6f7eb', '#393e41', '#3f88c5', '#f2c14e', '#44bba4', '#1b998b', '#ffffff', '#e4572e'];
  const ppl = [], umb = [], poles = [], fl = [];
  const yAt = typeof y === 'function' ? y : () => y;
  for (let i = 0; i < count; i++) {
    const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
    ppl.push({ x, y: yAt(x, z), z, s: 0.9 + r() * 0.25, color: shirts[Math.floor(r() * shirts.length)] });
    if (r() < umbrellas) umb.push({ x: x + 1, y: yAt(x, z) + 2.1, z, s: 1, color: ['#e94f37', '#f2c14e', '#3f88c5', '#ffffff', '#44bba4'][Math.floor(r() * 5)] });
    if (flags && r() < 0.06) fl.push({ x, y: yAt(x, z) + 2.4, z, ry: r() * 0.6 });
  }
  g.add(instanced(person, new THREE.MeshStandardMaterial({ roughness: 0.8 }), ppl));
  if (umb.length) {
    g.add(instanced(new THREE.ConeGeometry(1.4, 0.6, 10), new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide }), umb));
    g.add(instanced(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 4).translate(0, -1.1, 0), mat('#dddddd'), umb.map((u) => ({ ...u, color: undefined }))));
  }
  if (fl.length && flags) g.add(flagMesh(fl, flags));
  return g;
}

function flagMesh(list, colors) {
  const c = document.createElement('canvas');
  c.width = 96; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = colors[0]; x.fillRect(0, 0, 96, 64);
  x.fillStyle = colors[1];
  x.beginPath(); x.moveTo(48, 6); x.lineTo(90, 32); x.lineTo(48, 58); x.lineTo(6, 32); x.closePath(); x.fill();
  x.fillStyle = colors[2]; x.beginPath(); x.arc(48, 32, 14, 0, Math.PI * 2); x.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(1.5, 1, 4, 1).translate(0.75, 0, 0);
  return instanced(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }), list);
}

// Scaffold tower (e.g. the judging tower at Teahupo'o, lifeguard towers).
export function tower({ h = 12, w = 4, color = '#b9c0c7', hut = '#e9ecef', legs = 4 }) {
  const g = new THREE.Group();
  const m = mat(color, { metalness: 0.7, roughness: 0.35 });
  const legGeo = new THREE.CylinderGeometry(0.12, 0.12, h, 6);
  for (let i = 0; i < legs; i++) {
    const a = i / legs * Math.PI * 2 + Math.PI / 4;
    const leg = new THREE.Mesh(legGeo, m);
    leg.position.set(Math.cos(a) * w * 0.7, h / 2, Math.sin(a) * w * 0.7);
    g.add(leg);
  }
  for (let k = 1; k <= 3; k++) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(w * 1.1, 0.2, w * 1.1), m);
    deck.position.y = h * k / 3;
    g.add(deck);
    // cross bracing
    for (let s = 0; s < 4; s++) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, Math.hypot(w, h / 3), 4), m);
      br.position.set(s < 2 ? (s ? 1 : -1) * w * 0.5 : 0, h * (k - 0.5) / 3, s >= 2 ? (s === 2 ? 1 : -1) * w * 0.5 : 0);
      br.rotation.set(s >= 2 ? Math.atan2(w, h / 3) : 0, 0, s < 2 ? Math.atan2(w, h / 3) : 0);
      g.add(br);
    }
  }
  const box = new THREE.Mesh(new THREE.BoxGeometry(w * 1.2, 2.6, w * 1.2), mat(hut, { roughness: 0.5 }));
  box.position.y = h + 1.3;
  g.add(box);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(w * 1.22, 1.0, w * 1.22), mat('#26323d', { roughness: 0.1, metalness: 0.6 }));
  glass.position.y = h + 1.6;
  g.add(glass);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 1.5, 0.25, w * 1.5), mat('#dfe3e6'));
  roof.position.y = h + 2.75;
  g.add(roof);
  return g;
}

export function boat({ len = 8, color = '#ffffff', cabin = true }) {
  const g = new THREE.Group();
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-len / 2, -1); hullShape.lineTo(len * 0.3, -1); hullShape.quadraticCurveTo(len / 2, -1, len / 2, 0);
  hullShape.quadraticCurveTo(len / 2, 1, len * 0.3, 1); hullShape.lineTo(-len / 2, 1); hullShape.lineTo(-len / 2, -1);
  const hull = new THREE.ExtrudeGeometry(hullShape, { depth: 1.1, bevelEnabled: false, curveSegments: 8 });
  hull.rotateX(-Math.PI / 2);
  hull.scale(1, 1, len / 8 * 1.2);
  const hm = new THREE.Mesh(hull, mat(color, { roughness: 0.4 }));
  hm.position.y = -0.4;
  g.add(hm);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(len * 0.95, 0.12, len / 8 * 2.45), mat('#1f3a5f'));
  stripe.position.y = 0.55; stripe.position.x = -len * 0.02;
  g.add(stripe);
  if (cabin) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(len * 0.28, 1.2, len / 8 * 1.6), mat('#f2f2f2', { roughness: 0.4 }));
    c.position.set(-len * 0.05, 1.3, 0);
    g.add(c);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(len * 0.36, 0.1, len / 8 * 2), mat('#d8dde2'));
    roof.position.set(-len * 0.05, 2.0, 0);
    g.add(roof);
  }
  // a few people on deck
  const ppl = new THREE.CapsuleGeometry(0.2, 0.9, 2, 6).translate(0, 0.65, 0);
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(ppl, mat(['#e94f37', '#222831', '#f2c14e', '#3f88c5'][i]));
    p.position.set(-len * 0.35 + i * 0.6, 0.7, (i % 2 ? 0.5 : -0.5) * len / 8);
    g.add(p);
  }
  return g;
}

// Soft cloud billboards.
let cloudTex = null;
function cloudTexture() {
  if (cloudTex) return cloudTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const r = rng(77);
  for (let i = 0; i < 60; i++) {
    const px = 40 + r() * 176, py = 90 + r() * 90 - Math.abs(px - 128) * 0.25, rad = 20 + r() * 45;
    const gr = x.createRadialGradient(px, py, 0, px, py, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr;
    x.beginPath(); x.arc(px, py, rad, 0, Math.PI * 2); x.fill();
  }
  cloudTex = new THREE.CanvasTexture(c);
  cloudTex.colorSpace = THREE.SRGBColorSpace;
  return cloudTex;
}

export function clouds({ count = 20, seed = 31, x0 = -3000, x1 = 6000, z0 = -4000, z1 = 6000, y0 = 900, y1 = 1800, size = [800, 1600], opacity = 0.9, tint = '#ffffff' }) {
  const r = rng(seed);
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const m = new THREE.SpriteMaterial({ map: cloudTexture(), color: tint, transparent: true, opacity: opacity * (0.6 + r() * 0.4), depthWrite: false, fog: true });
    const s = new THREE.Sprite(m);
    const w = size[0] + r() * (size[1] - size[0]);
    s.scale.set(w, w * 0.45, 1);
    s.position.set(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), z0 + r() * (z1 - z0));
    g.add(s);
  }
  return g;
}

// Window texture for high-rises.
export function windowTexture(seed, floors = 30, cols = 10, base = '#9fb3c4', lit = '#e8eef2') {
  const r = rng(seed);
  const c = document.createElement('canvas');
  c.width = cols * 8; c.height = floors * 8;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, c.width, c.height);
  for (let f = 0; f < floors; f++) {
    for (let k = 0; k < cols; k++) {
      x.fillStyle = r() < 0.5 ? lit : (r() < 0.5 ? '#5f7486' : '#c9d6e0');
      x.fillRect(k * 8 + 1, f * 8 + 2, 6, 4);
    }
    x.fillStyle = 'rgba(255,255,255,0.35)';
    x.fillRect(0, f * 8 + 7, c.width, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}

export function highrise({ x, z, w, d, h, seed, base, y = 0, crown = null }) {
  const g = new THREE.Group();
  const tex = windowTexture(seed, 32, 10, base);
  tex.repeat.set(Math.max(1, Math.round(w / 12)), Math.max(1, Math.round(h / 90)));
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.3 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(0, h / 2, 0);
  g.add(b);
  if (crown) {
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.4, crown, 6), mat('#dfe6ea', { metalness: 0.8, roughness: 0.3 }));
    sp.position.y = h + crown / 2;
    g.add(sp);
  }
  g.position.set(x, y, z);
  return g;
}
