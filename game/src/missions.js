// SPDX-License-Identifier: MIT
// 7 Amber Archipelago airmail sorties: rings, lighthouse airdrops, storm medevac, thermals, bingo fuel glide.

import { clamp, lerp } from './random.js';

export const SORTIE_DEFS = [
  {
    index: 0,
    code: 'SORTIE 1/7',
    title: 'CANYON RING RUN',
    from: 'Pelican Quay',
    to: 'Coral Spire',
    shortTo: 'CORAL',
    fromIdx: 0,
    toIdx: 1,
    weather: 'tradewind',
    timeLimit: 115,
    fuelPct: 95,
    ringsCount: 5,
    dropsCount: 0,
    thermalsCount: 1,
    radio: 'Thread the canyon rings and land RWY 06.',
    objectiveText: 'FLY 5 CANYON RINGS · LAND RWY 06',
  },
  {
    index: 1,
    code: 'SORTIE 2/7',
    title: 'LIGHTHOUSE AIRDROP',
    from: 'Coral Spire',
    to: 'Beacon Point',
    shortTo: 'BEACON',
    fromIdx: 1,
    toIdx: 2,
    weather: 'tradewind',
    timeLimit: 120,
    fuelPct: 90,
    ringsCount: 4,
    dropsCount: 2,
    thermalsCount: 1,
    radio: 'Drop both mail sacks [SPACE] on Beacon pier.',
    objectiveText: 'DROP 2 MAIL SACKS [SPACE] · LAND RWY 11',
  },
  {
    index: 2,
    code: 'SORTIE 3/7',
    title: 'MONSOON MEDEVAC',
    from: 'Beacon Point',
    to: 'Squall Reach',
    shortTo: 'SQUALL',
    fromIdx: 2,
    toIdx: 3,
    weather: 'monsoon',
    timeLimit: 110,
    fuelPct: 78,
    ringsCount: 5,
    dropsCount: 1,
    thermalsCount: 0,
    radio: '28 KT gusts! Watch fuel & follow ILS RWY 08.',
    objectiveText: 'MONSOON RINGS & CLINIC DROP · LAND RWY 08',
  },
  {
    index: 3,
    code: 'SORTIE 4/7',
    title: 'CALDERA THERMAL CLIMB',
    from: 'Squall Reach',
    to: 'Mt. Solis',
    shortTo: 'MT SOLIS',
    fromIdx: 3,
    toIdx: 4,
    weather: 'volcanicDusk',
    timeLimit: 125,
    fuelPct: 82,
    ringsCount: 5,
    dropsCount: 0,
    thermalsCount: 4,
    radio: 'Ride thermal ribbons up Mt. Solis summit.',
    objectiveText: 'RIDE THERMALS THROUGH 5 RINGS · LAND RWY 09',
  },
  {
    index: 4,
    code: 'SORTIE 5/7',
    title: 'BINGO FUEL GLIDE',
    from: 'Mt. Solis',
    to: 'Drifter Atoll',
    shortTo: 'DRIFTER',
    fromIdx: 4,
    toIdx: 5,
    weather: 'goldenHour',
    timeLimit: 120,
    fuelPct: 38,
    ringsCount: 4,
    dropsCount: 1,
    thermalsCount: 3,
    radio: '38% BINGO fuel! Glide thermals to Drifter.',
    objectiveText: 'CONSERVE FUEL · 4 RINGS · LAND RWY 08',
  },
  {
    index: 5,
    code: 'SORTIE 6/7',
    title: 'DUSK STRAIT EXPRESS',
    from: 'Drifter Atoll',
    to: 'Amber Channel',
    shortTo: 'AMBER',
    fromIdx: 5,
    toIdx: 6,
    weather: 'goldenHour',
    timeLimit: 115,
    fuelPct: 86,
    ringsCount: 6,
    dropsCount: 2,
    thermalsCount: 2,
    radio: 'Cleared RWY 09 — hold 15° flaps & glide PAPI.',
    objectiveText: '6 STRAIT RINGS · 2 DROPS · LAND RWY 09',
  },
  {
    index: 6,
    code: 'SORTIE 7/7',
    title: 'ARCHIPELAGO GRAND CIRCUIT',
    from: 'Amber Channel',
    to: 'Imperial Harbor',
    shortTo: 'IMPERIAL',
    fromIdx: 6,
    toIdx: 7,
    weather: 'volcanicDusk',
    timeLimit: 130,
    fuelPct: 80,
    ringsCount: 6,
    dropsCount: 2,
    thermalsCount: 3,
    radio: 'Final imperial pouch! Grease RWY 09 for S.',
    objectiveText: '6 HARBOR RINGS · 2 DROPS · LAND RWY 09',
  },
];

