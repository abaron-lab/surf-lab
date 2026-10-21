// Championship Tour spots: wave character, scoring focus, light, and the
// landmarks that make each place recognisable from the line-up.
//
// dir: +1 = left-hander (rides towards +x unmirrored), -1 = right-hander
// (the whole scene is mirrored so the rider still travels along local +x).

import * as THREE from 'three';
import {
  rng, fbm, ridged, noise, smoothstep, mat, terrain, col, mix, palms, trees, houses,
  rocks, crowd, tower, boat, clouds, highrise, instanced,
} from './scenery.js';

const C = new THREE.Color();

export const SPOTS = [
  {
    id: 'teahupoo',
    name: "Teahupo'o",
    place: 'Tahiti · Französisch-Polynesien',
    dir: 1,
    focus: ['tube'],
    blurb: 'Die schwerste Linke der Welt. Eine dicke Lippe wirft über ein flaches Riff. Bleib so lange wie möglich in der Tube.',
    wave: { height: 4.6, peel: 10.6, curl: 1.0, barrelLen: 17, thick: 1.45, suck: 0.32, drive: 6.4 },
    score: { tube: 3.0, turn: 0.35, air: 0.25, k: 55 },
    sun: { elev: 26, azim: -35 },
    sky: { turbidity: 3, rayleigh: 1.4, mie: 0.004, g: 0.85 },
    fog: 0.00011,
    water: { deep: '#06304d', shallow: '#22c4c4' },
    offshore: 0.7,
    build: buildTeahupoo,
  },
  {
    id: 'pipeline',
    name: 'Pipeline',
    place: 'North Shore · Oahu, Hawaii',
    dir: 1,
    focus: ['tube'],
    blurb: 'Banzai Pipeline: kurze, kraftvolle Linke direkt vor dem Strand. Tief rein, lange drin bleiben, sauber raus.',
    wave: { height: 3.9, peel: 10.2, curl: 0.97, barrelLen: 13, thick: 1.2, suck: 0.2, drive: 6.2 },
    score: { tube: 3.0, turn: 0.55, air: 0.35, k: 50 },
    sun: { elev: 36, azim: -20 },
    sky: { turbidity: 2.4, rayleigh: 1.1, mie: 0.004, g: 0.8 },
    fog: 0.00016,
    water: { deep: '#073a5c', shallow: '#2cbcd2' },
    offshore: 0.5,
    build: buildPipeline,
  },
  {
    id: 'jbay',
    name: 'Jeffreys Bay',
    place: 'Supertubes · Südafrika',
    dir: -1,
    focus: ['turn'],
    blurb: 'Endlos lange, schnelle Rechte an der Felsküste. Power-Turns, Snaps und Cutbacks auf der offenen Wand.',
    wave: { height: 3.1, peel: 8.8, curl: 0.64, barrelLen: 4, thick: 1.0, suck: 0.05, drive: 6.8 },
    score: { tube: 1.0, turn: 2.6, air: 0.6, k: 45 },
    sun: { elev: 30, azim: -50 },
    sky: { turbidity: 2, rayleigh: 1.0, mie: 0.003, g: 0.8 },
    fog: 0.00018,
    water: { deep: '#0b3546', shallow: '#3a9e9c' },
    offshore: 0.6,
    build: buildJBay,
  },
  {
    id: 'bells',
    name: 'Bells Beach',
    place: 'Victoria · Australien',
    dir: -1,
    focus: ['turn'],
    blurb: 'Rechte vor rotbraunen Klippen im goldenen Abendlicht. Klassisches Rail-Surfen: Carves, Snaps, Roundhouse-Cutbacks.',
    wave: { height: 3.2, peel: 8.0, curl: 0.58, barrelLen: 3, thick: 1.0, suck: 0.0, drive: 6.4 },
    score: { tube: 0.8, turn: 2.8, air: 0.5, k: 45 },
    sun: { elev: 10, azim: -140 },
    sky: { turbidity: 6, rayleigh: 2.2, mie: 0.008, g: 0.88 },
    fog: 0.00022,
    water: { deep: '#123542', shallow: '#4c9a94' },
    offshore: 0.4,
    cloudy: true,
    build: buildBells,
  },
  {
    id: 'snapper',
    name: 'Snapper Rocks',
    place: 'Gold Coast · Australien',
    dir: -1,
    focus: ['turn', 'air'],
    blurb: 'Superbank-Rechte mit der Skyline von Surfers Paradise am Horizont. Schnelle Turns und Airs auf den Sektionen.',
    wave: { height: 2.5, peel: 9.2, curl: 0.78, barrelLen: 5, thick: 1.0, suck: 0.08, drive: 6.6 },
    score: { tube: 1.2, turn: 1.8, air: 1.6, k: 50 },
    sun: { elev: 48, azim: -10 },
    sky: { turbidity: 2.2, rayleigh: 0.9, mie: 0.003, g: 0.8 },
    fog: 0.00012,
    water: { deep: '#0b4361', shallow: '#36c0c7' },
    offshore: 0.3,
    build: buildSnapper,
  },
  {
    id: 'trestles',
    name: 'Lower Trestles',
    place: 'San Clemente · Kalifornien',
    dir: -1,
    focus: ['air'],
    blurb: 'Perfekte Rampen über Kopfsteinpflaster-Riff. Holz-Trestle, Amtrak und die Kuppeln von San Onofre. Hier zählen Airs.',
    wave: { height: 2.4, peel: 8.4, curl: 0.56, barrelLen: 2, thick: 1.0, suck: 0.0, drive: 6.6 },
    score: { tube: 0.6, turn: 1.1, air: 2.8, k: 55 },
    sun: { elev: 28, azim: -40 },
    sky: { turbidity: 4.5, rayleigh: 1.6, mie: 0.01, g: 0.86 },
    fog: 0.0002,
    water: { deep: '#14394a', shallow: '#4a9599' },
    offshore: 0.2,
    build: buildTrestles,
  },
  {
    id: 'saquarema',
    name: 'Saquarema',
    place: 'Rio de Janeiro · Brasilien',
    dir: 1,
    focus: ['air'],
    blurb: 'Itaúna-Linke unter der weißen Kirche Nossa Senhora de Nazaré. Die Fans wollen Airs sehen.',
    wave: { height: 2.7, peel: 8.6, curl: 0.6, barrelLen: 3, thick: 1.0, suck: 0.05, drive: 6.6 },
    score: { tube: 0.8, turn: 1.2, air: 2.6, k: 52 },
    sun: { elev: 40, azim: 300 },
    sky: { turbidity: 3, rayleigh: 1.2, mie: 0.005, g: 0.82 },
    fog: 0.00018,
    water: { deep: '#0d3a50', shallow: '#3ab0b4' },
    offshore: 0.35,
    build: buildSaquarema,
  },
];

