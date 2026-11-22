// Missions and the Solmarina story: Dario Cruz, wheelman for fixer Mara Voss.
import * as THREE from '../vendor/three.module.min.js';
import { clamp } from './config.js';

export const MISSIONS = [
  {
    id: 'pickup', name: 'FIRST PICKUP', giver: 'Mara Voss',
    brief: 'Mara needs a package from the docks. Go get it — and don\'t keep her waiting.',
    steps: [
      { text: 'Drive to the container yard at the docks', target: { x: 104, z: 156 }, radius: 5 },
      { text: 'Press E to pick up the package', target: { x: 104, z: 156 }, radius: 4, pickup: true },
      { text: 'Deliver the package to The Palms Club', target: { x: -26, z: -52 }, radius: 5 },
    ],
    reward: 500,
  },
  {
    id: 'hotwheels', name: 'HOT WHEELS', giver: 'Mara Voss',
    brief: 'A red Veloce GT is sitting in the showroom lot. Steal it. The cops will notice.',
    steps: [
      { text: 'Steal the red Veloce GT from the showroom lot', target: { x: 29, z: 52 }, radius: 6, steal: true },
      { text: 'Deliver the Veloce to the chop shop', target: { x: -182, z: -190 }, radius: 6 },
    ],
    reward: 1200,
  },
  {
    id: 'getaway', name: 'THE GETAWAY', giver: 'Mara Voss',
    brief: 'The job went loud. Three stars and counting — reach the pier safehouse before they box you in.',
    steps: [
      { text: 'Reach the pier safehouse — lose the cops on the way', target: { x: 130, z: 246 }, radius: 6, timer: 100 },
    ],
    reward: 2000,
  },
];

let marker = null;

function makeMarker(scene) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(3.4, 3.4, 0.25, 24),
    new THREE.MeshLambertMaterial({ color: 0xffcf3d, emissive: 0xffcf3d, emissiveIntensity: 0.8, transparent: true, opacity: 0.75 }),
  );
  ring.position.y = 0.15;
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 60, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffcf3d, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 30;
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshLambertMaterial({ color: 0xffcf3d, emissive: 0xffcf3d, emissiveIntensity: 1 }),
  );
  gem.position.y = 5;
  g.add(ring, pillar, gem);
  g.userData = { gem, ring };
  scene.add(g);
  return g;
}

/** Begin a mission: briefing, marker, timer. */
export function startMission(G, idx) {
  const m = MISSIONS[idx];
  G.missionIndex = idx;
  G.missionStep = 0;
  G.missionTimer = m.steps[0].timer || 0;
  if (!marker) marker = makeMarker(G.scene);
  marker.visible = true;
  const step = m.steps[0];
  marker.position.set(step.target.x, 0, step.target.z);
  if (m.id === 'getaway') {
    G.player.wanted = Math.max(G.player.wanted, 3);
    G.crimeTimer = 0;
  }
  G.toast(`${m.name} — ${m.giver}`, 3200);
  setTimeout(() => G.toast(m.brief, 4200), 600);
  G.audio.jingle();
}

/** Current step's target (for HUD + minimap), or null in free roam. */
export function missionTarget(G) {
  if (G.missionIndex < 0) return null;
  const m = MISSIONS[G.missionIndex];
  if (!m || G.missionStep >= m.steps.length) return null;
  return m.steps[G.missionStep].target;
}

export function missionText(G) {
  if (G.missionIndex < 0) return { tag: 'FREE ROAM', text: 'Explore Solmarina. Press R to replay the story.' };
  const m = MISSIONS[G.missionIndex];
  if (G.missionStep >= m.steps.length) return { tag: m.name, text: 'Mission complete!' };
  return { tag: m.name, text: m.steps[G.missionStep].text };
}

/** Advance the mission state; call every frame. */
export function updateMissions(G, dt) {
  if (marker) {
    const t = performance.now() * 0.002;
    marker.userData.gem.rotation.y += dt * 2;
    marker.userData.gem.position.y = 5 + Math.sin(t) * 0.6;
    marker.userData.ring.scale.setScalar(1 + Math.sin(t * 1.4) * 0.08);
  }
  if (G.missionIndex < 0) return;
  const m = MISSIONS[G.missionIndex];
  const step = m.steps[G.missionStep];
  if (!step) return;
  if (step.timer) {
    G.missionTimer -= dt;
    if (G.missionTimer <= 0) {
      G.toast('Too slow — the trail went cold. Mission failed.', 3200);
      failMission(G);
      return;
    }
  }
  const p = G.player;
  const d = Math.hypot(p.x - step.target.x, p.z - step.target.z);
  let done = d < step.radius;
  if (step.steal) done = done && p.car && p.car.missionCar === true;
  if (step.pickup) done = done && p.pickupTap === true;
  p.pickupTap = false;
  if (!done) return;
  G.missionStep += 1;
  G.audio.pickup();
  if (G.missionStep >= m.steps.length) {
    p.cash += m.reward;
    G.toast(`MISSION COMPLETE — +$${m.reward}`, 3600);
    G.audio.jingle();
    G.saveGame();
    if (marker) marker.visible = false;
    const next = G.missionIndex + 1;
    G.missionIndex = -1;
    G.missionStep = 0;
    if (next < MISSIONS.length) {
      setTimeout(() => startMission(G, next), 2600);
    } else {
      setTimeout(() => G.toast('STORY COMPLETE — you run Solmarina now. Free roam!', 5000), 1200);
    }
  } else {
    const next = m.steps[G.missionStep];
    G.missionTimer = next.timer || 0;
    if (marker) marker.position.set(next.target.x, 0, next.target.z);
  }
}

function failMission(G) {
  if (marker) marker.visible = false;
  G.missionIndex = -1;
  G.missionStep = 0;
  G.audio.thud();
}
