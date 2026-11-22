// SOLMARINA — boot, game loop, input, camera, save/load and the state machine.
import * as THREE from '../vendor/three.module.min.js';
import { WORLD, COLOURS, mulberry32, pick, roadLines, clamp } from './config.js';
import { buildCity } from './city.js';
import { spawnCar, startTraffic, driveStep, carHitBuildings, carHitCar, updateTraffic } from './vehicles.js';
import { makePersonMesh, spawnPed, sidewalkPoint, updatePeds, updatePlayerOnFoot } from './people.js';
import { addWanted, updateWanted, updatePolice } from './police.js';
import { MISSIONS, startMission, updateMissions } from './missions.js';
import { punch, shoot } from './combat.js';
import { showToast, updateHUD, drawMinimap } from './hud.js';
import { createAudio } from './audio.js';
import { applyShot } from './shots.js';

const SAVE_KEY = 'solmarina-save-v1';
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');

const G = {
  rng: mulberry32(20261117),
  scene: null, camera: null, renderer: null,
  city: null, cars: [], peds: [], cops: [],
  player: null, missionCar: null,
  camYaw: 0, camPitch: 0.34, camDist: 9.5, dragT: 99,
  state: 'menu', time: 0, crimeTimer: 0, spawnCd: 0, copCd: 0,
  missionIndex: -1, missionStep: 0, missionTimer: 0,
  busted: false, wasted: false,
  audio: createAudio(),
  input: { fwd: false, back: false, left: false, right: false, shift: false },
  toast: showToast,
  shot: null,
};
window.G = G; // handy for the finalist review console

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: G.player.cash, missionIndex: G.missionIndex,
      x: G.player.x, z: G.player.z, health: G.player.health,
    }));
  } catch (e) { /* storage unavailable: ignore */ }
}
G.saveGame = saveGame;

function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    return s && typeof s.cash === 'number' ? s : null;
  } catch (e) { return null; }
}

function buildWorld() {
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game'), antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  G.renderer = renderer;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b8d8);
  scene.fog = new THREE.Fog(0x9fc4dc, 180, 520);
  G.scene = scene;

  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
  G.camera = camera;

  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8a7a5a, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe8b8, 2.2);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 500;
  scene.add(sun);

  G.city = buildCity(scene);

  // the player: Dario Cruz, teal jacket
  const mesh = makePersonMesh(0x1a8a8a, 0x2a2a3a, 0xc88a5a);
  mesh.position.set(0, 0, -100);
  scene.add(mesh);
  G.player = {
    mesh, x: 0, z: -100, heading: 0, health: 100, cash: 0, wanted: 0,
    car: null, punchCd: 0, punchT: 0, shootCd: 0, lastHurt: -99,
  };
  mesh.userData.person = G.player;

  // parked cars around the city (stealable)
  const rng = G.rng;
  const lines = roadLines();
  for (let i = 0; i < 9; i++) {
    const kind = pick(rng, ['sedan', 'sedan', 'sport', 'taxi', 'truck']);
    const line = pick(rng, lines);
    const along = -220 + rng() * 440;
    const side = rng() < 0.5 ? 1 : -1;
    const horizontal = rng() < 0.5;
    const x = horizontal ? along : line + side * 4.4;
    const z = horizontal ? line + side * 4.4 : along;
    const heading = horizontal ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? Math.PI : 0);
    const car = spawnCar(scene, kind, pick(rng, COLOURS.car), x, z, heading, { parked: true });
    car.mesh.userData.carRef = car;
    G.cars.push(car);
  }
  // the mission car: red Veloce GT parked on the showroom lot's street (road x=26)
  const mc = spawnCar(scene, 'sport', 0xd83a2e, 29, 52, 0, { parked: true });
  mc.missionCar = true;
  mc.mesh.userData.carRef = mc;
  G.cars.push(mc);
  G.missionCar = mc;

  // traffic
  for (let i = 0; i < 12; i++) {
    const kind = pick(rng, ['sedan', 'sedan', 'taxi', 'sport', 'truck']);
    const car = spawnCar(scene, kind, pick(rng, COLOURS.car), 0, 0, 0);
    car.cruise = rng() * 3;
    car.mesh.userData.carRef = car;
    startTraffic(car, rng);
    G.cars.push(car);
  }
  // pedestrians
  for (let i = 0; i < 20; i++) {
    const pt = sidewalkPoint(rng);
    const ped = spawnPed(scene, rng, pt.x, pt.z);
    ped.mesh.userData.person = ped;
    G.peds.push(ped);
  }
}