// Every builder returns { group, animate?(t) }.

function buildTeahupoo() {
  const g = new THREE.Group();
  const sand = col('#e3d3ad'), jungle = col('#24461f'), jungle2 = col('#3a6a2a'), rock = col('#4a4a3f');
  const h = (x, z) => {
    const coast = smoothstep(680, 860, z);
    const m = ridged(x / 650 + 3, z / 650, 6);
    const rise = smoothstep(800, 2400, z);
    return -4 + coast * (6 + rise * (180 + 1350 * m * m)) + (1 - coast) * 0;
  };
  g.add(terrain({
    x0: -3000, x1: 6000, z0: 600, z1: 5200, nx: 220, nz: 120, height: h,
    color: (x, y, z, ny, c) => {
      if (y < 5) return c.copy(sand);
      mix(c, jungle2, jungle, fbm(x / 120, z / 120, 3) * 1.4 - 0.2);
      if (ny < 0.55) mix(c, c, rock, (0.55 - ny) * 3);
      return c;
    },
  }));
  // coastal palms and village
  const r = rng(4);
  const pl = [];
  for (let i = 0; i < 420; i++) { const x = -1500 + r() * 6000, z = 760 + r() * 120; pl.push({ x, y: h(x, z), z }); }
  g.add(palms(pl, 4));
  const hs = [];
  for (let i = 0; i < 60; i++) { const x = -600 + r() * 2200, z = 790 + r() * 60; hs.push({ x, y: h(x, z), z, color: ['#f1ece2', '#d6e4e0', '#f0d9b5'][i % 3], roof: ['#7b3b2a', '#56636b', '#a0522d'][i % 3] }); }
  g.add(houses(hs, 4));
  // the judging tower in the channel
  const t = tower({ h: 14, w: 4.2 });
  t.position.set(150, -0.5, 132);
  g.add(t);
  // boats & jet skis in the channel
  const boats = [];
  const br = rng(8);
  for (let i = 0; i < 12; i++) {
    const b = boat({ len: 7 + br() * 6, color: ['#ffffff', '#f1f1f1', '#d9e3ea', '#ffe3a3'][i % 4], cabin: br() > 0.3 });
    b.position.set(90 + br() * 260, 0, 112 + br() * 70);
    b.rotation.y = br() * 6;
    b.userData.phase = br() * 6;
    g.add(b); boats.push(b);
  }
  g.add(clouds({ count: 26, x0: -2500, x1: 6000, z0: 1200, z1: 4500, y0: 600, y1: 1300, size: [500, 1100], opacity: 0.85 }));
  g.add(clouds({ count: 12, seed: 9, x0: -3000, x1: 6000, z0: -6000, z1: -1500, y0: 1200, y1: 2200, size: [900, 1800], opacity: 0.7 }));
  return {
    group: g,
    animate(time) { for (const b of boats) { b.position.y = Math.sin(time * 0.9 + b.userData.phase) * 0.25; b.rotation.z = Math.sin(time * 0.7 + b.userData.phase) * 0.04; } },
  };
}

