// SPDX-License-Identifier: MIT
// Core constants, Amber Archipelago art palette, and AERO-7 PELICAN aircraft specs.

export const GAME_TITLE = 'GALEWING POST';
export const GAME_SUBTITLE = 'AMBER ARCHIPELAGO';
export const AIRCRAFT_NAME = 'AERO-7 PELICAN';
export const DEFAULT_SEED = 1740;
export const FIXED_DT = 1 / 60;

export const BASE_WIDTH = 1280;
export const BASE_HEIGHT = 720;

export const PALETTE = {
  ink: '#17232c',
  navyDeep: '#11222e',
  navyPanel: '#172d3c',
  navySlate: '#223e50',
  cream: '#f6efde',
  creamWarm: '#ede0c2',
  parchment: '#e5d4b0',
  crimson: '#c93a2b',
  crimsonBright: '#e84c38',
  amber: '#efae38',
  amberGlow: '#ffd46b',
  brass: '#d89b32',
  teal: '#247f86',
  tealBright: '#43c4c4',
  jade: '#2f9668',
  jadeBright: '#54d996',
  plum: '#734878',
  plumBright: '#a96db0',
  copper: '#c25e2c',
  coral: '#eb7b54',
  oceanDeep: '#194a63',
  oceanMid: '#236885',
  oceanGlint: '#f7c979',
  sand: '#e6c98e',
  cliffLight: '#9c7858',
  cliffDark: '#5b4539',
  pineDark: '#234a39',
  pineLight: '#366b4f',
  runway: '#2a333b',
  runwayLine: '#f6efde',
};

export const AIRCRAFT_SPECS = {
  minSpeedKts: 42,
  stallSpeedKts: 54,
  cruiseSpeedKts: 108,
  maxSpeedKts: 158,
  vneSpeedKts: 172,
  baseThrust: 44,
  wepThrustMult: 1.48,
  wepFuelMult: 2.5,
  baseFuelCap: 100,
  baseFuelBurnPerSec: 1.05,
  baseHullCap: 100,
  gravity: 22.0,
  liftFactor: 0.00235,
  dragBase: 0.00088,
  inducedDrag: 0.018,
  flapSteps: [0, 15, 35],
  flapLiftBonus: [0, 0.24, 0.46],
  flapDragPenalty: [0, 0.34, 0.78],
  flapStallReduction: [0, 8, 15],
  pitchRate: 1.45,
  rollRate: 2.05,
  yawRate: 0.92,
  maxPitchRad: 0.78,
  maxRollRad: 1.18,
};

export const LANDING_GRADES = {
  greasedFpm: 210,
  firmFpm: 390,
  hardFpm: 620,
  maxBankDeg: 18,
  maxCenterOffset: 24,
  maxTouchSpeedKts: 94,
};

export const KEY_LEGEND = [
  { key: 'W/S', label: 'PITCH' },
  { key: 'A/D', label: 'ROLL' },
  { key: 'Q/E', label: 'RUDDER' },
  { key: '↑/↓', label: 'THROTTLE' },
  { key: 'SHIFT', label: 'BOOST' },
  { key: 'F', label: 'FLAPS' },
  { key: 'SPACE', label: 'DROP' },
  { key: 'C', label: 'VIEW' },
  { key: 'P', label: 'PAUSE' },
  { key: 'M', label: 'MUTE' },
];
