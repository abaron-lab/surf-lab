import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { WaveField, COL } from './wave.js';
import { createWater } from './water.js';
import { createSurfer } from './surfer.js';
import { createSpray } from './fx.js';
import { Rider } from './rider.js';
import { SPOTS } from './spots.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';

const RUN_SECONDS = 60;
const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

// ------------------------------------------------------------------ renderer
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.42;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 22000);
const root = new THREE.Group();          // wave-local frame (mirrored for rights)
scene.add(root);

const sky = new Sky();
sky.scale.setScalar(18000);
scene.add(sky);
const envScene = new THREE.Scene();
const envSky = new Sky();
envSky.scale.setScalar(1000);
envScene.add(envSky);
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;

const sun = new THREE.DirectionalLight(0xffffff, 2.5);
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x2a3a40, 0.4);
scene.add(hemi);
scene.fog = new THREE.FogExp2(0xcfd8e0, 0.0002);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.5, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

let quality = store.get('surf.quality', 'high');
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const pr = quality === 'high' ? Math.min(window.devicePixelRatio, 2) : Math.min(window.devicePixelRatio, 1) * 0.8;
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pr);
  composer.setSize(w, h);
  bloom.enabled = quality === 'high';
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  spray.uniforms.uScale.value = h * pr * 0.9;
}

// ------------------------------------------------------------------ world
let spot = SPOTS[0];
let field = new WaveField(spot);
const water = createWater(field);
root.add(water.group);
const surfer = createSurfer();
surfer.root.children[0].children.find((c) => c.isGroup).scale.z = -1; // face the wave
root.add(surfer.root);
const spray = createSpray();
root.add(spray.points);
let scenery = null;

const input = createInput();
const audio = createAudio();
let rider = new Rider(field, spot, onEvent);

const sunDirLocal = new THREE.Vector3();
const sunDirWorld = new THREE.Vector3();

function sunColorFor(elev) {
  const t = THREE.MathUtils.smoothstep(elev, 4, 40);
  return new THREE.Color().setRGB(1.0, THREE.MathUtils.lerp(0.55, 0.95, t), THREE.MathUtils.lerp(0.3, 0.88, t));
}

// Average sky radiance in a few directions: used for fog and reflections.
const probeRT = new THREE.WebGLRenderTarget(8, 8, { type: THREE.FloatType });
const probeCam = new THREE.PerspectiveCamera(30, 1, 0.1, 5000);
function probeSky(dir) {
  probeCam.position.set(0, 0, 0);
  probeCam.lookAt(dir);
  renderer.setRenderTarget(probeRT);
  renderer.render(envScene, probeCam);
  const buf = new Float32Array(8 * 8 * 4);
  renderer.readRenderTargetPixels(probeRT, 0, 0, 8, 8, buf);
  renderer.setRenderTarget(null);
  const c = new THREE.Color(0, 0, 0);
  for (let i = 0; i < 64; i++) { c.r += buf[i * 4] / 64; c.g += buf[i * 4 + 1] / 64; c.b += buf[i * 4 + 2] / 64; }
  return c;
}

