// SPDX-License-Identifier: MIT
// Galewing Post main entry point: fixed-timestep simulation loop, state machine, and deterministic shot hook.

import { BASE_HEIGHT, BASE_WIDTH, DEFAULT_SEED, FIXED_DT } from './config.js';
import { buildArchipelago } from './terrain.js';
import { createWeatherState, stepWeather } from './weather.js';
import { createAircraft, cycleFlaps, stepFlightModel } from './flightModel.js';
import { buildSortieMission, launchMailDrop, SORTIE_DEFS, stepMission } from './missions.js';
import { createCameraState, snapCameraToPlane, updateCamera } from './camera.js';
import { computeRefitMods, countSetPieces, rollHangarChoices } from './refits.js';
import { evaluateFeats } from './feats.js';
import { loadLogbookSlots, saveLogbookSlot } from './save.js';
import { createFlightAudio } from './audio.js';
import { createInputController } from './input.js';
import { createWebGL2Renderer } from './webgl2.js';
import { renderFlightHud } from './hud.js';
import { renderDebriefScreen, renderHangarScreen, renderTitleScreen } from './screens.js';
import { runDeterministicShot } from './shots.js';

const frameEl = document.getElementById('frame');
const glCanvas = document.getElementById('gl-stage');
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const webgl = glCanvas ? createWebGL2Renderer(glCanvas) : null;
const audio = createFlightAudio();

const params = new URLSearchParams(window.location.search);
const shotParam = params.get('shot');
const seedParam = Number(params.get('seed')) || DEFAULT_SEED;
const isShotMode = Boolean(shotParam);

const state = {
  screen: 'title', // 'title' | 'play' | 'hangar' | 'debrief'
  paused: false,
  selectedSlot: 0,
  logbookSlots: loadLogbookSlots(isShotMode),
  world: null,
  weather: null,
  plane: null,
  mission: null,
  camera: null,
  campaign: null,
  refitMods: null,
  hangar: null,
  debrief: null,
  crashCooldownAt: 0,
  actions: null,
};

