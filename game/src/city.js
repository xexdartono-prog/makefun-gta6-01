// Procedural Solmarina: ground texture, buildings, parks, props, beach and pier.
// All geometry is original, drawn from a seeded RNG so every run looks the same.
import * as THREE from '../vendor/three.module.min.js';
import { WORLD, COLOURS, mulberry32, pick, roadLines } from './config.js';

const S = 2048 / 520; // ground-texture pixels per world unit (world -260..260)

/** Draw the whole ground (roads, dashes, crosswalks, blocks, sand) on one canvas. */
function groundTexture(rng) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 2048;
  const g = cv.getContext('2d');
  const X = (x) => (x + 260) * S, Z = (z) => (z + 260) * S;
  g.fillStyle = '#8f887d'; g.fillRect(0, 0, 2048, 2048); // sidewalk base
  // beach sand (south edge)
  g.fillStyle = '#e8d29a'; g.fillRect(0, Z(WORLD.beachZ), 2048, 2048 - Z(WORLD.beachZ));
  // blocks: subtle shade variation + a few parks
  const lines = roadLines();
  for (let i = 0; i < WORLD.blocks; i++) {
    for (let j = 0; j < WORLD.blocks; j++) {
      const x0 = lines[i] + WORLD.roadHalf, z0 = lines[j] + WORLD.roadHalf;
      const w = WORLD.pitch - WORLD.roadHalf * 2;
      const park = (i === 1 && j === 6) || (i === 6 && j === 2) || (i === 3 && j === 3);
      g.fillStyle = park ? '#5f9e52' : (rng() < 0.5 ? '#968e82' : '#8a8378');
      g.fillRect(X(x0), Z(z0), w * S, w * S);
    }
  }
  // roads
  g.fillStyle = '#2e3138';
  for (const L of lines) {
    g.fillRect(0, Z(L - WORLD.roadHalf), 2048, WORLD.roadHalf * 2 * S);
    g.fillRect(X(L - WORLD.roadHalf), 0, WORLD.roadHalf * 2 * S, Z(WORLD.beachZ));
  }
  // lane dashes (yellow centre) + edge lines
  g.fillStyle = '#d8b83a';
  for (const L of lines) {
    for (let d = -240; d < 240; d += 16) {
      g.fillRect(X(d), Z(L) - 1, 8 * S, 2);
      g.fillRect(X(L) - 1, Z(d), 2, 8 * S);
    }
  }
  // crosswalks at intersections
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (const Lx of lines) for (const Lz of lines) {
    for (let k = -2; k <= 2; k++) {
      g.fillRect(X(Lx + k * 2.2) - 2, Z(Lz - WORLD.roadHalf), 4, 5 * S);
      g.fillRect(X(Lx + k * 2.2) - 2, Z(Lz + WORLD.roadHalf) - 5 * S, 4, 5 * S);
      g.fillRect(X(Lx - WORLD.roadHalf), Z(Lz + k * 2.2) - 2, 5 * S, 4);
      g.fillRect(X(Lx + WORLD.roadHalf) - 5 * S, Z(Lz + k * 2.2) - 2, 5 * S, 4);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A window-grid texture; litRatio controls how many windows glow warm. */
function windowTexture(litRatio, rng) {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#22242a'; g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 16) {
    for (let x = 8; x < 120; x += 16) {
      const lit = rng() < litRatio;
      g.fillStyle = lit ? (rng() < 0.5 ? '#ffd88a' : '#bfe0ff') : '#3a4a5a';
      g.fillRect(x, y, 10, 11);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Push a circle (x,z,r) out of every building AABB; returns corrected [x,z]. */
export function collideCircle(x, z, r, buildings) {
  for (const b of buildings) {
    const cx = Math.max(b.minX, Math.min(x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    const dx = x - cx, dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 < 1e-6) { x = b.maxX + r; continue; }
      const d = Math.sqrt(d2);
      x = cx + (dx / d) * r; z = cz + (dz / d) * r;
    }
  }
  return [x, z];
}

export function buildCity(scene) {
  const rng = mulberry32(20261117);
  const buildings = [];
  const group = new THREE.Group();
  group.name = 'city';

  // ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(520, 520),
    new THREE.MeshLambertMaterial({ map: groundTexture(rng) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // sea
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(520, 90),
    new THREE.MeshLambertMaterial({ color: COLOURS.sea, transparent: true, opacity: 0.88 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.15, WORLD.seaZ + 20);
  group.add(sea);

  // building window textures (3 variants)
  const winTex = [windowTexture(0.25, rng), windowTexture(0.45, rng), windowTexture(0.12, rng)];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x555550 });
  const lines = roadLines();
  const parkBlocks = new Set(['1,6', '6,2', '3,3']);
  const dockBlock = '6,7'; // containers by the beach

  for (let i = 0; i < WORLD.blocks; i++) {
    for (let j = 0; j < WORLD.blocks; j++) {
      const key = i + ',' + j;
      const bx = lines[i] + WORLD.roadHalf, bz = lines[j] + WORLD.roadHalf;
      const bw = WORLD.pitch - WORLD.roadHalf * 2;
      if (parkBlocks.has(key)) {
        // park: grass mounds + palm trees
        for (let k = 0; k < 5; k++) addPalm(group, rng, bx + 6 + rng() * (bw - 12), bz + 6 + rng() * (bw - 12));
        const mound = new THREE.Mesh(new THREE.SphereGeometry(6, 10, 6), new THREE.MeshLambertMaterial({ color: 0x4a8a44 }));
        mound.scale.y = 0.25; mound.position.set(bx + bw / 2, 0, bz + bw / 2);
        group.add(mound);
        continue;
      }
      if (key === dockBlock) {
        // container yard
        const cols = [0xd83a2e, 0x2e6fd8, 0x30c878, 0xf2c230];
        for (let k = 0; k < 6; k++) {
          const c = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: cols[k % 4] }));
          c.scale.set(10, 3, 3.4);
          c.position.set(bx + 8 + (k % 3) * 12, 1.5, bz + 8 + Math.floor(k / 3) * 8);
          c.rotation.y = (k % 2) * 0.08;
          c.castShadow = true;
          group.add(c);
          buildings.push({ minX: c.position.x - 5, maxX: c.position.x + 5, minZ: c.position.z - 1.8, maxZ: c.position.z + 1.8 });
        }
        continue;
      }
      // 1-3 buildings per block
      const n = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        const w = 10 + rng() * 14, d = 10 + rng() * 14;
        const h = 8 + rng() * rng() * 34;
        const x = bx + 5 + rng() * (bw - 10 - w);
        const z = bz + 5 + rng() * (bw - 10 - d);
        const tex = pick(rng, winTex).clone();
        tex.needsUpdate = true;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(Math.max(1, Math.round(w / 9)), Math.max(1, Math.round(h / 9)));
        const mat = new THREE.MeshLambertMaterial({ color: pick(rng, COLOURS.building), map: tex });
        const m = new THREE.Mesh(boxGeo, mat);
        m.scale.set(w, h, d);
        m.position.set(x + w / 2, h / 2, z + d / 2);
        m.castShadow = true; m.receiveShadow = true;
        group.add(m);
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.scale.set(w * 0.3, 1.2, d * 0.3);
        roof.position.set(x + w / 2, h + 0.6, z + d / 2);
        group.add(roof);
        buildings.push({ minX: x, maxX: x + w, minZ: z, maxZ: z + d });
      }
      // a palm or two on the sidewalk corners
      if (rng() < 0.6) addPalm(group, rng, bx + 2, bz + 2);
      if (rng() < 0.4) addPalm(group, rng, bx + bw - 2, bz + bw - 2);
    }
  }

  // street lamps along roads
  const lampPole = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const lampHead = new THREE.SphereGeometry(0.45, 8, 6);
  const lampGlow = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffe9a8, emissiveIntensity: 0.7 });
  for (const L of lines) {
    for (let d = -220; d <= 220; d += 52) {
      for (const [lx, lz] of [[L + WORLD.roadHalf + 0.8, d], [d, L + WORLD.roadHalf + 0.8]]) {
        const pole = new THREE.Mesh(lampPole, lampMat);
        pole.position.set(lx, 3.5, lz);
        group.add(pole);
        const head = new THREE.Mesh(lampHead, lampGlow);
        head.position.set(lx, 7.1, lz);
        group.add(head);
      }
    }
  }

  // pier into the sea (south edge, near the docks)
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
  for (let k = 0; k < 14; k++) {
    const plank = new THREE.Mesh(boxGeo, pierMat);
    plank.scale.set(10, 0.5, 5);
    plank.position.set(130, 1.2, WORLD.beachZ + 8 + k * 5);
    group.add(plank);
  }
  for (let k = 0; k < 4; k++) addPalm(group, rng, 118 + rng() * 24, WORLD.beachZ - 8 - rng() * 6);

  scene.add(group);
  return { buildings, group };
}

function addPalm(group, rng, x, z) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.4, 6, 6),
    new THREE.MeshLambertMaterial({ color: COLOURS.trunk }),
  );
  trunk.position.set(x, 3, z);
  trunk.rotation.z = (rng() - 0.5) * 0.15;
  trunk.castShadow = true;
  group.add(trunk);
  const frondMat = new THREE.MeshLambertMaterial({ color: COLOURS.palm });
  for (let k = 0; k < 6; k++) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.5, 4), frondMat);
    const a = (k / 6) * Math.PI * 2;
    frond.position.set(x + Math.cos(a) * 1.6, 6.4, z + Math.sin(a) * 1.6);
    frond.rotation.z = Math.cos(a) * 1.1;
    frond.rotation.x = -Math.sin(a) * 1.1;
    group.add(frond);
  }
}
