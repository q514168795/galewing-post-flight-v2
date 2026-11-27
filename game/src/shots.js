// SPDX-License-Identifier: MIT
// Deterministic ?shot= staging for 4 polished WebGL2 competition screenshots (sync paint + 8 rAF + __shotReady).

import { buildArchipelago } from './terrain.js';
import { createWeatherState, stepWeather } from './weather.js';
import { createAircraft, stepFlightModel } from './flightModel.js';
import { buildSortieMission } from './missions.js';
import { createCameraState, snapCameraToPlane } from './camera.js';
import { computeRefitMods, REFIT_CATALOG } from './refits.js';
import { evaluateFeats } from './feats.js';
import { createEmptySlots } from './save.js';

export function buildShotState(shotName, seed, actions) {
  const world = buildArchipelago(seed);
  const ownedRefits = [
    'twin-supercharger',
    'brass-props',
    'slotted-flaps',
    'albatross-tips',
    'gyro-compass',
    'storm-radar',
  ];
  const refitMods = computeRefitMods(ownedRefits);

  const campaign = {
    seed,
    sortieIndex: 5,
    completedSorties: 5,
    totalScore: 142800,
    postage: 240,
    refits: ownedRefits,
    sortieScores: [
      { score: 21400, rating: 'GREASED' },
      { score: 24900, rating: 'GREASED' },
      { score: 26300, rating: 'FIRM' },
      { score: 29800, rating: 'GREASED' },
      { score: 31200, rating: 'GREASED' },
      { score: 35600, rating: 'GREASED' },
      { score: 42400, rating: 'GREASED' },
    ],
    stats: {
      greasedLandings: 6,
      centerlineHits: 4,
      bestStreak: 6,
      bullseyeDrops: 3,
      stormCleared: true,
      thermalClimbFt: 620,
      bingoLandings: 1,
      usedCockpit: true,
      cleanHullSorties: 5,
      maxSetPieces: 2,
      fullFlapLanding: false,
    },
    feats: [],
  };

  if (shotName === 'play-cover') {
    // Climax Golden Hour WebGL2 3/4 Chase View: sculpted AERO-7 PELICAN banking into Final Gate toward long RWY 09!
    const mission = buildSortieMission(5, world, refitMods);
    const weather = createWeatherState('goldenHour', seed, mission.thermals);
    stepWeather(weather, 1.8);

    const rwy = mission.targetRunway;
    for (let i = 0; i < mission.rings.length - 1; i++) mission.rings[i].cleared = true;
    mission.ringsCleared = mission.rings.length - 1;
    for (const dz of mission.dropZones) dz.delivered = true;
    mission.dropsCleared = mission.dropZones.length;
    mission.streak = 6;
    mission.bestStreak = 6;
    mission.score = 18400;
    mission.timeLeft = 74;
    mission.postageEarned = 640;
    mission.radioLine = 'Cleared RWY 09 — hold 15° flaps & glide PAPI.';

    // Exact 4.3-deg glideslope into long 540m coastal runway -> CRISP 2 WHITE / 2 RED PAPI (PAPI ON green!)
    const finalRing = mission.rings[mission.rings.length - 1];
    finalRing.x = rwy.x - rwy.dirX * 440;
    finalRing.z = rwy.z - rwy.dirZ * 440;
    finalRing.y = rwy.y + 24;
    finalRing.yaw = rwy.headingRad;
    finalRing.cleared = false;

    // Hero aircraft cleanly in LOWER-LEFT third banking gracefully RIGHT (+10 deg) INTO the centered Final Gate & RWY 09!
    const plane = createAircraft(
      {
        x: finalRing.x - rwy.dirX * 162 - rwy.rightX * 36,
        y: rwy.y + 31.5,
        z: finalRing.z - rwy.dirZ * 162 - rwy.rightZ * 36,
        headingDeg: rwy.headingDeg + 5,
        speedKts: 88,
        pitchRad: -0.045,
        rollRad: 0.18,
        throttle: 0.54,
        fuelPct: 68,
        hullPct: 94,
      },
      refitMods,
    );
    plane.flapIndex = 1;
    plane.flapsDeg = 15;
    plane.aileronDeflect = 0.46;
    plane.propAngle = 0.6;
    plane.boosting = false;

    for (let s = 0; s < 24; s++) {
      const k = 24 - s;
      plane.trail.push({
        x: plane.x - Math.sin(plane.yaw) * k * 2.5,
        y: plane.y + k * 0.18,
        z: plane.z - Math.cos(plane.yaw) * k * 2.5,
        roll: plane.roll * (0.55 + (s / 24) * 0.45),
        yaw: plane.yaw,
      });
    }
    stepFlightModel(plane, { pitch: 0, roll: 0.04, yaw: 0, throttleDelta: 0, boost: false }, world, weather, refitMods, 1 / 60);
    plane.verticalFpm = -240;

    // Asymmetric heroic chase camera: frames hero aircraft lower-left, lighthouse cleanly unobstructed to its left, PAPI 2W/2R clearly visible outside Final Gate!
    const camera = createCameraState(plane);
    camera.mode = 'chase';
    snapCameraToPlane(camera, plane);
    camera.x = plane.x - Math.sin(rwy.headingRad) * 29 + rwy.rightX * 15;
    camera.y = plane.y + 7.2;
    camera.z = plane.z - Math.cos(rwy.headingRad) * 29 + rwy.rightZ * 15;
    camera.yaw = rwy.headingRad - 0.11;
    camera.pitch = -0.088;
    camera.roll = 0.02;
    camera.fovDeg = 54;

    return {
      screen: 'play',
      paused: false,
      selectedSlot: 0,
      logbookSlots: createEmptySlots(),
      world,
      weather,
      plane,
      mission,
      camera,
      campaign,
      refitMods,
      hangar: null,
      debrief: null,
      actions,
    };
  }

  if (shotName === 'cockpit-storm') {
    // True 3D Perspective Cockpit in Monsoon Squall: tilted outside storm horizon matches Attitude & Turn gauges 100%!
    campaign.sortieIndex = 2;
    campaign.completedSorties = 2;
    campaign.totalScore = 68450;
    const mission = buildSortieMission(2, world, refitMods);
    const weather = createWeatherState('monsoon', seed, mission.thermals);
    stepWeather(weather, 2.4);
    weather.lightningFlash = 0.88;
    weather.lightningBoltX = 0.78;
    weather.windSpeedKts = 28;

    const rwy = mission.targetRunway;
    for (let i = 0; i < mission.rings.length - 1; i++) mission.rings[i].cleared = true;
    mission.ringsCleared = mission.rings.length - 1;
    for (const dz of mission.dropZones) dz.delivered = true;
    mission.dropsCleared = mission.dropZones.length;
    mission.streak = 4;
    mission.timeLeft = 41;
    mission.score = 12900;
    mission.radioLine = '28 KT gusts! Cut boost at 18% fuel — ILS RWY 08.';

    const finalRing = mission.rings[mission.rings.length - 1];
    finalRing.x = rwy.x - rwy.dirX * 435;
    finalRing.z = rwy.z - rwy.dirZ * 435;
    finalRing.y = rwy.y + 28;
    finalRing.yaw = rwy.headingRad;
    finalRing.cleared = false;

    const plane = createAircraft(
      {
        x: finalRing.x - rwy.dirX * 185 + rwy.rightX * 12,
        y: rwy.y + 32.5,
        z: finalRing.z - rwy.dirZ * 185 + rwy.rightZ * 12,
        headingDeg: rwy.headingDeg - 2,
        speedKts: 86,
        pitchRad: -0.048,
        rollRad: -0.15, // Clear -8.5 deg LEFT bank matching symmetrically centered cockpit, tilted WebGL2 horizon, Attitude & Turn gauges!
        throttle: 0.56,
        fuelPct: 18,
        hullPct: 64,
      },
      refitMods,
    );
    plane.flapIndex = 1;
    plane.flapsDeg = 15;
    plane.bingoFuel = true;
    plane.verticalFpm = -260;

    const camera = createCameraState(plane);
    camera.mode = 'cockpit';
    snapCameraToPlane(camera, plane);

    return {
      screen: 'play',
      paused: false,
      selectedSlot: 0,
      logbookSlots: createEmptySlots(),
      world,
      weather,
      plane,
      mission,
      camera,
      campaign,
      refitMods,
      hangar: null,
      debrief: null,
      actions,
    };
  }

  if (shotName === 'hangar-refit') {
    // Live 3D Waterfront Hangar Bay + Varied Rarities (RARE / EPIC / COMMON) + Tight Meaningful Economy (240P vs 150P)!
    campaign.sortieIndex = 5;
    campaign.completedSorties = 5;
    campaign.postage = 240;
    campaign.refits = ['brass-props', 'slotted-flaps', 'oleo-struts', 'gyro-compass', 'storm-radar'];
    const choices = [
      REFIT_CATALOG.find((r) => r.id === 'twin-supercharger'), // RARE (Turbocharger 1->2 unlocks 2pc!)
      REFIT_CATALOG.find((r) => r.id === 'pelican-chines'), // EPIC (Glider 2->3 unlocks 3pc!)
      REFIT_CATALOG.find((r) => r.id === 'postmaster-seal'), // COMMON (Avionics 2->3 unlocks 3pc!)
    ];
    return {
      screen: 'hangar',
      paused: false,
      selectedSlot: 0,
      logbookSlots: createEmptySlots(),
      world,
      weather: createWeatherState('goldenHour', seed),
      plane: null,
      mission: null,
      camera: null,
      campaign,
      refitMods: computeRefitMods(campaign.refits),
      hangar: {
        choices,
        selectedIndex: 0,
        rerollCost: 150,
        freeRerolls: 0,
        rerollCount: 0,
      },
      debrief: null,
      actions,
    };
  }

  // Live 3D Imperial Harbor Sunset Debrief & Archipelago Flight Route Map (14/16 authentic earned medals!)
  campaign.sortieIndex = 7;
  campaign.completedSorties = 7;
  campaign.totalScore = 211600;
  campaign.postage = 4890;
  campaign.refits = [
    'twin-supercharger',
    'brass-props',
    'slotted-flaps',
    'albatross-tips',
    'gyro-compass',
    'storm-radar',
    'chart-folio',
  ];
  evaluateFeats(campaign);

  return {
    screen: 'debrief',
    paused: false,
    selectedSlot: 0,
    logbookSlots: createEmptySlots(),
    world,
    weather: createWeatherState('goldenHour', seed),
    plane: null,
    mission: null,
    camera: null,
    campaign,
    refitMods: computeRefitMods(campaign.refits),
    hangar: null,
    debrief: {
      grade: 'S',
      headline: 'ALL 7 AMBER ARCHIPELAGO SORTIES COMPLETED · MASTER AIRMAIL PILOT',
      fuelPct: 44,
      hullPct: 92,
      crashReason: '',
      lastLanding: {
        runwayCode: 'RWY 09',
        islandName: 'Imperial Harbor',
        fpm: -140,
        rating: 'GREASED',
        centerlinePct: 98,
        centerOffset: 0.4,
        touchSpeedKts: 66,
        flapsDeg: 35,
        bonus: 3500,
      },
    },
    actions,
  };
}

export function runDeterministicShot(shotName, seed, renderer, actions) {
  const state = buildShotState(shotName, seed, actions);
  renderer.resize();
  renderer.draw(state);

  let painted = 0;
  function tick() {
    renderer.resize();
    renderer.draw(state);
    painted++;
    if (painted < 8) {
      window.requestAnimationFrame(tick);
    } else {
      window.__shotReady = true;
    }
  }
  window.requestAnimationFrame(tick);
}
