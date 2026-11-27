// SPDX-License-Identifier: MIT
// Perimeter-locked WebGL2 aviation HUD: backlit brass 6-pack instruments, collimated storm combiner & wind radar.

import { GAME_TITLE } from './config.js';
import { clamp, formatHeading } from './random.js';
import { getTelemetry } from './flightModel.js';
import { getActiveWaypoint } from './missions.js';
import { buildCameraBasis, projectPoint } from './camera.js';
import { computePapiLights } from './terrain.js';

function drawDialBezel(ctx, cx, cy, r, glowColor = '#ffd46b') {
  ctx.save();
  ctx.fillStyle = '#071118';
  ctx.strokeStyle = '#6c8798';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const grad = ctx.createRadialGradient(cx, cy - r * 0.24, r * 0.08, cx, cy, r);
  grad.addColorStop(0, '#1e3848');
  grad.addColorStop(0.75, '#0f1f2b');
  grad.addColorStop(1, '#071017');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = glowColor;
  ctx.globalAlpha = 0.58;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#9bb5c4';
  for (const a of [0.78, 2.35, 3.92, 5.49]) {
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * (r + 1.2), cy + Math.sin(a) * (r + 1.2), 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawGlassSheen(ctx, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
  ctx.clip();
  const shine = ctx.createLinearGradient(cx - r, cy - r, cx + r * 0.35, cy + r * 0.35);
  shine.addColorStop(0, 'rgba(255, 250, 232, 0.20)');
  shine.addColorStop(0.45, 'rgba(255, 250, 232, 0.03)');
  shine.addColorStop(1, 'rgba(255, 250, 232, 0)');
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.24, cy - r * 0.42, r * 0.86, r * 0.46, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawArtificialHorizon(ctx, cx, cy, r, plane) {
  drawDialBezel(ctx, cx, cy, r, '#ffd46b');
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
  ctx.clip();

  // Mathematically exact aviation horizon: +roll (right bank) tilts horizon CCW (-plane.roll)
  // so the right wing of the fixed orange aircraft dips into brown ground, matching WebGL2 3D roll!
  ctx.translate(cx, cy);
  ctx.rotate(-plane.roll);
  const pitchOffset = clamp(((plane.pitch * 180) / Math.PI) * (r / 38), -r * 0.82, r * 0.82);

  ctx.fillStyle = '#2b7ea6';
  ctx.fillRect(-r * 1.6, -r * 1.8 + pitchOffset, r * 3.2, r * 1.8);
  ctx.fillStyle = '#7a4b2b';
  ctx.fillRect(-r * 1.6, pitchOffset, r * 3.2, r * 1.8);

  ctx.strokeStyle = '#fff5d9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r, pitchOffset);
  ctx.lineTo(r, pitchOffset);
  ctx.stroke();

  ctx.lineWidth = 1.25;
  ctx.strokeStyle = 'rgba(255, 245, 217, 0.85)';
  for (const deg of [-20, -10, 10, 20]) {
    const y = pitchOffset - deg * (r / 38);
    const hw = Math.abs(deg) === 10 ? r * 0.3 : r * 0.16;
    ctx.beginPath();
    ctx.moveTo(-hw, y);
    ctx.lineTo(hw, y);
    ctx.stroke();
  }

  ctx.fillStyle = '#ffd46b';
  ctx.beginPath();
  ctx.moveTo(0, -r + 5);
  ctx.lineTo(-4.2, -r + 12);
  ctx.lineTo(4.2, -r + 12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = '#ffd46b';
  ctx.lineWidth = 1.3;
  for (const deg of [-45, -30, -15, 0, 15, 30, 45]) {
    const a = -Math.PI * 0.5 + (deg * Math.PI) / 180;
    const len = deg === 0 ? 6.5 : 4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3));
    ctx.lineTo(cx + Math.cos(a) * (r - 3 - len), cy + Math.sin(a) * (r - 3 - len));
    ctx.stroke();
  }

  ctx.strokeStyle = '#ff9838';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.44, cy);
  ctx.lineTo(cx - r * 0.14, cy);
  ctx.lineTo(cx - r * 0.14, cy + 5);
  ctx.moveTo(cx + r * 0.44, cy);
  ctx.lineTo(cx + r * 0.14, cy);
  ctx.lineTo(cx + r * 0.14, cy + 5);
  ctx.stroke();
  ctx.fillStyle = '#ffd46b';
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawGlassSheen(ctx, cx, cy, r);
}

function drawAirspeedDial(ctx, cx, cy, r, plane, showDigital = true) {
  drawDialBezel(ctx, cx, cy, r, plane.stalling ? '#ff4636' : '#54d996');
  const startA = Math.PI * 0.72;
  const spanA = Math.PI * 1.56;
  const speedToA = (kts) => startA + clamp((kts - 20) / 160, 0, 1) * spanA;

  const arc = (a0, a1, col, lw = 3.8) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 6.5, a0, a1);
    ctx.stroke();
  };
  arc(speedToA(40), speedToA(85), '#dce8ee', 2.8);
  arc(speedToA(55), speedToA(138), '#43d08a', 3.8);
  arc(speedToA(138), speedToA(162), '#efae38', 3.8);
  arc(speedToA(162), speedToA(176), '#e84c38', 4.4);

  ctx.fillStyle = '#f6efde';
  ctx.font = `bold ${Math.max(8, Math.round(r * 0.2))}px "Trebuchet MS", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let k = 40; k <= 160; k += 20) {
    const a = speedToA(k);
    ctx.strokeStyle = '#f6efde';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r - 11), cy + Math.sin(a) * (r - 11));
    ctx.lineTo(cx + Math.cos(a) * (r - 5), cy + Math.sin(a) * (r - 5));
    ctx.stroke();
    if (k % 40 === 0) {
      ctx.fillText(String(k), cx + Math.cos(a) * (r - 18.5), cy + Math.sin(a) * (r - 18.5));
    }
  }

  if (showDigital) {
    ctx.fillStyle = '#071118';
    ctx.strokeStyle = '#385466';
    ctx.lineWidth = 1;
    ctx.fillRect(cx - r * 0.5, cy + r * 0.34, r * 1.0, r * 0.34);
    ctx.strokeRect(cx - r * 0.5, cy + r * 0.34, r * 1.0, r * 0.34);
    ctx.fillStyle = plane.stalling ? '#ff5442' : '#54d996';
    ctx.font = `bold ${Math.max(8, Math.round(r * 0.22))}px "Trebuchet MS", sans-serif`;
    ctx.fillText(`${Math.round(plane.speedKts)} KT`, cx, cy + r * 0.52);
  } else {
    ctx.fillStyle = '#8eb1c2';
    ctx.font = 'bold 8px "Trebuchet MS", sans-serif';
    ctx.fillText('KTS', cx, cy + r * 0.48);
  }

  const na = speedToA(plane.speedKts);
  ctx.strokeStyle = '#ffd46b';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(na) * 5, cy - Math.sin(na) * 5);
  ctx.lineTo(cx + Math.cos(na) * (r - 13), cy + Math.sin(na) * (r - 13));
  ctx.stroke();
  ctx.fillStyle = '#f6efde';
  ctx.beginPath();
  ctx.arc(cx, cy, 3.6, 0, Math.PI * 2);
  ctx.fill();
  drawGlassSheen(ctx, cx, cy, r);
}

function drawAltimeterDial(ctx, cx, cy, r, telemetry, showDigital = true) {
  drawDialBezel(ctx, cx, cy, r, '#ffd46b');
  ctx.fillStyle = '#f6efde';
  ctx.font = `bold ${Math.max(8, Math.round(r * 0.2))}px "Trebuchet MS", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < 10; i++) {
    const a = -Math.PI * 0.5 + (i / 10) * Math.PI * 2;
    ctx.strokeStyle = '#f6efde';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r - 9.5), cy + Math.sin(a) * (r - 9.5));
    ctx.lineTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
    ctx.stroke();
    if (!showDigital || i !== 5) {
      ctx.fillText(String(i), cx + Math.cos(a) * (r - 17), cy + Math.sin(a) * (r - 17));
    }
  }

  if (showDigital) {
    ctx.fillStyle = '#071118';
    ctx.strokeStyle = '#385466';
    ctx.lineWidth = 1;
    ctx.fillRect(cx - r * 0.5, cy + r * 0.34, r * 1.0, r * 0.34);
    ctx.strokeRect(cx - r * 0.5, cy + r * 0.34, r * 1.0, r * 0.34);
    ctx.fillStyle = '#ffd46b';
    ctx.font = `bold ${Math.max(8, Math.round(r * 0.22))}px "Trebuchet MS", sans-serif`;
    ctx.fillText(`${telemetry.altFt} FT`, cx, cy + r * 0.52);
  } else {
    ctx.fillStyle = '#8eb1c2';
    ctx.font = 'bold 7.5px "Trebuchet MS", sans-serif';
    ctx.fillText('ALT', cx, cy - r * 0.24);
  }

  const a1000 = -Math.PI * 0.5 + ((telemetry.altFt % 10000) / 10000) * Math.PI * 2;
  const a100 = -Math.PI * 0.5 + ((telemetry.altFt % 1000) / 1000) * Math.PI * 2;
  ctx.strokeStyle = '#43c4c4';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a1000) * (r * 0.45), cy + Math.sin(a1000) * (r * 0.45));
  ctx.stroke();

  ctx.strokeStyle = '#fff5d9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a100) * (r - 11), cy + Math.sin(a100) * (r - 11));
  ctx.stroke();

  ctx.fillStyle = '#ffd46b';
  ctx.beginPath();
  ctx.arc(cx, cy, 3.6, 0, Math.PI * 2);
  ctx.fill();
  drawGlassSheen(ctx, cx, cy, r);
}

