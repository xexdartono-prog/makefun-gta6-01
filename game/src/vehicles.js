// Cars: mesh factory, arcade driving, traffic AI and collisions.
import * as THREE from '../vendor/three.module.min.js';
import { WORLD, COLOURS, mulberry32, pick, roadLines, clamp, angDiff } from './config.js';
import { collideCircle } from './city.js';

const KINDS = {
  sedan: { len: 4.4, wid: 2.0, h: 1.15, cabin: 0.9, top: 32, accel: 15 },
  sport: { len: 4.2, wid: 2.0, h: 0.95, cabin: 0.75, top: 40, accel: 19 },
  taxi: { len: 4.4, wid: 2.0, h: 1.15, cabin: 0.9, top: 31, accel: 15 },
  truck: { len: 5.6, wid: 2.2, h: 1.9, cabin: 1.1, top: 24, accel: 11 },
  police: { len: 4.5, wid: 2.0, h: 1.15, cabin: 0.9, top: 35, accel: 18 },
};

const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

/** Build a boxy low-poly car. Returns a THREE.Group (facing +z when heading = 0). */
export function makeCarMesh(kind, color) {
  const k = KINDS[kind] || KINDS.sedan;
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1c2a38 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(k.wid, k.h, k.len), paint);
  body.position.y = 0.55 + k.h / 2 - 0.35;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(k.wid * 0.86, k.cabin, k.len * 0.5), glass);
  cabin.position.set(0, body.position.y + k.h / 2 + k.cabin / 2 - 0.15, -k.len * 0.06);
  cabin.castShadow = true;
  g.add(cabin);
  const wheels = [];
  for (const [wx, wz] of [[-k.wid / 2, k.len * 0.32], [k.wid / 2, k.len * 0.32], [-k.wid / 2, -k.len * 0.32], [k.wid / 2, -k.len * 0.32]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    g.add(w);
    wheels.push(w);
  }
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0xfff2a8, emissiveIntensity: 0.9 });
  for (const sx of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.1), lightMat);
    hl.position.set(sx, 0.75, k.len / 2 + 0.02);
    g.add(hl);
  }
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xaa1111, emissive: 0xdd2222, emissiveIntensity: 0.7 });
  for (const sx of [-0.6, 0.6]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.1), tailMat);
    tl.position.set(sx, 0.75, -k.len / 2 - 0.02);
    g.add(tl);
  }
  if (kind === 'sport') {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(k.wid * 0.9, 0.08, 0.5), paint);
    sp.position.set(0, 1.25, -k.len / 2 + 0.2);
    g.add(sp);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.5), new THREE.MeshLambertMaterial({ color: 0xffe27a, emissive: 0xffd23d, emissiveIntensity: 0.5 }));
    sign.position.set(0, body.position.y + k.h / 2 + k.cabin + 0.05, 0);
    g.add(sign);
  }
  if (kind === 'police') {
    const bar = new THREE.Group();
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.3), new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 1 }));
    const b = r.clone();
    b.material = new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 1 });
    r.position.x = -0.35; b.position.x = 0.35;
    bar.add(r, b);
    bar.position.set(0, body.position.y + k.h / 2 + k.cabin + 0.1, 0);
    g.add(bar);
    g.userData.lightBar = bar;
  }
  g.userData.wheels = wheels;
  g.userData.kind = kind;
  return g;
}

/** Spawn a car object and add it to the scene. */
export function spawnCar(scene, kind, color, x, z, heading, opts = {}) {
  const mesh = makeCarMesh(kind, color);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  const car = {
    mesh, kind, color, x, z, heading, speed: 0,
    steer: 0, isPlayer: false, isPolice: kind === 'police', isTraffic: false,
    parked: !!opts.parked, maxSpeed: KINDS[kind].top, accel: KINDS[kind].accel,
    lane: null, lastCross: -1, flash: 0, ...opts,
  };
  mesh.userData.carRef = car;
  return car;
}

