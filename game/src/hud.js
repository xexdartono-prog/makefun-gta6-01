// HUD: cash, health, wanted stars, objective, speed — and the minimap canvas.
import { WORLD, roadLines } from './config.js';
import { missionTarget, missionText } from './missions.js';

let toastTimer = null;

/** Big centre toast, auto-hiding. */
export function showToast(text, ms) {
  const el = document.getElementById('toast');
  el.innerHTML = text;
  el.style.display = 'block';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, ms || 2500);
}

const cashEl = document.getElementById('cash');
const healthEl = document.getElementById('healthfill');
const wantedEl = document.getElementById('wanted');
const speedEl = document.getElementById('speed');
const objTag = document.getElementById('objtag');
const objTxt = document.getElementById('objtxt');
const objDist = document.getElementById('objdist');
const crosshair = document.getElementById('crosshair');
const mini = document.getElementById('minimap');
const mctx = mini.getContext('2d');

/** Refresh every HUD readout from the game state. */
export function updateHUD(G) {
  const p = G.player;
  cashEl.childNodes[0].textContent = '$' + p.cash.toLocaleString('en-US');
  healthEl.style.width = Math.max(0, p.health) + '%';
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < p.wanted ? '★' : '<span class="dim">★</span>';
  wantedEl.innerHTML = stars;
  const mph = p.car ? Math.round(Math.abs(p.car.speed) * 2.24) : 0;
  speedEl.childNodes[0].textContent = p.car ? mph : '—';
  const mt = missionText(G);
  objTag.textContent = mt.tag;
  objTxt.textContent = mt.text;
  const t = missionTarget(G);
  if (t) {
    const d = Math.round(Math.hypot(p.x - t.x, p.z - t.z));
    objDist.textContent = d + 'm away';
    if (G.missionTimer > 0) objDist.textContent += '  ·  ' + Math.ceil(G.missionTimer) + 's left';
  } else objDist.textContent = '';
  crosshair.style.display = (!p.car && G.state === 'play') ? 'block' : 'none';
}

/** Top-down minimap: roads, blocks, player, cars, cops, mission marker. */
export function drawMinimap(G) {
  const W = 180, S = W / 520;
  const X = (x) => (x + 260) * S, Z = (z) => (z + 260) * S;
  mctx.fillStyle = '#20242c';
  mctx.fillRect(0, 0, W, W);
  // sea + sand
  mctx.fillStyle = '#1e7fa8';
  mctx.fillRect(0, Z(WORLD.seaZ), W, W - Z(WORLD.seaZ));
  mctx.fillStyle = '#e8d29a';
  mctx.fillRect(0, Z(WORLD.beachZ), W, Z(WORLD.seaZ) - Z(WORLD.beachZ));
  // blocks
  mctx.fillStyle = '#3a3f47';
  const lines = roadLines();
  for (let i = 0; i < WORLD.blocks; i++) for (let j = 0; j < WORLD.blocks; j++) {
    mctx.fillRect(X(lines[i] + WORLD.roadHalf), Z(lines[j] + WORLD.roadHalf), (WORLD.pitch - 12) * S, (WORLD.pitch - 12) * S);
  }
  // roads
  mctx.fillStyle = '#565b64';
  for (const L of lines) {
    mctx.fillRect(0, Z(L - WORLD.roadHalf), W, 12 * S);
    mctx.fillRect(X(L - WORLD.roadHalf), 0, 12 * S, Z(WORLD.beachZ));
  }
  const p = G.player;
  // mission marker
  const t = missionTarget(G);
  if (t) {
    const pulse = 4 + Math.sin(performance.now() * 0.006) * 1.5;
    mctx.fillStyle = '#ffcf3d';
    mctx.beginPath(); mctx.arc(X(t.x), Z(t.z), pulse, 0, Math.PI * 2); mctx.fill();
    mctx.strokeStyle = '#ffcf3d'; mctx.lineWidth = 1.5;
    mctx.beginPath(); mctx.arc(X(t.x), Z(t.z), pulse + 3, 0, Math.PI * 2); mctx.stroke();
  }
  // traffic (white) and police (flashing blue/red)
  for (const c of G.cars) {
    if (c.isPolice) {
      mctx.fillStyle = Math.floor(performance.now() / 300) % 2 ? '#ff4444' : '#4488ff';
    } else if (c.isPlayer) continue;
    else mctx.fillStyle = '#dddddd';
    mctx.fillRect(X(c.x) - 1.5, Z(c.z) - 1.5, 3, 3);
  }
  // cops on foot
  mctx.fillStyle = '#4488ff';
  for (const cop of G.cops) mctx.fillRect(X(cop.x) - 1.5, Z(cop.z) - 1.5, 3, 3);
  // player arrow
  mctx.save();
  mctx.translate(X(p.x), Z(p.z));
  mctx.rotate(Math.atan2(Math.sin(p.heading), Math.cos(p.heading)) * -1 + Math.PI);
  mctx.fillStyle = '#ffffff';
  mctx.beginPath();
  mctx.moveTo(0, -6); mctx.lineTo(4.5, 5); mctx.lineTo(-4.5, 5); mctx.closePath();
  mctx.fill();
  mctx.restore();
  // view cone edge
  mctx.strokeStyle = 'rgba(255,255,255,0.5)';
  mctx.strokeRect(0.5, 0.5, W - 1, W - 1);
}