function loadSpot(s) {
  spot = s;
  if (scenery) { root.remove(scenery.group); disposeTree(scenery.group); }
  field.texture.dispose();
  field = new WaveField(spot);
  water.setField(field);
  scenery = spot.build();
  root.add(scenery.group);
  root.scale.x = spot.dir;
  root.updateMatrixWorld(true);

  // sun & sky
  const el = THREE.MathUtils.degToRad(spot.sun.elev), az = THREE.MathUtils.degToRad(spot.sun.azim);
  sunDirLocal.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  sunDirWorld.copy(sunDirLocal); sunDirWorld.x *= spot.dir;
  for (const sk of [sky, envSky]) {
    const u = sk.material.uniforms;
    u.turbidity.value = spot.sky.turbidity;
    u.rayleigh.value = spot.sky.rayleigh;
    u.mieCoefficient.value = spot.sky.mie;
    u.mieDirectionalG.value = spot.sky.g;
    u.sunPosition.value.copy(sunDirWorld).multiplyScalar(1000);
  }
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(envScene, 0.02);
  scene.environment = envRT.texture;

  let horizon, zenith;
  try {
    horizon = new THREE.Color(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * Math.PI * 2;
      horizon.add(probeSky(new THREE.Vector3(Math.cos(a), 0.04, Math.sin(a))));
    }
    horizon.multiplyScalar(0.25);
    zenith = probeSky(new THREE.Vector3(0.0001, 1, 0));
    if (![horizon.r, horizon.g, zenith.b].every(Number.isFinite) || horizon.r + horizon.g + horizon.b < 1e-4) throw new Error('probe');
  } catch {
    horizon = new THREE.Color(0.9, 1.0, 1.1); zenith = new THREE.Color(0.25, 0.45, 0.9);
  }
  const sc = sunColorFor(spot.sun.elev);
  const sunI = THREE.MathUtils.lerp(1.2, 3.2, THREE.MathUtils.smoothstep(spot.sun.elev, 3, 35));

  const u = water.uniforms;
  u.uSunDir.value.copy(sunDirWorld);
  u.uSunColor.value.copy(sc).multiplyScalar(sunI);
  u.uSkyHorizon.value.copy(horizon);
  u.uSkyZenith.value.copy(zenith);
  u.uDeep.value.set(spot.water.deep);
  u.uShallow.value.set(spot.water.shallow);
  u.uFogColor.value.copy(horizon);
  u.uFogDensity.value = spot.fog;
  scene.fog.color.copy(horizon);
  scene.fog.density = spot.fog;
  spray.uniforms.uFogColor.value.copy(horizon);
  spray.uniforms.uFogDensity.value = spot.fog;
  spray.uniforms.uColor.value.copy(sc).multiplyScalar(sunI * 0.35).add(horizon.clone().multiplyScalar(0.7));

  const cloudCol = horizon.clone().multiplyScalar(1.05).add(sc.clone().multiplyScalar(sunI * 0.12));
  scenery.group.traverse((o) => { if (o.isSprite) o.material.color.copy(cloudCol); });
  sun.color.copy(sc);
  sun.intensity = sunI;
  hemi.color.copy(zenith).multiplyScalar(1 / Math.max(zenith.r, zenith.g, zenith.b, 1e-3));
  hemi.intensity = 0.35;
  spray.clear();
  rider = new Rider(field, spot, onEvent);
}

function disposeTree(o) {
  o.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    if (n.material) [].concat(n.material).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
  });
}

// ------------------------------------------------------------------ game state
let mode = 'menu';         // menu | run | paused | results
let timeLeft = RUN_SECONDS;
let elapsed = 0;
let surgeSeed = 0;
// sections: the peel races and slows down so you have to read the wave
const peelSurge = (e) => 1 + 0.17 * Math.sin(e * 0.37 + surgeSeed) + 0.11 * Math.sin(e * 0.93 + surgeSeed * 2.1) + 0.07 * Math.sin(e * 2.3 + surgeSeed * 0.7);
let selected = 0;

const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let debugCam = null;
let snapCam = true;
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
const toWorld = (v, out) => out.set(v.x * spot.dir, v.y, v.z);

function onEvent(e) {
  switch (e.type) {
    case 'trick': feed(e.name, `+${e.points.toFixed(2).replace('.', ',')}`, e.kind); if (e.kind === 'air') audio.whoosh(); break;
    case 'message': flash(e.text, e.tone); break;
    case 'ready': prompt('AUFSTEHEN!', 'Leertaste / Sprung-Taste – jetzt!', 1, true); break;
    case 'popup': hidePrompt(); flash(e.perfect ? 'Perfekter Take-off' : 'Drin!', 'good'); audio.splash(0.8); break;
    case 'wipeout': flash(`WIPEOUT · ${e.reason}`, 'bad'); audio.splash(1.6); break;
    case 'respawn': flash('Weiter geht’s', 'good'); break;
    case 'tubeStart': $('tube').hidden = false; break;
    case 'tubeEnd': $('tube').hidden = true; break;
    case 'spray': emitSpray(e.kind, e.strength); break;
  }
}

