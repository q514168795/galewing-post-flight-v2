// SPDX-License-Identifier: MIT
// Pure Canvas 2D 3D-projection fallback renderer (auto-activates if WebGL2/hardware acceleration is disabled or lost).

import { clamp, wrapAngleRad } from './random.js';
import { buildCameraBasis, projectPoint, projectRingPoints } from './camera.js';
import { computePapiLights } from './terrain.js';

function drawPoly(ctx, pts, fill, stroke, lineWidth = 1.2) {
  if (!pts || pts.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].sx, pts[0].sy);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function drawSkyAndOcean(ctx, basis, cam, weather, w, h) {
  const p = weather.preset;
  const isStorm = p.rainIntensity > 0.5;
  const horizonY = basis.cy + Math.tan(cam.pitch) * basis.focal;
  const diag = Math.hypot(w, h) * 1.1;

  ctx.save();
  ctx.translate(basis.cx, horizonY);
  ctx.rotate(-cam.roll);

  // Sky gradient
  const skyGrad = ctx.createLinearGradient(0, -diag * 0.72, 0, 14);
  skyGrad.addColorStop(0, p.skyTop);
  skyGrad.addColorStop(0.55, p.skyMid);
  skyGrad.addColorStop(1, p.skyHorizon);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(-diag, -diag, diag * 2, diag + 14);

  // Sun disc & atmospheric corona
  const sunRelYaw = wrapAngleRad(p.sunAzimuth - cam.yaw);
  const sunX = Math.tan(clamp(sunRelYaw, -1.18, 1.18)) * basis.focal;
  const sunY = -Math.tan(p.sunElevation) * basis.focal;
  if (!isStorm && Math.abs(sunRelYaw) < 1.35) {
    const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 260);
    glow.addColorStop(0, 'rgba(255, 245, 200, 0.95)');
    glow.addColorStop(0.18, 'rgba(255, 204, 118, 0.52)');
    glow.addColorStop(0.55, 'rgba(242, 138, 66, 0.16)');
    glow.addColorStop(1, 'rgba(242, 138, 66, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 260, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff9df';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 20, 0, Math.PI * 2);
    ctx.fill();
  }

  // Stylized cloud bands
  ctx.fillStyle = isStorm ? 'rgba(28, 44, 58, 0.58)' : 'rgba(255, 214, 158, 0.24)';
  const cloudDrift = (weather.time || 0) * 6;
  for (let i = -5; i <= 5; i++) {
    const cx = i * 210 + ((cloudDrift + i * 73) % 210) - 105;
    const cy = -58 - (Math.abs(i * 37) % 130);
    const rw = 110 + (Math.abs(i * 29) % 75);
    const rh = 18 + (Math.abs(i * 19) % 18);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Storm lightning flash
  if (isStorm && (weather.lightningFlash || 0) > 0.12) {
    const lx = ((weather.lightningBoltX || 0.62) - 0.5) * w;
    ctx.strokeStyle = `rgba(215, 240, 255, ${clamp(weather.lightningFlash, 0, 1)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(lx, -diag * 0.45);
    ctx.lineTo(lx - 18, -140);
    ctx.lineTo(lx + 14, -75);
    ctx.lineTo(lx - 8, 4);
    ctx.stroke();
  }

  // Ocean gradient
  const seaGrad = ctx.createLinearGradient(0, 0, 0, diag * 0.72);
  seaGrad.addColorStop(0, isStorm ? '#2b4350' : p.fogColor);
  seaGrad.addColorStop(0.12, p.oceanNear);
  seaGrad.addColorStop(0.65, p.oceanDeep);
  seaGrad.addColorStop(1, '#071724');
  ctx.fillStyle = seaGrad;
  ctx.fillRect(-diag, 0, diag * 2, diag);

  // Shimmering sun reflection corridor on ocean
  if (!isStorm && Math.abs(sunRelYaw) < 1.35) {
    ctx.fillStyle = 'rgba(255, 218, 138, 0.26)';
    for (let r = 0; r < 14; r++) {
      const t = r / 14;
      const y = 8 + t * t * 340;
      const sw = 18 + t * 140;
      const wob = Math.sin((weather.time || 0) * 2.4 + r * 1.9) * (6 + t * 18);
      ctx.fillRect(sunX - sw * 0.5 + wob, y, sw, 2 + t * 3);
    }
  }

  // Horizon mist seam
  const haze = ctx.createLinearGradient(0, -18, 0, 22);
  haze.addColorStop(0, 'rgba(255, 224, 178, 0)');
  haze.addColorStop(0.5, isStorm ? 'rgba(62, 86, 100, 0.55)' : 'rgba(244, 186, 126, 0.42)');
  haze.addColorStop(1, 'rgba(255, 224, 178, 0)');
  ctx.fillStyle = haze;
  ctx.fillRect(-diag, -18, diag * 2, 40);

  ctx.restore();
}

function drawRunway2D(ctx, basis, rwy, plane) {
  const halfL = rwy.length * 0.5;
  const halfW = rwy.width * 0.5;
  const y = rwy.y + 0.5;
  const corners = [
    projectPoint(basis, rwy.x - rwy.dirX * halfL - rwy.rightX * halfW, y, rwy.z - rwy.dirZ * halfL - rwy.rightZ * halfW),
    projectPoint(basis, rwy.x - rwy.dirX * halfL + rwy.rightX * halfW, y, rwy.z - rwy.dirZ * halfL + rwy.rightZ * halfW),
    projectPoint(basis, rwy.x + rwy.dirX * halfL + rwy.rightX * halfW, y, rwy.z + rwy.dirZ * halfL + rwy.rightZ * halfW),
    projectPoint(basis, rwy.x + rwy.dirX * halfL - rwy.rightX * halfW, y, rwy.z + rwy.dirZ * halfL - rwy.rightZ * halfW),
  ];
  if (corners.some((c) => !c)) return;
  drawPoly(ctx, corners, '#2a343d', '#cfd8df', 1.4);

  // Centerline dashes
  ctx.strokeStyle = 'rgba(245, 240, 220, 0.85)';
  ctx.lineWidth = 2;
  for (let d = -halfL + 42; d < halfL - 36; d += 44) {
    const a = projectPoint(basis, rwy.x + rwy.dirX * d, y + 0.2, rwy.z + rwy.dirZ * d);
    const b = projectPoint(basis, rwy.x + rwy.dirX * (d + 22), y + 0.2, rwy.z + rwy.dirZ * (d + 22));
    if (a && b) {
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
    }
  }

  // PAPI lights (left of approach threshold)
  const papiStates = computePapiLights(plane, rwy);
  const px = rwy.x - rwy.dirX * (halfL - 58) - rwy.rightX * (halfW + 24);
  const pz = rwy.z - rwy.dirZ * (halfL - 58) - rwy.rightZ * (halfW + 24);
  for (let i = 0; i < 4; i++) {
    const off = (i - 1.5) * 6;
    const pt = projectPoint(basis, px - rwy.rightX * off, y + 2, pz - rwy.rightZ * off);
    if (!pt) continue;
    const r = clamp(pt.scale * 2.2, 2.2, 6.5);
    ctx.fillStyle = papiStates[i] === 'white' ? '#fffdf2' : '#ff3222';
    ctx.beginPath();
    ctx.arc(pt.sx, pt.sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawIsland2D(ctx, basis, isl, plane, isStorm) {
  const center = projectPoint(basis, isl.x, 4, isl.z);
  if (!center || center.z > 8600) return;

  // Shallow turquoise lagoon ring + sandy beach skirt
  const skirt = [];
  const beach = [];
  const segs = 14;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const wobble = 0.84 + 0.16 * Math.sin(a * 3 + (isl.index || 0) * 1.7);
    const rLag = isl.radius * (wobble + 0.14);
    const rLand = isl.radius * wobble;
    const pLag = projectPoint(basis, isl.x + Math.cos(a) * rLag, 0.5, isl.z + Math.sin(a) * rLag);
    const pLand = projectPoint(basis, isl.x + Math.cos(a) * rLand, 3.5, isl.z + Math.sin(a) * rLand);
    if (pLag) skirt.push(pLag);
    if (pLand) beach.push(pLand);
  }
  if (skirt.length >= 3) drawPoly(ctx, skirt, isStorm ? 'rgba(38, 86, 98, 0.52)' : 'rgba(46, 174, 168, 0.45)', null);
  if (beach.length >= 3) drawPoly(ctx, beach, isStorm ? '#5b6359' : '#d6bb85', isStorm ? '#36484e' : '#f2e1b6', 1.2);

  // Multi-peak volcanic / emerald slopes (sorted back-to-front)
  const peaks = [...(isl.peaks || [])].sort((a, b) => {
    const pa = projectPoint(basis, a.x, a.height * 0.4, a.z);
    const pb = projectPoint(basis, b.x, b.height * 0.4, b.z);
    return (pb ? pb.z : 99999) - (pa ? pa.z : 99999);
  });
  for (const pk of peaks) {
    const pr = pk.baseR || 180;
    const apex = projectPoint(basis, pk.x, pk.height, pk.z);
    const left = projectPoint(basis, pk.x - pr * 0.9, 2, pk.z - pr * 0.35);
    const mid = projectPoint(basis, pk.x, 3, pk.z + pr * 0.85);
    const right = projectPoint(basis, pk.x + pr * 0.9, 2, pk.z - pr * 0.35);
    if (apex && left && mid && right) {
      drawPoly(ctx, [left, apex, mid], isStorm ? '#29423a' : '#2f6d46', null);
      drawPoly(ctx, [mid, apex, right], isStorm ? '#1b2d2b' : '#1f4936', null);
      const capY = pk.height * 0.62;
      const cl = projectPoint(basis, pk.x - pr * 0.28, capY, pk.z);
      const cr = projectPoint(basis, pk.x + pr * 0.28, capY, pk.z);
      if (cl && cr) drawPoly(ctx, [cl, apex, cr], isStorm ? '#3c4c54' : '#7b807e', null);
    }
  }

  // Runway on island
  if (isl.runway) drawRunway2D(ctx, basis, isl.runway, plane);

  // Lighthouse tower & warm beacon
  if (isl.lighthouse) {
    const lh = isl.lighthouse;
    const b0 = projectPoint(basis, lh.x - 4, lh.y, lh.z);
    const b1 = projectPoint(basis, lh.x + 4, lh.y, lh.z);
    const t0 = projectPoint(basis, lh.x - 2.2, lh.y + lh.height, lh.z);
    const t1 = projectPoint(basis, lh.x + 2.2, lh.y + lh.height, lh.z);
    if (b0 && b1 && t0 && t1) {
      drawPoly(ctx, [b0, b1, t1, t0], '#f3efe6', '#c8422b', 1.2);
      const lamp = projectPoint(basis, lh.x, lh.y + lh.height + 2.5, lh.z);
      if (lamp) {
        const lr = clamp(lamp.scale * 4, 3, 12);
        ctx.fillStyle = '#ffe580';
        ctx.beginPath();
        ctx.arc(lamp.sx, lamp.sy, lr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawRingsAndSacks2D(ctx, basis, mission) {
  if (!mission) return;
  const rings = (mission.rings || [])
    .filter((r) => !r.cleared)
    .map((r) => ({ ring: r, p: projectPoint(basis, r.x, r.y, r.z) }))
    .filter((item) => item.p && item.p.z > 8 && item.p.z < 6500)
    .sort((a, b) => b.p.z - a.p.z);

  for (const { ring } of rings) {
    const pts = projectRingPoints(basis, ring.x, ring.y, ring.z, ring.radius, ring.yaw, 24);
    if (!pts || pts.length < 6) continue;
    const isApproach = ring.kind === 'approach';
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].sx, pts[0].sy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
    ctx.closePath();
    ctx.strokeStyle = isApproach ? 'rgba(255, 198, 64, 0.95)' : 'rgba(66, 232, 196, 0.92)';
    ctx.lineWidth = clamp((pts[0].scale || 1) * 1.9, 2.5, 9);
    ctx.stroke();
    ctx.strokeStyle = isApproach ? 'rgba(255, 245, 200, 0.72)' : 'rgba(210, 255, 246, 0.65)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
  }

  // Falling parachute mail sacks
  for (const sack of mission.activeSacks || []) {
    const p = projectPoint(basis, sack.x, sack.y, sack.z);
    if (!p) continue;
    const r = clamp(p.scale * 3.2, 3, 14);
    ctx.fillStyle = '#f8f0dc';
    ctx.beginPath();
    ctx.arc(p.sx, p.sy - r * 1.4, r * 1.15, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#d47c2a';
    ctx.fillRect(p.sx - r * 0.45, p.sy - r * 0.3, r * 0.9, r * 0.9);
  }
}

function projectAircraftLocal(basis, plane, lx, ly, lz) {
  const cy = Math.cos(plane.yaw), sy = Math.sin(plane.yaw);
  const cp = Math.cos(plane.pitch), sp = Math.sin(plane.pitch);
  const cr = Math.cos(plane.roll), sr = Math.sin(plane.roll);

  // Roll -> Pitch -> Yaw (matching webgl2 buildAircraftModelMat4)
  const x1 = lx * cr - ly * sr;
  const y1 = lx * sr + ly * cr;
  const z1 = lz;

  const x2 = x1;
  const y2 = y1 * cp + z1 * sp;
  const z2 = -y1 * sp + z1 * cp;

  const wx = plane.x + x2 * cy + z2 * sy;
  const wy = plane.y + y2;
  const wz = plane.z - x2 * sy + z2 * cy;
  return projectPoint(basis, wx, wy, wz);
}

function drawAeroPelican2D(ctx, basis, plane) {
  const P = (x, y, z) => projectAircraftLocal(basis, plane, x, y, z);

  // Wingtip trails
  if (plane.trail && plane.trail.length > 2) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 244, 224, 0.36)';
    ctx.lineWidth = 2;
    for (const side of [-8.6, 8.6]) {
      ctx.beginPath();
      let started = false;
      for (const st of plane.trail) {
        const cr = Math.cos(st.roll), sr = Math.sin(st.roll);
        const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw);
        const wx = st.x + cy * cr * side;
        const wy = st.y - sr * side + 2.6;
        const wz = st.z - sy * cr * side;
        const pt = projectPoint(basis, wx, wy, wz);
        if (pt) {
          if (!started) { ctx.moveTo(pt.sx, pt.sy); started = true; }
          else ctx.lineTo(pt.sx, pt.sy);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Draw engines/props BEFORE wings when viewed from behind so wings properly occlude leading-edge props
  const drawEngines = () => {
    for (const sx of [-2.85, 2.85]) {
      const nac = P(sx, 2.55, 1.9);
      const prop = P(sx, 2.55, 3.05);
      if (nac) {
        const nr = clamp(nac.scale * 0.65, 3, 14);
        ctx.fillStyle = '#33404a';
        ctx.beginPath();
        ctx.arc(nac.sx, nac.sy, nr, 0, Math.PI * 2);
        ctx.fill();
      }
      if (prop) {
        const pr = clamp(prop.scale * 1.45, 7, 30);
        ctx.strokeStyle = plane.boosting ? 'rgba(255, 212, 108, 0.72)' : 'rgba(232, 240, 248, 0.45)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(prop.sx, prop.sy, pr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(235, 242, 248, 0.14)';
        ctx.fill();
      }
    }
  };

  const nosePt = P(0, 1.5, 6.0);
  const tailPt = P(0, 1.5, -7.0);
  const fromBehind = nosePt && tailPt ? nosePt.z > tailPt.z : true;
  if (fromBehind) drawEngines();

  // Horizontal stabilizer
  const hStab = [P(-3.1, 1.8, -6.5), P(3.1, 1.8, -6.5), P(2.5, 1.8, -8.2), P(-2.5, 1.8, -8.2)];
  if (hStab.every(Boolean)) drawPoly(ctx, hStab, '#d9d0be', '#9f2a22', 1.4);

  // Main high gull-wing
  const lWing = [P(-8.9, 2.75, 0.4), P(-0.8, 2.25, 1.9), P(-0.8, 2.25, -1.2), P(-8.9, 2.75, -1.3)];
  const rWing = [P(0.8, 2.25, 1.9), P(8.9, 2.75, 0.4), P(8.9, 2.75, -1.3), P(0.8, 2.25, -1.2)];
  if (lWing.every(Boolean)) drawPoly(ctx, lWing, '#f2ead8', '#b83226', 1.8);
  if (rWing.every(Boolean)) drawPoly(ctx, rWing, '#e8dec9', '#b83226', 1.8);

  // Crimson wingtip trim bands
  const lTip = [P(-8.9, 2.77, 0.4), P(-7.0, 2.65, 0.65), P(-7.0, 2.65, -1.25), P(-8.9, 2.77, -1.3)];
  const rTip = [P(7.0, 2.65, 0.65), P(8.9, 2.77, 0.4), P(8.9, 2.77, -1.3), P(7.0, 2.65, -1.25)];
  if (lTip.every(Boolean)) drawPoly(ctx, lTip, '#c73428', null);
  if (rTip.every(Boolean)) drawPoly(ctx, rTip, '#c73428', null);

  // Fuselage hull (cream upper + dark marine underside)
  const hullTop = [P(0, 1.55, 6.2), P(1.15, 1.35, 1.8), P(0.75, 1.15, -7.2), P(-0.75, 1.15, -7.2), P(-1.15, 1.35, 1.8)];
  const hullBot = [P(0, 0.35, 5.8), P(1.05, 0.15, 1.6), P(0.55, 0.55, -7.0), P(-0.55, 0.55, -7.0), P(-1.05, 0.15, 1.6)];
  if (hullBot.every(Boolean)) drawPoly(ctx, hullBot, '#2c4252', '#172530', 1.2);
  if (hullTop.every(Boolean)) drawPoly(ctx, hullTop, '#f5eedc', '#9c8c72', 1.2);

  // Cockpit canopy glass
  const canopy = [P(0, 2.25, 3.1), P(0.92, 1.72, 1.2), P(-0.92, 1.72, 1.2)];
  if (canopy.every(Boolean)) drawPoly(ctx, canopy, '#295770', '#c7e3f0', 1.1);

  // Vertical tail fin (crimson mail stripe)
  const vFin = [P(0, 1.2, -5.0), P(0, 4.1, -7.4), P(0, 3.85, -8.3), P(0, 1.1, -7.8)];
  if (vFin.every(Boolean)) drawPoly(ctx, vFin, '#c73428', '#ffd46b', 1.3);

  if (!fromBehind) drawEngines();
}

function drawCockpitFrame2D(ctx, w, h) {
  ctx.save();
  // Top canopy beam + symmetric A-pillars
  ctx.fillStyle = '#151e26';
  ctx.fillRect(0, 0, w, 46);
  ctx.beginPath();
  ctx.moveTo(0, 44);
  ctx.lineTo(132, 44);
  ctx.lineTo(92, h * 0.62);
  ctx.lineTo(0, h * 0.62);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(w, 44);
  ctx.lineTo(w - 132, 44);
  ctx.lineTo(w - 92, h * 0.62);
  ctx.lineTo(w, h * 0.62);
  ctx.closePath();
  ctx.fill();

  // Glareshield lower deck
  ctx.fillStyle = '#141c23';
  ctx.fillRect(0, h * 0.60, w, h * 0.40);
  ctx.strokeStyle = '#3a4c59';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.60);
  ctx.lineTo(w, h * 0.60);
  ctx.stroke();
  ctx.restore();
}

function drawFallbackPill(ctx, w) {
  ctx.save();
  const label = '2D SOFTWARE MODE · ENABLE CHROME HARDWARE ACCEL FOR WEBGL2 3D';
  ctx.font = 'bold 10px "Trebuchet MS", sans-serif';
  const tw = ctx.measureText(label).width + 18;
  const x = w - tw - 16;
  const y = 64;
  ctx.fillStyle = 'rgba(10, 22, 32, 0.80)';
  ctx.strokeStyle = 'rgba(240, 178, 66, 0.68)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, tw, 20, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffd97a';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 9, y + 10);
  ctx.restore();
}

export function renderWorld2D(ctx, state, width, height) {
  const { world, weather, plane, mission, camera } = state;
  const basis = buildCameraBasis(camera, width, height);
  const isStorm = weather.preset.rainIntensity > 0.5;

  drawSkyAndOcean(ctx, basis, camera, weather, width, height);

  // Sort islands back-to-front
  const sortedIslands = [...world.islands].sort((a, b) => {
    const da = Math.hypot(a.x - camera.x, a.z - camera.z);
    const db = Math.hypot(b.x - camera.x, b.z - camera.z);
    return db - da;
  });
  for (const isl of sortedIslands) {
    drawIsland2D(ctx, basis, isl, plane, isStorm);
  }

  drawRingsAndSacks2D(ctx, basis, mission);

  if (camera.mode === 'cockpit') {
    drawCockpitFrame2D(ctx, width, height);
  } else {
    drawAeroPelican2D(ctx, basis, plane);
    drawFallbackPill(ctx, width);
  }
}

export function renderHangar2D(ctx, state, width, height) {
  const { weather, hangar } = state;
  const p = weather ? weather.preset : { skyTop: '#163554', skyMid: '#684457', skyHorizon: '#e5924a', oceanNear: '#1c6d7e', oceanDeep: '#0d2e44', fogColor: '#cf7442', sunAzimuth: 1.0, sunElevation: 0.2, rainIntensity: 0 };
  const fakeCam = { x: 0, y: 8.5, z: -26, yaw: 0, pitch: -0.05, roll: 0, fovDeg: 40 };
  const basis = buildCameraBasis(fakeCam, width, height);
  basis.cx = width * 0.36;
  basis.cy = height * 0.28;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, 342);
  ctx.clip();
  drawSkyAndOcean(ctx, basis, fakeCam, { preset: p, time: 0 }, width, height);

  // Waterfront timber slipway pier with visible sunlit bay water above it
  ctx.fillStyle = '#4e3523';
  ctx.beginPath();
  ctx.moveTo(0, 272);
  ctx.lineTo(width, 272);
  ctx.lineTo(width, 342);
  ctx.lineTo(0, 342);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#735036';
  ctx.lineWidth = 1.6;
  for (let y = 278; y < 342; y += 11) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
  ctx.beginPath();
  ctx.ellipse(width * 0.36, 294, 155, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hero parked AERO-7 Pelican centered cleanly above the gold divider line
  const parked = { x: 0, y: 6.2, z: 4.5, yaw: 0.62, pitch: 0.0, roll: 0, trail: [], boosting: false };
  drawAeroPelican2D(ctx, basis, parked);
  ctx.restore();

  const selectedChoice = hangar && hangar.choices ? hangar.choices[hangar.selectedIndex || 0] : null;
  const zone = selectedChoice ? selectedChoice.set : 'avionics';
  const anchorPt =
    zone === 'turbocharger' ? projectAircraftLocal(basis, parked, 2.85, 2.55, 1.9) :
    zone === 'glider' ? projectAircraftLocal(basis, parked, 7.6, 2.7, 0.2) :
    projectAircraftLocal(basis, parked, 0.0, 2.1, 2.0);
  return anchorPt ? { sx: anchorPt.sx, sy: anchorPt.sy } : { sx: width * 0.42, sy: height * 0.25 };
}

export function renderDebrief2D(ctx, state, width, height) {
  const { weather } = state;
  const p = weather ? weather.preset : { skyTop: '#163554', skyMid: '#684457', skyHorizon: '#e5924a', oceanNear: '#1c6d7e', oceanDeep: '#0d2e44', fogColor: '#cf7442', sunAzimuth: 1.0, sunElevation: 0.2, rainIntensity: 0 };
  const fakeCam = { x: 0, y: 12, z: -26, yaw: 0, pitch: -0.12, roll: 0, fovDeg: 48 };
  const basis = buildCameraBasis(fakeCam, width, height);
  drawSkyAndOcean(ctx, basis, fakeCam, { preset: p, time: 0 }, width, height);
  const parked = { x: 8, y: 7, z: 8, yaw: -0.55, pitch: 0.02, roll: 0, trail: [], boosting: false };
  drawAeroPelican2D(ctx, basis, parked);
}