/** Put a car on a road lane for traffic duty. */
export function startTraffic(car, rng) {
  const lines = roadLines();
  const axis = rng() < 0.5 ? 'x' : 'z';
  const line = pick(rng, lines);
  const dir = rng() < 0.5 ? 1 : -1;
  const side = axis === 'x' ? (dir > 0 ? 3 : -3) : (dir > 0 ? -3 : 3);
  car.lane = { axis, line, dir, side };
  car.isTraffic = true;
  car.speed = 9 + rng() * 4;
  if (axis === 'x') { car.z = line + side; car.heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
  else { car.x = line + side; car.heading = dir > 0 ? Math.PI : 0; }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
}

/** Arcade drive step shared by player, traffic and police. */
export function driveStep(car, dt, throttle, steer, handbrake) {
  const k = KINDS[car.kind];
  const maxF = car.maxSpeed, maxR = 9;
  if (throttle > 0) car.speed += car.accel * throttle * dt;
  else if (throttle < 0) car.speed += (car.speed > 0.5 ? 26 : car.accel * 0.7) * throttle * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
  if (handbrake) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 30 * dt);
    car.heading += steer * 1.6 * Math.sign(car.speed || 1) * dt;
  }
  car.speed = clamp(car.speed, -maxR, maxF);
  const turn = steer * 1.85 * clamp(Math.abs(car.speed) / 12, 0, 1) * (car.speed < 0 ? -1 : 1);
  car.heading += turn * dt;
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  // wheels: front steer, all spin
  const wheels = car.mesh.userData.wheels;
  for (let i = 0; i < wheels.length; i++) {
    wheels[i].rotation.x += (car.speed * dt) / 0.38;
    if (i < 2) wheels[i].rotation.y = steer * 0.45;
  }
}

/** Circle-vs-building collision for a car; returns true on hit. */
export function carHitBuildings(car, buildings) {
  const r = 2.1;
  const [nx, nz] = collideCircle(car.x, car.z, r, buildings);
  if (nx !== car.x || nz !== car.z) {
    car.x = nx; car.z = nz;
    car.speed *= 0.45;
    return true;
  }
  return false;
}

/** Push two cars apart (circle test), returns true on contact. */
export function carHitCar(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const d2 = dx * dx + dz * dz;
  if (d2 < 16 && d2 > 1e-4) {
    const d = Math.sqrt(d2);
    const push = (4 - d) / 2;
    const nx = dx / d, nz = dz / d;
    a.x -= nx * push; a.z -= nz * push;
    b.x += nx * push; b.z += nz * push;
    const s = a.speed; a.speed = b.speed * 0.5; b.speed = s * 0.5;
    return true;
  }
  return false;
}

/** Traffic update: follow lanes, turn at intersections, queue behind cars. */
export function updateTraffic(G, dt) {
  const lines = roadLines();
  for (const car of G.cars) {
    if (!car.isTraffic || car.isPlayer) continue;
    const lane = car.lane;
    if (!lane) continue;
    // car ahead on the same lane?
    let blocked = false;
    for (const o of G.cars) {
      if (o === car) continue;
      const along = lane.axis === 'x' ? (o.x - car.x) * lane.dir : (o.z - car.z) * lane.dir;
      const across = lane.axis === 'x' ? Math.abs(o.z - car.z) : Math.abs(o.x - car.x);
      if (along > 0 && along < 10 && across < 3.4) { blocked = true; break; }
    }
    const target = blocked ? 0 : 10 + (car.cruise || 0);
    car.speed += clamp(target - car.speed, -14 * dt, 8 * dt);
    // advance along the lane
    if (lane.axis === 'x') {
      car.x += lane.dir * car.speed * dt;
      car.z = lane.line + lane.side;
      car.heading = lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      car.z += lane.dir * car.speed * dt;
      car.x = lane.line + lane.side;
      car.heading = lane.dir > 0 ? Math.PI : 0;
    }
    // intersection decision
    const along = lane.axis === 'x' ? car.x : car.z;
    for (const L of lines) {
      if (Math.abs(along - L) < 1.2 && car.lastCross !== L) {
        car.lastCross = L;
        const rng = G.rng;
        if (rng() < 0.35) {
          // turn onto the crossed road
          const turnDir = rng() < 0.5 ? 1 : -1;
          const newAxis = lane.axis === 'x' ? 'z' : 'x';
          const newSide = newAxis === 'x' ? (turnDir > 0 ? 3 : -3) : (turnDir > 0 ? -3 : 3);
          car.lane = { axis: newAxis, line: L, dir: turnDir, side: newSide };
        }
        break;
      }
    }
    // wrap at the city edge: turn around
    if (Math.abs(car.x) > WORLD.cityHalf + 20 || Math.abs(car.z) > WORLD.beachZ) {
      car.lane.dir *= -1;
      car.lane.side *= -1;
    }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    const wheels = car.mesh.userData.wheels;
    for (const w of wheels) w.rotation.x += (car.speed * dt) / 0.38;
  }
}
