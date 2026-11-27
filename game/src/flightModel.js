// SPDX-License-Identifier: MIT
// 6-DOF aerodynamic flight physics, energy conservation, stall/flaps/fuel/hull, and touchdown FPM grading.

import { AIRCRAFT_SPECS, LANDING_GRADES } from './config.js';
import { clamp, radToHeadingDeg, wrapAngleRad } from './random.js';
import { queryTerrainElevation } from './terrain.js';
import { sampleWindAt } from './weather.js';

export function createAircraft(spawn, refitMods) {
  const fuelCap = AIRCRAFT_SPECS.baseFuelCap + (refitMods.fuelCapBonus || 0);
  const hullCap = AIRCRAFT_SPECS.baseHullCap + (refitMods.hullCapBonus || 0);
  const yaw = (spawn.headingDeg * Math.PI) / 180;
  const speedMs = (spawn.speedKts || AIRCRAFT_SPECS.cruiseSpeedKts) * 0.5144;
  return {
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    vx: Math.sin(yaw) * speedMs,
    vy: 0,
    vz: Math.cos(yaw) * speedMs,
    yaw,
    pitch: spawn.pitchRad || 0,
    roll: spawn.rollRad || 0,
    speedKts: spawn.speedKts || AIRCRAFT_SPECS.cruiseSpeedKts,
    verticalFpm: 0,
    throttle: spawn.throttle ?? 0.72,
    boosting: false,
    flapIndex: 0,
    flapsDeg: 0,
    fuel: spawn.fuelPct != null ? (fuelCap * spawn.fuelPct) / 100 : fuelCap,
    fuelCap,
    hull: spawn.hullPct != null ? (hullCap * spawn.hullPct) / 100 : hullCap,
    hullCap,
    stalling: false,
    stallTimer: 0,
    bingoFuel: false,
    inThermal: false,
    onGround: false,
    landed: false,
    crashed: false,
    crashReason: '',
    landingReport: null,
    aileronDeflect: 0,
    elevatorDeflect: 0,
    rudderDeflect: 0,
    propAngle: 0,
    waterSkimTimer: 0,
    damageFlash: 0,
    trail: [],
    thermalGainFt: 0,
  };
}

export function cycleFlaps(plane) {
  plane.flapIndex = (plane.flapIndex + 1) % AIRCRAFT_SPECS.flapSteps.length;
  plane.flapsDeg = AIRCRAFT_SPECS.flapSteps[plane.flapIndex];
  return plane.flapsDeg;
}