function buildPipeline() {
  const g = new THREE.Group();
  const sand = col('#e8d9b5'), wetSand = col('#b9a884'), grass = col('#4f7a33'), forest = col('#2c4f24'), cliff = col('#3e5a31');
  const h = (x, z) => {
    let y = THREE.MathUtils.lerp(-1.2, 2.6, smoothstep(102, 150, z));
    y += smoothstep(150, 260, z) * 2.5;
    const ridge = smoothstep(2600, 3600, z) * (1 - smoothstep(4800, 6000, z) * 0.5);
    const flutes = ridged(x / 160, z / 900, 5);
    y += ridge * (250 + 700 * flutes * (0.6 + 0.4 * fbm(x / 1500, 3)));
    y += fbm(x / 300, z / 300, 3) * 12 * smoothstep(300, 600, z);
    return y;
  };
  g.add(terrain({
    x0: -3000, x1: 6000, z0: 95, z1: 6200, nx: 240, nz: 140, height: h,
    color: (x, y, z, ny, c) => {
      if (z < 110) return c.copy(wetSand);
      if (z < 158) return c.copy(sand);
      mix(c, grass, forest, smoothstep(300, 1200, z) + fbm(x / 80, z / 80, 3) * 0.6 - 0.3);
      if (y > 200) mix(c, c, cliff, ny < 0.7 ? 0.6 : 0.1);
      return c;
    },
  }));
  const r = rng(12);
  const pl = [], hs = [];
  for (let i = 0; i < 520; i++) { const x = -800 + r() * 3600, z = 160 + r() * 160; pl.push({ x, y: h(x, z), z }); }
  for (let i = 0; i < 90; i++) { const x = -700 + r() * 3400, z = 175 + r() * 120; hs.push({ x, y: h(x, z), z, w: 9 + r() * 6, h: 4 + r() * 4 }); }
  g.add(palms(pl, 12));
  g.add(houses(hs, 13, ['#f3f0e8', '#dfe8e6', '#d9c7a7', '#bcd3d6']));
  // lifeguard tower & contest scaffold
  const lg = new THREE.Group();
  const yellow = mat('#f2c230', { roughness: 0.6 });
  const legs = new THREE.CylinderGeometry(0.1, 0.1, 3, 5);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { const l = new THREE.Mesh(legs, mat('#e7e1d3')); l.position.set(a * 1.1, 1.5, b * 1.1); lg.add(l); });
  const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 3), yellow); cab.position.y = 4.1; lg.add(cab);
  const roofL = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.2, 3.6), mat('#e94f37')); roofL.position.y = 5.3; lg.add(roofL);
  lg.position.set(30, h(30, 140), 140);
  g.add(lg);
  const sc = tower({ h: 7, w: 8, color: '#9aa3ab', hut: '#20252b' });
  sc.position.set(110, h(110, 168), 168);
  g.add(sc);
  g.add(crowd({ x0: -150, x1: 520, z0: 128, z1: 156, count: 650, y: (x, z) => h(x, z), seed: 41, umbrellas: 0.1 }));
  g.add(clouds({ count: 22, x0: -2500, x1: 6000, z0: 2500, z1: 6500, y0: 700, y1: 1300, size: [600, 1200] }));
  g.add(clouds({ count: 10, seed: 3, x0: -3000, x1: 6000, z0: -6000, z1: -2000, y0: 1200, y1: 2000, size: [900, 1600], opacity: 0.6 }));
  return { group: g };
}

