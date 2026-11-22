// Combat: fists, a pistol, health and the WASTED screen.
import * as THREE from '../vendor/three.module.min.js';
import { addWanted } from './police.js';

const raycaster = new THREE.Raycaster();
const tmpV = new THREE.Vector3();

/** Punch the nearest person in front of the player. */
export function punch(G) {
  const p = G.player;
  if (p.car || p.punchCd > 0) return;
  p.punchCd = 0.45;
  p.punchT = 0.3;
  G.audio.punch();
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  let best = null, bestD = 2.4;
  for (const t of [...G.peds, ...G.cops]) {
    if (t.health <= 0) continue;
    const dx = t.x - p.x, dz = t.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < bestD && dx * fx + dz * fz > 0) { best = t; bestD = d; }
  }
  if (!best) return;
  best.health -= 25;
  best.x += fx * 0.8; best.z += fz * 0.8;
  best.mesh.position.set(best.x, 0, best.z);
  if (best.isCop) addWanted(G, 1, 'You hit a cop');
  else { addWanted(G, 1, 'Assault'); best.panic = 6; }
  if (best.health <= 0) killPerson(G, best);
}

/** Shoot toward the crosshair: raycast against people and cars. */
export function shoot(G) {
  const p = G.player;
  if (p.car || p.shootCd > 0) return;
  p.shootCd = 0.28;
  G.audio.gunshot();
  // muzzle flash: brief light at the player's hand
  const flash = new THREE.PointLight(0xffd88a, 30, 12);
  flash.position.set(p.x, 1.4, p.z);
  G.scene.add(flash);
  setTimeout(() => G.scene.remove(flash), 70);
  raycaster.setFromCamera({ x: 0, y: 0 }, G.camera);
  raycaster.far = 70;
  const targets = [];
  for (const t of [...G.peds, ...G.cops]) if (t.health > 0) targets.push(t.mesh);
  for (const c of G.cars) if (c !== p.car) targets.push(c.mesh);
  const hits = raycaster.intersectObjects(targets, true);
  if (!hits.length) {
    // tracer into the distance so the shot reads
    addTracer(G, raycaster.ray.origin, tmpV.copy(raycaster.ray.direction).multiplyScalar(50).add(raycaster.ray.origin));
    return;
  }
  const hit = hits[0];
  addTracer(G, raycaster.ray.origin, hit.point);
  let obj = hit.object;
  while (obj && !obj.userData.person && !obj.userData.carRef) obj = obj.parent;
  if (obj && obj.userData.person) {
    const t = obj.userData.person;
    t.health -= 34;
    if (t.isCop) addWanted(G, 1, 'You shot a cop');
    else { addWanted(G, 1, 'Shots fired'); t.panic = 8; }
    if (t.health <= 0) killPerson(G, t);
    else {
      // nearby peds panic
      for (const q of G.peds) if (Math.hypot(q.x - p.x, q.z - p.z) < 25) q.panic = 5;
    }
  } else if (obj && obj.userData.carRef) {
    const c = obj.userData.carRef;
    c.speed *= 0.7;
    G.audio.thud();
  }
}

function addTracer(G, from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9 }));
  G.scene.add(line);
  setTimeout(() => { G.scene.remove(line); geo.dispose(); }, 90);
}

function killPerson(G, t) {
  t.health = 0;
  t.mesh.rotation.x = -Math.PI / 2;
  t.mesh.position.y = 0.35;
  addWanted(G, 1, 'Somebody is down');
  setTimeout(() => {
    G.scene.remove(t.mesh);
    const arr = t.isCop ? G.cops : G.peds;
    const i = arr.indexOf(t);
    if (i >= 0) arr.splice(i, 1);
  }, 25000);
}

/** Hurt the player; returns true when the player is wasted. */
export function damagePlayer(G, n) {
  const p = G.player;
  p.health = Math.max(0, p.health - n);
  p.lastHurt = G.time;
  G.audio.thud();
  if (p.health <= 0) { G.wasted = true; return true; }
  return false;
}