export function buildSortieMission(sortieIdx, world, refitMods) {
  const def = SORTIE_DEFS[clamp(sortieIdx, 0, SORTIE_DEFS.length - 1)];
  const fromIsl = world.islands[def.fromIdx];
  const toIsl = world.islands[def.toIdx];
  const targetRunway = toIsl.runway;

  const dx = targetRunway.x - fromIsl.runway.x;
  const dz = targetRunway.z - fromIsl.runway.z;
  const courseYaw = Math.atan2(dx, dz);
  const courseHeadingDeg = ((courseYaw * 180) / Math.PI + 360) % 360;

  // Approach entry point 390m short of target runway threshold
  const approachX = targetRunway.x - targetRunway.dirX * 360;
  const approachZ = targetRunway.z - targetRunway.dirZ * 360;

  const rings = [];
  for (let i = 0; i < def.ringsCount; i++) {
    const t = (i + 1) / (def.ringsCount + 1);
    const sway = Math.sin(t * Math.PI * 2.2 + sortieIdx) * (def.index === 0 ? 120 : 95);
    const perpX = Math.cos(courseYaw);
    const perpZ = -Math.sin(courseYaw);
    const isLast = i === def.ringsCount - 1;
    const rx = isLast ? approachX : lerp(fromIsl.runway.x, approachX, t) + perpX * sway;
    const rz = isLast ? approachZ : lerp(fromIsl.runway.z, approachZ, t) + perpZ * sway;
    const baseAlt = def.index === 3 ? 115 + Math.sin(t * Math.PI) * 145 : 85 + Math.sin(t * Math.PI) * 55;
    const ry = isLast ? targetRunway.y + 42 : baseAlt;
    rings.push({
      id: `ring-${sortieIdx}-${i}`,
      index: i,
      x: rx,
      y: ry,
      z: rz,
      radius: 26 * (1 + (refitMods.ringRadiusBonus || 0)),
      yaw: isLast ? targetRunway.headingRad : courseYaw,
      cleared: false,
      flash: 0,
      kind: isLast ? 'approach' : 'waypoint',
    });
  }

  const dropZones = [];
  for (let d = 0; d < def.dropsCount; d++) {
    const t = def.dropsCount === 1 ? 0.62 : 0.42 + d * 0.34;
    const side = d % 2 === 0 ? -1 : 1;
    const perpX = Math.cos(courseYaw);
    const perpZ = -Math.sin(courseYaw);
    const zoneX = d === def.dropsCount - 1 && toIsl.lighthouse
      ? toIsl.lighthouse.x + 42
      : lerp(fromIsl.runway.x, approachX, t) + perpX * side * 140;
    const zoneZ = d === def.dropsCount - 1 && toIsl.lighthouse
      ? toIsl.lighthouse.z + 24
      : lerp(fromIsl.runway.z, approachZ, t) + perpZ * side * 140;
    dropZones.push({
      id: `drop-${sortieIdx}-${d}`,
      name: d === 0 ? 'PIER BEACON ALPHA' : 'LIGHTHOUSE QUAY',
      x: zoneX,
      y: 12,
      z: zoneZ,
      radius: 44 * (1 + (refitMods.dropRadiusBonus || 0)),
      delivered: false,
      bullseye: false,
    });
  }

  const thermals = [];
  for (let k = 0; k < def.thermalsCount; k++) {
    const t = (k + 0.65) / (def.thermalsCount + 0.6);
    const sway = (k % 2 === 0 ? 1 : -1) * 115;
    thermals.push({
      x: lerp(fromIsl.runway.x, approachX, t) + Math.cos(courseYaw) * sway,
      z: lerp(fromIsl.runway.z, approachZ, t) - Math.sin(courseYaw) * sway,
      radius: 95,
      topY: 360,
      lift: 14.5,
    });
  }

  const spawn = {
    x: fromIsl.runway.x + Math.sin(courseYaw) * 160,
    y: 112,
    z: fromIsl.runway.z + Math.cos(courseYaw) * 160,
    headingDeg: courseHeadingDeg,
    speedKts: 106,
    fuelPct: def.fuelPct,
    hullPct: 100,
    throttle: 0.74,
  };

  return {
    def,
    spawn,
    targetRunway,
    rings,
    dropZones,
    thermals,
    activeSacks: [],
    mailAmmo: Math.max(def.dropsCount + 2, 3),
    timeLeft: def.timeLimit + (refitMods.timerBonus || 0),
    elapsed: 0,
    ringsCleared: 0,
    dropsCleared: 0,
    streak: 0,
    bestStreak: 0,
    score: 0,
    postageEarned: 0,
    popups: [],
    radioLine: def.radio,
  };
}

export function launchMailDrop(mission, plane) {
  if (mission.mailAmmo <= 0) return false;
  mission.mailAmmo--;
  mission.activeSacks.push({
    x: plane.x,
    y: plane.y - 3,
    z: plane.z,
    vx: plane.vx * 0.42,
    vy: Math.min(-2, plane.vy * 0.25),
    vz: plane.vz * 0.42,
    chuteOpen: 0,
    landed: false,
  });
  return true;
}