function buildJBay() {
  const g = new THREE.Group();
  const fynbos = col('#6b6a3c'), fyn2 = col('#8b7d4a'), sandC = col('#cdb487'), rockC = col('#6b4a36');
  const h = (x, z) => {
    let y = THREE.MathUtils.lerp(-1, 2, smoothstep(100, 135, z));
    y += smoothstep(130, 600, z) * 55 + smoothstep(450, 1800, z) * (140 + 160 * fbm(x / 900, z / 900, 4));
    y += fbm(x / 200, z / 200, 3) * 8;
    return y;
  };
  g.add(terrain({
    x0: -3000, x1: 6000, z0: 95, z1: 4000, nx: 220, nz: 110, height: h,
    color: (x, y, z, ny, c) => {
      if (z < 135) return c.copy(rockC).offsetHSL(0, 0, fbm(x / 6, z / 6, 2) * 0.1 - 0.05);
      mix(c, fynbos, fyn2, fbm(x / 60, z / 60, 3) * 1.6 - 0.4);
      if (fbm(x / 30 + 9, z / 30, 2) > 0.68) c.lerp(sandC, 0.5);
      return c;
    },
  }));
  // far Kouga mountains
  g.add(terrain({
    x0: -6000, x1: 9000, z0: 5000, z1: 9000, nx: 120, nz: 40,
    height: (x, z) => smoothstep(5000, 7000, z) * (500 + 600 * ridged(x / 1400, z / 1400, 4)),
    color: (x, y, z, ny, c) => c.copy(col('#56614a')),
  }));
  const r = rng(22);
  const rk = [];
  for (let i = 0; i < 900; i++) { const x = -800 + r() * 4200, z = 98 + r() * 34; rk.push({ x, z, y: h(x, z) - 0.4, s: 0.6 + r() * 1.8 }); }
  g.add(rocks(rk, '#5e4434', 22));
  const hs = [];
  for (let i = 0; i < 200; i++) { const x = -500 + r() * 3200, z = 160 + r() * 340; hs.push({ x, y: h(x, z) - 0.3, z, w: 8 + r() * 8, d: 7 + r() * 6, h: 3 + r() * 4, color: '#f4f1ea', roof: r() < 0.5 ? '#3d4247' : '#8e4b32' }); }
  g.add(houses(hs, 23));
  const tr = [];
  for (let i = 0; i < 160; i++) { const x = -500 + r() * 3200, z = 160 + r() * 400; tr.push({ x, y: h(x, z), z, s: 0.5 + r() * 0.5 }); }
  g.add(trees(tr, 24));
  g.add(crowd({ x0: 0, x1: 260, z0: 136, z1: 150, count: 120, y: (x, z) => h(x, z), seed: 43, umbrellas: 0 }));
  g.add(clouds({ count: 14, x0: -3000, x1: 6000, z0: 1500, z1: 7000, y0: 900, y1: 1500, size: [700, 1300], opacity: 0.7 }));
  return { group: g };
}