function drawCompassRose(ctx, cx, cy, r, telemetry, waypointBearingDeg) {
  drawDialBezel(ctx, cx, cy, r, '#43c4c4');
  const hdgRad = (telemetry.hdgDeg * Math.PI) / 180;
  ctx.save();
  for (let d = 0; d < 360; d += 30) {
    const a = -Math.PI * 0.5 + (d * Math.PI) / 180 - hdgRad;
    const isCard = d % 90 === 0;
    ctx.strokeStyle = isCard ? '#ffd46b' : '#7b99a8';
    ctx.lineWidth = isCard ? 1.9 : 1.1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r - 8.5), cy + Math.sin(a) * (r - 8.5));
    ctx.lineTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3));
    ctx.stroke();

    const lbl = d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : d === 270 ? 'W' : String(d / 10);
    if (isCard || r >= 44) {
      ctx.fillStyle = d === 0 ? '#ff5d47' : isCard ? '#fff5d9' : '#9bb8c7';
      ctx.font = `bold ${Math.max(8, Math.round(r * (isCard ? 0.22 : 0.17)))}px "Trebuchet MS", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(lbl, cx + Math.cos(a) * (r - 17), cy + Math.sin(a) * (r - 17));
    }
  }

  const bugA = -Math.PI * 0.5 + (waypointBearingDeg * Math.PI) / 180 - hdgRad;
  ctx.fillStyle = '#ff8c2e';
  ctx.strokeStyle = '#fff5d9';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx + Math.cos(bugA) * (r - 6), cy + Math.sin(bugA) * (r - 6), 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ff6b4a';
  ctx.beginPath();
  ctx.moveTo(cx, cy - r + 1);
  ctx.lineTo(cx - 4, cy - r + 8.5);
  ctx.lineTo(cx + 4, cy - r + 8.5);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#ffd46b';
  ctx.lineWidth = 1.9;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 7);
  ctx.lineTo(cx, cy + 7);
  ctx.moveTo(cx - 8, cy - 1);
  ctx.lineTo(cx + 8, cy - 1);
  ctx.moveTo(cx - 3.5, cy + 5.5);
  ctx.lineTo(cx + 3.5, cy + 5.5);
  ctx.stroke();
  ctx.restore();
  drawGlassSheen(ctx, cx, cy, r);
}

function drawTurnCoordinator(ctx, cx, cy, r, plane) {
  drawDialBezel(ctx, cx, cy, r, '#43c4c4');
  ctx.save();
  // Level wing ticks + standard-rate 20 deg downward bank marks (L / R)
  ctx.strokeStyle = '#f6efde';
  ctx.lineWidth = 1.7;
  for (const ang of [0, 0.34]) {
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(ang) * (r - 12), cy - 4 + Math.sin(ang) * (r - 12));
    ctx.lineTo(cx - Math.cos(ang) * (r - 5), cy - 4 + Math.sin(ang) * (r - 5));
    ctx.moveTo(cx + Math.cos(ang) * (r - 12), cy - 4 + Math.sin(ang) * (r - 12));
    ctx.lineTo(cx + Math.cos(ang) * (r - 5), cy - 4 + Math.sin(ang) * (r - 5));
    ctx.stroke();
  }
  ctx.fillStyle = '#9bb8c7';
  ctx.font = 'bold 8px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('L', cx - r + 15, cy + 16);
  ctx.fillText('R', cx + r - 15, cy + 16);

  // Exact 1:1 bank angle match with outside horizon, HUD & Attitude Indicator!
  ctx.save();
  ctx.translate(cx, cy - 4);
  ctx.rotate(clamp(plane.roll, -0.52, 0.52));
  ctx.strokeStyle = '#ffd46b';
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(-r * 0.54, 2);
  ctx.lineTo(r * 0.54, 2);
  ctx.moveTo(0, -10);
  ctx.lineTo(0, 4);
  ctx.moveTo(-6, -6);
  ctx.lineTo(6, -6);
  ctx.stroke();
  ctx.fillStyle = '#ff8c38';
  ctx.beginPath();
  ctx.arc(0, 2, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Inclinometer slip/skid tube with twin center calibration bars (authentic crosswind slip ball!)
  const tubeW = r * 0.9;
  const tubeY = cy + r * 0.42;
  ctx.fillStyle = '#08141c';
  ctx.strokeStyle = '#738f9f';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(cx - tubeW * 0.5, tubeY - 5.5, tubeW, 11, 5.5);
  ctx.fill();
  ctx.stroke();
  const ballOff = clamp(plane.roll * 26 + plane.rudderDeflect * 9, -tubeW * 0.3, tubeW * 0.3);
  ctx.fillStyle = '#f6efde';
  ctx.beginPath();
  ctx.arc(cx + ballOff, tubeY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffd46b';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(cx - 6, tubeY - 5.5); ctx.lineTo(cx - 6, tubeY + 5.5);
  ctx.moveTo(cx + 6, tubeY - 5.5); ctx.lineTo(cx + 6, tubeY + 5.5);
  ctx.stroke();

  ctx.fillStyle = '#9bb8c7';
  ctx.font = 'bold 8px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('TURN / SLIP', cx, cy - r * 0.56);
  ctx.restore();
  drawGlassSheen(ctx, cx, cy, r);
}

function drawVsiDial(ctx, cx, cy, r, telemetry) {
  drawDialBezel(ctx, cx, cy, r, telemetry.vsiFpm < -420 ? '#ff5442' : '#54d996');
  ctx.save();
  const fpmToA = (fpm) => Math.PI + clamp(fpm / 1000, -1, 1) * (Math.PI * 0.72);
  ctx.fillStyle = '#f6efde';
  ctx.font = `bold ${Math.max(8, Math.round(r * 0.19))}px "Trebuchet MS", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const v of [-800, -400, 0, 400, 800]) {
    const a = fpmToA(v);
    ctx.strokeStyle = v < -400 ? '#ff6b52' : '#f6efde';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10));
    ctx.lineTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
    ctx.stroke();
    ctx.fillText(String(Math.abs(v) / 100), cx + Math.cos(a) * (r - 18), cy + Math.sin(a) * (r - 18));
  }

  ctx.fillStyle = '#9bb8c7';
  ctx.font = 'bold 8px "Trebuchet MS", sans-serif';
  ctx.fillText('VSI', cx, cy - r * 0.28);
  ctx.fillStyle = telemetry.vsiFpm < -400 ? '#ff6b52' : '#54d996';
  ctx.font = 'bold 10px "Trebuchet MS", sans-serif';
  ctx.fillText(`${telemetry.vsiFpm >= 0 ? '+' : ''}${telemetry.vsiFpm}`, cx + 4, cy + r * 0.34);

  const na = fpmToA(telemetry.vsiFpm);
  ctx.strokeStyle = '#ffd46b';
  ctx.lineWidth = 2.3;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(na) * (r - 11), cy + Math.sin(na) * (r - 11));
  ctx.stroke();
  ctx.fillStyle = '#f6efde';
  ctx.beginPath();
  ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawGlassSheen(ctx, cx, cy, r);
}