// ------------------------------------------------------------------ spray
function rand(a, b) { return a + Math.random() * (b - a); }
const cnt = (n) => Math.floor(n + Math.random());
function emitSpray(kind, strength = 1) {
  const p = rider.pos, n = rider.normal, f = rider.fwd;
  if (kind === 'carve') {
    const side = tmp.copy(n).cross(f).normalize().multiplyScalar(Math.sign(rider.steerSmooth) || 1);
    const count = cnt(4 * strength);
    for (let i = 0; i < count; i++) {
      spray.emit(p.x - f.x * 0.7, p.y + 0.1, p.z - f.z * 0.7,
        side.x * rand(2, 6) * strength - f.x * 2 + n.x * 3, n.y * rand(2.5, 6) * strength + 1, side.z * rand(2, 6) * strength - f.z * 2 + n.z * 3,
        rand(0.08, 0.2), rand(0.5, 1.0), 0.9, 0.5);
    }
  } else if (kind === 'lip' || kind === 'land' || kind === 'wipe') {
    const count = Math.round(40 * strength);
    for (let i = 0; i < count; i++) {
      spray.emit(p.x + rand(-0.5, 0.5), p.y + 0.2, p.z + rand(-0.5, 0.5),
        rand(-3, 3) + f.x * 2, rand(2, 7) * strength, rand(-3, 3), rand(0.12, 0.35), rand(0.6, 1.4), 0.85, 0.7);
    }
  }
}

function ambientSpray(dt) {
  const fl = field, x0 = rider.x;
  // offshore spray feathering off the crest
  const n1 = cnt(spot.offshore * 90 * dt);
  for (let i = 0; i < n1; i++) {
    const x = x0 + rand(-20, 90), s = x - fl.peelX;
    if (s < 1) continue;
    const c = COL.crest + rand(-1, 3);
    const k = Math.min(1, fl.heightAt(s) / fl.H0);
    spray.emit(x, fl.y(s, c) + 0.1, fl.z(s, c), rand(-0.5, 0.5), rand(1.5, 4) * k, -rand(3, 8) * spot.offshore, rand(0.15, 0.4), rand(0.8, 1.6), 0.55 * k, 0.9);
  }
  // explosion where the lip lands
  const n2 = cnt(70 * dt);
  for (let i = 0; i < n2; i++) {
    const s = rand(-4, 1), c = rand(COL.tip - 4, COL.trough + 4);
    const x = fl.peelX + s;
    const h = fl.H0;
    spray.emit(x, fl.y(s, c) + 0.3, fl.z(s, c) + rand(-1, 1), rand(-1, 4), rand(2, 5) * Math.sqrt(h / 3), rand(-2, 2),
      rand(0.5, 1.3) * Math.sqrt(h / 3), rand(1.0, 2.0), 0.3, 0.85);
  }
  // whitewater mist behind the peel
  const n3 = cnt(22 * dt);
  for (let i = 0; i < n3; i++) {
    const s = rand(-40, -4), c = rand(COL.crest - 10, COL.trough);
    const x = fl.peelX + s;
    spray.emit(x, fl.y(s, c) + 0.5, fl.z(s, c), rand(-1, 1), rand(0.5, 1.5), rand(-1, 1), rand(0.8, 1.8), rand(1.5, 2.5), 0.16, 0.95);
  }
  // barrel spit
  if (rider.tube.on && Math.random() < dt * 0.6) {
    for (let i = 0; i < 80; i++) {
      const s = rand(-1, 2), c = rand(COL.ceiling, COL.mid);
      spray.emit(fl.peelX + s, fl.y(s, c), fl.z(s, c), rand(12, 22), rand(-0.5, 1.5), rand(-1, 1), rand(0.3, 0.8), rand(0.6, 1.1), 0.7, 0.4);
    }
  }
}