function buildBells() {
  const g = new THREE.Group();
  const sand = col('#d8c194'), ochre = col('#b5652f'), ochre2 = col('#d38a4a'), dark = col('#7b3f22'), scrub = col('#5d6a34'), scrub2 = col('#7d7a45');
  const h = (x, z) => {
    const bay = Math.sin(x / 420) * 25;
    const zc = z - bay;
    let y = THREE.MathUtils.lerp(-1, 1.2, smoothstep(100, 150, zc));
    y += smoothstep(158, 178, zc) * (40 + 10 * fbm(x / 150, 1, 3));
    y += smoothstep(200, 2000, zc) * 35 * fbm(x / 600, z / 600, 4);
    y += fbm(x / 25, z / 25, 2) * 1.5;
    return y;
  };
  g.add(terrain({
    x0: -3000, x1: 6000, z0: 95, z1: 3000, nx: 320, nz: 140, height: h,
    color: (x, y, z, ny, c) => {
      if (y < 2.2 && ny > 0.8) return c.copy(sand);
      if (ny < 0.75) {
        mix(c, ochre, ochre2, 0.5 + 0.5 * Math.sin(y * 1.4 + noise(x / 20, y / 3) * 2));
        if (y < 6) c.lerp(dark, 0.5);
        return c;
      }
      return mix(c, scrub, scrub2, fbm(x / 50, z / 50, 3) * 1.6 - 0.4);
    },
  }));
  // staircase down the cliff
  const steps = [];
  for (let i = 0; i < 40; i++) {
    const t = i / 40;
    steps.push({ x: 120 + t * 40, z: 168 - t * 14 + Math.sin(120 / 420) * 25, y: 40 - t * 39, sx: 3, sy: 0.25, sz: 1.6 });
  }
  g.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat('#8a6a4a'), steps));
  const deck = new THREE.Mesh(new THREE.BoxGeometry(14, 0.5, 8), mat('#7d5d40'));
  deck.position.set(115, h(115, 190) + 0.6, 190);
  g.add(deck);
  const r = rng(31);
  const rk = [];
  for (let i = 0; i < 300; i++) { const x = -600 + r() * 3000; const z = 140 + Math.sin(x / 420) * 25 + r() * 18; rk.push({ x, z, y: 0, s: 0.8 + r() * 2.4 }); }
  g.add(rocks(rk, '#4a3426', 31));
  const sh = [];
  for (let i = 0; i < 500; i++) { const x = -800 + r() * 3600, z = 190 + r() * 600; sh.push({ x, y: h(x, z), z, s: 0.35 + r() * 0.35 }); }
  g.add(trees(sh, 32));
  g.add(crowd({ x0: 60, x1: 220, z0: 185, z1: 200, count: 140, y: (x, z) => h(x, z), seed: 44, umbrellas: 0 }));
  g.add(clouds({ count: 34, x0: -4000, x1: 7000, z0: -6000, z1: 7000, y0: 700, y1: 1600, size: [800, 1700], opacity: 0.85, tint: '#ffe2c4' }));
  return { group: g };
}

