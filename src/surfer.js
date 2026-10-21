// Articulated surfer + surfboard built from primitives. Limbs are posed every
// frame with simple two-bone IK so the rider can crouch, lean, paddle and
// tumble. Local axes of the rig: +x = board nose, +y = up, +z = surfer's chest
// side (the side the rider faces when standing).

import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

function boardGeometry(length = 1.85, width = 0.5, thick = 0.065) {
  const s = new THREE.Shape();
  const L = length / 2, W = width / 2;
  // outline: pointed nose (+x), squash tail (-x)
  s.moveTo(L, 0);
  s.bezierCurveTo(L * 0.7, W * 0.55, L * 0.25, W * 1.02, -L * 0.15, W);
  s.bezierCurveTo(-L * 0.6, W * 0.95, -L * 0.92, W * 0.7, -L, W * 0.38);
  s.lineTo(-L, -W * 0.38);
  s.bezierCurveTo(-L * 0.92, -W * 0.7, -L * 0.6, -W * 0.95, -L * 0.15, -W);
  s.bezierCurveTo(L * 0.25, -W * 1.02, L * 0.7, -W * 0.55, L, 0);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: thick * 0.4, bevelEnabled: true, bevelThickness: thick * 0.3, bevelSize: 0.02,
    bevelSegments: 4, curveSegments: 24,
  });
  g.rotateX(-Math.PI / 2);
  // rocker: lift nose and tail
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / L;
    p.setY(i, p.getY(i) + 0.11 * Math.pow(Math.max(0, x), 2.2) + 0.05 * Math.pow(Math.max(0, -x), 2.5));
  }
  g.computeVertexNormals();
  return g;
}

function limb(radius, length, mat) {
  const g = new THREE.CapsuleGeometry(radius, length, 4, 10);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.userData.len = length;
  return m;
}

// Place a capsule so it spans from a to b (rig space).
function span(mesh, a, b) {
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  tmpV.copy(b).sub(a);
  const len = tmpV.length();
  tmpQ.setFromUnitVectors(UP, tmpV.normalize());
  mesh.quaternion.copy(tmpQ);
  const base = mesh.userData.len + mesh.geometry.parameters.radius * 2;
  mesh.scale.set(1, (len + mesh.geometry.parameters.radius * 2) / base, 1);
}

// Two-bone IK: knee/elbow position given root, target, bone lengths and bend hint.
function ik(root, target, l1, l2, hint, out) {
  const d = tmpV.copy(target).sub(root);
  let dist = d.length();
  dist = Math.min(dist, (l1 + l2) * 0.999);
  const dir = d.normalize();
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const side = hint.clone().sub(dir.clone().multiplyScalar(hint.dot(dir))).normalize();
  return out.copy(root).addScaledVector(dir, a).addScaledVector(side, h);
}