// ------------------------------------------------------------------ surfer pose
const basis = new THREE.Matrix4();
const qBoard = new THREE.Quaternion();
const qRoll = new THREE.Quaternion();
function poseSurfer(dt) {
  const r = rider, st = surfer.state;
  surfer.root.position.copy(r.pos);
  if (r.state === 'air') {
    // keep take-off orientation, blend up-vector towards world up
    r.normal.lerp(tmp.set(0, 1, 0), Math.min(1, dt * 3)).normalize();
  }
  const up = r.normal;
  const fwd = tmp.copy(r.fwd);
  if (r.state === 'air') fwd.set(r.vel.x, 0, r.vel.z).normalize();
  fwd.addScaledVector(up, -fwd.dot(up)).normalize();
  const side = tmp2.copy(fwd).cross(up).normalize();
  basis.makeBasis(fwd, up, side);
  qBoard.setFromRotationMatrix(basis);
  qRoll.setFromAxisAngle(fwd, -r.lean * 0.45);
  surfer.root.quaternion.slerp(qRoll.multiply(qBoard), Math.min(1, dt * 14));

  r.revert *= Math.exp(-dt * 7);
  if (r.state === 'wipeout') {
    surfer.tilt.rotation.x += dt * 7;
    surfer.tilt.rotation.z += dt * 3;
  } else {
    surfer.tilt.rotation.set(0, r.airSpin + r.revert, 0);
  }
  st.prone = THREE.MathUtils.lerp(st.prone, r.state === 'paddle' ? 1 : 0, Math.min(1, dt * (r.state === 'paddle' ? 3 : 9)));
  st.paddle = r.paddlePhase;
  st.crouch = r.crouch;
  st.lean = r.lean;
  st.arms = r.state === 'air' ? 1 : Math.abs(r.lean) * 0.5;
  surfer.update(dt);
}

// ------------------------------------------------------------------ camera
function updateCamera(dt, t) {
  const r = rider, fl = field;
  let pos, look, rate = 4;
  if (mode === 'menu') {
    // view from the channel, above the lip: the breaking wave and the spot's coastline behind it
    const a = t * 0.06;
    pos = new THREE.Vector3(fl.peelX + 30 + Math.sin(a) * 10, 11 + fl.H0 * 1.6 + Math.sin(t * 0.11) * 0.5, -42 + Math.cos(a) * 5);
    look = new THREE.Vector3(fl.peelX - 4, 6, 120);
    rate = 1.5;
  } else if (r.state === 'paddle') {
    pos = new THREE.Vector3(r.pos.x - 6, r.pos.y + 2.2 + fl.H0 * 0.25, r.pos.z + 9 + fl.H0 * 1.2);
    look = new THREE.Vector3(r.pos.x + 2, r.pos.y + fl.H0 * 0.35, r.pos.z - 1);
    rate = 3;
  } else {
    const s = r.x - fl.peelX;
    const inTube = r.tube.on || (fl.curlAt(s) > 0.8 && s < spot.wave.barrelLen + 3);
    const dist = inTube ? 4.6 : r.state === 'air' ? 7.5 : 6;
    const h = inTube ? 0.7 : 1.9;
    const zo = inTube ? 0.9 : 2.6;
    const along = THREE.MathUtils.clamp(Math.cos(r.phi), -0.2, 1);
    pos = new THREE.Vector3(r.pos.x - dist * (0.55 + 0.45 * along), r.pos.y + h, r.pos.z + zo + (1 - along) * 2);
    if (r.state === 'wipeout') pos.x = camPos.x;
    // stay out of the collapsing section and above the water
    const sc = pos.x - fl.peelX;
    if (sc < -1) pos.x = Math.min(fl.peelX - 1, r.pos.x - 2.2);
    const ws = fl.frontSurfaceY(pos.x - fl.peelX, pos.z);
    if (ws !== null) pos.y = Math.max(pos.y, ws + 0.7);
    look = new THREE.Vector3(r.pos.x + 5, r.pos.y + (inTube ? 0.7 : 0.4), r.pos.z - 0.3);
    rate = inTube ? 6 : 4.5;
  }
  const k = snapCam ? 1 : 1 - Math.exp(-dt * rate);
  snapCam = false;
  camPos.lerp(pos, k);
  camLook.lerp(look, k);
  if (debugCam) { camPos.copy(debugCam[0]); camLook.copy(debugCam[1]); }
  toWorld(camPos, camera.position);
  camera.lookAt(toWorld(camLook, tmp));
}

