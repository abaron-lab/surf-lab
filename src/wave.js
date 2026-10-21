// Breaking-wave model.
//
// The wave is described in its own frame: x runs along the crest (the surfer
// rides towards +x), z points towards the shore, y is up. The cross-section of
// the wave at any x is a closed-loop-capable curve (it can curl over to form a
// barrel). Its shape depends only on s = x - peelX, the distance ahead of the
// point where the lip is currently hitting the flat water. Because of that the
// whole wave is precomputed once per spot into a table (rows = s, columns =
// position along the profile curve). The same table drives the GPU mesh (as a
// float texture) and the surfer physics, so what you see is what you ride.

import * as THREE from 'three';

export const SUB = 10;                 // samples per control-point segment
const NPTS = 16;
export const COLS = (NPTS - 1) * SUB + 1;
export const COL = {
  crest: 4 * SUB,
  tip: 7 * SUB,
  ceiling: 9 * SUB,
  upper: 10 * SUB,
  mid: 11 * SUB,
  low: 12 * SUB,
  trough: 13 * SUB,
};

export const S_MIN = -70;
export const S_MAX = 340;
export const DS = 0.5;
export const ROWS = Math.round((S_MAX - S_MIN) / DS) + 1;

const BACK_Z = -70;
const FRONT_Z = 95;

// Control points in units of wave height H: [z, y].
// 0 back far | 1-3 back slope | 4 crest | 5-6 outer lip | 7 lip tip |
// 8 inner lip | 9 ceiling | 10 upper face | 11 mid face | 12 low face |
// 13 trough | 14 front | 15 front far
const SWELL = [
  [0, 0], [-5, 0.12], [-2.2, 0.55], [-0.9, 0.92], [0, 1], [0.5, 0.96], [0.95, 0.87],
  [1.3, 0.77], [1.6, 0.67], [1.9, 0.57], [2.2, 0.47], [2.7, 0.32], [3.6, 0.13],
  [5, 0], [8, 0], [0, 0],
];
const STEEP = [
  [0, 0], [-4.5, 0.15], [-1.8, 0.66], [-0.7, 0.95], [0, 1.02], [0.22, 1.0], [0.38, 0.95],
  [0.46, 0.88], [0.48, 0.8], [0.47, 0.7], [0.45, 0.58], [0.55, 0.35], [0.9, 0.13],
  [1.8, -0.03], [4.5, 0], [0, 0],
];
const BARREL = [
  [0, 0], [-4.5, 0.15], [-1.8, 0.68], [-0.6, 0.98], [0.25, 1.06], [0.85, 1.02], [1.28, 0.74],
  [1.45, 0.2], [1.22, 0.38], [0.85, 0.84], [0.32, 0.8], [0.27, 0.44], [0.45, 0.1],
  [1.5, -0.08], [4.5, 0], [0, 0],
];
const BROKEN = [
  [0, 0], [-4.5, 0.1], [-1.8, 0.4], [-0.6, 0.58], [0.2, 0.62], [0.6, 0.6], [0.9, 0.54],
  [1.1, 0.46], [1.25, 0.39], [1.38, 0.33], [1.5, 0.27], [1.68, 0.2], [2.0, 0.11],
  [2.7, 0.02], [5, 0], [0, 0],
];

const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

function lerpPts(A, B, t, out) {
  for (let i = 0; i < NPTS; i++) {
    out[i][0] = lerp(A[i][0], B[i][0], t);
    out[i][1] = lerp(A[i][1], B[i][1], t);
  }
  return out;
}

// Centripetal Catmull-Rom between p1 and p2.
function catmull(p0, p1, p2, p3, t, out) {
  const d = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]) + 1e-6, 0.5);
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const tt = lerp(t1, t2, t);
  for (let k = 0; k < 2; k++) {
    const a1 = ((t1 - tt) * p0[k] + (tt - t0) * p1[k]) / (t1 - t0);
    const a2 = ((t2 - tt) * p1[k] + (tt - t1) * p2[k]) / (t2 - t1);
    const a3 = ((t3 - tt) * p2[k] + (tt - t2) * p3[k]) / (t3 - t2);
    const b1 = ((t2 - tt) * a1 + (tt - t0) * a2) / (t2 - t0);
    const b2 = ((t3 - tt) * a2 + (tt - t1) * a3) / (t3 - t1);
    out[k] = ((t2 - tt) * b1 + (tt - t1) * b2) / (t2 - t1);
  }
  return out;
}