function createRenderer(input) {
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const vw = window.innerWidth || BASE_WIDTH;
    const vh = window.innerHeight || BASE_HEIGHT;
    const aspect = BASE_WIDTH / BASE_HEIGHT;
    let cssW = vw;
    let cssH = Math.round(vw / aspect);
    if (cssH > vh) {
      cssH = vh;
      cssW = Math.round(vh * aspect);
    }
    if (frameEl) {
      frameEl.style.width = `${cssW}px`;
      frameEl.style.height = `${cssH}px`;
    }
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(BASE_WIDTH * dpr);
    canvas.height = Math.round(BASE_HEIGHT * dpr);
    if (glCanvas) {
      glCanvas.style.width = `${cssW}px`;
      glCanvas.style.height = `${cssH}px`;
      glCanvas.width = Math.round(BASE_WIDTH * dpr);
      glCanvas.height = Math.round(BASE_HEIGHT * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(targetState) {
    ctx.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
    if (targetState.screen === 'title' || targetState.screen === 'play') {
      if (webgl) {
        webgl.renderWorldWebGL(targetState, BASE_WIDTH, BASE_HEIGHT);
      } else {
        ctx.fillStyle = '#102230';
        ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
      }
      if (targetState.screen === 'play') {
        renderFlightHud(ctx, targetState, BASE_WIDTH, BASE_HEIGHT);
      } else {
        renderTitleScreen(ctx, targetState, input, BASE_WIDTH, BASE_HEIGHT);
      }
    } else if (targetState.screen === 'hangar') {
      const anchor = webgl ? webgl.renderHangarWebGL(targetState, BASE_WIDTH, BASE_HEIGHT) : null;
      renderHangarScreen(ctx, targetState, input, BASE_WIDTH, BASE_HEIGHT, anchor);
    } else if (targetState.screen === 'debrief') {
      if (webgl) {
        webgl.renderDebriefWebGL(targetState, BASE_WIDTH, BASE_HEIGHT);
      }
      renderDebriefScreen(ctx, targetState, input, BASE_WIDTH, BASE_HEIGHT);
    }
  }

  return { resize, draw };
}

function makeFreshCampaign(seed) {
  return {
    seed,
    sortieIndex: 0,
    completedSorties: 0,
    totalScore: 0,
    postage: 250,
    refits: [],
    sortieScores: [],
    stats: {
      greasedLandings: 0,
      centerlineHits: 0,
      bestStreak: 0,
      bullseyeDrops: 0,
      stormCleared: false,
      thermalClimbFt: 0,
      bingoLandings: 0,
      usedCockpit: false,
      cleanHullSorties: 0,
      maxSetPieces: 0,
      fullFlapLanding: false,
    },
    feats: [],
  };
}

function computeCampaignGrade(campaign, completedAll) {
  if (completedAll && campaign.totalScore >= 165000 && campaign.stats.greasedLandings >= 3) return 'S';
  if (campaign.completedSorties >= 5 || campaign.totalScore >= 110000) return 'A';
  if (campaign.completedSorties >= 2 || campaign.totalScore >= 45000) return 'B';
  return 'C';
}

function startSortie(sortieIdx) {
  state.refitMods = computeRefitMods(state.campaign.refits);
  state.mission = buildSortieMission(sortieIdx, state.world, state.refitMods);
  state.weather = createWeatherState(state.mission.def.weather, state.campaign.seed + sortieIdx * 17, state.mission.thermals);
  state.plane = createAircraft(state.mission.spawn, state.refitMods);
  state.camera = createCameraState(state.plane);
  snapCameraToPlane(state.camera, state.plane);
  state.paused = false;
  state.screen = 'play';
}

function openHangar() {
  const owned = state.campaign.refits;
  const mods = computeRefitMods(owned);
  state.hangar = {
    choices: rollHangarChoices(owned, state.campaign.seed, state.campaign.sortieIndex, 0),
    selectedIndex: 0,
    rerollCost: Math.max(50, 150 - (mods.rerollDiscount || 0)),
    freeRerolls: mods.freeReroll || 0,
    rerollCount: 0,
  };
  state.screen = 'hangar';
  audio.updateEngine(state.plane, false);
}

function openDebrief(lastLanding, crashReason = '') {
  evaluateFeats(state.campaign);
  const completedAll = state.campaign.completedSorties >= SORTIE_DEFS.length;
  const grade = computeCampaignGrade(state.campaign, completedAll);
  const fuelPct = state.plane ? Math.round((state.plane.fuel / state.plane.fuelCap) * 100) : 0;
  const hullPct = state.plane ? Math.round((state.plane.hull / state.plane.hullCap) * 100) : 0;

  state.debrief = {
    grade,
    headline: completedAll
      ? 'ALL 7 AMBER ARCHIPELAGO SORTIES COMPLETED · MASTER AIRMAIL PILOT'
      : `SORTIE ${state.campaign.sortieIndex + 1}/7 ENDED · ${crashReason || 'LOGGED'}`,
    fuelPct,
    hullPct,
    crashReason,
    lastLanding,
  };

  saveLogbookSlot(
    state.selectedSlot,
    {
      score: state.campaign.totalScore,
      grade,
      sorties: state.campaign.completedSorties,
      feats: state.campaign.feats.length,
      seed: state.campaign.seed,
    },
    isShotMode,
  );
  state.logbookSlots = loadLogbookSlots(isShotMode);
  state.screen = 'debrief';
  audio.updateEngine(state.plane, false);
}

function initTitleBackdrop(seed) {
  state.campaign = makeFreshCampaign(seed);
  state.world = buildArchipelago(seed);
  state.refitMods = computeRefitMods([]);
  state.mission = buildSortieMission(5, state.world, state.refitMods);
  state.weather = createWeatherState('goldenHour', seed, state.mission.thermals);
  state.plane = createAircraft(state.mission.spawn, state.refitMods);
  state.camera = createCameraState(state.plane);
  snapCameraToPlane(state.camera, state.plane);
  state.screen = 'title';
}

const actions = {
  selectSlot(idx) {
    audio.unlock();
    audio.playClick();
    state.selectedSlot = idx;
    const slot = state.logbookSlots[idx];
    if (slot && slot.seed) state.campaign.seed = slot.seed;
  },
  startCampaign() {
    audio.unlock();
    audio.playClick();
    const seed = state.campaign ? state.campaign.seed : seedParam;
    state.campaign = makeFreshCampaign(seed);
    state.world = buildArchipelago(seed);
    startSortie(0);
  },
  pickRefit(idx) {
    if (!state.hangar || !state.hangar.choices[idx]) return;
    audio.unlock();
    audio.playClick();
    const chosen = state.hangar.choices[idx];
    state.campaign.refits.push(chosen.id);
    const counts = countSetPieces(state.campaign.refits);
    state.campaign.stats.maxSetPieces = Math.max(
      state.campaign.stats.maxSetPieces,
      counts.turbocharger,
      counts.glider,
      counts.avionics,
    );
    evaluateFeats(state.campaign);
    startSortie(state.campaign.sortieIndex);
  },
  rerollHangar() {
    if (!state.hangar) return;
    audio.unlock();
    const cost = state.hangar.freeRerolls > 0 ? 0 : state.hangar.rerollCost;
    if (state.campaign.postage < cost) return;
    audio.playClick();
    if (state.hangar.freeRerolls > 0) state.hangar.freeRerolls--;
    else state.campaign.postage -= cost;
    state.hangar.rerollCount++;
    state.hangar.choices = rollHangarChoices(
      state.campaign.refits,
      state.campaign.seed,
      state.campaign.sortieIndex,
      state.hangar.rerollCount,
    );
  },
  restartNewSeed() {
    audio.unlock();
    audio.playClick();
    const nextSeed = ((state.campaign.seed * 1664525 + 1013904223) >>> 0) % 9000 + 1000;
    state.campaign = makeFreshCampaign(nextSeed);
    state.world = buildArchipelago(nextSeed);
    startSortie(0);
  },
  restartSameSeed() {
    audio.unlock();
    audio.playClick();
    const keepSeed = state.campaign.seed;
    state.campaign = makeFreshCampaign(keepSeed);
    state.world = buildArchipelago(keepSeed);
    startSortie(0);
  },
  returnToTitle() {
    audio.unlock();
    audio.playClick();
    initTitleBackdrop(state.campaign ? state.campaign.seed : seedParam);
  },
};
state.actions = actions;

const input = createInputController(canvas, {
  onKeyPress(code) {
    audio.unlock();
    if (code === 'KeyM') {
      audio.toggleMute();
      return;
    }

    if (state.screen === 'title') {
      if (code === 'Digit1') actions.selectSlot(0);
      else if (code === 'Digit2') actions.selectSlot(1);
      else if (code === 'Digit3') actions.selectSlot(2);
      else if (code === 'Enter' || code === 'Space') actions.startCampaign();
      return;
    }

    if (state.screen === 'hangar' && state.hangar) {
      if (code === 'KeyA' || code === 'ArrowLeft') {
        state.hangar.selectedIndex = (state.hangar.selectedIndex + 2) % 3;
        audio.playClick();
      } else if (code === 'KeyD' || code === 'ArrowRight') {
        state.hangar.selectedIndex = (state.hangar.selectedIndex + 1) % 3;
        audio.playClick();
      } else if (code === 'Digit1') actions.pickRefit(0);
      else if (code === 'Digit2') actions.pickRefit(1);
      else if (code === 'Digit3') actions.pickRefit(2);
      else if (code === 'Enter') actions.pickRefit(state.hangar.selectedIndex);
      else if (code === 'KeyX') actions.rerollHangar();
      return;
    }

    if (state.screen === 'debrief') {
      if (code === 'KeyR') actions.restartNewSeed();
      else if (code === 'KeyS') actions.restartSameSeed();
      else if (code === 'Enter' || code === 'Escape') actions.returnToTitle();
      return;
    }

    if (state.screen === 'play') {
      if (code === 'KeyP' || code === 'Escape') {
        state.paused = !state.paused;
        return;
      }
      if (code === 'KeyC') {
        state.camera.mode = state.camera.mode === 'chase' ? 'cockpit' : 'chase';
        if (state.camera.mode === 'cockpit') state.campaign.stats.usedCockpit = true;
        snapCameraToPlane(state.camera, state.plane);
        audio.playClick();
        return;
      }
      if (code === 'KeyF' && !state.paused && !state.plane.crashed) {
        cycleFlaps(state.plane);
        audio.playFlaps();
        return;
      }
      if (code === 'Space' && !state.paused && !state.plane.crashed) {
        if (launchMailDrop(state.mission, state.plane)) audio.playDrop();
        return;
      }
      if (code === 'KeyR' && performance.now() >= state.crashCooldownAt) {
        startSortie(state.campaign.sortieIndex);
        return;
      }
      if (code === 'Enter' && state.plane.crashed && performance.now() >= state.crashCooldownAt) {
        openDebrief(null, state.plane.crashReason);
      }
    }
  },
  onCanvasClick() {
    audio.unlock();
  },
});

const renderer = createRenderer(input);

function stepLiveSimulation(dt) {
  if (state.screen === 'title') {
    stepWeather(state.weather, dt);
    const autopilot = { pitch: 0.02, roll: 0.16, yaw: 0, throttleDelta: 0, boost: false };
    stepFlightModel(state.plane, autopilot, state.world, state.weather, state.refitMods, dt);
    if (state.plane.y < 110) state.plane.y = 110;
    state.plane.fuel = state.plane.fuelCap;
    updateCamera(state.camera, state.plane, state.weather, dt);
    return;
  }

  if (state.screen !== 'play' || state.paused) {
    audio.updateEngine(state.plane || { throttle: 0, fuel: 0, speedKts: 0, stalling: false }, false);
    return;
  }

  stepWeather(state.weather, dt);
  const controls = input.sampleFlightControls();
  const flightEvent = stepFlightModel(state.plane, controls, state.world, state.weather, state.refitMods, dt);

  stepMission(state.mission, state.plane, state.refitMods, dt, {
    onRing(streak) {
      audio.playRing(streak);
      state.campaign.stats.bestStreak = Math.max(state.campaign.stats.bestStreak, streak);
    },
    onDropHit(bullseye) {
      audio.playRing(bullseye ? 6 : 3);
      if (bullseye) state.campaign.stats.bullseyeDrops++;
    },
  });

  state.campaign.stats.thermalClimbFt = Math.max(
    state.campaign.stats.thermalClimbFt,
    Math.round(state.plane.thermalGainFt),
  );

  // Check mission timeout
  if (state.mission.timeLeft <= 0 && !state.plane.landed && !state.plane.crashed) {
    state.plane.crashed = true;
    state.plane.crashReason = 'DISPATCH DEADLINE EXPIRED';
    state.crashCooldownAt = performance.now() + 450;
    audio.playCrash();
  }

  if (flightEvent && flightEvent.event === 'crash') {
    state.crashCooldownAt = performance.now() + 450;
    audio.playCrash();
  } else if (flightEvent && flightEvent.event === 'landed') {
    const rep = flightEvent.report;
    audio.playTouchdown(rep.rating === 'GREASED');
    const timeBonus = Math.round(state.mission.timeLeft * 35);
    const sortieTotal = Math.round((state.mission.score + rep.bonus + timeBonus) * (state.refitMods.scoreMult || 1));
    state.campaign.totalScore += sortieTotal;
    state.campaign.postage += state.mission.postageEarned + Math.round(220 * (state.refitMods.postageMult || 1));
    state.campaign.sortieScores[state.campaign.sortieIndex] = { score: sortieTotal, rating: rep.rating };
    state.campaign.completedSorties = Math.max(state.campaign.completedSorties, state.campaign.sortieIndex + 1);

    if (rep.rating === 'GREASED') state.campaign.stats.greasedLandings++;
    if (rep.centerOffset <= 4.0) state.campaign.stats.centerlineHits++;
    if (state.mission.def.weather === 'monsoon') state.campaign.stats.stormCleared = true;
    if (state.plane.fuel / state.plane.fuelCap < 0.12) state.campaign.stats.bingoLandings++;
    if (state.plane.hull / state.plane.hullCap >= 0.9) state.campaign.stats.cleanHullSorties++;
    if (rep.flapsDeg >= 35) state.campaign.stats.fullFlapLanding = true;

    evaluateFeats(state.campaign);
    state.campaign.sortieIndex++;

    if (state.campaign.sortieIndex >= SORTIE_DEFS.length) {
      openDebrief(rep);
    } else {
      openHangar();
    }
    return;
  }

  updateCamera(state.camera, state.plane, state.weather, dt);
  audio.updateEngine(state.plane, !state.plane.crashed && !state.plane.landed);
}

function runLiveGame() {
  initTitleBackdrop(seedParam);
  renderer.resize();
  window.addEventListener('resize', renderer.resize);

  let lastTs = performance.now();
  let accumulator = 0;

  function frame(now) {
    const delta = Math.min(0.08, Math.max(0, (now - lastTs) / 1000));
    lastTs = now;
    accumulator += delta;
    while (accumulator >= FIXED_DT) {
      stepLiveSimulation(FIXED_DT);
      accumulator -= FIXED_DT;
    }
    renderer.draw(state);
    window.requestAnimationFrame(frame);
  }

  window.requestAnimationFrame(frame);
}

if (shotParam) {
  runDeterministicShot(shotParam, seedParam, renderer, actions);
} else {
  runLiveGame();
}