// ------------------------------------------------------------------ HUD
const feedEl = $('feed');
function feed(name, pts, kind) {
  const el = document.createElement('div');
  el.className = `feed-item kind-${kind}`;
  el.innerHTML = `<span class="feed-name"></span><span class="feed-pts"></span>`;
  el.firstChild.textContent = name;
  el.lastChild.textContent = pts;
  feedEl.prepend(el);
  setTimeout(() => el.classList.add('out'), 2200);
  setTimeout(() => el.remove(), 2800);
  while (feedEl.children.length > 4) feedEl.lastChild.remove();
}
let flashTimer = 0;
function flash(text, tone = 'good') {
  const el = $('flash');
  el.textContent = text;
  el.className = `flash tone-${tone} show`;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classList.remove('show'), 1800);
}
function prompt(title, sub, meter, hot = false) {
  $('prompt').hidden = false;
  $('prompt-title').textContent = title;
  $('prompt-sub').textContent = sub;
  $('prompt').classList.toggle('hot', hot);
  $('meter-fill').style.transform = `scaleX(${meter})`;
}
function hidePrompt() { $('prompt').hidden = true; }

const fmt = (n) => n.toFixed(2).replace('.', ',');
function waveScore(total) { return Math.min(10, 10 * (1 - Math.exp(-total / spot.score.k))); }

function updateHUD() {
  const r = rider;
  $('timer').textContent = `0:${String(Math.max(0, Math.ceil(timeLeft))).padStart(2, '0')}`;
  $('timer').classList.toggle('low', timeLeft < 10);
  $('pts').textContent = fmt(r.total);
  $('wscore').textContent = fmt(waveScore(r.total));
  $('speed').textContent = `${Math.round(r.state === 'air' ? r.vel.length() * 3.6 : r.v * 3.6)} km/h`;
  if (r.state === 'paddle' && !r.ready) prompt('PADDELN', '↑ wiederholt drücken, bis die Welle dich nimmt', r.meter);
  if (r.tube.on) {
    $('tube-time').textContent = `${r.tube.t.toFixed(1).replace('.', ',')} s`;
    $('tube-depth').style.transform = `scaleX(${r.tube.depth.toFixed(3)})`;
  }
  // position relative to the breaking peel
  const s = r.x - field.peelX;
  const pct = Math.min(1, Math.max(0, (s + 4) / 44));
  $('peel-dot').style.left = `${(pct * 100).toFixed(1)}%`;
  const zone = Math.min(1, (spot.wave.barrelLen + 4) / 44);
  $('peel-zone').style.width = `${(zone * 100).toFixed(1)}%`;
}

// ------------------------------------------------------------------ menu / flow
function buildMenu() {
  const list = $('spot-list');
  list.innerHTML = '';
  SPOTS.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'spot';
    b.type = 'button';
    b.id = `spot-${s.id}`;
    const best = store.get(`surf.best.${s.id}`, null);
    b.innerHTML = `
      <span class="spot-name"></span>
      <span class="spot-meta"><span class="spot-place"></span></span>
      <span class="spot-tags">${s.focus.map((f) => `<span class="tag tag-${f}">${f === 'tube' ? 'Tube' : f === 'turn' ? 'Turns' : 'Airs'}</span>`).join('')}
      <span class="tag tag-dir">${s.dir > 0 ? 'Linke' : 'Rechte'}</span></span>
      <span class="spot-best">${best !== null ? `Bestwert ${fmt(best)}` : ''}</span>`;
    b.querySelector('.spot-name').textContent = s.name;
    b.querySelector('.spot-place').textContent = s.place;
    b.addEventListener('click', () => selectSpot(i));
    b.addEventListener('dblclick', () => { selectSpot(i); startRun(); });
    list.appendChild(b);
  });
}