export class WaveField {
  constructor(spot) {
    this.spot = spot;
    this.H0 = spot.wave.height;
    this.peelX = 0;
    this.hScale = 1;
    this.data = new Float32Array(ROWS * COLS * 4);
    this.faceTop = new Float32Array(ROWS);
    this.curlRow = new Float32Array(ROWS);
    this.heightRow = new Float32Array(ROWS);
    this._build();
    this.texture = new THREE.DataTexture(this.data, COLS, ROWS, THREE.RGBAFormat, THREE.FloatType);
    this.texture.minFilter = this.texture.magFilter = THREE.NearestFilter;
    this.texture.needsUpdate = true;
  }

  // Shape parameters at distance s ahead of the peel.
  shape(s) {
    const w = this.spot.wave;
    const bl = w.barrelLen;
    let curl;
    if (s < bl) curl = w.curl;
    else if (s < bl + 22) curl = lerp(w.curl, Math.min(w.curl, 0.5), smooth((s - bl) / 22));
    else curl = lerp(Math.min(w.curl, 0.5), 0.18, smooth((s - bl - 22) / 140));
    const collapse = s < 0 ? smooth(-s / 16) : 0;
    let H = this.H0;
    if (s > 150) H *= lerp(1, 0.45, smooth((s - 150) / 190));
    H *= 1 - 0.42 * collapse;
    return { curl, collapse, H };
  }

  _build() {
    const w = this.spot.wave;
    const barrel = BARREL.map((p) => p.slice());
    // Spot character: thick lips and waves that suck below sea level.
    barrel[8][1] -= (w.thick - 1) * 0.16;
    barrel[9][1] -= (w.thick - 1) * 0.1;
    barrel[13][1] -= w.suck;
    barrel[12][1] -= w.suck * 0.4;
    barrel[7][0] += (w.thick - 1) * 0.15;

    const P = Array.from({ length: NPTS }, () => [0, 0]);
    const Q = Array.from({ length: NPTS }, () => [0, 0]);
    const tmp = [0, 0];
    const ext = (a, b) => [2 * a[0] - b[0], 2 * a[1] - b[1]];

    for (let r = 0; r < ROWS; r++) {
      const s = S_MIN + r * DS;
      const { curl, collapse, H } = this.shape(s);
      if (curl <= 0.5) lerpPts(SWELL, STEEP, smooth(curl / 0.5), P);
      else lerpPts(STEEP, barrel, smooth((curl - 0.5) / 0.5), P);
      if (collapse > 0) lerpPts(P, BROKEN, collapse, P);
      for (let i = 0; i < NPTS; i++) { Q[i][0] = P[i][0] * H; Q[i][1] = P[i][1] * H; }
      Q[0][0] = BACK_Z; Q[0][1] = 0;
      Q[NPTS - 1][0] = FRONT_Z; Q[NPTS - 1][1] = 0;

      this.curlRow[r] = collapse > 0.3 ? 0 : curl;
      this.heightRow[r] = H;

      const base = r * COLS * 4;
      for (let i = 0; i < NPTS - 1; i++) {
        const p0 = i === 0 ? ext(Q[0], Q[1]) : Q[i - 1];
        const p3 = i === NPTS - 2 ? ext(Q[NPTS - 1], Q[NPTS - 2]) : Q[i + 2];
        const steps = i === NPTS - 2 ? SUB + 1 : SUB;
        for (let k = 0; k < steps; k++) {
          catmull(p0, Q[i], Q[i + 1], p3, k / SUB, tmp);
          const c = i * SUB + k;
          const o = base + c * 4;
          this.data[o] = tmp[0];
          this.data[o + 1] = tmp[1];
          this.data[o + 2] = foamAt(s, c, curl, collapse);
          this.data[o + 3] = transAt(c, curl, collapse);
        }
      }

      // Highest rideable column: walk up from the trough until the surface overhangs.
      let top = COL.crest;
      for (let c = COL.trough; c > COL.crest; c--) {
        const tz = this.data[base + (c + 1) * 4] - this.data[base + (c - 1) * 4];
        const ty = this.data[base + (c + 1) * 4 + 1] - this.data[base + (c - 1) * 4 + 1];
        if (tz / (Math.hypot(tz, ty) + 1e-6) < -0.25) { top = c + 2; break; }
      }
      this.faceTop[r] = top;
    }
  }

  rowOf(s) {
    return Math.min(ROWS - 1.001, Math.max(0, (s - S_MIN) / DS));
  }

  // Bilinear lookup of channel k at (s, col).
  get(s, col, k) {
    const r = this.rowOf(s);
    const r0 = Math.floor(r), fr = r - r0;
    const c = Math.min(COLS - 1.001, Math.max(0, col));
    const c0 = Math.floor(c), fc = c - c0;
    const d = this.data;
    const i00 = (r0 * COLS + c0) * 4 + k, i01 = i00 + 4;
    const i10 = i00 + COLS * 4, i11 = i10 + 4;
    return lerp(lerp(d[i00], d[i01], fc), lerp(d[i10], d[i11], fc), fr);
  }

