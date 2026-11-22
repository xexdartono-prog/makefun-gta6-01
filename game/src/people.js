// People: the player character, pedestrians and on-foot cops (boxy low-poly figures).
import * as THREE from '../vendor/three.module.min.js';
import { WORLD, mulberry32, pick, roadLines, clamp } from './config.js';
import { collideCircle } from './city.js';

const SHIRTS = [0xd83a2e, 0x2e6fd8, 0x30c878, 0xf2c230, 0xe8e8e8, 0x8a5fd0, 0xff7a2e, 0x3aa8a8];
const PANTS = [0x2a2a3a, 0x4a3a2a, 0x3a4a5a, 0x222222, 0x5a5a6a];
const SKINS = [0xe8b88a, 0xc88a5a, 0x8a5a38, 0xf0c8a0];

/** A simple humanoid: torso, head, two legs, two arms; limbs swing when walking. */
export function makePersonMesh(shirt, pants, skin) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.3), shirtMat);
  torso.position.y = 1.05; torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skinMat);
  head.position.y = 1.52; head.castShadow = true;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.36), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  cap.position.y = 1.7;
  g.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.22), pantsMat);
  legL.position.set(-0.14, 0.55, 0);
  legL.geometry.translate(0, -0.28, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  g.add(legL, legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.16), shirtMat);
  armL.position.set(-0.37, 1.32, 0);
  armL.geometry.translate(0, -0.24, 0);
  const armR = armL.clone();
  armR.position.x = 0.37;
  g.add(armL, armR);
  g.userData = { legL, legR, armL, armR, head, phase: 0 };
  return g;
}

/** Spawn a pedestrian wandering the sidewalks. */
export function spawnPed(scene, rng, x, z) {
  const mesh = makePersonMesh(pick(rng, SHIRTS), pick(rng, PANTS), pick(rng, SKINS));
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  const ped = {
    mesh, x, z, heading: rng() * Math.PI * 2, speed: 1.1 + rng() * 0.9,
    target: null, health: 100, isCop: false, isPed: true, panic: 0,
  };
  mesh.userData.person = ped;
  return ped;
}

/** A random sidewalk point near a road line. */
export function sidewalkPoint(rng) {
  const lines = roadLines();
  const line = pick(rng, lines);
  const along = -230 + rng() * 460;
  const side = rng() < 0.5 ? 8.5 : -8.5;
  if (rng() < 0.5) return { x: along, z: line + side };
  return { x: line + side, z: along };
}

/** Walk a person toward its target with a limb swing. */
export function walkPerson(p, dt, speed) {
  if (!p.target) return;
  const dx = p.target.x - p.x, dz = p.target.z - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 1.2) { p.target = null; return; }
  const want = Math.atan2(dx, dz);
  let dh = want - p.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  p.heading += clamp(dh, -2.4 * dt, 2.4 * dt);
  p.x += Math.sin(p.heading) * speed * dt;
  p.z += Math.cos(p.heading) * speed * dt;
  const u = p.mesh.userData;
  u.phase += speed * dt * 3.2;
  const s = Math.sin(u.phase) * 0.55;
  u.legL.rotation.x = s; u.legR.rotation.x = -s;
  u.armL.rotation.x = -s * 0.7; u.armR.rotation.x = s * 0.7;
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.rotation.y = p.heading;
}

/** Pedestrian update: wander; flee when panicked (gunfire / speeding car nearby). */
export function updatePeds(G, dt) {
  for (const p of G.peds) {
    if (p.health <= 0) continue;
    if (p.panic > 0) {
      p.panic -= dt;
      // run away from the player
      const dx = p.x - G.player.x, dz = p.z - G.player.z;
      const d = Math.hypot(dx, dz) || 1;
      p.target = { x: p.x + (dx / d) * 20, z: p.z + (dz / d) * 20 };
      walkPerson(p, dt, 4.2);
    } else {
      if (!p.target) p.target = sidewalkPoint(G.rng);
      walkPerson(p, dt, p.speed);
    }
    const [nx, nz] = collideCircle(p.x, p.z, 0.5, G.city.buildings);
    p.x = nx; p.z = nz;
    p.mesh.position.set(p.x, 0, p.z);
  }
}

/** On-foot player movement (WASD relative to the camera yaw). */
export function updatePlayerOnFoot(G, dt, input) {
  const p = G.player;
  const run = input.shift ? 8.2 : 5.0;
  let mx = 0, mz = 0;
  if (input.fwd) mz += 1;
  if (input.back) mz -= 1;
  if (input.left) mx -= 1;
  if (input.right) mx += 1;
  const moving = mx !== 0 || mz !== 0;
  if (moving) {
    const len = Math.hypot(mx, mz);
    mx /= len; mz /= len;
    const cy = G.camYaw;
    // camera-relative: forward f = (-sin cy, -cos cy), right r = (cos cy, -sin cy)
    const fx = -Math.sin(cy), fz = -Math.cos(cy);
    const rx = Math.cos(cy), rz = -Math.sin(cy);
    const dx = fx * mz + rx * mx, dz = fz * mz + rz * mx;
    p.x += dx * run * dt;
    p.z += dz * run * dt;
    p.heading = Math.atan2(dx, dz);
    const u = p.mesh.userData;
    u.phase += run * dt * 2.4;
    const s = Math.sin(u.phase) * 0.6;
    u.legL.rotation.x = s; u.legR.rotation.x = -s;
    u.armL.rotation.x = -s * 0.7; u.armR.rotation.x = s * 0.7;
  } else {
    const u = p.mesh.userData;
    u.legL.rotation.x *= 0.8; u.legR.rotation.x *= 0.8;
    u.armL.rotation.x *= 0.8; u.armR.rotation.x *= 0.8;
  }
  const [nx, nz] = collideCircle(p.x, p.z, 0.6, G.city.buildings);
  p.x = nx; p.z = nz;
  // soft push away from cars
  for (const c of G.cars) {
    const dx = p.x - c.x, dz = p.z - c.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 5.3 && d2 > 1e-4) {
      const d = Math.sqrt(d2);
      p.x = c.x + (dx / d) * 2.3;
      p.z = c.z + (dz / d) * 2.3;
    }
  }
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.rotation.y = p.heading;
}