function buildSnapper() {
  const g = new THREE.Group();
  const sand = col('#ead9b0'), grass = col('#4f7a37'), urban = col('#8a8a7e');
  const coastZ = (x) => 125 + Math.max(0, x) * 0.12;
  const h = (x, z) => {
    const cz = coastZ(x);
    let y = THREE.MathUtils.lerp(-1, 2.5, smoothstep(cz - 25, cz + 25, z));
    // Point Danger headland behind the take-off
    const dx = (x + 280) / 220, dz = (z - 320) / 200;
    y += Math.max(0, 1 - dx * dx - dz * dz) * 46;
    y += fbm(x / 400, z / 400, 3) * 10 * smoothstep(cz + 100, cz + 600, z);
    return y;
  };
  g.add(terrain({
    x0: -2000, x1: 9000, z0: 95, z1: 5000, nx: 260, nz: 110, height: h,
    color: (x, y, z, ny, c) => {
      if (z < coastZ(x) + 35 && y < 6) return c.copy(sand);
      return mix(c, grass, urban, smoothstep(0, 1, fbm(x / 120, z / 120, 3) + (x > 0 && z < coastZ(x) + 500 ? 0.25 : -0.2)));
    },
  }));
  // Snapper Rocks
  const r = rng(51);
  const rk = [];
  for (let i = 0; i < 140; i++) rk.push({ x: -150 + r() * 120, z: 70 + r() * 60, y: -0.6, s: 1 + r() * 2.5 });
  g.add(rocks(rk, '#2f2b28', 51));
  // Point Danger lighthouse (Captain Cook memorial)
  const lh = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 18, 12), mat('#f4f4f0', { roughness: 0.5 }));
  shaft.position.y = 9; lh.add(shaft);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 2.5, 16), mat('#e7e7e2'));
  lamp.position.y = 19; lh.add(lamp);
  const top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 3, 12), mat('#c64032'));
  top.position.y = 21.8; lh.add(top);
  lh.position.set(-280, h(-280, 320) - 1, 320);
  g.add(lh);
  // Coolangatta / Kirra mid-rises along the beach
  for (let i = 0; i < 40; i++) {
    const x = 150 + r() * 2600, z = coastZ(x) + 70 + r() * 200;
    g.add(highrise({ x, z, y: h(x, z) - 1, w: 18 + r() * 14, d: 14 + r() * 10, h: 15 + r() * 45, seed: 100 + i, base: ['#d8dcd8', '#c4cdd2', '#e6e2d6'][i % 3] }));
  }
  // Surfers Paradise skyline on the horizon
  for (let i = 0; i < 70; i++) {
    const x = 5200 + r() * 3600, z = coastZ(x) + 150 + r() * 1100;
    const tall = r();
    g.add(highrise({ x, z, y: h(x, z) - 2, w: 24 + r() * 18, d: 20 + r() * 14, h: 60 + tall * tall * 190, seed: 200 + i, base: ['#b9c6cf', '#d5dadd', '#9fb1bd'][i % 3] }));
  }
  g.add(highrise({ x: 6900, z: coastZ(6900) + 600, y: h(6900, coastZ(6900) + 600) - 2, w: 36, d: 30, h: 280, seed: 999, base: '#a9bfcf', crown: 45 }));
  const pines = [];
  for (let i = 0; i < 120; i++) { const x = -400 + r() * 2800, z = coastZ(x) + 40 + r() * 30; pines.push({ x, y: h(x, z), z, s: 1.4 + r() * 0.6 }); }
  g.add(trees(pines, 52, 'pine'));
  g.add(crowd({ x0: -100, x1: 600, z0: 150, z1: 175, count: 420, y: (x, z) => h(x, z), seed: 45, umbrellas: 0.15 }));
  g.add(clouds({ count: 16, x0: -3000, x1: 10000, z0: 2000, z1: 9000, y0: 900, y1: 1700, size: [700, 1500], opacity: 0.7 }));
  return { group: g };
}