export function stepFlightModel(plane, controls, world, weather, refitMods, dt) {
  if (plane.crashed || plane.landed) return null;

  const mods = refitMods;
  const agility = 1 + (mods.agilityBonus || 0);
  const stabilityMult = Math.max(0.25, 1 - (mods.stabilitySave || 0));

  // Throttle & afterburner boost control
  if (controls.throttleDelta !== 0) {
    plane.throttle = clamp(plane.throttle + controls.throttleDelta * dt * 0.75, 0, 1);
  }
  plane.boosting = Boolean(controls.boost && plane.fuel > 0 && plane.throttle > 0.65);

  // Control authority scales smoothly with airspeed (remains responsive even near stall)
  const authority = clamp((plane.speedKts - 28) / 70, 0.42, 1.15);
  const pitchCmd = clamp(controls.pitch, -1, 1);
  const rollCmd = clamp(controls.roll, -1, 1);
  const yawCmd = clamp(controls.yaw, -1, 1);

  plane.elevatorDeflect = pitchCmd;
  plane.aileronDeflect = rollCmd;
  plane.rudderDeflect = yawCmd;

  const wind = sampleWindAt(weather, plane.x, plane.y, plane.z, stabilityMult);
  plane.inThermal = wind.inThermal;

  // Apply pitch, roll, and coordinated turn yaw
  plane.pitch = clamp(
    plane.pitch + (pitchCmd * AIRCRAFT_SPECS.pitchRate * agility * authority + wind.pitchKick * 0.16) * dt,
    -AIRCRAFT_SPECS.maxPitchRad,
    AIRCRAFT_SPECS.maxPitchRad,
  );
  if (Math.abs(rollCmd) > 0.02) {
    plane.roll = clamp(
      plane.roll + (rollCmd * AIRCRAFT_SPECS.rollRate * agility * authority + wind.rollKick * 0.25) * dt,
      -AIRCRAFT_SPECS.maxRollRad,
      AIRCRAFT_SPECS.maxRollRad,
    );
  } else {
    // Gentle self-righting wing dihedral
    plane.roll += (-plane.roll * 0.65 + wind.rollKick * 0.18) * dt;
  }

  const bankTurnRate = Math.sin(plane.roll) * 0.88 * clamp(plane.speedKts / 95, 0.55, 1.25);
  plane.yaw = wrapAngleRad(plane.yaw + (bankTurnRate + yawCmd * AIRCRAFT_SPECS.yawRate * agility) * dt);

  // Fuel consumption & engine flameout
  const fuelBurnBase = AIRCRAFT_SPECS.baseFuelBurnPerSec * (1 - (mods.fuelBurnSave || 0));
  const boostFactor = plane.boosting
    ? AIRCRAFT_SPECS.wepFuelMult * (1 - (mods.wepBurnSave || 0))
    : 1.0;
  const burnRate = fuelBurnBase * (0.18 + plane.throttle * 0.82) * boostFactor;
  if (plane.fuel > 0) {
    plane.fuel = Math.max(0, plane.fuel - burnRate * dt);
  }
  plane.bingoFuel = plane.fuel / plane.fuelCap < 0.2;

  // Aerodynamic energy balance: thrust vs drag vs gravity climb/dive
  const flapLift = AIRCRAFT_SPECS.flapLiftBonus[plane.flapIndex] + (mods.flapLiftBonus || 0) * (plane.flapIndex > 0 ? 1 : 0);
  const flapDrag = AIRCRAFT_SPECS.flapDragPenalty[plane.flapIndex];
  const stallKts = Math.max(
    32,
    AIRCRAFT_SPECS.stallSpeedKts - AIRCRAFT_SPECS.flapStallReduction[plane.flapIndex] - (mods.stallReduce || 0),
  );

  const hasEngine = plane.fuel > 0;
  const thrustMult = (mods.thrustMult || 1.0) * (plane.boosting ? AIRCRAFT_SPECS.wepThrustMult + (mods.wepThrustBonus || 0) : 1.0);
  const thrustAccel = hasEngine ? AIRCRAFT_SPECS.baseThrust * plane.throttle * thrustMult : 0;

  const speedMs = Math.max(12, plane.speedKts * 0.5144);
  const dragCoeff = (AIRCRAFT_SPECS.dragBase * (1 + flapDrag) + AIRCRAFT_SPECS.inducedDrag * Math.abs(Math.sin(plane.roll)) * 0.04)
    * (1 - (mods.dragSave || 0));
  const dragAccel = speedMs * speedMs * dragCoeff;
  const gravitySlope = -Math.sin(plane.pitch) * AIRCRAFT_SPECS.gravity * 1.18;

  const nextSpeedMs = clamp(
    speedMs + (thrustAccel - dragAccel + gravitySlope) * dt,
    AIRCRAFT_SPECS.minSpeedKts * 0.42,
    (AIRCRAFT_SPECS.maxSpeedKts + (mods.maxSpeedBonus || 0) + (plane.boosting ? 22 : 0)) * 0.5144,
  );
  plane.speedKts = nextSpeedMs / 0.5144;

  // Stall detection & nose drop buffet
  plane.stalling = plane.speedKts < stallKts && !plane.onGround;
  if (plane.stalling) {
    plane.stallTimer += dt;
    plane.pitch = clamp(plane.pitch - 0.52 * dt, -AIRCRAFT_SPECS.maxPitchRad, AIRCRAFT_SPECS.maxPitchRad);
  } else {
    plane.stallTimer = Math.max(0, plane.stallTimer - dt * 2);
  }

  // Forward velocity vector + lift/gravity balance + wind & volcanic thermals
  const cosP = Math.cos(plane.pitch);
  const sinP = Math.sin(plane.pitch);
  const fwdX = Math.sin(plane.yaw) * cosP;
  const fwdY = sinP;
  const fwdZ = Math.cos(plane.yaw) * cosP;

  const liftRatio = clamp((plane.speedKts / stallKts) * (1 + flapLift) * Math.cos(plane.roll * 0.65), 0.35, 1.45);
  const stallSink = plane.stalling ? -(stallKts - plane.speedKts) * 0.68 : 0;
  const glideSink = (liftRatio < 1.0 ? -(1.0 - liftRatio) * 11.5 : (liftRatio - 1.0) * 2.2) + stallSink;
  const thermalLift = wind.vy * (mods.thermalMult || 1.0);
  if (thermalLift > 1.5) {
    plane.thermalGainFt += thermalLift * dt * 3.28084;
  }

  plane.vx = fwdX * nextSpeedMs + wind.vx;
  plane.vy = fwdY * nextSpeedMs + glideSink + thermalLift;
  plane.vz = fwdZ * nextSpeedMs + wind.vz;

  plane.x += plane.vx * dt;
  plane.y += plane.vy * dt;
  plane.z += plane.vz * dt;

  // Vertical speed in feet per minute (FPM)
  plane.verticalFpm = plane.vy * 196.85;

  // Propeller spin & damage flash decay
  const propSpin = hasEngine ? 22 + plane.throttle * 34 + (plane.boosting ? 16 : 0) : 6;
  plane.propAngle = (plane.propAngle + propSpin * dt) % (Math.PI * 2);
  plane.damageFlash = Math.max(0, plane.damageFlash - dt * 2.5);

  // Severe storm gust wear at extreme overspeed/turbulence
  if (weather.preset.turbulence > 0.6 && plane.speedKts > 142) {
    const gustWear = (1 - (mods.gustDamageSave || 0)) * 2.4 * dt;
    plane.hull = Math.max(1, plane.hull - gustWear);
  }

  // Wingtip trail recording
  plane.trail.push({ x: plane.x, y: plane.y, z: plane.z, roll: plane.roll, yaw: plane.yaw });
  if (plane.trail.length > 26) plane.trail.shift();

  // Terrain / runway / ocean collision using relative impact velocity
  const ground = queryTerrainElevation(world, plane.x, plane.z);
  const clearance = plane.y - ground.elevation;

  // Seaplane hydroplane skim bonus over water (if refit installed and gentle descent)
  if (ground.surface === 'water' && clearance > 1.2 && clearance < 9 && Math.abs(plane.roll) < 0.3) {
    plane.waterSkimTimer += dt;
    if (mods.waterSkimFuel && plane.waterSkimTimer > 1.2) {
      plane.fuel = Math.min(plane.fuelCap, plane.fuel + plane.fuelCap * 0.1);
      plane.waterSkimTimer = 0;
    }
  } else {
    plane.waterSkimTimer = 0;
  }

  if (clearance <= 1.8) {
    plane.y = ground.elevation + 1.8;
    const sinkFpm = Math.max(0, -plane.verticalFpm);
    const bankDeg = Math.abs((plane.roll * 180) / Math.PI);
    const impactRelSpeed = Math.hypot(plane.vx, plane.vy, plane.vz);

    if (ground.surface === 'runway' && ground.runway) {
      const fpmPad = mods.landingFpmPad || 0;
      const effFpm = Math.max(0, sinkFpm - fpmPad);
      const centerOffset = Math.abs(ground.across);
      const rwyHeadingDiff = Math.abs(
        wrapAngleRad(plane.yaw - ground.runway.headingRad) * (180 / Math.PI),
      );
      const aligned = rwyHeadingDiff < 38 || Math.abs(180 - rwyHeadingDiff) < 38;

      if (effFpm > LANDING_GRADES.hardFpm + 180 || bankDeg > 34 || !aligned || plane.speedKts > LANDING_GRADES.maxTouchSpeedKts + 36) {
        plane.crashed = true;
        plane.hull = 0;
        plane.crashReason = !aligned
          ? `RUNWAY EXCURSION (${Math.round(rwyHeadingDiff)}° OFF AXIS)`
          : bankDeg > 34
            ? `WINGTIP STRIKE ON ${ground.runway.code} (${Math.round(bankDeg)}° BANK)`
            : `HARD IMPACT ON ${ground.runway.code} (-${Math.round(sinkFpm)} FPM)`;
        return { event: 'crash', reason: plane.crashReason };
      }

      let rating = 'GREASED';
      let bonus = 3500;
      let hullLoss = 0;
      if (effFpm > LANDING_GRADES.firmFpm || bankDeg > LANDING_GRADES.maxBankDeg || centerOffset > 14) {
        rating = 'HARD';
        bonus = 1100;
        hullLoss = 22;
      } else if (effFpm > LANDING_GRADES.greasedFpm || centerOffset > 7) {
        rating = 'FIRM';
        bonus = 2200;
        hullLoss = 6;
      }

      plane.hull = Math.max(5, plane.hull - hullLoss);
      plane.onGround = true;
      plane.landed = true;
      const centerlinePct = Math.round(clamp(100 - (centerOffset / (ground.runway.width * 0.5)) * 100, 35, 100));
      plane.landingReport = {
        runwayCode: ground.runway.code,
        islandName: ground.runway.islandName,
        fpm: -Math.round(sinkFpm),
        rating,
        centerlinePct,
        centerOffset: Number(centerOffset.toFixed(1)),
        touchSpeedKts: Math.round(plane.speedKts),
        flapsDeg: plane.flapsDeg,
        bonus,
        hullLoss,
      };
      return { event: 'landed', report: plane.landingReport };
    }

    // Water ditching vs cliff impact
    if (ground.surface === 'water') {
      if (sinkFpm < 260 && Math.abs(plane.roll) < 0.25 && plane.speedKts < 86) {
        // Amphibious Pelican bounces gently off waves with hull scuff
        plane.vy = Math.max(4, Math.abs(plane.vy) * 0.45);
        plane.y = 5.5;
        plane.hull = Math.max(0, plane.hull - 14);
        plane.damageFlash = 1.0;
        if (plane.hull <= 0) {
          plane.crashed = true;
          plane.crashReason = `HULL BREACH IN OPEN SEA (${Math.round(impactRelSpeed * 1.94)} KTS)`;
          return { event: 'crash', reason: plane.crashReason };
        }
        return { event: 'water-bounce' };
      }
      plane.crashed = true;
      plane.hull = 0;
      plane.crashReason = plane.stalling
        ? `STALL WATER IMPACT (-${Math.round(sinkFpm)} FPM)`
        : `WATER DITCHING (-${Math.round(sinkFpm)} FPM · ${Math.round(plane.speedKts)} KTS)`;
      return { event: 'crash', reason: plane.crashReason };
    }

    // Island cliff / ridge impact
    plane.crashed = true;
    plane.hull = 0;
    plane.crashReason = `TERRAIN IMPACT ON ${ground.surface.toUpperCase()} (${Math.round(impactRelSpeed * 1.94)} KTS)`;
    return { event: 'crash', reason: plane.crashReason };
  }

  return null;
}

export function getTelemetry(plane) {
  return {
    altFt: Math.max(0, Math.round(plane.y * 3.28084)),
    spdKts: Math.round(plane.speedKts),
    hdgDeg: radToHeadingDeg(plane.yaw),
    vsiFpm: Math.round(plane.verticalFpm),
    fuelPct: Math.round((plane.fuel / plane.fuelCap) * 100),
    hullPct: Math.round((plane.hull / plane.hullCap) * 100),
    throttlePct: Math.round(plane.throttle * 100),
    flapsDeg: plane.flapsDeg,
  };
}
