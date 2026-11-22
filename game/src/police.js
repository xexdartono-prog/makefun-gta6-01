// Wanted system and the Solmarina PD: patrol cars that chase, foot cops that bust.
import * as THREE from '../vendor/three.module.min.js';
import { WORLD, COLOURS, pick, roadLines, clamp, angDiff, dist2 } from './config.js';
import { spawnCar, driveStep, carHitBuildings, carHitCar } from './vehicles.js';
import { makePersonMesh, walkPerson } from './people.js';

const MAX_STARS = 5;

/** Raise the wanted level (capped) and stamp the crime clock. */
export function addWanted(G, n, reason) {
  if (G.player.wanted >= MAX_STARS) return;
  G.player.wanted = Math.min(MAX_STARS, G.player.wanted + n);
  G.crimeTimer = 0;
  if (reason) G.toast(reason + ' — WANTED LEVEL UP', 2600);
  G.audio.siren();
}

/** Wanted decay: stay clean and unseen and the heat cools off. */
export function updateWanted(G, dt) {
  const p = G.player;
  if (p.wanted === 0) return;
  G.crimeTimer += dt;
  let near = false;
  for (const c of G.cars) if (c.isPolice && dist2(c.x, c.z, p.x, p.z) < 45 * 45) { near = true; break; }
  for (const c of G.cops) if (dist2(c.x, c.z, p.x, p.z) < 45 * 45) { near = true; break; }
  if (G.crimeTimer > 18 && !near) {
    p.wanted -= 1;
    G.crimeTimer = 0;
    G.toast(p.wanted === 0 ? 'You lost them. Heat is off.' : 'Heat cooling off…', 2200);
  }
}

function spawnPoliceCar(G) {
  const lines = roadLines();
  const p = G.player;
  // spawn on a road 35-55 units from the player
  const axis = G.rng() < 0.5 ? 'x' : 'z';
  const line = pick(G.rng, lines);
  const dir = G.rng() < 0.5 ? 1 : -1;
  let x, z;
  if (axis === 'x') { x = p.x + dir * (38 + G.rng() * 16); z = line + (dir > 0 ? 3 : -3); }
  else { x = line + (dir > 0 ? -3 : 3); z = p.z + dir * (38 + G.rng() * 16); }
  x = clamp(x, -WORLD.cityHalf, WORLD.cityHalf);
  z = clamp(z, -WORLD.cityHalf, WORLD.beachZ - 10);
  const car = spawnCar(G.scene, 'police', COLOURS.police, x, z, 0);
  car.isPolice = true;
  car.isTraffic = false;
  G.cars.push(car);
  return car;
}

function spawnFootCop(G) {
  const p = G.player;
  const a = G.rng() * Math.PI * 2;
  const x = clamp(p.x + Math.sin(a) * 22, -WORLD.cityHalf, WORLD.cityHalf);
  const z = clamp(p.z + Math.cos(a) * 22, -WORLD.cityHalf, WORLD.beachZ - 8);
  const mesh = makePersonMesh(0x1a2a5a, 0x1a1a2e, 0xe8b88a);
  mesh.position.set(x, 0, z);
  G.scene.add(mesh);
  const cop = { mesh, x, z, heading: 0, speed: 4.8, target: null, health: 100, isCop: true, punchCd: 0, bust: 0 };
  mesh.userData.person = cop;
  G.cops.push(cop);
  return cop;
}

/** Police update: keep pressure matched to the wanted level, chase, ram, bust. */
export function updatePolice(G, dt) {
  const p = G.player;
  const want = p.wanted;
  // spawn cars up to the wanted level (max 4 at once)
  const policeCars = G.cars.filter((c) => c.isPolice);
  if (want > 0 && policeCars.length < Math.min(4, 1 + want)) {
    if (G.spawnCd === undefined) G.spawnCd = 0;
    G.spawnCd -= dt;
    if (G.spawnCd <= 0) { spawnPoliceCar(G); G.spawnCd = 2.5; }
  }
  // foot cops when the player is on foot
  if (want > 0 && !p.car && G.cops.length < Math.min(3, want)) {
    if (G.copCd === undefined) G.copCd = 0;
    G.copCd -= dt;
    if (G.copCd <= 0) { spawnFootCop(G); G.copCd = 3; }
  }
  // stand down when clean
  if (want === 0) {
    for (const c of policeCars) {
      c.despawn = (c.despawn || 0) + dt;
      if (c.despawn > 8) {
        G.scene.remove(c.mesh);
        G.cars.splice(G.cars.indexOf(c), 1);
      }
    }
    for (const cop of [...G.cops]) {
      G.scene.remove(cop.mesh);
      G.cops.splice(G.cops.indexOf(cop), 1);
    }
  }
  // chase: police cars hunt the player's car (or circle a player on foot)
  for (const c of G.cars) {
    if (!c.isPolice || c.despawn) continue;
    const tx = p.car ? p.car.x : p.x, tz = p.car ? p.car.z : p.z;
    const dx = tx - c.x, dz = tz - c.z;
    const d = Math.hypot(dx, dz);
    const want2 = Math.atan2(dx, dz);
    const steer = clamp(angDiff(c.heading, want2) * 1.6, -1, 1);
    const throttle = d > 6 ? 1 : 0.55;
    driveStep(c, dt, throttle, steer, false);
    carHitBuildings(c, G.city.buildings);
    // flash the light bar
    c.flash += dt * 9;
    const bar = c.mesh.userData.lightBar;
    if (bar) {
      bar.children[0].material.emissiveIntensity = Math.sin(c.flash) > 0 ? 2.2 : 0.15;
      bar.children[1].material.emissiveIntensity = Math.sin(c.flash) > 0 ? 0.15 : 2.2;
    }
    // ramming the player's car hurts
    if (p.car && carHitCar(c, p.car)) {
      G.player.health = Math.max(0, G.player.health - 4);
      G.audio.thud();
      if (G.player.health <= 0) G.wasted = true;
    }
  }
  // foot cops chase and try to bust the player
  for (const cop of [...G.cops]) {
    if (p.car) {
      // player escaped in a car: cops give up and leave
      G.scene.remove(cop.mesh);
      G.cops.splice(G.cops.indexOf(cop), 1);
      continue;
    }
    const dx = p.x - cop.x, dz = p.z - cop.z;
    const d = Math.hypot(dx, dz);
    cop.target = { x: p.x, z: p.z };
    walkPerson(cop, dt, cop.speed);
    cop.punchCd -= dt;
    if (d < 1.7 && cop.punchCd <= 0) {
      cop.punchCd = 0.9;
      p.health = Math.max(0, p.health - 8);
      G.audio.thud();
      G.toast('The cops are beating you down!', 1200);
      if (p.health <= 0) G.wasted = true;
    }
    if (d < 2.1) {
      cop.bust += dt;
      if (cop.bust > 1.2) G.busted = true;
    } else {
      cop.bust = Math.max(0, cop.bust - dt * 2);
    }
  }
}