function buildTrestles() {
  const g = new THREE.Group();
  const cobble = col('#7c7466'), gold = col('#b39b62'), gold2 = col('#9b8a55'), scrub = col('#6c7448'), bluff = col('#b49b78');
  const creek = (x) => Math.exp(-(((x - 100) / 140) ** 2));
  const h = (x, z) => {
    let y = THREE.MathUtils.lerp(-0.8, 1.6, smoothstep(98, 128, z));
    const bl = smoothstep(150, 185, z) * 22 * (1 - creek(x) * 0.9);
    y += bl;
    y += smoothstep(200, 1800, z) * (60 + 110 * fbm(x / 700, z / 700, 4)) * (1 - creek(x) * 0.6);
    y += fbm(x / 120, z / 120, 3) * 4;
    return y;
  };
  g.add(terrain({
    x0: -3000, x1: 6000, z0: 95, z1: 3500, nx: 240, nz: 120, height: h,
    color: (x, y, z, ny, c) => {
      if (z < 132) return c.copy(cobble).offsetHSL(0, 0, fbm(x / 3, z / 3, 2) * 0.12 - 0.06);
      if (ny < 0.7 && y < 30) return c.copy(bluff);
      mix(c, gold, gold2, fbm(x / 90, z / 90, 3) * 1.5 - 0.3);
      if (fbm(x / 40 + 3, z / 40, 3) > 0.6) c.lerp(scrub, 0.7);
      return c;
    },
  }));
  const r = rng(61);
  const cb = [];
  for (let i = 0; i < 1600; i++) { const x = -600 + r() * 3200, z = 99 + r() * 30; cb.push({ x, z, y: h(x, z) - 0.15, s: 0.25 + r() * 0.5 }); }
  g.add(rocks(cb, '#776e62', 61));
  // the trestle: wooden railway bridge across the creek mouth
  const deckY = 9, tz = 210;
  const bridge = new THREE.Group();
  const wood = mat('#5c4632', { roughness: 0.9 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(420, 1.4, 6), wood);
  deck.position.set(100, deckY, tz); bridge.add(deck);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(420, 0.25, 0.3), mat('#8a8f94', { metalness: 0.8, roughness: 0.4 }));
  rail.position.set(100, deckY + 0.85, tz - 1); bridge.add(rail);
  const rail2 = rail.clone(); rail2.position.z = tz + 1; bridge.add(rail2);
  const posts = [];
  for (let x = -100; x <= 300; x += 8) {
    for (const dz of [-2.2, 0, 2.2]) posts.push({ x, z: tz + dz, y: 0, sx: 0.5, sy: deckY, sz: 0.5 });
    posts.push({ x, z: tz, y: deckY * 0.45, sx: 0.3, sy: 0.3, sz: 5.4 });
  }
  bridge.add(instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), wood, posts));
  g.add(bridge);
  // Amtrak train
  const train = new THREE.Group();
  const silver = mat('#c9ced3', { metalness: 0.7, roughness: 0.3 });
  const blue = mat('#1d4f91');
  for (let i = 0; i < 7; i++) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(24, 4.2, 3.2), silver);
    car.position.set(-i * 25.5, deckY + 2.9, tz);
    train.add(car);
    const st = new THREE.Mesh(new THREE.BoxGeometry(24.1, 0.5, 3.25), blue);
    st.position.set(-i * 25.5, deckY + 2.0, tz);
    train.add(st);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8, 0, Math.PI), silver);
  nose.rotation.y = Math.PI / 2; nose.scale.set(1, 1, 1.6); nose.position.set(12, deckY + 2.9, tz);
  train.add(nose);
  g.add(train);
  // San Onofre domes down the coast
  const domes = new THREE.Group();
  const white = mat('#efece4', { roughness: 0.6 });
  for (const dx of [0, 95]) {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(32, 32, 26, 32), white);
    cyl.position.set(dx, 13, 0); domes.add(cyl);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(32, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), white);
    dome.position.set(dx, 26, 0); domes.add(dome);
  }
  const block = new THREE.Mesh(new THREE.BoxGeometry(260, 22, 50), mat('#cfc7b8'));
  block.position.set(48, 11, 55); domes.add(block);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(420, 8, 4), mat('#b9b2a5'));
  wall.position.set(48, 3, -45); domes.add(wall);
  domes.position.set(1750, 0, 225);
  g.add(domes);
  const sc = [];
  for (let i = 0; i < 400; i++) { const x = -800 + r() * 3600, z = 190 + r() * 500; sc.push({ x, y: h(x, z), z, s: 0.3 + r() * 0.3 }); }
  g.add(trees(sc, 62));
  g.add(crowd({ x0: -40, x1: 200, z0: 128, z1: 140, count: 160, y: (x, z) => h(x, z), seed: 46, umbrellas: 0.05 }));
  g.add(clouds({ count: 12, x0: -3000, x1: 6000, z0: -3000, z1: 6000, y0: 400, y1: 700, size: [900, 1800], opacity: 0.45, tint: '#f1f1ee' }));
  return {
    group: g,
    animate(time) {
      const period = 45;
      const t = (time % period) / period;
      train.position.x = -2200 + t * 5200;
    },
  };
}

