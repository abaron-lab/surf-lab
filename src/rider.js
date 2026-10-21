// Surfer controller: paddling, pop-up, riding the face, airs, wipeouts and
// trick/score detection. Works in wave-local space (see wave.js).

import * as THREE from 'three';
import { COL } from './wave.js';

const GRAV = 9.81;
const AIR_GRAV = 12.5;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Rider {
  constructor(field, spot, emit) {
    this.field = field;
    this.spot = spot;
    this.emit = emit;           // (event) => void
    this.pos = new THREE.Vector3();
    this.normal = new THREE.Vector3(0, 1, 0);
    this.fwd = new THREE.Vector3(1, 0, 0);
    this.vel = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.state = 'paddle';
    this.x = 0;
    this.j = COL.trough - 12;
    this.phi = -1.15;
    this.v = 0;
    this.meter = 0;
    this.ready = false;
    this.readyT = 0;
    this.paddlePhase = 0;
    this.startS = this.spot.wave.curl > 0.9 ? 8 : this.spot.wave.barrelLen + 7;
    this.field.peelX = this.x - this.startS;
    this.field.hScale = 0.45;
    this.time = 0;
    this.steerSmooth = 0;
    this.lean = 0;
    this.crouch = 0.35;
    this.hop = 0; this.hopV = 0;
    this.airSpin = 0;
    this.revert = 0;
    this.wipeT = 0;
    this.tube = { on: false, t: 0, pts: 0, off: 0, depth: 0 };
    this.turn = null;
    this.counts = {};
    this.tricks = [];
    this.total = 0;
    this.lipHit = 0;
    this.cutDir = 0;
  }

  get heightFrac() {
    const f = this.field, s = this.x - f.peelX;
    const yT = f.y(s, COL.trough), yTop = f.y(s, f.faceTopAt(s));
    return clamp((this.pos.y - yT) / Math.max(0.5, yTop - yT), 0, 1);
  }

  award(name, points, kind) {
    const n = (this.counts[name] = (this.counts[name] || 0) + 1);
    const variety = Math.pow(0.78, n - 1);
    const mul = this.spot.score[kind];
    const p = Math.round(points * variety * mul * 100) / 100;
    this.total += p;
    this.tricks.push({ name, points: p, kind, t: this.time });
    this.emit({ type: 'trick', name, points: p, kind });
  }

  update(dt, input) {
    this.time += dt;
    switch (this.state) {
      case 'paddle': this.updatePaddle(dt, input); break;
      case 'ride': this.updateRide(dt, input); break;
      case 'air': this.updateAir(dt, input); break;
      case 'wipeout': this.updateWipeout(dt); break;
    }
  }

  // ---------------------------------------------------------------- paddle
  updatePaddle(dt, input) {
    const f = this.field;
    if (input.upPressed) this.meter += 0.13;
    if (input.up) this.meter += 0.32 * dt;
    if (!this.ready) this.meter = clamp(this.meter - 0.1 * dt, 0, 1);
    this.paddlePhase += dt * (3 + (input.up ? 6 : 0) + this.meter * 4);
    f.hScale = 0.45 + 0.55 * smooth(this.meter);

    if (!this.ready && this.meter >= 1) {
      this.ready = true; this.readyT = 0;
      this.emit({ type: 'ready' });
    }
    if (this.ready) {
      this.readyT += dt;
      f.hScale = 1;
      if (input.jumpPressed) { this.popUp(this.readyT < 0.9); return; }
      if (this.readyT > 2.6) {
        this.ready = false; this.meter = 0.25;
        this.emit({ type: 'message', text: 'Zu spät – die Welle läuft dir davon', tone: 'bad' });
      }
    } else if (input.jumpPressed) {
      this.meter = Math.max(0, this.meter - 0.15);
      this.emit({ type: 'message', text: 'Zu früh – weiter paddeln', tone: 'bad' });
    }
    // drift slightly up the face as the wave stands up
    this.j = COL.trough - 12 - this.meter * 8;
    f.peelX = this.x - this.startS;
    this.place();
  }

  popUp(perfect) {
    this.state = 'ride';
    this.phi = -0.75;
    this.v = perfect ? 11 : 9;
    this.crouch = 0.8;
    this.emit({ type: 'popup', perfect });
    if (perfect) this.award('Take-off', 1.0, 'turn');
  }

  // ---------------------------------------------------------------- ride
  updateRide(dt, input) {
    const f = this.field, sp = this.spot, w = sp.wave;
    let s = this.x - f.peelX;
    const top = f.faceTopAt(s);
    const [uz, uy, mpc] = f.upTangent(s, this.j);

    // steering: screen-left/right regardless of wave direction
    const steer = clamp(-input.x * sp.dir, -1, 1);
    this.steerSmooth += (steer - this.steerSmooth) * Math.min(1, dt * 10);
    const rate = 2.3 + 1.5 * (1 - clamp(this.v / 20, 0, 1));
    let dphi = this.steerSmooth * rate * dt;
    // beyond 90° it takes commitment to keep turning (cutback); released, the cutback completes itself
    const back = Math.cos(this.phi) < 0;
    if (back && !this.cutDir) this.cutDir = Math.sign(dphi) || Math.sign(this.phi) || 1;
    if (!back) this.cutDir = 0;
    if (back && Math.sign(dphi) === this.cutDir) dphi *= 0.6;
    if (back && Math.abs(this.steerSmooth) < 0.2) dphi += this.cutDir * 2.6 * dt;
    this.phi = wrap(this.phi + dphi);

    const sinP = Math.sin(this.phi), cosP = Math.cos(this.phi);
    const onFace = this.j < COL.trough - 3 ? 1 : 0.35;
    const hFac = clamp(f.heightAt(s) / f.H0, 0.4, 1.1);
    const drive = w.drive * onFace * hFac * (s < 0 ? 0.5 : 1);
    const kDrag = w.drive / (15.5 * 15.5);
    let a = drive - GRAV * uy * sinP - kDrag * this.v * this.v;
    if (input.up) a += 3.2;
    if (input.down) a -= 4.5 + 0.15 * this.v;
    a -= Math.abs(this.steerSmooth) * 0.6;
    this.v = clamp(this.v + a * dt, 2.5, 24);

    const vUp = this.v * sinP, vX = this.v * cosP;
    this.x += vX * dt;
    this.j -= (vUp * dt) / Math.max(0.05, mpc);

    // bottom: forced bottom turn
    if (this.j > COL.trough) {
      this.j = COL.trough;
      if (sinP < 0) this.phi = Math.atan2(-sinP * 0.35, cosP);
    }
    // top: lip bounce (re-entry) or ceiling of the barrel
    if (this.j < top) {
      this.j = top;
      if (sinP > 0) {
        const curl = f.curlAt(s);
        if (vUp > 4.2 && curl < 0.88) {
          this.phi = Math.atan2(-Math.abs(sinP) * 0.85, cosP);
          // only a deliberate turn off the lip scores; a passive bounce doesn't
          if (this.time - this.lipHit > 0.8 && Math.sign(this.steerSmooth) === -1 && Math.abs(this.steerSmooth) > 0.3) {
            this.award('Re-entry', 2.2 * clamp(vUp / 7, 0.6, 1.5), 'turn');
            if (this.turn) this.turn.reentry = true;
            this.emit({ type: 'spray', kind: 'lip', strength: vUp / 6 });
          }
          this.lipHit = this.time;
        } else {
          this.phi = Math.atan2(-sinP * 0.25, cosP);
          this.v *= 0.985;
        }
      }
    }

    this.place();
    s = this.x - f.peelX;

    // crouch & lean
    const inTubeZone = f.curlAt(s) > 0.8 && s < w.barrelLen + 4;
    const targetCrouch = inTubeZone ? 0.9 : (input.down ? 0.75 : 0.32 + Math.abs(this.steerSmooth) * 0.35);
    this.crouch += (targetCrouch - this.crouch) * Math.min(1, dt * 5);
    this.lean += (this.steerSmooth * clamp(this.v / 12, 0.3, 1.2) - this.lean) * Math.min(1, dt * 6);

    // ollie / air
    if (this.hop > 0 || this.hopV > 0) {
      this.hopV -= AIR_GRAV * dt; this.hop += this.hopV * dt;
      if (this.hop <= 0) { this.hop = 0; this.hopV = 0; }
    }
    if (input.jumpPressed && this.hop === 0) {
      const curl = f.curlAt(s);
      if (this.heightFrac > 0.5 && vUp > 1.6 && curl < 0.88) this.launch(uz, uy, vX, vUp);
      else this.hopV = 3.3;
      if (this.state === 'air') return;
    }

    this.trackTube(dt, s);
    this.trackTurn(dt, dphi);

    // carve spray
    const carve = Math.abs(this.steerSmooth) * this.v;
    if (carve > 5) this.emit({ type: 'spray', kind: 'carve', strength: carve / 12 });

    // caught by the whitewater: barrels close on you, open faces let you fight the foam a little
    const limit = w.curl > 0.9 ? -3.2 : -6;
    if (s < -1.5) this.v *= 1 - 0.5 * dt;
    if (s < limit) this.wipeout('Vom Weißwasser erwischt');
  }

  trackTube(dt, s) {
    const f = this.field, w = this.spot.wave, t = this.tube;
    const covered = f.curlAt(s) >= 0.8 && s > -3.2 && s < w.barrelLen + 3 &&
      this.pos.y + 1.3 < f.y(s, COL.ceiling) && f.z(s, COL.tip) > this.pos.z + 0.3;
    if (covered) {
      if (!t.on) { t.on = true; t.t = 0; t.pts = 0; this.emit({ type: 'tubeStart' }); }
      t.off = 0;
      t.depth = 1 - clamp(s / Math.max(4, w.barrelLen), 0, 1);
      t.t += dt;
      t.pts += dt * (1 + t.depth * 1.6);
    } else if (t.on) {
      t.off += dt;
      if (t.off > 0.3) this.endTube(true);
    }
  }

  endTube(clean) {
    const t = this.tube;
    if (!t.on) return;
    t.on = false;
    if (clean && t.t > 0.4) {
      const secs = t.t.toFixed(1).replace('.', ',');
      const depth = t.pts / t.t - 1;   // average depth 0..1.6
      this.award(`Barrel ${secs}s`, 0.8 + Math.pow(t.t, 0.8) * (1 + depth) * 0.9, 'tube');
    } else if (!clean && t.t > 0.4) {
      this.emit({ type: 'message', text: `Tube ${t.t.toFixed(1).replace('.', ',')}s – nicht rausgekommen`, tone: 'bad' });
    }
    this.emit({ type: 'tubeEnd' });
    t.t = 0; t.pts = 0;
  }

  trackTurn(dt, dphi) {
    const active = Math.abs(this.steerSmooth) > 0.3;
    const hf = this.heightFrac;
    if (active && this.turn && Math.sign(this.steerSmooth) !== this.turn.dir) this.finishTurn();
    if (active) {
      if (!this.turn) {
        this.turn = { dir: Math.sign(this.steerSmooth), accum: 0, t0: this.time, idle: 0, startUp: Math.sin(this.phi) > 0, maxH: hf, minH: hf, back: false, vSum: 0, n: 0, reentry: false };
      }
      const tr = this.turn;
      tr.accum += Math.abs(dphi);
      tr.idle = 0;
      tr.maxH = Math.max(tr.maxH, hf); tr.minH = Math.min(tr.minH, hf);
      if (Math.cos(this.phi) < -0.2) tr.back = true;
      tr.vSum += this.v; tr.n++;
    } else if (this.turn) {
      this.turn.idle += dt;
      if (this.turn.idle > 0.22) this.finishTurn();
    }
  }

  finishTurn() {
    const tr = this.turn;
    this.turn = null;
    if (!tr || tr.accum < 1.15) return;
    const endUp = Math.sin(this.phi) > 0;
    const dur = this.time - tr.t0;
    const vAvg = tr.vSum / Math.max(1, tr.n);
    let name, base;
    if (tr.back && Math.cos(this.phi) > 0) {
      name = tr.accum > 4.4 ? 'Roundhouse Cutback' : 'Cutback'; base = tr.accum > 4.4 ? 3.6 : 2.8;
    } else if (tr.startUp && !endUp && tr.maxH > 0.62) {
      if (tr.reentry) return;
      name = dur < 0.8 ? 'Snap' : 'Top Turn'; base = dur < 0.8 ? 2.7 : 2.0;
    } else if (!tr.startUp && endUp && tr.minH < 0.4) {
      name = 'Bottom Turn'; base = 0.8;
    } else {
      name = 'Carve'; base = 1.4;
    }
    const pts = base * clamp(tr.accum / 1.6, 0.7, 2.2) * clamp(vAvg / 13, 0.5, 1.4) * (0.7 + tr.maxH * 0.5);
    this.award(name, pts, 'turn');
  }

  // ---------------------------------------------------------------- air
  launch(uz, uy, vX, vUp) {
    this.state = 'air';
    this.vel.set(vX, Math.min(vUp * uy, 4.6) + 3.0, Math.max(vUp * uz, 0.6));
    this.airSpin = 0;
    this.airStartY = this.pos.y;
    this.airMaxY = this.pos.y;
    this.airT = 0;
    if (this.turn) this.finishTurn();
    this.emit({ type: 'spray', kind: 'lip', strength: 1.2 });
    this.emit({ type: 'launch' });
  }

  updateAir(dt, input) {
    const f = this.field, sp = this.spot;
    this.airT += dt;
    this.vel.y -= AIR_GRAV * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.x = this.pos.x;
    this.airMaxY = Math.max(this.airMaxY, this.pos.y);
    const spin = clamp(-input.x * sp.dir, -1, 1);
    this.airSpin += spin * 5.6 * dt;
    this.crouch += (0.7 - this.crouch) * Math.min(1, dt * 4);
    this.trackTube(dt, this.x - f.peelX);

    const s = this.x - f.peelX;
    if (this.vel.y < 0) {
      const jc = f.nearestCol(s, this.pos.z, this.pos.y);
      const qz = f.z(s, jc), qy = f.y(s, jc);
      const [uz, uy] = f.upTangent(s, jc);
      // profile normal pointing out of the water: rotate up-tangent
      const nz = uy, ny = -uz;
      const d = (this.pos.z - qz) * nz + (this.pos.y - qy) * ny;
      if (d <= 0.05 || this.pos.y < f.y(s, COL.trough) - 0.5) this.land(jc, uz, uy);
    }
  }

  land(jc, uz, uy) {
    const deg = Math.abs(this.airSpin) * 180 / Math.PI;
    const k = Math.round(deg / 180);
    const off = Math.abs(deg - k * 180);
    const f = this.field;
    this.j = Math.max(jc, f.faceTopAt(this.x - f.peelX));
    if (off > 42) { this.wipeout('Landung verpatzt'); return; }
    const vUp = this.vel.y * uy + this.vel.z * uz;
    this.phi = Math.atan2(Math.min(vUp, 0) * 0.6, this.vel.x);
    this.v = clamp(Math.hypot(this.vel.x, vUp) * 0.85, 8, 20);
    this.state = 'ride';
    // board yaw at touchdown; reverses spin back to forward afterwards
    this.revert = wrap(this.airSpin);
    this.airSpin = 0;
    const names = ['Air', 'Air Reverse', 'Full Rotation', '540 Air', '720 Air'];
    const height = this.airMaxY - this.airStartY;
    const pts = (1.6 + height * 0.7 + k * 1.8 + this.airT * 0.6) * (off < 20 ? 1 : 0.7);
    this.award(names[Math.min(k, 4)], pts, 'air');
    this.emit({ type: 'spray', kind: 'land', strength: 1.3 });
    this.place();
  }

  // ---------------------------------------------------------------- wipeout
  wipeout(reason) {
    if (this.state === 'wipeout') return;
    if (this.tube.on) this.endTube(false);
    this.turn = null;
    this.state = 'wipeout';
    this.wipeT = 0;
    this.emit({ type: 'wipeout', reason });
    this.emit({ type: 'spray', kind: 'wipe', strength: 2 });
  }

  updateWipeout(dt) {
    const f = this.field;
    this.wipeT += dt;
    this.x += Math.max(0, f.spot.wave.peel * 0.6) * dt;
    this.pos.x = this.x;
    this.pos.y += (-0.6 - this.pos.y) * Math.min(1, dt * 3);
    if (this.wipeT > 2.3) {
      // back on a fresh section ahead of the peel
      this.x = f.peelX + Math.min(10, f.spot.wave.barrelLen * 0.6 + 4);
      const s = this.x - f.peelX;
      this.j = Math.max(f.faceTopAt(s) + 10, COL.mid + 4);
      this.phi = -0.2;
      this.v = 11;
      this.airSpin = 0;
      this.revert = 0;
      this.state = 'ride';
      this.emit({ type: 'respawn' });
      this.place();
    }
  }

  // Position and orientation on the wave surface.
  place() {
    const f = this.field;
    const s = this.x - f.peelX;
    this.pos.set(this.x, f.y(s, this.j) + this.hop, f.z(s, this.j));
    f.normal(s, this.j, this.normal);
    const [uz, uy] = f.upTangent(s, this.j);
    const X = new THREE.Vector3(1, f.y(s + 0.5, this.j) - f.y(s - 0.5, this.j), f.z(s + 0.5, this.j) - f.z(s - 0.5, this.j)).normalize();
    const U = new THREE.Vector3(0, uy, uz);
    this.fwd.copy(X).multiplyScalar(Math.cos(this.phi)).addScaledVector(U, Math.sin(this.phi)).normalize();
  }
}
