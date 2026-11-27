// SPDX-License-Identifier: MIT
// Hangar Refit system: 18 distinct aircraft upgrades across 3x6 synergy sets with unique icons and clear stats.

import { createRng } from './random.js';

export const SYNERGY_SETS = {
  turbocharger: {
    id: 'turbocharger',
    name: 'TURBOCHARGER',
    color: '#c25e2c',
    light: '#f49956',
    bonuses: [
      { pieces: 2, label: '2 PC · THRUST +12% & BOOST BURN -20%' },
      { pieces: 3, label: '3 PC · RING STREAK BONUS +25%' },
    ],
  },
  glider: {
    id: 'glider',
    name: 'GLIDER WING',
    color: '#247f86',
    light: '#4cd1d1',
    bonuses: [
      { pieces: 2, label: '2 PC · STALL -8 KTS & LIFT +14%' },
      { pieces: 3, label: '3 PC · THERMAL CLIMB +45%' },
    ],
  },
  avionics: {
    id: 'avionics',
    name: 'AVIONICS',
    color: '#734878',
    light: '#ba7ec2',
    bonuses: [
      { pieces: 2, label: '2 PC · CROSSWIND DAMPING +30%' },
      { pieces: 3, label: '3 PC · ALL SORTIE POINTS +15%' },
    ],
  },
};

export const REFIT_CATALOG = [
  // TURBOCHARGER (6 distinct icons)
  { id: 'twin-supercharger', name: 'TWIN SUPERCHARGER', set: 'turbocharger', rarity: 'RARE', icon: 'turbo', desc: 'Max thrust +16% and climb accel +20%.', mods: { thrustMult: 0.16 } },
  { id: 'copper-manifold', name: 'COPPER MANIFOLD', set: 'turbocharger', rarity: 'COMMON', icon: 'exhaust', desc: 'Boost overburn consumes 28% less fuel.', mods: { wepBurnSave: 0.28 } },
  { id: 'brass-props', name: 'FEATHERED PROPS', set: 'turbocharger', rarity: 'COMMON', icon: 'prop', desc: 'Top cruise +10 KTS and thrust +6%.', mods: { maxSpeedBonus: 10, thrustMult: 0.06 } },
  { id: 'aux-wing-tank', name: 'AUX WING TANK', set: 'turbocharger', rarity: 'COMMON', icon: 'tank', desc: 'Fuel tank capacity +25% for ocean legs.', mods: { fuelCapBonus: 25 } },
  { id: 'oil-cooler', name: 'BAFFLED COOLER', set: 'turbocharger', rarity: 'RARE', icon: 'radiator', desc: 'Fuel burn -18% across every throttle step.', mods: { fuelBurnSave: 0.18 } },
  { id: 'nitro-primer', name: 'HIGH-OCTANE PRIMER', set: 'turbocharger', rarity: 'EPIC', icon: 'spark', desc: 'Boost thrust +24% and +150 pts per ring.', mods: { wepThrustBonus: 0.24, ringFlatBonus: 150 } },

  // GLIDER WING (6 distinct icons)
  { id: 'slotted-flaps', name: 'SLOTTED FLAPS', set: 'glider', rarity: 'COMMON', icon: 'flap', desc: 'Flaps add +30% lift for short island strips.', mods: { flapLiftBonus: 0.3 } },
  { id: 'albatross-tips', name: 'ALBATROSS WINGTIPS', set: 'glider', rarity: 'RARE', icon: 'gullwing', desc: 'Induced drag -25% and glide ratio +22%.', mods: { dragSave: 0.25 } },
  { id: 'thermal-vario', name: 'THERMAL VARIO', set: 'glider', rarity: 'COMMON', icon: 'thermal', desc: 'Volcanic thermal updrafts lift +35% faster.', mods: { thermalMult: 0.35 } },
  { id: 'oleo-struts', name: 'OLEO LANDING STRUTS', set: 'glider', rarity: 'COMMON', icon: 'strut', desc: 'Absorbs landing shock (+120 FPM cushion).', mods: { landingFpmPad: 120 } },
  { id: 'spruce-ribs', name: 'REINFORCED RIBS', set: 'glider', rarity: 'RARE', icon: 'ribs', desc: 'Airframe hull +30 HP and gust wear -50%.', mods: { hullCapBonus: 30, gustDamageSave: 0.5 } },
  { id: 'pelican-chines', name: 'HYDROPLANE CHINES', set: 'glider', rarity: 'EPIC', icon: 'pontoon', desc: 'Stall -10 KTS; sea skims restore +10% fuel.', mods: { stallReduce: 10, waterSkimFuel: 1 } },

  // AVIONICS (6 distinct icons)
  { id: 'gyro-compass', name: 'GYRO COMPASS', set: 'avionics', rarity: 'COMMON', icon: 'gyro', desc: 'Roll & rudder response +18% at all speeds.', mods: { agilityBonus: 0.18 } },
  { id: 'drift-sight', name: 'DRIFT BOMBSIGHT', set: 'avionics', rarity: 'RARE', icon: 'crosshair', desc: 'Airdrop bullseye +40% and +400 drop pts.', mods: { dropRadiusBonus: 0.4, dropScoreBonus: 400 } },
  { id: 'storm-radar', name: 'AMBER STORM RADAR', set: 'avionics', rarity: 'RARE', icon: 'radar', desc: 'Crosswind & squall turbulence cut by 30%.', mods: { stabilitySave: 0.3 } },
  { id: 'postmaster-seal', name: 'POSTMASTER SEAL', set: 'avionics', rarity: 'COMMON', icon: 'stamp', desc: 'Earn +25% Postage stamps & -50 P hangar reroll cost.', mods: { postageMult: 0.25, rerollDiscount: 50 } },
  { id: 'chart-folio', name: 'ARCHIPELAGO FOLIO', set: 'avionics', rarity: 'RARE', icon: 'map', desc: 'Ring radius +22% and +1 free hangar reroll.', mods: { ringRadiusBonus: 0.22, freeReroll: 1 } },
  { id: 'night-collimator', name: 'BRASS COLLIMATOR', set: 'avionics', rarity: 'EPIC', icon: 'collimator', desc: 'All sortie scores +20% and +12s leg clock.', mods: { scoreMult: 0.2, timerBonus: 12 } },
];