function buildSaquarema() {
  const g = new THREE.Group();
  const sand = col('#f1e6c8'), green = col('#3f6f2e'), green2 = col('#5d8a3a'), rockC = col('#5a5550');
  const hill = (x, z) => { const dx = (x - 400) / 130, dz = (z - 250) / 120; return Math.max(0, 1 - dx * dx - dz * dz); };
  const h = (x, z) => {
    let y = THREE.MathUtils.lerp(-1, 2.2, smoothstep(105, 160, z));
    y += smoothstep(180, 300, z) * 4;
    y += Math.pow(hill(x, z), 0.6) * 30;
    y += smoothstep(2500, 4500, z) * (300 + 500 * ridged(x / 900, z / 900, 5));
    y += fbm(x / 200, z / 200, 3) * 5;
    return y;
  };
  g.add(terrain({
    x0: -3000, x1: 6000, z0: 95, z1: 7000, nx: 240, nz: 140, height: h,
    color: (x, y, z, ny, c) => {
      if (z < 175 && hill(x, z) < 0.05) return c.copy(sand);
      if (hill(x, z) > 0.05 && ny < 0.8) return c.copy(rockC);
      return mix(c, green, green2, fbm(x / 80, z / 80, 3) * 1.4 - 0.2);
    },
  }));
  const r = rng(71);
  const rk = [];
  for (let i = 0; i < 160; i++) { const a = r() * Math.PI * 2, d = 0.7 + r() * 0.4; const x = 400 + Math.cos(a) * 130 * d, z = 250 + Math.sin(a) * 120 * d; rk.push({ x, z, y: h(x, z) - 1, s: 2 + r() * 4 }); }
  g.add(rocks(rk, '#57524c', 71));
  // Igreja de Nossa Senhora de Nazaré
  const church = new THREE.Group();
  const white = mat('#f7f6f1', { roughness: 0.6 });
  const trim = mat('#2f6db0', { roughness: 0.5 });
  const nave = new THREE.Mesh(new THREE.BoxGeometry(12, 10, 30), white);
  nave.position.set(0, 5, 6); church.add(nave);
  const navRoof = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.2, 30, 3, 1), mat('#b9573a'));
  navRoof.rotation.x = Math.PI / 2; navRoof.rotation.y = Math.PI / 2; navRoof.scale.set(1, 1, 0.45);
  navRoof.position.set(0, 12, 6); church.add(navRoof);
  const facade = new THREE.Mesh(new THREE.BoxGeometry(14, 13, 2), white);
  facade.position.set(0, 6.5, -9.5); church.add(facade);
  const tw = new THREE.Mesh(new THREE.BoxGeometry(5, 26, 5), white);
  tw.position.set(0, 13, -9); church.add(tw);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(3.6, 7, 4), white);
  spire.rotation.y = Math.PI / 4; spire.position.set(0, 29.5, -9); church.add(spire);
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 0.3), white);
  cross.position.set(0, 34, -9); church.add(cross);
  for (const y of [9, 17, 25.8]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.5, 5.2), trim);
    band.position.set(0, y, -9); church.add(band);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4, 0.3), trim);
  door.position.set(0, 2, -10.6); church.add(door);
  church.rotation.y = 0.15;
  church.position.set(400, h(400, 250) - 0.5, 250);
  g.add(church);
  const hs = [];
  const pastel = ['#f2d7a6', '#f7b2a1', '#a7d3c9', '#f5f0e6', '#f0c96a', '#b6c9e6'];
  for (let i = 0; i < 160; i++) { const x = -800 + r() * 3000, z = 200 + r() * 260; if (hill(x, z) > 0) continue; hs.push({ x, y: h(x, z) - 0.3, z, w: 7 + r() * 5, d: 7 + r() * 5, h: 3 + r() * 4, color: pastel[i % pastel.length] }); }
  g.add(houses(hs, 72));
  const pl = [];
  for (let i = 0; i < 160; i++) { const x = -800 + r() * 3000, z = 175 + r() * 300; if (hill(x, z) > 0) continue; pl.push({ x, y: h(x, z), z }); }
  g.add(palms(pl, 73));
  g.add(crowd({ x0: -150, x1: 330, z0: 135, z1: 165, count: 700, y: (x, z) => h(x, z), seed: 47, umbrellas: 0.12, flags: ['#1f9e46', '#f6d32d', '#1d3f8f'] }));
  g.add(clouds({ count: 18, x0: -3000, x1: 6000, z0: 2000, z1: 8000, y0: 700, y1: 1400, size: [600, 1300] }));
  return { group: g };
}