function selectSpot(i) {
  selected = (i + SPOTS.length) % SPOTS.length;
  document.querySelectorAll('.spot').forEach((el, k) => el.classList.toggle('active', k === selected));
  const s = SPOTS[selected];
  $('detail-name').textContent = s.name;
  $('detail-blurb').textContent = s.blurb;
  const ft = Math.round(s.wave.height * 3.28 * 0.8);
  $('detail-stats').innerHTML = '';
  [['Welle', `${ft}–${ft + 2} ft`], ['Richtung', s.dir > 0 ? 'Links' : 'Rechts'], ['Fokus', s.focus.map((f) => ({ tube: 'Tube-Riding', turn: 'Turns', air: 'Airs' }[f])).join(' + ')]].forEach(([k, v]) => {
    const d = document.createElement('div');
    d.innerHTML = '<dt></dt><dd></dd>';
    d.firstChild.textContent = k; d.lastChild.textContent = v;
    $('detail-stats').appendChild(d);
  });
  if (s !== spot) loadSpot(s);
  store.set('surf.spot', selected);
  snapCam = true;
}

function startRun() {
  audio.init();
  if (spot !== SPOTS[selected]) loadSpot(SPOTS[selected]);
  rider = new Rider(field, spot, onEvent);
  spray.clear();
  timeLeft = RUN_SECONDS;
  elapsed = 0;
  surgeSeed = Math.random() * 100;
  mode = 'run';
  $('menu').hidden = true;
  $('results').hidden = true;
  $('pause').hidden = true;
  $('hud').hidden = false;
  $('tube').hidden = true;
  $('hud-spot').textContent = spot.name;
  $('hud-focus').textContent = spot.focus.map((f) => ({ tube: 'Tube-Riding', turn: 'Turns', air: 'Airs' }[f])).join(' · ');
  feedEl.innerHTML = '';
  input.clear();
  rider.place();
  camPos.set(rider.pos.x - 9, rider.pos.y + 3, rider.pos.z + 8);
  camLook.copy(rider.pos);
}

function endRun() {
  mode = 'results';
  if (rider.tube.on) rider.endTube(true);
  if (rider.turn) rider.finishTurn();
  hidePrompt();
  $('hud').hidden = true;
  const score = waveScore(rider.total);
  const key = `surf.best.${spot.id}`;
  const best = store.get(key, null);
  const isBest = best === null || score > best;
  if (isBest) store.set(key, score);
  $('res-spot').textContent = spot.name;
  $('res-score').textContent = fmt(score);
  $('res-pts').textContent = `${fmt(rider.total)} Punkte`;
  $('res-best').textContent = isBest ? 'Neuer Bestwert' : `Bestwert ${fmt(best)}`;
  const byKind = { tube: 0, turn: 0, air: 0 };
  rider.tricks.forEach((t) => { byKind[t.kind] += t.points; });
  $('res-break').innerHTML = '';
  [['Tube', byKind.tube], ['Turns', byKind.turn], ['Airs', byKind.air]].forEach(([k, v]) => {
    const d = document.createElement('div');
    d.innerHTML = '<dt></dt><dd></dd>';
    d.firstChild.textContent = k; d.lastChild.textContent = fmt(v);
    $('res-break').appendChild(d);
  });
  const top = [...rider.tricks].sort((a, b) => b.points - a.points).slice(0, 6);
  $('res-tricks').innerHTML = top.length ? '' : '<li class="empty">Keine gewerteten Manöver</li>';
  top.forEach((t) => {
    const li = document.createElement('li');
    li.innerHTML = '<span></span><span></span>';
    li.firstChild.textContent = t.name;
    li.lastChild.textContent = fmt(t.points);
    $('res-tricks').appendChild(li);
  });
  $('results').hidden = false;
  buildMenu();
  selectSpot(selected);
}

function toMenu() {
  mode = 'menu';
  $('results').hidden = true;
  $('pause').hidden = true;
  $('hud').hidden = true;
  $('menu').hidden = false;
  rider = new Rider(field, spot, onEvent);
  snapCam = true;
}

function togglePause() {
  if (mode === 'run') { mode = 'paused'; $('pause').hidden = false; }
  else if (mode === 'paused') { mode = 'run'; $('pause').hidden = true; input.clear(); }
}

