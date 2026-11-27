# galewing-post-flight-v2

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/q514168795/galewing-post-flight-v2/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/q514168795/galewing-post-flight-v2/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**GALEWING POST: Amber Archipelago** is an original offline **WebGL2 3D** coastal airmail flight game built from scratch with custom GLSL ES 3.00 shaders, modular ES JavaScript, and procedural WebAudio — zero external libraries, zero build step, and zero network requests.

Pilot the vintage cream-and-crimson twin-engine amphibious flying boat **AERO-7 PELICAN** across seven handcrafted archipelago sorties: thread volcanic canyon rings, drop parachute mail sacks onto coastal lighthouse piers, battle 28-knot monsoon crosswinds from a symmetric 3D lit cockpit with collimated ILS HUD, climb volcanic thermal ribbons, nurse bingo fuel reserves, and stick PAPI-guided runway landings rated by real vertical touchdown rate (FPM) and centerline alignment.

## Features

- **Custom WebGL2 3D Engine (`webgl2.js`, `shaders.js`, `meshBuilder.js`, `meshWorld.js`, `meshAircraft.js`, `cockpit3d.js`)**: True linear-HDR ACES tone-mapped pipeline with 2048×2048 PCF directional shadow maps, Rayleigh/Mie sunset & monsoon sky dome with backlit volumetric clouds and branching storm lightning, animated Fresnel ocean with turquoise coastal shallows and surf foam, procedural multi-biome island cliffs/meadows/beaches, sculpted twin-engine seaplane with deflected flaps, spinning prop blur, nav lights, curling wingtip vortices, and a live 3D waterfront Hangar Refit Bay.
- **Dual Playable Perspectives (`C`)**: Smooth spring-damped 3D chase camera over the articulated twin-prop seaplane, plus a true 3D first-person cockpit with continuous canopy frame, outboard radial nacelles, collimated emerald ILS HUD (`GS` / `LOC` / `FPV`), windshield rain, and backlit six-pack aviation gauges.
- **Aerodynamic Flight Model (`flightModel.js`)**: True airspeed/lift/gravity energy conservation, aerodynamic stall & buffet, three-stage flaps (`F`: 0° / 15° / 35°), boost overburn (2.5× fuel), crosswind drift, volcanic updraft thermals, airframe integrity, and real FPM landing grades (`GREASED` / `FIRM` / `HARD` / `CRASH`).
- **7 Distinct Sorties (`missions.js`)**: Canyon Ring Run, Lighthouse Airdrop, Monsoon Medevac, Caldera Thermal Climb, Bingo Fuel Glide, Dusk Strait Express, and Archipelago Grand Circuit.
- **18 Hangar Refits & 3-Piece Set Synergies (`refits.js`)**: Pick 1 of 3 vintage airmail-stamp upgrades between legs (`TURBOCHARGER`, `GLIDER WING`, `AVIONICS`) with live 3D aircraft part preview, blueprint stat-delta bars, Postage economy, rerolls (`X`), 16 pilot medals (`feats.js`), nautical flight-route debrief, and 3-slot local logbook saves (`save.js`).

## Controls

- `W` / `S` — Pitch nose down / up (or click-drag mouse yoke)
- `A` / `D` or `←` / `→` — Bank roll left / right
- `Q` / `E` — Rudder yaw left / right
- `↑` / `↓` — Increase / decrease throttle (`Shift` for WEP boost)
- `F` — Cycle flaps (`0°` / `15°` / `35°`)
- `Space` — Drop parachute airmail sack
- `C` — Toggle Chase / Lit 3D Cockpit view
- `P` — Pause · `R` — Retry sortie · `M` — Mute procedural WebAudio

## Run it

```sh
node serve.ts
```

Open `http://127.0.0.1:8080` in desktop Chrome.

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
