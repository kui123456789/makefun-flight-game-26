# Skyline Courier

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/kui123456789/makefun-flight-game-26/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/kui123456789/makefun-flight-game-26/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

A little red prop plane, one long valley, and a strip at the far end.
**Skyline Courier** is a complete, original 2D flight game that runs offline
in a desktop browser from static files — no build step, no network requests.

Fly the valley in chase view over procedural terrain: patchwork fields, a
river crossing, pine forests and snow-capped ridges, with the sun, drifting
clouds and a live compass tape overhead. Thread the target rings, watch your
fuel gauge, and bring her home: a gentle, lined-up touchdown on the runway
scores a landing bonus; a steep, fast or sideways arrival — or any meeting
with the terrain — ends the sortie.

## How to play

Pick one of three missions on the title screen, then take off:

- **Ring Run** — thread 8 rings over the valley, then land on the strip.
- **Canyon Dash** — low and fast through the canyon. 10 rings, little room
  to climb.
- **Storm Landing** — crosswind, half a tank, one runway. Land it clean.

Each ring you thread adds to your score. Fuel burns faster at full throttle
and damage builds up if you scrape the valley walls — a sortie is a
decision between pushing on and playing it safe.

### Controls

| Input | Action |
| --- | --- |
| `↑` / `↓` | Pitch nose up / down |
| `←` / `→` or `A` / `D` | Bank and turn |
| `W` / `S` | Throttle up / down |
| `Space` | Brake |
| `1` / `2` / `3` | Pick a mission |
| `Enter` | Take off |
| `R` | Restart the sortie |
| `P` | Pause |
| Mouse | Drag on the sky to steer; the throttle slider sets power |

The HUD shows altitude, speed, heading, vertical speed, throttle, fuel,
damage, score and rings, plus an attitude indicator and a heading tape.
Engine hum, ring chimes and touchdown thuds are synthesised live with
WebAudio — no audio files.

## Run it

Serve the `game/` folder with any static server and open `index.html`:

```sh
cd game
python3 -m http.server 8080
# open http://localhost:8080/
```

Or with Node, from the repository root:

```sh
node serve.ts
# open http://localhost:8080/
```

Deterministic screenshot scenes (used for the entry's screenshots) are
available as query parameters — they freeze a fixed scene so renders
reproduce exactly:

- `?shot=start&seed=20261126` — title screen
- `?shot=play&seed=20261126` — mid-flight through the valley
- `?shot=rings&seed=20261126` — closing on a ring
- `?shot=landing&seed=20261126` — final approach to the runway

## Layout

- `game/index.html` — page, HUD and overlays
- `game/src/main.js` — game loop and state (title, flying, landed, crashed)
- `game/src/physics.js` — flight model: throttle, lift, drag, wind, fuel, damage
- `game/src/terrain.js` — seeded valley course: segments, rings, runway, clouds
- `game/src/render.js` — pseudo-3D chase view, aircraft, rings, gauges
- `game/src/hud.js` — DOM instrument panel
- `game/src/input.js` — keyboard and mouse controls
- `game/src/audio.js` — synthesised WebAudio sounds
- `game/src/shots.js` — deterministic screenshot scenes
- `game/src/util.js` — seeded random numbers and numeric helpers
- `main.ts` — the entry program: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json` with the vendored make.fun library
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged

## License

MIT — see `LICENSE`.