function drawTerrainRadar(ctx, cx, cy, r, world, plane, mission, weather) {
  drawDialBezel(ctx, cx, cy, r, '#54d996');
  const isStorm = weather.preset.rainIntensity > 0.5;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = '#071a19';
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  ctx.strokeStyle = 'rgba(84, 217, 150, 0.24)';
  ctx.lineWidth = 1;
  for (const frac of [0.38, 0.72]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * frac, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
  ctx.stroke();

  if (isStorm) {
    ctx.fillStyle = 'rgba(239, 174, 56, 0.24)';
    ctx.beginPath();
    ctx.arc(cx + 12, cy - 14, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
  }

  const range = 2000;
  const sinY = Math.sin(plane.yaw);
  const cosY = Math.cos(plane.yaw);
  const toRadar = (wx, wz) => {
    const dx = wx - plane.x;
    const dz = wz - plane.z;
    const fwd = dx * sinY + dz * cosY;
    const right = dx * cosY - dz * sinY;
    return { x: cx + (right / range) * (r - 6), y: cy - (fwd / range) * (r - 6) };
  };

  for (const isl of world.islands) {
    const p = toRadar(isl.x, isl.z);
    const ir = Math.max(4, (isl.radius / range) * r);
    if (Math.hypot(p.x - cx, p.y - cy) > r + ir) continue;
    ctx.fillStyle = 'rgba(67, 196, 156, 0.30)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, ir, 0, Math.PI * 2);
    ctx.fill();
  }

  if (mission) {
    const rwy = mission.targetRunway;
    const pA = toRadar(rwy.x - rwy.dirX * (rwy.length * 0.5), rwy.z - rwy.dirZ * (rwy.length * 0.5));
    const pB = toRadar(rwy.x + rwy.dirX * (rwy.length * 0.5), rwy.z + rwy.dirZ * (rwy.length * 0.5));
    ctx.strokeStyle = '#54d996';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(pA.x, pA.y);
    ctx.lineTo(pB.x, pB.y);
    ctx.stroke();

    const wp = getActiveWaypoint(mission);
    if (wp) {
      const p = toRadar(wp.x, wp.z);
      ctx.fillStyle = '#ffb84d';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = '#fff5d9';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 5);
  ctx.lineTo(cx - 3.5, cy + 4);
  ctx.lineTo(cx + 3.5, cy + 4);
  ctx.closePath();
  ctx.fill();

  // Crisp Wind Speed + Directional Vector Arrow cleanly boxed at bottom of radar (never overlapping range rings!)
  const relWindRad = ((weather.windDirDeg * Math.PI) / 180) - plane.yaw;
  ctx.fillStyle = 'rgba(7, 22, 24, 0.92)';
  ctx.fillRect(cx - r * 0.72, cy + r * 0.42, r * 1.44, 15);
  ctx.fillStyle = '#7bf0b2';
  ctx.font = 'bold 8px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`WND ${Math.round(weather.windSpeedKts)}`, cx - r * 0.54, cy + r * 0.54);
  ctx.save();
  ctx.translate(cx + r * 0.38, cy + r * 0.50);
  ctx.rotate(relWindRad);
  ctx.strokeStyle = '#ffd46b';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(0, 4.5); ctx.lineTo(0, -4.5);
  ctx.lineTo(-2.6, -1.5);
  ctx.moveTo(0, -4.5); ctx.lineTo(2.6, -1.5);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  drawGlassSheen(ctx, cx, cy, r);
}

function drawMiniBar(ctx, x, y, w, h, label, valueText, frac, barColor, warn = false) {
  ctx.fillStyle = warn ? '#ff6452' : '#c4d8e4';
  ctx.font = 'bold 10px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(label, x, y);
  ctx.textAlign = 'right';
  ctx.fillStyle = warn ? '#ff7c68' : '#fff5d9';
  ctx.fillText(valueText, x + w, y);

  ctx.fillStyle = '#09151e';
  ctx.strokeStyle = warn ? '#e84c38' : '#355061';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.roundRect(x, y + 13, w, h, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = barColor;
  ctx.beginPath();
  ctx.roundRect(x + 1.5, y + 14.5, Math.max(0, (w - 3) * clamp(frac, 0, 1)), h - 3, 3);
  ctx.fill();
}

function drawWorldGateTag(ctx, state, width, height) {
  const { camera, mission, plane } = state;
  if (!mission) return;
  const wp = getActiveWaypoint(mission);
  if (!wp) return;
  const basis = buildCameraBasis(camera, width, height);
  const proj = projectPoint(basis, wp.x, wp.y + 30, wp.z);
  if (!proj || proj.sx < 80 || proj.sx > width - 80 || proj.sy < 54 || proj.sy > height - 150) return;

  const distM = Math.round(Math.hypot(wp.x - plane.x, wp.y - plane.y, wp.z - plane.z));
  const text = `${wp.label} · ${distM}m`;
  ctx.save();
  ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
  const tw = ctx.measureText(text).width + 22;
  const tx = proj.sx - tw * 0.5;
  const ty = Math.max(52, proj.sy - 24);

  ctx.fillStyle = 'rgba(10, 21, 30, 0.82)';
  ctx.strokeStyle = '#ffaa3b';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(tx, ty, tw, 24, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffe599';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, proj.sx, ty + 12.5);
  ctx.restore();
}

function drawWindshieldRain(ctx, weather, width, height) {
  if (weather.preset.rainIntensity <= 0.2) return;
  const intensity = weather.preset.rainIntensity;
  ctx.save();
  // Strictly clipped inside the slanted interior windshield glass trapezoid below the 3D canopy header bar!
  ctx.beginPath();
  ctx.moveTo(width * 0.10, 74);
  ctx.lineTo(width * 0.90, 74);
  ctx.lineTo(width * 0.88, height * 0.56);
  ctx.lineTo(width * 0.12, height * 0.56);
  ctx.closePath();
  ctx.clip();

  // Slanted LEFT-TO-RIGHT (\) matching the 28 KT crosswind (WND 28 ->) + glistening glass droplets!
  ctx.strokeStyle = `rgba(198, 232, 248, ${0.32 * intensity})`;
  ctx.lineWidth = 1.45;
  for (let i = 0; i < weather.rainDrops.length; i++) {
    const d = weather.rainDrops[i];
    const x = d.x * width;
    const y = 74 + d.y * (height * 0.48);
    const dx = d.len * 0.44;
    const dy = d.len * 1.12;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx, y + dy);
    ctx.stroke();

    if (i % 2 === 0) {
      ctx.fillStyle = `rgba(218, 244, 255, ${0.26 * intensity})`;
      ctx.beginPath();
      ctx.ellipse(x + dx * 0.5, y + dy * 0.5, 2.0, 4.2, 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawCollimatedHudCombiner(ctx, state, telemetry, width, height) {
  // Strictly clipped inside centered 3D HUD glass combiner — pitch-conformal horizon + ILS GS/LOC + eyes-up SPD/ALT!
  const { plane, mission } = state;
  const cx = width * 0.5;
  const cy = height * 0.39;
  const boxW = 286;
  const boxH = 166;
  const bx = cx - boxW * 0.5;
  const by = cy - boxH * 0.5 + 14;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(bx + 6, by + 6, boxW - 12, boxH - 12, 6);
  ctx.clip();

  ctx.shadowColor = 'rgba(0, 14, 10, 0.90)';
  ctx.shadowBlur = 4;

  // Pitch-conformal collimated horizon line aligned with outside horizon + tilted by -plane.roll!
  ctx.save();
  ctx.translate(cx, cy + 4);
  ctx.rotate(-plane.roll);
  const pShift = ((plane.pitch * 180) / Math.PI) * 5.0;
  ctx.strokeStyle = '#6bffca';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(-78, pShift); ctx.lineTo(-22, pShift);
  ctx.moveTo(22, pShift); ctx.lineTo(78, pShift);
  ctx.stroke();

  ctx.lineWidth = 1.3;
  for (const deg of [-5, 5]) {
    const py = pShift - deg * 5.0;
    ctx.setLineDash(deg < 0 ? [5, 4] : []);
    ctx.beginPath();
    ctx.moveTo(-36, py); ctx.lineTo(-16, py);
    ctx.moveTo(16, py); ctx.lineTo(36, py);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();

  // Flight Path Vector reticle
  ctx.strokeStyle = '#7dffcf';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.arc(cx, cy + 16, 6.5, 0, Math.PI * 2);
  ctx.moveTo(cx - 18, cy + 16); ctx.lineTo(cx - 6.5, cy + 16);
  ctx.moveTo(cx + 6.5, cy + 16); ctx.lineTo(cx + 18, cy + 16);
  ctx.moveTo(cx, cy + 9.5); ctx.lineTo(cx, cy + 2);
  ctx.stroke();

  // Eyes-up compact left SPD & right ALT readouts
  ctx.fillStyle = '#85ffd4';
  ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${telemetry.spdKts}KT`, bx + 14, cy + 18);
  ctx.textAlign = 'right';
  ctx.fillText(`${telemetry.altFt}FT`, bx + boxW - 36, cy + 18);

  // Right-edge ILS Glideslope Scale + GS Label + Diamond
  const gsX = bx + boxW - 20;
  ctx.strokeStyle = 'rgba(120, 255, 208, 0.80)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(gsX - 6, cy + 14); ctx.lineTo(gsX + 6, cy + 14);
  ctx.stroke();
  for (const d of [-2, -1, 1, 2]) {
    ctx.beginPath();
    ctx.arc(gsX, cy + 14 + d * 13, 2.0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#ffe278';
  ctx.beginPath();
  ctx.moveTo(gsX, cy + 8); ctx.lineTo(gsX + 5, cy + 14); ctx.lineTo(gsX, cy + 20); ctx.lineTo(gsX - 5, cy + 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#85ffd4';
  ctx.font = 'bold 8.5px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('GS', gsX, by + 34);

  // Bottom-edge ILS Localizer Scale + LOC Label + Diamond
  const locY = by + boxH - 26;
  ctx.beginPath();
  ctx.moveTo(cx, locY - 6); ctx.lineTo(cx, locY + 6);
  ctx.stroke();
  for (const d of [-2, -1, 1, 2]) {
    ctx.beginPath();
    ctx.arc(cx + d * 20, locY, 2.0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#6bffca';
  ctx.beginPath();
  ctx.moveTo(cx + 3, locY - 5); ctx.lineTo(cx + 8, locY); ctx.lineTo(cx + 3, locY + 5); ctx.lineTo(cx - 2, locY);
  ctx.closePath();
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.fillText('LOC', bx + 14, locY + 3);

  // Clean unobstructed top Heading & ILS readout (ZERO colliding roll arc!)
  ctx.fillStyle = '#85ffd4';
  ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`HDG ${formatHeading(telemetry.hdgDeg)}°  ·  ILS ${mission ? mission.targetRunway.code : 'RWY'}`, cx, by + 22);

  const wp = mission ? getActiveWaypoint(mission) : null;
  const distM = wp ? Math.round(Math.hypot(wp.x - plane.x, wp.y - plane.y, wp.z - plane.z)) : 0;
  ctx.fillStyle = '#ffe585';
  ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
  ctx.fillText(`${wp ? wp.label : 'FINAL'} · ${distM}m`, cx, by + boxH - 10);
  ctx.restore();
}

function renderCockpitHud(ctx, state, telemetry, width, height) {
  const { world, weather, plane, mission, campaign } = state;

  drawWindshieldRain(ctx, weather, width, height);
  drawCollimatedHudCombiner(ctx, state, telemetry, width, height);

  // Minimal perimeter corner pills ONLY (zero duplicate ALT/SPD/HDG, zero sky-blocking top slab!)
  ctx.save();
  ctx.fillStyle = 'rgba(9, 19, 27, 0.78)';
  ctx.strokeStyle = 'rgba(216, 155, 50, 0.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(18, 14, 344, 52, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#efae38';
  ctx.fillRect(18, 14, 4, 52);

  ctx.fillStyle = '#ffd46b';
  ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${mission.def.code} · ${mission.def.title} · SQUALL IFR`, 32, 32);
  ctx.fillStyle = '#d7e6ee';
  ctx.font = '600 11px "Trebuchet MS", sans-serif';
  ctx.fillText(`${mission.ringsCleared}/${mission.rings.length} RINGS · ${mission.dropsCleared}/${mission.dropZones.length} DROPS · ${mission.radioLine}`, 32, 52, 316);

  ctx.fillStyle = 'rgba(9, 19, 27, 0.78)';
  ctx.strokeStyle = 'rgba(216, 155, 50, 0.55)';
  ctx.beginPath();
  ctx.roundRect(width - 236, 14, 218, 52, 8);
  ctx.fill();
  ctx.stroke();
  const secs = Math.max(0, Math.ceil(mission.timeLeft));
  const clk = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  ctx.fillStyle = '#9db9c7';
  ctx.font = 'bold 10px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`IFR · STREAK x${mission.streak}`, width - 222, 31);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(clk, width - 30, 31);
  ctx.fillStyle = '#ffd46b';
  ctx.font = 'bold 18px "Trebuchet MS", sans-serif';
  ctx.fillText((campaign.totalScore + mission.score).toLocaleString(), width - 30, 55);
  ctx.restore();

  // Lit 6-Pack Cockpit Instrument Console anchored cleanly beneath the 3D WebGL2 glareshield
  const dashY = height - 206;
  ctx.save();
  const dashGrad = ctx.createLinearGradient(0, dashY, 0, height);
  dashGrad.addColorStop(0, '#182936');
  dashGrad.addColorStop(0.12, '#101d27');
  dashGrad.addColorStop(1, '#081016');
  ctx.fillStyle = dashGrad;
  ctx.beginPath();
  ctx.moveTo(0, dashY + 18);
  ctx.quadraticCurveTo(width * 0.5, dashY - 12, width, dashY + 18);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#d89b32';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(0, dashY + 18);
  ctx.quadraticCurveTo(width * 0.5, dashY - 12, width, dashY + 18);
  ctx.stroke();

  const annY = dashY + 16;
  const pills = [
    { text: `X-WIND ${Math.round(weather.windSpeedKts)} KT`, bg: '#263846', bd: '#56c2cf', fg: '#8ef0ff' },
    {
      text: plane.bingoFuel ? `BINGO FUEL ${telemetry.fuelPct}%` : `FUEL ${telemetry.fuelPct}%`,
      bg: plane.bingoFuel ? '#5e1a18' : '#1b312d',
      bd: plane.bingoFuel ? '#ff5542' : '#43c48a',
      fg: plane.bingoFuel ? '#ffd4c7' : '#89f2be',
    },
    {
      text: `HULL ${telemetry.hullPct}%`,
      bg: telemetry.hullPct < 75 ? '#4a3114' : '#1b312d',
      bd: telemetry.hullPct < 75 ? '#efae38' : '#43c48a',
      fg: telemetry.hullPct < 75 ? '#ffe099' : '#89f2be',
    },
    {
      text: plane.stalling ? 'STALL WARN' : `FLAPS ${plane.flapsDeg}°`,
      bg: plane.stalling ? '#641717' : '#163540',
      bd: plane.stalling ? '#ff4636' : '#43c4c4',
      fg: plane.stalling ? '#ffd4c7' : '#9ff5f5',
    },
    { text: `ILS ${mission.targetRunway.code} LOCK`, bg: '#153226', bd: '#54d996', fg: '#8cf7be' },
  ];
  const pillW = 148;
  const pillGap = 12;
  const totalPW = pills.length * pillW + (pills.length - 1) * pillGap;
  let px = (width - totalPW) * 0.5;
  for (const p of pills) {
    ctx.fillStyle = p.bg;
    ctx.strokeStyle = p.bd;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(px, annY, pillW, 24, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = p.fg;
    ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.text, px + pillW * 0.5, annY + 12.5);
    px += pillW + pillGap;
  }

  // Authentic Lit 6-Pack Dials + Storm Radar + Engine Powerplant Panel
  const dialY = dashY + 122;
  const r = 52;
  const wp = getActiveWaypoint(mission);
  const wpBearing = wp ? (((Math.atan2(wp.x - plane.x, wp.z - plane.z) * 180) / Math.PI) + 360) % 360 : telemetry.hdgDeg;

  drawAirspeedDial(ctx, 118, dialY, r, plane, true);
  drawArtificialHorizon(ctx, 244, dialY, r, plane);
  drawAltimeterDial(ctx, 370, dialY, r, telemetry, true);
  drawTurnCoordinator(ctx, 496, dialY, r, plane);
  drawCompassRose(ctx, 622, dialY, r, telemetry, wpBearing);
  drawVsiDial(ctx, 748, dialY, r, telemetry);
  drawTerrainRadar(ctx, 882, dialY, r, world, plane, mission, weather);

  const ex = 966;
  const ey = dashY + 56;
  const ew = 286;
  const eh = 132;
  ctx.fillStyle = '#0a1620';
  ctx.strokeStyle = '#365263';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(ex, ey, ew, eh, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffd46b';
  ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('AERO-7 TWIN RADIAL POWERPLANT', ex + 14, ey + 18);

  const bx = ex + 14;
  const bw = 192;
  drawMiniBar(ctx, bx, ey + 28, bw, 10, 'FUEL RESERVE', `${telemetry.fuelPct}%`, plane.fuel / plane.fuelCap, plane.bingoFuel ? '#ff4f3e' : '#efae38', plane.bingoFuel);
  drawMiniBar(ctx, bx, ey + 61, bw, 10, 'AIRFRAME HULL', `${telemetry.hullPct}%`, plane.hull / plane.hullCap, telemetry.hullPct < 75 ? '#efae38' : '#43c48a', telemetry.hullPct < 55);
  drawMiniBar(ctx, bx, ey + 94, bw, 10, 'THROTTLE / RPM', `${telemetry.throttlePct}%`, plane.throttle, plane.boosting ? '#ff8b3d' : '#43c4c4', false);

  const qx = ex + 238;
  const qy = ey + 28;
  const qh = 74;
  ctx.fillStyle = '#060d12';
  ctx.strokeStyle = '#476578';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(qx - 7, qy, 14, qh, 6);
  ctx.fill();
  ctx.stroke();

  const knobY = qy + qh - plane.throttle * qh;
  ctx.fillStyle = plane.boosting ? '#ff5938' : '#efae38';
  ctx.strokeStyle = '#fff5d9';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(qx - 18, knobY - 7, 36, 14, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#9bb8c7';
  ctx.font = 'bold 8.5px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('WEP', qx, qy - 7);
  ctx.fillText('IDLE', qx, qy + qh + 13);
  ctx.restore();
}

function renderChaseHud(ctx, state, telemetry, width, height) {
  const { world, weather, plane, mission, campaign } = state;

  drawWorldGateTag(ctx, state, width, height);

  // 1. Sleek Top Translucent Aviation Bar (42px — clean single telemetry row!)
  ctx.save();
  ctx.fillStyle = 'rgba(10, 20, 29, 0.78)';
  ctx.fillRect(0, 0, width, 42);
  ctx.strokeStyle = 'rgba(216, 155, 50, 0.55)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, 42);
  ctx.lineTo(width, 42);
  ctx.stroke();

  ctx.fillStyle = '#ffd46b';
  ctx.font = 'bold 15px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(GAME_TITLE, 18, 21);
  ctx.fillStyle = '#a7c3d1';
  ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
  ctx.fillText(`${mission.def.code} · ${mission.def.title}`, 154, 21);

  const centerStats = [
    { lbl: 'ALT', val: `${telemetry.altFt} FT`, col: '#ffd46b' },
    { lbl: 'SPD', val: `${telemetry.spdKts} KTS`, col: '#69e4e4' },
    { lbl: 'HDG', val: `${formatHeading(telemetry.hdgDeg)}°`, col: '#69e4e4' },
    { lbl: 'STREAK', val: `x${mission.streak}`, col: '#ff9f43' },
  ];
  let sx = 438;
  for (const st of centerStats) {
    ctx.fillStyle = 'rgba(22, 42, 56, 0.78)';
    ctx.strokeStyle = 'rgba(92, 132, 154, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(sx, 7, 108, 28, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#8fb0c2';
    ctx.font = 'bold 9px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(st.lbl, sx + 8, 21);
    ctx.fillStyle = st.col;
    ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(st.val, sx + 100, 21);
    sx += 116;
  }

  const secs = Math.max(0, Math.ceil(mission.timeLeft));
  const clk = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  ctx.fillStyle = '#d7e6ee';
  ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(clk, width - 190, 21);
  ctx.fillStyle = '#91b0c0';
  ctx.font = 'bold 10px "Trebuchet MS", sans-serif';
  ctx.fillText('SCORE', width - 122, 21);
  ctx.fillStyle = '#ffd46b';
  ctx.font = 'bold 17px "Trebuchet MS", sans-serif';
  ctx.fillText((campaign.totalScore + mission.score).toLocaleString(), width - 18, 21);

  // 2. Sleek Dark-Glass Upper-Left Comms Pill (matches overall UI palette — never hijacks focal hierarchy!)
  ctx.fillStyle = 'rgba(10, 22, 31, 0.76)';
  ctx.strokeStyle = 'rgba(216, 155, 50, 0.52)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(18, 54, 336, 52, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#efae38';
  ctx.fillRect(18, 54, 4, 52);

  ctx.fillStyle = '#ffd46b';
  ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('DISPATCH · T. SATO', 32, 71);
  ctx.fillStyle = '#68eba8';
  ctx.textAlign = 'right';
  ctx.fillText(`${mission.ringsCleared}/${mission.rings.length} RINGS · ${mission.dropsCleared}/${mission.dropZones.length} DROPS`, 342, 71);
  ctx.fillStyle = '#e7f0f5';
  ctx.font = '600 11.5px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(mission.radioLine, 32, 92, 312);

  // 3. Compact Bottom-Center Lit Instrument Pod (leaves ocean & aircraft wings breathing freely!)
  const podW = 684;
  const podH = 104;
  const podX = (width - podW) * 0.5;
  const podY = height - podH - 12;

  ctx.fillStyle = 'rgba(10, 21, 30, 0.84)';
  ctx.strokeStyle = 'rgba(216, 155, 50, 0.65)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.roundRect(podX, podY, podW, podH, 12);
  ctx.fill();
  ctx.stroke();

  const dialR = 39;
  const dialY = podY + podH * 0.5;
  const wp = getActiveWaypoint(mission);
  const wpBearing = wp ? (((Math.atan2(wp.x - plane.x, wp.z - plane.z) * 180) / Math.PI) + 360) % 360 : telemetry.hdgDeg;

  // Analog-only faces on chase dials so ALT/SPD numbers aren't duplicated from top bar!
  drawAirspeedDial(ctx, podX + 54, dialY, dialR, plane, false);
  drawArtificialHorizon(ctx, podX + 146, dialY, dialR, plane);
  drawAltimeterDial(ctx, podX + 238, dialY, dialR, telemetry, false);
  drawCompassRose(ctx, podX + 330, dialY, dialR, telemetry, wpBearing);

  const barX = podX + 388;
  const barW = 186;
  drawMiniBar(ctx, barX, podY + 8, barW, 7, 'FUEL', `${telemetry.fuelPct}%`, plane.fuel / plane.fuelCap, plane.bingoFuel ? '#ff4f3e' : '#efae38', plane.bingoFuel);
  drawMiniBar(ctx, barX, podY + 34, barW, 7, 'HULL', `${telemetry.hullPct}%`, plane.hull / plane.hullCap, '#43c48a', telemetry.hullPct < 50);
  drawMiniBar(ctx, barX, podY + 60, barW, 7, 'THR', `${telemetry.throttlePct}%`, plane.throttle, plane.boosting ? '#ff8b3d' : '#43c4c4', false);

  const papi = computePapiLights(plane, mission.targetRunway);
  const whites = papi.filter((c) => c === 'white').length;
  const slopeTxt = whites === 2 ? 'PAPI ON' : whites > 2 ? 'HIGH' : 'LOW';
  ctx.font = 'bold 9.5px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7bf0f0';
  ctx.fillText(`FLAPS ${plane.flapsDeg}°`, barX, podY + 88);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#d7e6ee';
  ctx.fillText(`VSI ${telemetry.vsiFpm}`, barX + barW * 0.5, podY + 88);
  ctx.textAlign = 'right';
  ctx.fillStyle = whites === 2 ? '#68eba8' : '#ffd46b';
  ctx.fillText(slopeTxt, barX + barW, podY + 88);

  drawTerrainRadar(ctx, podX + podW - 54, dialY, dialR, world, plane, mission, weather);

  let popY = 58;
  for (const pop of mission.popups) {
    ctx.fillStyle = 'rgba(10, 21, 30, 0.85)';
    ctx.strokeStyle = pop.color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(width * 0.5 - 110, popY, 220, 32, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = pop.color;
    ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pop.text, width * 0.5, popY + 17);
    popY += 38;
  }
  ctx.restore();
}

export function drawFooterStrip(ctx, items, width, height) {
  ctx.save();
  ctx.fillStyle = 'rgba(8, 16, 23, 0.86)';
  ctx.fillRect(0, height - 30, width, 30);
  ctx.strokeStyle = 'rgba(216, 155, 50, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height - 30);
  ctx.lineTo(width, height - 30);
  ctx.stroke();

  let x = 20;
  ctx.textBaseline = 'middle';
  for (const it of items) {
    ctx.font = 'bold 10px "Trebuchet MS", sans-serif';
    const kw = ctx.measureText(it.key).width + 10;
    ctx.fillStyle = '#1b3140';
    ctx.strokeStyle = '#628396';
    ctx.beginPath();
    ctx.roundRect(x, height - 23, kw, 16, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffd46b';
    ctx.textAlign = 'center';
    ctx.fillText(it.key, x + kw * 0.5, height - 15);
    x += kw + 5;
    ctx.fillStyle = '#c5d7e0';
    ctx.textAlign = 'left';
    ctx.fillText(it.label, x, height - 15);
    x += ctx.measureText(it.label).width + 14;
  }
  ctx.restore();
}

export function renderFlightHud(ctx, state, width, height) {
  const { plane, camera, paused } = state;
  const telemetry = getTelemetry(plane);

  if (camera.mode === 'cockpit') {
    renderCockpitHud(ctx, state, telemetry, width, height);
  } else {
    renderChaseHud(ctx, state, telemetry, width, height);
  }

  if (plane.damageFlash > 0.02) {
    ctx.save();
    ctx.fillStyle = `rgba(220, 48, 38, ${plane.damageFlash * 0.35})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  if (plane.crashed || paused) {
    ctx.save();
    ctx.fillStyle = 'rgba(7, 15, 22, 0.72)';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#11222e';
    ctx.strokeStyle = plane.crashed ? '#e84c38' : '#efae38';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(width * 0.5 - 240, height * 0.5 - 92, 480, 184, 12);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = plane.crashed ? '#ff6452' : '#ffd46b';
    ctx.font = 'bold 26px "Trebuchet MS", sans-serif';
    ctx.fillText(plane.crashed ? 'AIRFRAME LOST' : 'FLIGHT PAUSED', width * 0.5, height * 0.5 - 42);
    ctx.fillStyle = '#e7f0f5';
    ctx.font = 'bold 14px "Trebuchet MS", sans-serif';
    ctx.fillText(
      plane.crashed ? (plane.crashReason || 'TERRAIN IMPACT') : 'W/S PITCH · A/D ROLL · Q/E RUDDER · ↑/↓ THR · F FLAPS · SPACE DROP · C VIEW',
      width * 0.5,
      height * 0.5 + 4,
    );
    ctx.fillStyle = '#9fc0d1';
    ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
    ctx.fillText(
      plane.crashed ? '[R] RETRY SORTIE    ·    [ENTER] LOGBOOK DEBRIEF' : '[P] RESUME    ·    [R] RESTART SORTIE',
      width * 0.5,
      height * 0.5 + 52,
    );
    ctx.restore();
  }
}
