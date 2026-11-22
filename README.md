# makefun-gta6-01 — SOLMARINA

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/xexdartono-prog/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/xexdartono-prog/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**SOLMARINA** — an original open-world crime game in the spirit of GTA 6, built with
three.js. A sun-soaked coastal city to explore on foot and by car, with traffic and
pedestrians, cars to steal and drive, a wanted system with police who chase and bust
you, a three-mission story, combat, a HUD with a live minimap, a start screen, saves,
and synthesized sound — all running offline from static files.

## Play it

Serve `game/` with any static server and open `game/index.html` in desktop Chrome:

```sh
cd game && python3 -m http.server 8080
```

WASD move/drive · SHIFT run · E enter/steal car · F punch · CLICK shoot ·
SPACE handbrake · drag mouse to look · P pause · M mute.

## Systems

- `game/src/city.js` — procedural Solmarina: streets, buildings, parks, docks, beach, pier
- `game/src/vehicles.js` — car factory, arcade driving, traffic AI
- `game/src/people.js` — the player on foot, wandering pedestrians
- `game/src/police.js` — wanted stars, patrol cars, foot cops, busts
- `game/src/missions.js` — three story missions for fixer Mara Voss
- `game/src/combat.js` — fists, pistol, health, WASTED
- `game/src/hud.js` — cash, health, stars, objective, minimap
- `game/src/audio.js` — synthesized engine, sirens, gunshots, music
- `game/src/shots.js` — deterministic screenshot scenes (`?shot=cover|drive|chase|mission`)
