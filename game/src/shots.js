// Screenshot staging: deterministic scenes behind ?shot=cover|drive|chase|mission.
// Each scene repositions the actors, sets the wanted level and mission, then warms the
// simulation up for a fixed number of steps so the frame is what real play looks like.
import { startMission } from './missions.js';
import { spawnCar } from './vehicles.js';
import { COLOURS } from './config.js';

function putPlayerInCar(G, car, x, z, heading, speed) {
  car.x = x; car.z = z; car.heading = heading; car.speed = speed;
  car.mesh.position.set(x, 0, z);
  car.mesh.rotation.y = heading;
  G.player.car = car;
  car.isPlayer = true;
  G.player.x = x; G.player.z = z; G.player.heading = heading;
  G.player.mesh.visible = false;
  G.camYaw = heading + Math.PI; // chase camera behind the car
}

function putPlayerOnFoot(G, x, z, heading) {
  if (G.player.car) { G.player.car.isPlayer = false; G.player.car = null; }
  G.player.x = x; G.player.z = z; G.player.heading = heading;
  G.player.mesh.visible = true;
  G.player.mesh.position.set(x, 0, z);
  G.player.mesh.rotation.y = heading;
  G.camYaw = heading + Math.PI; // camera behind the player
}

/** n police cars approaching head-on (visible ahead of the player), staggered in z. */
function addPoliceHeadOn(G, x, z, heading, n) {
  for (let i = 0; i < n; i++) {
    const car = spawnCar(G.scene, 'police', COLOURS.police, x, z - i * 16, heading);
    car.isPolice = true;
    G.cars.push(car);
  }
}

/** Stage a named scene; returns warmup frames to simulate before the shot. */
export function applyShot(G, name) {
  const p = G.player;
  p.cash = 1250;
  p.health = 100;
  if (name === 'cover') {
    // Dario in the red Veloce on the main avenue (road x=26, right lane x=29),
    // one star, a unit coming head-on, Mara's job on the HUD.
    const car = G.missionCar;
    putPlayerInCar(G, car, 29, -80, 0, 16);
    p.wanted = 1;
    addPoliceHeadOn(G, 23, 0, Math.PI, 1);
    startMission(G, 0);
    G.shot = { warmup: 60, drive: true, steer: 0 };
  } else if (name === 'drive') {
    // Flat out along the beach road in a taxi, sea on the right.
    const car = spawnCar(G.scene, 'taxi', COLOURS.taxi, -120, 238, Math.PI / 2);
    G.cars.push(car);
    putPlayerInCar(G, car, -120, 238, Math.PI / 2, 30);
    p.wanted = 0;
    G.shot = { warmup: 90, drive: true, steer: 0 };
  } else if (name === 'chase') {
    // Three stars, two units coming head-on downtown, racing the getaway clock.
    const car = spawnCar(G.scene, 'sedan', 0xd83a2e, -29, 40, Math.PI);
    G.cars.push(car);
    putPlayerInCar(G, car, -29, 40, Math.PI, 22);
    addPoliceHeadOn(G, -23, -30, 0, 2);
    startMission(G, 2);
    G.shot = { warmup: 60, drive: true, steer: 0 };
  } else if (name === 'mission') {
    // On foot south of the containers, facing the yellow marker pillar.
    putPlayerOnFoot(G, 104, 162, Math.PI);
    p.wanted = 0;
    startMission(G, 0);
    G.shot = { warmup: 60, drive: false, steer: 0 };
  } else {
    G.shot = { warmup: 30, drive: false, steer: 0 };
  }
  return G.shot.warmup;
}