  z(s, col) { return this.get(s, col, 0); }
  y(s, col) { return this.get(s, col, 1) * this.hScale; }
  faceTopAt(s) { const r = this.rowOf(s); return lerp(this.faceTop[Math.floor(r)], this.faceTop[Math.ceil(r)], r % 1); }
  curlAt(s) { return this.curlRow[Math.round(this.rowOf(s))]; }
  heightAt(s) { return this.heightRow[Math.round(this.rowOf(s))] * this.hScale; }

  // Unit tangent pointing up the face (towards smaller column index), as [dz, dy].
  upTangent(s, col) {
    const a = Math.max(0, col - 1), b = Math.min(COLS - 1, col + 1);
    const dz = this.z(s, a) - this.z(s, b);
    const dy = this.y(s, a) - this.y(s, b);
    const len = Math.hypot(dz, dy) + 1e-6;
    return [dz / len, dy / len, len / (b - a)]; // last entry: metres per column
  }

  // Surface normal at (s, col) in wave-local space.
  normal(s, col, out) {
    const a = Math.max(0, col - 1), b = Math.min(COLS - 1, col + 1);
    const tz = this.z(s, b) - this.z(s, a), ty = this.y(s, b) - this.y(s, a);
    const xz = (this.z(s + 0.5, col) - this.z(s - 0.5, col));
    const xy = (this.y(s + 0.5, col) - this.y(s - 0.5, col));
    // N = T x X with T = (0, ty, tz), X = (1, xy, xz)
    out.set(ty * xz - tz * xy, tz, -ty).normalize();
    return out;
  }

  // Nearest point of the rideable part of the profile to (z, y). Returns column.
  nearestCol(s, z, y, from = COL.crest - 6, to = COL.trough + 8) {
    let best = from, bd = Infinity;
    for (let c = from; c <= to; c++) {
      const dz = this.z(s, c) - z, dy = this.y(s, c) - y;
      const d = dz * dz + dy * dy;
      if (d < bd) { bd = d; best = c; }
    }
    // refine between neighbours
    let lo = Math.max(from, best - 1), hi = Math.min(to, best + 1);
    for (let i = 0; i < 6; i++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      const d1 = (this.z(s, m1) - z) ** 2 + (this.y(s, m1) - y) ** 2;
      const d2 = (this.z(s, m2) - z) ** 2 + (this.y(s, m2) - y) ** 2;
      if (d1 < d2) hi = m2; else lo = m1;
    }
    return (lo + hi) / 2;
  }

  // Height of the water surface in front of the face at (s, z), or null when z is
  // inside/behind the face. Used to keep the camera out of the water.
  frontSurfaceY(s, z) {
    for (let c = COL.trough + 10; c >= COL.crest; c--) {
      const z0 = this.z(s, c), z1 = this.z(s, c + 1);
      if (z >= Math.min(z0, z1) && z <= Math.max(z0, z1)) {
        const t = (z - z0) / ((z1 - z0) || 1e-6);
        return lerp(this.y(s, c), this.y(s, c + 1), t);
      }
    }
    return null;
  }
}

function foamAt(s, c, curl, collapse) {
  let f = 0;
  // whitewater behind the peel
  if (s < 0) {
    const k = smooth((-s - 0.5) / 6);
    const onWave = smooth((c - 6) / 6) * (1 - smooth((c - COL.trough - 2) / 12));
    f = Math.max(f, k * onWave);
    // foam lines left on the flat water in front
    if (c > COL.trough) f = Math.max(f, 0.35 * smooth(-s / 30));
  }
  // feathering lip
  const lipBand = smooth((c - COL.crest + 4) / 4) * (1 - smooth((c - COL.tip - 2) / 4));
  const lip = curl > 0.6 ? smooth((curl - 0.6) / 0.4) * 0.35 : 0;
  f = Math.max(f, lipBand * lip * (s < 8 ? 1 : 0.4));
  // impact zone where the lip lands
  const imp = smooth((s + 3) / 2) * (1 - smooth((s - 1) / 3));
  const impBand = smooth((c - COL.tip + 6) / 4) * (1 - smooth((c - COL.trough - 4) / 4));
  f = Math.max(f, 0.7 * imp * impBand * smooth((curl - 0.5) / 0.3));
  return f;
}

function transAt(c, curl, collapse) {
  const lipAmt = lerp(0.3, 1, smooth((curl - 0.3) / 0.6));
  const w = smooth((c - COL.crest + 10) / 10) * (1 - smooth((c - COL.upper) / (COL.mid + 6 - COL.upper)));
  return lipAmt * w * (1 - smooth(collapse * 2));
}