function nearestCar(maxD) {
  const p = G.player;
  let best = null, bestD = maxD;
  for (const c of G.cars) {
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

function enterCar(car) {
  const p = G.player;
  p.car = car;
  car.isPlayer = true;
  car.isTraffic = false;
  car.parked = false;
  car.speed = 0;
  p.mesh.visible = false;
  G.camYaw = car.heading + Math.PI; // camera behind the car
  if (!car.stolen) {
    // first time taking a car you do not own: grand theft auto
    car.stolen = true;
    addWanted(G, 1, 'Grand theft auto');
  }
  G.audio.pickup();
}

function exitCar() {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  car.isPlayer = false;
  car.speed = 0;
  // step out to the car's right side
  p.x = car.x + Math.cos(car.heading) * 2.6;
  p.z = car.z - Math.sin(car.heading) * 2.6;
  p.heading = car.heading;
  p.car = null;
  p.mesh.visible = true;
  p.mesh.position.set(p.x, 0, p.z);
}

function tryEnterCar() {
  const p = G.player;
  if (p.car) { exitCar(); return; }
  const car = nearestCar(4.6);
  if (!car) { G.toast('No car close by.', 1200); return; }
  if (car.isPolice) { G.toast('That one has a cop in it. Find another.', 1800); return; }
  if (Math.abs(car.speed) > 2) { G.toast('Too fast to jump in!', 1200); return; }
  enterCar(car);
}

function startGame(fromSave) {
  G.audio.init();
  const s = fromSave ? loadSave() : null;
  G.state = 'play';
  document.getElementById('menu').style.display = 'none';
  document.getElementById('pause').style.display = 'none';
  document.getElementById('over').style.display = 'none';
  if (s) {
    G.player.cash = s.cash;
    G.player.x = s.x; G.player.z = s.z;
    G.player.health = s.health;
    G.player.mesh.position.set(s.x, 0, s.z);
    if (s.missionIndex >= 0) startMission(G, s.missionIndex);
    showToast('Welcome back to Solmarina.', 2400);
  } else {
    G.player.cash = 150;
    startMission(G, 0);
  }
}

function gameOver(kind) {
  G.state = 'over';
  const t = document.getElementById('over-title');
  const x = document.getElementById('over-text');
  if (kind === 'busted') {
    t.textContent = 'BUSTED';
    x.textContent = 'The Solmarina PD caught up with you. They took $100 and your pride.';
  } else {
    t.textContent = 'WASTED';
    x.textContent = 'You got taken out. The paramedics patched you up — for a $100 fee.';
  }
  document.getElementById('over').style.display = 'flex';
}

function respawn() {
  const p = G.player;
  p.cash = Math.max(0, p.cash - 100);
  p.health = 100;
  p.wanted = 0;
  p.x = G.busted ? 200 : -200;
  p.z = G.busted ? -200 : 190;
  p.heading = 0;
  if (p.car) { p.car.isPlayer = false; p.car = null; }
  p.mesh.visible = true;
  p.mesh.position.set(p.x, 0, p.z);
  G.busted = false; G.wasted = false;
  document.getElementById('over').style.display = 'none';
  G.state = 'play';
  showToast('Back on the streets. Stay out of trouble.', 2400);
}

function bindInput() {
  const keymap = { KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'shift', ShiftRight: 'shift' };
  addEventListener('keydown', (e) => {
    if (keymap[e.code] !== undefined) { G.input[keymap[e.code]] = true; e.preventDefault(); }
    if (e.code === 'KeyE' && G.state === 'play') {
      if (!G.player.car) G.player.pickupTap = true; // E also grabs a package
      tryEnterCar();
    }
    if (e.code === 'KeyF' && G.state === 'play') punch(G);
    if (e.code === 'KeyM') { const m = G.audio.toggleMute(); showToast(m ? 'Sound muted' : 'Sound on', 1000); }
    if (e.code === 'KeyR' && G.state === 'play' && G.missionIndex < 0) { startMission(G, 0); showToast('Story restarted.', 1500); }
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (G.state === 'play') {
        G.state = 'pause';
        document.getElementById('pause-info').textContent = `Cash $${G.player.cash} · Mission: ${G.missionIndex >= 0 ? MISSIONS[G.missionIndex].name : 'Free roam'}`;
        document.getElementById('pause').style.display = 'flex';
      } else if (G.state === 'pause') {
        G.state = 'play';
        document.getElementById('pause').style.display = 'none';
      }
    }
  });
  addEventListener('keyup', (e) => {
    if (keymap[e.code] !== undefined) G.input[keymap[e.code]] = false;
  });
  // mouse: drag orbits the camera, wheel zooms, click shoots
  const cv = document.getElementById('game');
  let dragging = false, lx = 0, ly = 0;
  cv.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
  addEventListener('pointerup', () => { dragging = false; });
  addEventListener('pointermove', (e) => {
    if (!dragging) return;
    G.camYaw -= (e.clientX - lx) * 0.005;
    G.camPitch = clamp(G.camPitch + (e.clientY - ly) * 0.004, 0.08, 1.1);
    lx = e.clientX; ly = e.clientY;
    G.dragT = 0;
  });
  cv.addEventListener('wheel', (e) => {
    G.camDist = clamp(G.camDist + Math.sign(e.deltaY) * 1.2, 5, 18);
    e.preventDefault();
  }, { passive: false });
  cv.addEventListener('click', () => {
    if (G.state === 'play' && !G.player.car) shoot(G);
  });
  addEventListener('resize', () => {
    G.camera.aspect = innerWidth / innerHeight;
    G.camera.updateProjectionMatrix();
    G.renderer.setSize(innerWidth, innerHeight);
  });
  document.getElementById('btn-start').onclick = () => startGame(false);
  document.getElementById('btn-continue').onclick = () => {
    if (loadSave()) startGame(true);
    else { startGame(false); }
  };
  document.getElementById('btn-resume').onclick = () => {
    G.state = 'play';
    document.getElementById('pause').style.display = 'none';
  };
  document.getElementById('btn-restart-mission').onclick = () => {
    document.getElementById('pause').style.display = 'none';
    G.state = 'play';
    if (G.missionIndex >= 0) startMission(G, G.missionIndex);
    else startMission(G, 0);
  };
  document.getElementById('btn-save').onclick = () => { saveGame(); showToast('Game saved.', 1500); };
  document.getElementById('btn-quit').onclick = () => {
    saveGame();
    G.state = 'menu';
    document.getElementById('pause').style.display = 'none';
    document.getElementById('menu').style.display = 'flex';
  };
  document.getElementById('btn-retry').onclick = respawn;
}

function updateCamera(dt) {
  const p = G.player;
  const target = p.car ? p.car : p;
  const tx = target.x, tz = target.z;
  G.dragT += dt;
  // gentle auto-align behind a moving car when the player is not dragging
  if (p.car && Math.abs(p.car.speed) > 6 && G.dragT > 2.5) {
    const want = p.car.heading + Math.PI;
    let d = want - G.camYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    G.camYaw += d * Math.min(1, dt * 1.2);
  }
  const dist = p.car ? G.camDist + 3.5 : G.camDist;
  const h = 3.2 + Math.sin(G.camPitch) * dist * 0.55;
  const back = Math.cos(G.camPitch) * dist;
  const cx = tx + Math.sin(G.camYaw) * back;
  const cz = tz + Math.cos(G.camYaw) * back;
  G.camera.position.lerp(new THREE.Vector3(cx, h, cz), Math.min(1, dt * 6));
  G.camera.lookAt(tx, 1.6, tz);
}

function step(dt) {
  G.time += dt;
  const p = G.player;
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.punchT = Math.max(0, p.punchT - dt);
  p.shootCd = Math.max(0, p.shootCd - dt);
  // health regen out of combat
  if (G.time - p.lastHurt > 6 && p.health > 0 && p.health < 100) p.health = Math.min(100, p.health + 3 * dt);
  // punch arm swing
  if (p.punchT > 0) {
    const u = p.mesh.userData;
    u.armR.rotation.x = -2.0 * Math.sin((0.3 - p.punchT) / 0.3 * Math.PI);
  }

  // shot autopilot: scripted input during warmup
  const inp = { ...G.input };
  if (G.shot && G.shot.warmup > 0) {
    if (G.shot.drive) { inp.fwd = true; inp.left = G.shot.steer < 0; inp.right = G.shot.steer > 0; }
  }

  if (p.car) {
    const steer = (inp.left ? -1 : 0) + (inp.right ? 1 : 0);
    const throttle = (inp.fwd ? 1 : 0) + (inp.back ? -1 : 0);
    driveStep(p.car, dt, throttle, steer, false);
    carHitBuildings(p.car, G.city.buildings);
    for (const c of G.cars) if (c !== p.car) carHitCar(p.car, c);
    // running over a pedestrian is a crime
    for (const ped of G.peds) {
      if (ped.health <= 0) continue;
      if (Math.hypot(ped.x - p.car.x, ped.z - p.car.z) < 2.2 && Math.abs(p.car.speed) > 6) {
        ped.health = 0;
        ped.mesh.rotation.x = -Math.PI / 2;
        ped.mesh.position.y = 0.35;
        addWanted(G, 1, 'You ran someone over!');
        G.audio.thud();
      }
    }
    p.x = p.car.x; p.z = p.car.z; p.heading = p.car.heading;
  } else {
    updatePlayerOnFoot(G, dt, inp);
  }
  updateTraffic(G, dt);
  updatePeds(G, dt);
  updatePolice(G, dt);
  updateWanted(G, dt);
  updateMissions(G, dt);
  // traffic cars bumping the player on foot (rate-limited)
  if (!p.car) {
    p.bumpCd = Math.max(0, (p.bumpCd || 0) - dt);
    for (const c of G.cars) {
      if (c.isPolice) continue;
      if (Math.hypot(c.x - p.x, c.z - p.z) < 2.0 && Math.abs(c.speed) > 4 && p.bumpCd <= 0) {
        p.bumpCd = 1.0;
        p.health = Math.max(0, p.health - 12);
        p.lastHurt = G.time;
        G.audio.thud();
        p.x += (p.x - c.x) * 0.6; p.z += (p.z - c.z) * 0.6;
        if (p.health <= 0) G.wasted = true;
      }
    }
  }
  // during a screenshot warmup the player cannot be wasted or busted
  if (G.shot && G.shot.warmup > 0) {
    if (p.health < 40) p.health = 40;
    G.busted = false; G.wasted = false;
  }
  // audio
  const speed01 = p.car ? Math.abs(p.car.speed) / p.car.maxSpeed : 0;
  G.audio.update(dt, speed01, !!p.car, p.wanted);
  updateHUD(G);
  drawMinimap(G);
  if (G.busted) { G.busted = false; gameOver('busted'); }
  if (G.wasted) { G.wasted = false; gameOver('wasted'); }
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, G.clock.getDelta());
  if (G.state === 'menu') {
    // attract mode: slow orbit over the city, traffic alive
    G.time += dt;
    updateTraffic(G, dt);
    updatePeds(G, dt);
    const a = G.time * 0.05;
    G.camera.position.set(Math.sin(a) * 190, 95, Math.cos(a) * 190);
    G.camera.lookAt(0, 0, 0);
    if (G.shot) {
      // shot mode skips the menu entirely
    }
  } else if (G.state === 'play') {
    step(dt);
    updateCamera(dt);
    if (G.shot && G.shot.warmup > 0) {
      G.shot.warmup -= 1;
      if (G.shot.warmup === 0) document.title = 'SHOT-READY';
    }
  }
  G.renderer.render(G.scene, G.camera);
}

function boot() {
  buildWorld();
  bindInput();
  G.clock = new THREE.Clock();
  document.getElementById('loader').style.display = 'none';
  if (SHOT) {
    // screenshot mode: straight into a staged scene, no menu, no audio gesture
    document.getElementById('menu').style.display = 'none';
    G.state = 'play';
    applyShot(G, SHOT);
  }
  loop();
}

boot();