$('start').addEventListener('click', startRun);
$('again').addEventListener('click', startRun);
$('to-menu').addEventListener('click', toMenu);
$('resume').addEventListener('click', togglePause);
$('quit').addEventListener('click', toMenu);
$('pause-btn').addEventListener('click', togglePause);
$('quality').addEventListener('click', () => {
  quality = quality === 'high' ? 'low' : 'high';
  store.set('surf.quality', quality);
  $('quality').textContent = quality === 'high' ? 'Grafik: Hoch' : 'Grafik: Schnell';
  resize();
});
$('sound').addEventListener('click', () => {
  audio.init();
  $('sound').textContent = audio.toggle() ? 'Ton: Aus' : 'Ton: An';
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  if (mode === 'menu') {
    if (e.code === 'ArrowDown') selectSpot(selected + 1);
    if (e.code === 'ArrowUp') selectSpot(selected - 1);
    if (e.code === 'Enter') startRun();
  } else if (mode === 'results' && e.code === 'Enter') startRun();
});
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
let t = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 30);
  tick(dt, input.poll(), true);
}

function tick(dt, inp, render) {
  t += dt;

  if (mode === 'run') {
    timeLeft -= dt;
    elapsed += dt;
    rider.update(dt, inp);
    if (rider.state !== 'paddle') field.peelX += spot.wave.peel * peelSurge(elapsed) * dt;
    if (timeLeft <= 0) endRun();
  } else if (mode === 'menu') {
    field.hScale = 1;
    field.peelX = 0;
    rider.x = field.peelX + 6;
    rider.j = COL.trough - 12;
    rider.state = 'paddle';
    rider.place();
  }

  const r = rider;
  const centerX = mode === 'menu' ? field.peelX + 40 : r.x + 60;
  water.update(t, centerX, field.peelX, field.hScale);
  if (mode !== 'paused') {
    ambientSpray(dt);
    spray.update(dt);
    scenery?.animate?.(t);
  }
  surfer.root.visible = mode !== 'menu';
  if (mode !== 'paused') poseSurfer(dt);
  updateCamera(dt, t);

  // shadowless sun follows the camera so standard materials get consistent light
  sun.position.copy(camera.position).addScaledVector(sunDirWorld, 500);
  sun.target.position.copy(camera.position);

  if (mode === 'run') {
    updateHUD();
    const s = r.x - field.peelX;
    audio.update(Math.max(0, 1 - Math.abs(s) / 30), r.tube.on ? 1 : 0, r.state === 'ride' ? r.v : 0);
  } else audio.update(0.3, 0, 0);

  if (render) composer.render();
}

// ------------------------------------------------------------------ boot
$('quality').textContent = quality === 'high' ? 'Grafik: Hoch' : 'Grafik: Schnell';
window.addEventListener('resize', resize);
resize();
buildMenu();
selected = Math.min(SPOTS.length - 1, Math.max(0, store.get('surf.spot', 0) | 0));
loadSpot(SPOTS[selected]);
selectSpot(selected);
$('loading').hidden = true;
$('menu').hidden = false;
frame();

// handle for automated checks in the console
window.surfLab = {
  get rider() { return rider; }, get field() { return field; }, get mode() { return mode; }, water, selectSpot, startRun, SPOTS,
  // advance the simulation in fixed steps; inp(time) returns an input state
  // pin the camera (wave-local coordinates) for inspection; null to release
  cam(p, l) { debugCam = p ? [new THREE.Vector3(...p), new THREE.Vector3(...l)] : null; tick(0.001, input.poll(), true); },
  hideUI() { document.querySelectorAll('.overlay').forEach((o) => { o.style.visibility = 'hidden'; }); },
  sim(seconds, inp = () => ({})) {
    for (let k = 0; k < Math.round(seconds * 60); k++) {
      tick(1 / 60, { x: 0, up: false, down: false, jump: false, upPressed: false, jumpPressed: false, ...inp(k / 60) }, false);
    }
    composer.render();
  },
};