export function stepMission(mission, plane, refitMods, dt, callbacks = {}) {
  mission.elapsed += dt;
  mission.timeLeft = Math.max(0, mission.timeLeft - dt);

  // Check ring capture (ordered priority on next uncleared ring, plus any ring flown through)
  const nextRing = mission.rings.find((r) => !r.cleared);
  for (const ring of mission.rings) {
    ring.flash = Math.max(0, ring.flash - dt * 2);
    if (ring.cleared) continue;
    const dist = Math.hypot(plane.x - ring.x, plane.y - ring.y, plane.z - ring.z);
    if (dist <= ring.radius) {
      ring.cleared = true;
      ring.flash = 1.0;
      mission.ringsCleared++;
      mission.streak = ring === nextRing ? mission.streak + 1 : 1;
      mission.bestStreak = Math.max(mission.bestStreak, mission.streak);
      const streakFactor = 1 + (mission.streak - 1) * (0.28 + (refitMods.streakMultBonus || 0));
      const pts = Math.round(((1200 + (refitMods.ringFlatBonus || 0)) * streakFactor) * (refitMods.scoreMult || 1.0));
      mission.score += pts;
      mission.postageEarned += Math.round(110 * (refitMods.postageMult || 1.0));
      mission.popups.push({ text: `RING +${pts.toLocaleString()}`, sub: `STREAK x${mission.streak}`, ttl: 1.8, color: '#ffd46b' });
      if (callbacks.onRing) callbacks.onRing(mission.streak, pts);
    }
  }

  // Simulate falling airmail parachute sacks
  for (const sack of mission.activeSacks) {
    if (sack.landed) continue;
    sack.chuteOpen = Math.min(1, sack.chuteOpen + dt * 2.2);
    sack.vy = Math.max(-14, sack.vy - (16 - sack.chuteOpen * 11) * dt);
    sack.vx *= Math.pow(0.48, dt);
    sack.vz *= Math.pow(0.48, dt);
    sack.x += sack.vx * dt;
    sack.y += sack.vy * dt;
    sack.z += sack.vz * dt;
    if (sack.y <= 12) {
      sack.y = 12;
      sack.landed = true;
      let hit = false;
      for (const zone of mission.dropZones) {
        if (zone.delivered) continue;
        const d = Math.hypot(sack.x - zone.x, sack.z - zone.z);
        if (d <= zone.radius) {
          zone.delivered = true;
          zone.bullseye = d <= 18;
          mission.dropsCleared++;
          hit = true;
          const pts = Math.round(((zone.bullseye ? 2600 : 1650) + (refitMods.dropScoreBonus || 0)) * (refitMods.scoreMult || 1.0));
          mission.score += pts;
          mission.postageEarned += Math.round((zone.bullseye ? 260 : 170) * (refitMods.postageMult || 1.0));
          mission.popups.push({
            text: zone.bullseye ? `BULLSEYE DROP +${pts.toLocaleString()}` : `MAIL DELIVERED +${pts.toLocaleString()}`,
            sub: zone.name,
            ttl: 2.2,
            color: '#54d996',
          });
          if (callbacks.onDropHit) callbacks.onDropHit(zone.bullseye, pts);
          break;
        }
      }
      if (!hit) {
        mission.popups.push({ text: 'SACK SPLASHED WIDE', sub: 'LINE UP OVER BEACON', ttl: 1.6, color: '#eb7b54' });
      }
    }
  }

  for (let i = mission.popups.length - 1; i >= 0; i--) {
    mission.popups[i].ttl -= dt;
    if (mission.popups[i].ttl <= 0) mission.popups.splice(i, 1);
  }
}

export function getActiveWaypoint(mission) {
  const nextRing = mission.rings.find((r) => !r.cleared);
  if (nextRing) {
    return {
      kind: 'ring',
      label: nextRing.kind === 'approach' ? 'FINAL GATE' : `RING ${nextRing.index + 1}/${mission.rings.length}`,
      x: nextRing.x,
      y: nextRing.y,
      z: nextRing.z,
    };
  }
  const nextDrop = mission.dropZones.find((d) => !d.delivered);
  if (nextDrop) {
    return {
      kind: 'drop',
      label: nextDrop.name,
      x: nextDrop.x,
      y: nextDrop.y + 38,
      z: nextDrop.z,
    };
  }
  return {
    kind: 'runway',
    label: `${mission.targetRunway.islandName.toUpperCase()} ${mission.targetRunway.code}`,
    x: mission.targetRunway.x,
    y: mission.targetRunway.y + 8,
    z: mission.targetRunway.z,
  };
}