export function createSurfer(colors = {}) {
  const suit = new THREE.MeshStandardMaterial({ color: colors.suit ?? 0x15181d, roughness: 0.55, metalness: 0.0 });
  const accent = new THREE.MeshStandardMaterial({ color: colors.accent ?? 0xf2c14e, roughness: 0.5 });
  const skin = new THREE.MeshStandardMaterial({ color: colors.skin ?? 0xc68a5e, roughness: 0.6 });
  const hair = new THREE.MeshStandardMaterial({ color: colors.hair ?? 0x2a1d14, roughness: 0.9 });
  const boardMat = new THREE.MeshPhysicalMaterial({ color: 0xf7f4ec, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: colors.board ?? 0xe8572f, roughness: 0.4 });

  const root = new THREE.Group();     // placed on the wave surface
  const tilt = new THREE.Group();     // extra spin/flip for airs & wipeouts
  root.add(tilt);

  const board = new THREE.Mesh(boardGeometry(), boardMat);
  board.castShadow = true;
  tilt.add(board);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.006, 0.025), stripeMat);
  stripe.position.set(0.05, 0.062, 0);
  tilt.add(stripe);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.11, 0.008), stripeMat);
  fin.position.set(-0.8, -0.05, 0);
  tilt.add(fin);

  const rider = new THREE.Group();
  rider.position.y = 0.07;
  tilt.add(rider);

  const torso = limb(0.15, 0.32, suit);
  const chestBand = limb(0.155, 0.06, accent);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 16), skin);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.122, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  head.add(hairCap);
  head.castShadow = true;
  const parts = {
    thighF: limb(0.075, 0.3, suit), shinF: limb(0.06, 0.32, suit),
    thighB: limb(0.075, 0.3, suit), shinB: limb(0.06, 0.32, suit),
    uarmL: limb(0.05, 0.22, suit), farmL: limb(0.042, 0.22, skin),
    uarmR: limb(0.05, 0.22, suit), farmR: limb(0.042, 0.22, skin),
  };
  rider.add(torso, chestBand, head, ...Object.values(parts));

  const P = {
    hip: new THREE.Vector3(), neck: new THREE.Vector3(), headC: new THREE.Vector3(),
    footF: new THREE.Vector3(), footB: new THREE.Vector3(), hipF: new THREE.Vector3(), hipB: new THREE.Vector3(),
    kneeF: new THREE.Vector3(), kneeB: new THREE.Vector3(),
    shL: new THREE.Vector3(), shR: new THREE.Vector3(), elL: new THREE.Vector3(), elR: new THREE.Vector3(),
    hL: new THREE.Vector3(), hR: new THREE.Vector3(),
  };

  const state = { crouch: 0.3, lean: 0, twist: 0, prone: 0, paddle: 0, arms: 0, tumble: 0, time: 0 };

  function pose() {
    const { crouch, lean, prone, paddle, arms, time } = state;
    const stand = 1 - prone;

    // ---- standing pose ----
    const hipH = THREE.MathUtils.lerp(0.98, 0.62, crouch);
    const sHip = new THREE.Vector3(-0.02 + lean * 0.05, hipH, lean * 0.2 + 0.04);
    const sNeck = sHip.clone().add(new THREE.Vector3(0.08 + crouch * 0.12, 0.5 - crouch * 0.12, 0.05 + crouch * 0.18 + lean * 0.15));
    // ---- prone pose (lying on the board, head towards the nose) ----
    const pHip = new THREE.Vector3(-0.35, 0.16, 0);
    const pNeck = new THREE.Vector3(0.22, 0.24 + 0.04 * Math.sin(paddle * 2), 0);

    P.hip.lerpVectors(pHip, sHip, stand);
    P.neck.lerpVectors(pNeck, sNeck, stand);
    P.headC.copy(P.neck).add(new THREE.Vector3(0.05 * stand + 0.13 * prone, 0.17 * stand + 0.06 * prone, 0.04 * stand));

    span(torso, P.hip, P.neck);
    chestBand.position.copy(P.hip).lerp(P.neck, 0.72);
    chestBand.quaternion.copy(torso.quaternion);
    head.position.copy(P.headC);

    // legs
    const sFF = new THREE.Vector3(0.36, 0.0, 0.0), sFB = new THREE.Vector3(-0.42, 0.0, 0.0);
    const pFF = new THREE.Vector3(-0.85, 0.08, 0.1), pFB = new THREE.Vector3(-0.85, 0.08, -0.1);
    P.footF.lerpVectors(pFF, sFF, stand);
    P.footB.lerpVectors(pFB, sFB, stand);
    P.hipF.copy(P.hip).add(new THREE.Vector3(0.08 * stand, 0, -0.04 * prone + 0.0));
    P.hipB.copy(P.hip).add(new THREE.Vector3(-0.08 * stand, 0, 0.04 * prone));
    const kneeHint = new THREE.Vector3(0, stand ? 0 : 1, 1).normalize();
    if (prone > 0.5) kneeHint.set(0, 1, 0);
    ik(P.hipF, P.footF, 0.44, 0.44, kneeHint, P.kneeF);
    ik(P.hipB, P.footB, 0.44, 0.44, kneeHint, P.kneeB);
    span(parts.thighF, P.hipF, P.kneeF); span(parts.shinF, P.kneeF, P.footF);
    span(parts.thighB, P.hipB, P.kneeB); span(parts.shinB, P.kneeB, P.footB);

    // arms
    const across = new THREE.Vector3(0.18, 0, 0);
    P.shL.copy(P.neck).add(new THREE.Vector3(0.12 * stand, -0.06, 0.02 * stand)).addScaledVector(across, 0).add(new THREE.Vector3(0, 0, prone * 0.17));
    P.shR.copy(P.neck).add(new THREE.Vector3(-0.12 * stand, -0.06, -0.02 * stand)).add(new THREE.Vector3(0, 0, -prone * 0.17));
    if (prone < 0.5) {
      P.shL.set(P.neck.x + 0.12, P.neck.y - 0.06, P.neck.z + 0.02);
      P.shR.set(P.neck.x - 0.12, P.neck.y - 0.06, P.neck.z - 0.02);
    }
    // standing hands: out for balance, sway with lean & arms param
    const sway = Math.sin(time * 1.7) * 0.05;
    const sHL = new THREE.Vector3(0.62 + arms * 0.1, hipH + 0.35 + sway + arms * 0.25 - lean * 0.25, 0.28 + lean * 0.3);
    const sHR = new THREE.Vector3(-0.6 - arms * 0.1, hipH + 0.28 - sway + arms * 0.3 + lean * 0.25, 0.25 - lean * 0.2);
    // paddling hands: windmill strokes alternating
    const a1 = paddle, a2 = paddle + Math.PI;
    const pHL = new THREE.Vector3(0.25 + Math.cos(a1) * 0.42, 0.1 + Math.sin(a1) * 0.32, 0.3);
    const pHR = new THREE.Vector3(0.25 + Math.cos(a2) * 0.42, 0.1 + Math.sin(a2) * 0.32, -0.3);
    P.hL.lerpVectors(pHL, sHL, stand);
    P.hR.lerpVectors(pHR, sHR, stand);
    const elbowHint = new THREE.Vector3(0, -1, 0);
    ik(P.shL, P.hL, 0.3, 0.3, elbowHint, P.elL);
    ik(P.shR, P.hR, 0.3, 0.3, elbowHint, P.elR);
    span(parts.uarmL, P.shL, P.elL); span(parts.farmL, P.elL, P.hL);
    span(parts.uarmR, P.shR, P.elR); span(parts.farmR, P.elR, P.hR);
  }

  pose();

  return {
    root, tilt, state,
    update(dt) { state.time += dt; pose(); },
  };
}