export function countSetPieces(ownedIds) {
  const counts = { turbocharger: 0, glider: 0, avionics: 0 };
  for (const id of ownedIds) {
    const item = REFIT_CATALOG.find((r) => r.id === id);
    if (item) counts[item.set]++;
  }
  return counts;
}

export function computeRefitMods(ownedIds) {
  const mods = {
    thrustMult: 1.0,
    wepThrustBonus: 0,
    wepBurnSave: 0,
    maxSpeedBonus: 0,
    fuelCapBonus: 0,
    fuelBurnSave: 0,
    ringFlatBonus: 0,
    flapLiftBonus: 0,
    dragSave: 0,
    thermalMult: 1.0,
    landingFpmPad: 0,
    hullCapBonus: 0,
    gustDamageSave: 0,
    stallReduce: 0,
    waterSkimFuel: 0,
    agilityBonus: 0,
    dropRadiusBonus: 0,
    dropScoreBonus: 0,
    stabilitySave: 0,
    postageMult: 1.0,
    rerollDiscount: 0,
    ringRadiusBonus: 0,
    freeReroll: 0,
    scoreMult: 1.0,
    timerBonus: 0,
    streakMultBonus: 0,
  };

  for (const id of ownedIds) {
    const item = REFIT_CATALOG.find((r) => r.id === id);
    if (!item) continue;
    for (const [k, v] of Object.entries(item.mods)) {
      mods[k] += v;
    }
  }

  const sets = countSetPieces(ownedIds);
  if (sets.turbocharger >= 2) {
    mods.thrustMult += 0.12;
    mods.wepBurnSave = Math.min(0.65, mods.wepBurnSave + 0.2);
  }
  if (sets.turbocharger >= 3) {
    mods.streakMultBonus += 0.25;
  }
  if (sets.glider >= 2) {
    mods.stallReduce += 8;
    mods.flapLiftBonus += 0.14;
  }
  if (sets.glider >= 3) {
    mods.thermalMult += 0.45;
  }
  if (sets.avionics >= 2) {
    mods.stabilitySave = Math.min(0.75, mods.stabilitySave + 0.3);
  }
  if (sets.avionics >= 3) {
    mods.scoreMult += 0.15;
  }
  return mods;
}

export function previewSetBonus(ownedIds, candidate) {
  const counts = countSetPieces(ownedIds);
  const nextCount = counts[candidate.set] + 1;
  const setDef = SYNERGY_SETS[candidate.set];
  const hit = setDef.bonuses.find((b) => b.pieces === nextCount);
  if (!hit) return null;
  return `UNLOCKS ${nextCount}/3 SET · ${hit.label.replace(/^\d+ PC · /, '')}`;
}

export function rollHangarChoices(ownedIds, seed, sortieIdx, rerollCount = 0) {
  const rng = createRng(seed * 31 + sortieIdx * 97 + rerollCount * 389);
  const pool = REFIT_CATALOG.filter((r) => !ownedIds.includes(r.id));
  const picked = [];
  const remaining = [...pool];
  while (picked.length < 3 && remaining.length > 0) {
    const idx = Math.floor(rng() * remaining.length);
    picked.push(remaining.splice(idx, 1)[0]);
  }
  return picked;
}
