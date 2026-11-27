// SPDX-License-Identifier: MIT
// Sculpted Amber Archipelago 3D world geometry: heightfield islands, paved runways, lighthouses, piers, boats & rings.

import { createMeshBuilder, hexToRgb, transformPoint, uploadMesh } from './meshBuilder.js';
import { queryTerrainElevation } from './terrain.js';

const C_WET_SAND = hexToRgb('#c8a76d');
const C_SAND = hexToRgb('#e5c88c');
const C_GRASS = hexToRgb('#3f6e49');
const C_GRASS_DARK = hexToRgb('#2a5138');
const C_CLIFF_LIT = hexToRgb('#8b6b52');
const C_CLIFF_DARK = hexToRgb('#544137');
const C_BASALT = hexToRgb('#3d3534');
const C_ASPHALT = hexToRgb('#252d35');
const C_APRON = hexToRgb('#343f48');
const C_LINE = hexToRgb('#f4ecd8');
const C_PINE_TRUNK = hexToRgb('#593b28');
const C_PINE_DARK = hexToRgb('#1f4534');
const C_PINE_MID = hexToRgb('#2b5c43');
const C_PINE_TOP = hexToRgb('#3c7552');
const C_CREAM = hexToRgb('#f0e5cc');
const C_CRIMSON = hexToRgb('#c5382a');
const C_WOOD = hexToRgb('#6e4a30');
const C_WOOD_LIGHT = hexToRgb('#8d6241');
const C_AMBER = hexToRgb('#f5b43c');
const C_TEAL = hexToRgb('#2b8089');
const C_DARK_METAL = hexToRgb('#202b34');
const C_GREEN_LIGHT = hexToRgb('#3df08c');
const C_RED_LIGHT = hexToRgb('#ff1008');
const C_WHITE_LIGHT = hexToRgb('#fffdf4');

const M_TERRAIN = [0.88, 0.02, 0.0, 1.0];
const M_ASPHALT = [0.76, 0.04, 0.0, 2.0];
const M_PROP = [0.64, 0.1, 0.0, 0.0];
const M_METAL = [0.35, 0.55, 0.0, 0.0];
const M_GLOW_SOFT = [0.25, 0.1, 1.35, 0.0];
const M_GLOW_BRIGHT = [0.2, 0.1, 2.1, 0.0];

function ridgeNoise(x, z) {
  const s1 = Math.sin(x * 0.017 + z * 0.013) * Math.cos(x * 0.011 - z * 0.019);
  const s2 = Math.sin(x * 0.043 - z * 0.037) * 0.5;
  const s3 = Math.cos(x * 0.089 + z * 0.071) * 0.25;
  return (1 - Math.abs(s1)) * 0.6 + s2 * 0.25 + s3 * 0.15;
}

function sampleSculptedHeight(world, isl, x, z) {
  const rwy = isl.runway;
  const dx = x - rwy.x;
  const dz = z - rwy.z;
  const along = dx * rwy.dirX + dz * rwy.dirZ;
  const across = dx * rwy.rightX + dz * rwy.rightZ;

  // Flat graded plateau for runway + apron + hangar pad
  const inRunwayPad = Math.abs(along) <= rwy.length * 0.58 && Math.abs(across) <= rwy.width * 2.55;
  if (inRunwayPad) {
    const edgeA = Math.max(0, (Math.abs(along) - rwy.length * 0.52) / (rwy.length * 0.08));
    const edgeB = Math.max(0, (Math.abs(across) - rwy.width * 1.85) / (rwy.width * 0.75));
    const blend = Math.min(1, Math.max(edgeA, edgeB));
    if (blend <= 0.001) return rwy.y - 0.15;
  }

  // Organic lobed island coast silhouette
  const relX = x - isl.x;
  const relZ = z - isl.z;
  const ang = Math.atan2(relZ, relX);
  const lobe = 0.84 + 0.18 * Math.sin(ang * 3 + isl.index * 1.4) + 0.08 * Math.cos(ang * 5 - isl.index);
  const effR = isl.radius * lobe * 1.12;
  const d = Math.hypot(relX, relZ);
  const coastT = 1 - d / effR;
  if (coastT <= -0.06) return -6.0;

  let h = coastT <= 0 ? coastT * 60 : Math.pow(coastT, 0.72) * 20 + ridgeNoise(x, z) * 5.2 * Math.min(1, coastT * 3);

  // Sculpted volcanic ridges & terraced peaks (multi-octave sculpted slopes, never sharp 4-poly pyramids!)
  for (const pk of isl.peaks) {
    const dp = Math.hypot(x - pk.x, z - pk.z);
    const pAng = Math.atan2(z - pk.z, x - pk.x);
    const spur = 1.0 + 0.22 * Math.sin(pAng * 3 + isl.index) + 0.11 * Math.cos(pAng * 5);
    const effP = pk.baseR * spur;
    if (dp < effP) {
      const ratio = 1 - dp / effP;
      const crag = 0.86 + 0.28 * ridgeNoise(x * 1.35, z * 1.35);
      let ph = 13 + pk.height * Math.pow(ratio, 1.42) * crag;
      if (pk.crater && dp < effP * 0.28) {
        ph -= (1 - dp / (effP * 0.28)) * 42;
      }
      if (ph > h) h = ph;
    }
  }

  // Smoothly grade into runway apron so runway never clips into hillsides
  const apronDist = Math.max(Math.abs(along) - rwy.length * 0.56, Math.abs(across) - rwy.width * 2.1);
  if (apronDist < 58) {
    const t = Math.max(0, Math.min(1, apronDist / 58));
    const smooth = t * t * (3 - 2 * t);
    h = (rwy.y - 0.18) * (1 - smooth) + h * smooth;
  }

  return h;
}

function addIslandHeightfield(b, world, isl) {
  const segs = 40;
  const span = isl.radius * 1.32;
  const step = (span * 2) / segs;
  const heights = [];
  const pts = [];

  for (let iz = 0; iz <= segs; iz++) {
    const hRow = [];
    const pRow = [];
    const wz = isl.z - span + iz * step;
    for (let ix = 0; ix <= segs; ix++) {
      const wx = isl.x - span + ix * step;
      const h = sampleSculptedHeight(world, isl, wx, wz);
      hRow.push(h);
      pRow.push([wx, h, wz]);
    }
    heights.push(hRow);
    pts.push(pRow);
  }

  // Compute smooth terrain vertex normals for crisp directional sun & cliff shading
  const normals = [];
  for (let iz = 0; iz <= segs; iz++) {
    const nRow = [];
    for (let ix = 0; ix <= segs; ix++) {
      const hL = heights[iz][Math.max(0, ix - 1)];
      const hR = heights[iz][Math.min(segs, ix + 1)];
      const hD = heights[Math.max(0, iz - 1)][ix];
      const hU = heights[Math.min(segs, iz + 1)][ix];
      let nx = (hL - hR) / (2 * step);
      let ny = 1.0;
      let nz = (hD - hU) / (2 * step);
      const len = Math.hypot(nx, ny, nz) || 1;
      nRow.push([nx / len, ny / len, nz / len]);
    }
    normals.push(nRow);
  }

  const gridIdx = [];
  for (let iz = 0; iz <= segs; iz++) {
    const idxRow = [];
    for (let ix = 0; ix <= segs; ix++) {
      const p = pts[iz][ix];
      const n = normals[iz][ix];
      const col = pickQuadColor(p, n);
      idxRow.push(b.pushVertex(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2], M_TERRAIN[0], M_TERRAIN[1], 0, M_TERRAIN[3]));
    }
    gridIdx.push(idxRow);
  }

  for (let iz = 0; iz < segs; iz++) {
    for (let ix = 0; ix < segs; ix++) {
      const h00 = heights[iz][ix], h10 = heights[iz][ix + 1];
      const h01 = heights[iz + 1][ix], h11 = heights[iz + 1][ix + 1];
      if (h00 < -3.8 && h10 < -3.8 && h01 < -3.8 && h11 < -3.8) continue;
      b.addSmoothTri(gridIdx[iz][ix], gridIdx[iz + 1][ix], gridIdx[iz + 1][ix + 1]);
      b.addSmoothTri(gridIdx[iz][ix], gridIdx[iz + 1][ix + 1], gridIdx[iz][ix + 1]);
    }
  }
}

function pickQuadColor(p, n) {
  const h = p[1];
  const slope = 1 - n[1];
  if (h < 1.6) return C_WET_SAND;
  if (h < 6.2) return C_SAND;
  if (slope > 0.22 || h > 90) return h > 165 ? C_BASALT : slope > 0.36 ? C_CLIFF_DARK : C_CLIFF_LIT;
  return h > 34 ? C_GRASS_DARK : C_GRASS;
}

function addDigitSegments(b, rwy, digitChar, alongCenter, acrossCenter, scale = 1.0) {
  // 7-segment crisp runway numeral painted flat on asphalt (y = rwy.y + 0.36)
  const map = {
    '0': [1, 1, 1, 1, 1, 1, 0],
    '1': [0, 1, 1, 0, 0, 0, 0],
    '2': [1, 1, 0, 1, 1, 0, 1],
    '3': [1, 1, 1, 1, 0, 0, 1],
    '4': [0, 1, 1, 0, 0, 1, 1],
    '5': [1, 0, 1, 1, 0, 1, 1],
    '6': [1, 0, 1, 1, 1, 1, 1],
    '7': [1, 1, 1, 0, 0, 0, 0],
    '8': [1, 1, 1, 1, 1, 1, 1],
    '9': [1, 1, 1, 1, 0, 1, 1],
  };
  const segs = map[digitChar];
  if (!segs) return;
  const w = 6.2 * scale, h = 11.5 * scale, th = 1.45 * scale;
  const put = (aOff, rOff, aLen, rLen) => {
    const px = rwy.x + rwy.dirX * (alongCenter + aOff) + rwy.rightX * (acrossCenter + rOff);
    const pz = rwy.z + rwy.dirZ * (alongCenter + aOff) + rwy.rightZ * (acrossCenter + rOff);
    b.addBox(px, rwy.y + 0.38, pz, rLen, 0.14, aLen, C_LINE, M_PROP, rwy.headingRad, 0, 0);
  };
  if (segs[0]) put(h * 0.5, 0, th, w); // top
  if (segs[1]) put(h * 0.25, w * 0.45, h * 0.5, th); // top-right
  if (segs[2]) put(-h * 0.25, w * 0.45, h * 0.5, th); // bot-right
  if (segs[3]) put(-h * 0.5, 0, th, w); // bottom
  if (segs[4]) put(-h * 0.25, -w * 0.45, h * 0.5, th); // bot-left
  if (segs[5]) put(h * 0.25, -w * 0.45, h * 0.5, th); // top-left
  if (segs[6]) put(0, 0, th, w); // mid
}

function addRunwayAndMarkings(b, rwy) {
  const halfL = rwy.length * 0.5;
  const halfW = rwy.width * 0.5;
  const y = rwy.y;

  // Paved shoulder apron + dark asphalt runway strip
  b.addBox(rwy.x, y - 0.12, rwy.z, rwy.width + 12, 0.35, rwy.length + 14, C_APRON, M_ASPHALT, rwy.headingRad, 0, 0);
  b.addBox(rwy.x, y + 0.08, rwy.z, rwy.width, 0.26, rwy.length, C_ASPHALT, M_ASPHALT, rwy.headingRad, 0, 0);

  // Side white runway border stripes
  for (const side of [-1, 1]) {
    const ex = rwy.x + rwy.rightX * (side * (halfW - 1.2));
    const ez = rwy.z + rwy.rightZ * (side * (halfW - 1.2));
    b.addBox(ex, y + 0.26, ez, 0.85, 0.12, rwy.length - 8, C_LINE, M_PROP, rwy.headingRad, 0, 0);
  }

  // White threshold piano keys at approach end (-halfL) & far end (+halfL)
  for (const endSign of [-1, 1]) {
    const baseA = endSign * (halfL - 16);
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      const across = k * 4.4;
      const px = rwy.x + rwy.dirX * baseA + rwy.rightX * across;
      const pz = rwy.z + rwy.dirZ * baseA + rwy.rightZ * across;
      b.addBox(px, y + 0.29, pz, 1.85, 0.12, 18, C_LINE, M_PROP, rwy.headingRad, 0, 0);
    }
  }

  // Painted runway numerals near approach threshold (e.g. "09", "08")
  const numStr = rwy.numeral || rwy.code.replace('RWY ', '');
  addDigitSegments(b, rwy, numStr[0], -halfL + 46, -4.6, 1.0);
  addDigitSegments(b, rwy, numStr[1], -halfL + 46, 4.6, 1.0);

  // Dashed white centerline
  for (let a = -halfL + 72; a <= halfL - 44; a += 32) {
    const px = rwy.x + rwy.dirX * a;
    const pz = rwy.z + rwy.dirZ * a;
    b.addBox(px, y + 0.29, pz, 1.15, 0.12, 15, C_LINE, M_PROP, rwy.headingRad, 0, 0);
  }

  // Touchdown aiming-point blocks
  for (const side of [-1, 1]) {
    const px = rwy.x + rwy.dirX * (-halfL + 95) + rwy.rightX * (side * 8.5);
    const pz = rwy.z + rwy.dirZ * (-halfL + 95) + rwy.rightZ * (side * 8.5);
    b.addBox(px, y + 0.29, pz, 3.8, 0.12, 24, C_LINE, M_PROP, rwy.headingRad, 0, 0);
  }

  // Glowing green threshold bar lights
  for (let k = -4; k <= 4; k++) {
    const px = rwy.x - rwy.dirX * (halfL + 1.8) + rwy.rightX * (k * 4.2);
    const pz = rwy.z - rwy.dirZ * (halfL + 1.8) + rwy.rightZ * (k * 4.2);
    b.addSphere(px, y + 0.85, pz, 0.72, 0.72, 0.72, 4, 6, C_GREEN_LIGHT, M_GLOW_BRIGHT);
  }

  // Glowing white/amber runway edge lights along both sides
  for (let a = -halfL + 20; a <= halfL - 10; a += 54) {
    const isEndZone = a > halfL - 140;
    const lCol = isEndZone ? C_AMBER : C_WHITE_LIGHT;
    for (const side of [-1, 1]) {
      const px = rwy.x + rwy.dirX * a + rwy.rightX * (side * (halfW + 1.6));
      const pz = rwy.z + rwy.dirZ * a + rwy.rightZ * (side * (halfW + 1.6));
      b.addSphere(px, y + 0.9, pz, 0.65, 0.65, 0.65, 4, 6, lCol, M_GLOW_SOFT);
    }
  }

  // Short lead-in approach lights before threshold (on coastal embankment)
  for (let step = 1; step <= 3; step++) {
    const px = rwy.x - rwy.dirX * (halfL + step * 24);
    const pz = rwy.z - rwy.dirZ * (halfL + step * 24);
    const py = Math.max(4.5, y - step * 1.4);
    b.addCylinder(px, py * 0.5, pz, 0.45, 0.35, py, 6, C_DARK_METAL, M_METAL, 'y');
    b.addSphere(px, py + 0.7, pz, 0.95, 0.95, 0.95, 4, 6, C_WHITE_LIGHT, M_GLOW_BRIGHT);
  }

  // Unobstructed PAPI housing positioned cleanly outside the Final Gate ring left edge (x = -(halfW + 30))!
  const papiX = rwy.x - rwy.dirX * (halfL - 58) - rwy.rightX * (halfW + 30);
  const papiZ = rwy.z - rwy.dirZ * (halfL - 58) - rwy.rightZ * (halfW + 30);
  b.addBox(papiX, y + 1.6, papiZ, 21.0, 3.4, 3.0, C_DARK_METAL, M_METAL, rwy.headingRad, 0, 0);
}

function addLighthouse(b, lh) {
  const { x, y, z, height } = lh;
  // Rocky coastal stone plinth
  b.addCylinder(x, y * 0.5 - 1, z, 11.5, 8.6, y + 4, 10, C_CLIFF_DARK, M_PROP, 'y');
  // Red-and-white striped tapered tower (5 bands)
  const bands = 5;
  const bandH = (height - 10) / bands;
  for (let i = 0; i < bands; i++) {
    const t0 = i / bands;
    const t1 = (i + 1) / bands;
    const r0 = 6.2 - t0 * 2.4;
    const r1 = 6.2 - t1 * 2.4;
    const cy = y + 1 + (i + 0.5) * bandH;
    b.addCylinder(x, cy, z, r0, r1, bandH + 0.1, 12, i % 2 === 0 ? C_CREAM : C_CRIMSON, M_PROP, 'y');
  }
  // Observation gallery deck + glowing golden lantern room + crimson cupola roof
  const topY = y + 1 + (height - 10);
  b.addCylinder(x, topY + 0.9, z, 5.1, 5.1, 1.8, 12, C_DARK_METAL, M_METAL, 'y');
  b.addCylinder(x, topY + 4.4, z, 3.2, 3.2, 5.6, 12, C_WHITE_LIGHT, M_GLOW_BRIGHT, 'y');
  b.addCylinder(x, topY + 9.2, z, 3.9, 0.25, 4.4, 12, C_CRIMSON, M_PROP, 'y');
  // Keeper's cottage tucked beside tower
  b.addBox(x + 9.5, y + 4.5, z + 4.5, 11, 7.5, 9, C_CREAM, M_PROP);
  b.addBox(x + 9.5, y + 9.1, z + 4.5, 12.2, 2.4, 10.2, C_CRIMSON, M_PROP);
  b.addBox(x + 9.5, y + 4.6, z - 0.15, 2.6, 2.2, 0.4, C_AMBER, M_GLOW_SOFT);
}

function addHangarProp(b, hg) {
  const { x, y, z, headingRad } = hg;
  const local = (lx, ly, lz) => transformPoint(lx, ly, lz, x, y, z, headingRad, 0, 0);
  // Timber coastal seaplane hangar with arched crimson roof & glowing open front bay
  b.addBox(x, y + 7.2, z, 28, 14.4, 34, C_CREAM, M_PROP, headingRad, 0, 0);
  b.addBox(x, y + 16.0, z, 30.5, 4.2, 36, C_CRIMSON, M_PROP, headingRad, 0, 0);
  b.addBox(x, y + 19.2, z, 21.0, 2.8, 35.5, C_CRIMSON, M_PROP, headingRad, 0, 0);
  // Warm illuminated open hangar doorway facing runway + charming coastal airmail village cottages beside apron!
  const [dx, dy, dz] = local(-14.2, 5.6, 0);
  b.addBox(dx, dy, dz, 0.9, 10.8, 22, C_AMBER, M_GLOW_SOFT, headingRad, 0, 0);
  const [fx, fy, fz] = local(3, 3.2, -23);
  b.addCylinder(fx, fy, fz, 2.8, 2.8, 8.5, 10, C_AMBER, M_METAL, 'x');
  const [cx1, cy1, cz1] = local(-8, 1.9, -22);
  b.addBox(cx1, cy1, cz1, 3.6, 3.6, 3.6, C_WOOD, M_PROP, headingRad + 0.25, 0, 0);
  const [cx2, cy2, cz2] = local(-12.5, 1.5, -20);
  b.addBox(cx2, cy2, cz2, 2.8, 2.8, 2.8, C_TEAL, M_PROP, headingRad - 0.15, 0, 0);

  // Seaside postal cottages & control tower with warm glowing dusk windows flanking the airstrip!
  const cottages = [
    { lx: 18, lz: -54, w: 14, h: 9, d: 12, roof: C_CRIMSON },
    { lx: 24, lz: -84, w: 12, h: 8, d: 11, roof: C_TEAL },
    { lx: 16, lz: 48, w: 15, h: 10, d: 13, roof: C_CRIMSON },
    { lx: -6, lz: -66, w: 10, h: 16, d: 10, roof: C_DARK_METAL }, // airfield dispatch tower!
  ];
  for (const ct of cottages) {
    const [px, py, pz] = local(ct.lx, ct.h * 0.5, ct.lz);
    b.addBox(px, py, pz, ct.w, ct.h, ct.d, C_CREAM, M_PROP, headingRad, 0, 0);
    b.addBox(px, py + ct.h * 0.5 + 1.3, pz, ct.w + 1.4, 2.6, ct.d + 1.4, ct.roof, M_PROP, headingRad, 0, 0);
    // Warm glowing dusk window facing approach
    const [wx, wy, wz] = local(ct.lx - ct.w * 0.52, ct.h * 0.56, ct.lz);
    b.addBox(wx, wy, wz, 0.5, ct.h * 0.28, ct.d * 0.52, C_AMBER, M_GLOW_BRIGHT, headingRad, 0, 0);
  }
}

function addPierAndBoats(b, pier) {
  const { x, y, z, headingRad, length, boats } = pier;
  // Wooden mail pier deck extending out into turquoise harbor water
  const deckMid = transformPoint(0, 0, length * 0.5, x, y, z, headingRad, 0, 0);
  b.addBox(deckMid[0], deckMid[1], deckMid[2], 9.5, 1.1, length, C_WOOD_LIGHT, M_PROP, headingRad, 0, 0);
  // Timber pilings & warm pier lantern posts
  for (let d = 6; d <= length - 4; d += 14) {
    for (const side of [-3.9, 3.9]) {
      const p = transformPoint(side, -1.8, d, x, y, z, headingRad, 0, 0);
      b.addCylinder(p[0], p[1], p[2], 0.55, 0.55, 6.5, 6, C_WOOD, M_PROP, 'y');
    }
    if (d > 10 && d % 28 < 14) {
      const lp = transformPoint(-4.1, 3.4, d, x, y, z, headingRad, 0, 0);
      b.addCylinder(lp[0], lp[1] - 1.5, lp[2], 0.22, 0.18, 3.4, 6, C_DARK_METAL, M_METAL, 'y');
      b.addSphere(lp[0], lp[1] + 0.5, lp[2], 0.72, 0.72, 0.72, 4, 6, C_AMBER, M_GLOW_SOFT);
    }
  }
  // Moored coastal fishing boats bobbing near the pier
  for (const bt of boats) {
    const bp = transformPoint(bt.ox, -y + 1.1, bt.oz, x, y, z, headingRad, 0, 0);
    const hullCol = bt.hue === 0 ? C_CREAM : C_TEAL;
    const trimCol = bt.hue === 0 ? C_CRIMSON : C_AMBER;
    b.addBox(bp[0], bp[1], bp[2], 4.2, 2.0, 12.0, hullCol, M_PROP, bt.yaw, 0, 0);
    b.addBox(bp[0], bp[1] + 1.9, bp[2] - 1.5, 3.1, 2.4, 4.4, trimCol, M_PROP, bt.yaw, 0, 0);
    b.addCylinder(bp[0], bp[1] + 5.2, bp[2] + 1.5, 0.16, 0.12, 6.2, 5, C_WOOD, M_PROP, 'y');
  }
}

function addPineTree(b, x, y, z, scale) {
  const h = scale * 1.15;
  b.addCylinder(x, y + h * 0.16, z, scale * 0.1, scale * 0.06, h * 0.34, 6, C_PINE_TRUNK, M_PROP, 'y');
  b.addCylinder(x, y + h * 0.42, z, scale * 0.44, scale * 0.06, h * 0.44, 7, C_PINE_DARK, M_TERRAIN, 'y');
  b.addCylinder(x, y + h * 0.66, z, scale * 0.34, scale * 0.05, h * 0.38, 7, C_PINE_MID, M_TERRAIN, 'y');
  b.addCylinder(x, y + h * 0.87, z, scale * 0.22, 0.05, h * 0.3, 7, C_PINE_TOP, M_TERRAIN, 'y');
}

function addSeaStack(b, islet) {
  const { x, z, radius, height, volcanic } = islet;
  const colBase = volcanic ? C_BASALT : C_CLIFF_DARK;
  const colMid = volcanic ? C_CLIFF_DARK : C_CLIFF_LIT;
  const colTop = volcanic ? C_CLIFF_LIT : C_GRASS_DARK;
  b.addCylinder(x, height * 0.22 - 3, z, radius * 0.95, radius * 0.62, height * 0.55, 9, colBase, M_TERRAIN, 'y');
  b.addCylinder(x + radius * 0.12, height * 0.62, z - radius * 0.08, radius * 0.56, radius * 0.14, height * 0.52, 8, colMid, M_TERRAIN, 'y');
  b.addCylinder(x - radius * 0.28, height * 0.38, z + radius * 0.2, radius * 0.42, radius * 0.1, height * 0.42, 7, colTop, M_TERRAIN, 'y');
}

export function buildWorldStaticMesh(gl, world) {
  const b = createMeshBuilder();
  for (const isl of world.islands) {
    addIslandHeightfield(b, world, isl);
    addRunwayAndMarkings(b, isl.runway);
    if (isl.lighthouse) addLighthouse(b, isl.lighthouse);
    if (isl.pier) addPierAndBoats(b, isl.pier);

    for (const tr of isl.trees) {
      const ground = queryTerrainElevation(world, tr.x, tr.z);
      if (ground.surface === 'runway' || ground.elevation < 5.5) continue;
      const th = sampleSculptedHeight(world, isl, tr.x, tr.z);
      if (th < 6.0 || th > 78) continue;
      addPineTree(b, tr.x, th - 0.6, tr.z, tr.scale);
    }
  }

  for (const hg of world.hangars) {
    addHangarProp(b, hg);
  }
  for (const islet of world.scenicIslets) {
    addSeaStack(b, islet);
  }
  return uploadMesh(gl, b.build());
}

export function buildTargetRingMesh(gl, colorHex = '#ff7b1c', isApproach = true) {
  const b = createMeshBuilder();
  const cMain = hexToRgb(colorHex);
  const cGlow = isApproach ? hexToRgb('#ffbe32') : hexToRgb('#2cf0b4');
  // Dimensional beveled glowing 3D amber/gold hoop with warm saturated contrast against dusk sky!
  b.addTorus(0, 0, 0, 1.0, 0.052, 36, 10, (i) => (i % 4 === 0 ? cGlow : cMain), [0.22, 0.35, 1.15, 0.0]);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const bx = Math.cos(a) * 1.06;
    const by = Math.sin(a) * 1.06;
    b.addBox(bx, by, 0, 0.12, 0.12, 0.24, cGlow, [0.2, 0.2, 1.5, 0.0], 0, 0, a);
  }
  return uploadMesh(gl, b.build());
}

export function buildPapiLightsMesh(gl, states) {
  // 4 unmistakable glowing white/red optical lenses cleanly spaced outside the Final Gate rim!
  const b = createMeshBuilder();
  for (let i = 0; i < 4; i++) {
    const col = states[i] === 'white' ? C_WHITE_LIGHT : C_RED_LIGHT;
    b.addSphere((i - 1.5) * 4.9, 1.9, -1.7, 1.65, 1.65, 1.15, 8, 10, col, [0.1, 0.1, 3.0, 0.0]);
  }
  return uploadMesh(gl, b.build());
}

export function buildWindsockMesh(gl) {
  // Mast + 5-band orange-and-white fluttering tapered windsock along +Z
  const b = createMeshBuilder();
  b.addCylinder(0, 7.5, 0, 0.25, 0.18, 15, 6, C_CREAM, M_METAL, 'y');
  for (let i = 0; i < 5; i++) {
    const col = i % 2 === 0 ? hexToRgb('#ff5e2b') : C_CREAM;
    const r0 = 1.15 - i * 0.14;
    const r1 = 1.15 - (i + 1) * 0.14;
    b.addCylinder(0, 14.4 - i * 0.14, 1.2 + i * 1.65, r0, r1, 1.72, 8, col, M_PROP, 'z', false);
  }
  return uploadMesh(gl, b.build());
}

export function buildParachuteSackMesh(gl) {
  const b = createMeshBuilder();
  // Billowing crimson-and-cream 8-panel mail parachute + satchel below
  b.addSphere(0, 4.4, 0, 3.8, 2.2, 3.8, 6, 10, C_CRIMSON, M_PROP);
  b.addSphere(0, 4.6, 0, 3.5, 2.1, 3.5, 5, 8, C_CREAM, M_PROP);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + 0.4;
    b.addStrut([Math.cos(a) * 3.1, 3.6, Math.sin(a) * 3.1], [0, 0.6, 0], 0.08, C_CREAM, M_PROP);
  }
  b.addBox(0, 0, 0, 1.8, 1.5, 1.2, C_WOOD_LIGHT, M_PROP);
  b.addBox(0, 0.25, 0.62, 0.85, 0.55, 0.12, C_AMBER, M_GLOW_SOFT);
  return uploadMesh(gl, b.build());
}

export function buildHangarBayMesh(gl) {
  // Open coastal timber seaplane hangar slipway for the live 3D Hangar Refit Showcase!
  const b = createMeshBuilder();
  // Open waterfront timber seaplane dock with dark contact shadow pad & wooden beaching cradle under hull!
  b.addBox(0, -1.55, 0, 32, 0.75, 26, C_APRON, M_ASPHALT);
  b.addBox(0, -1.16, 11.4, 32, 0.16, 1.3, C_AMBER, M_PROP);
  // Dark grounded contact-shadow pad & wooden maintenance cradle directly beneath the seaplane hull & floats!
  b.addBox(0, -1.16, 0.5, 13.5, 0.04, 15.5, hexToRgb('#10171d'), [0.95, 0.0, 0.0, 0.0]);
  b.addBox(0, -0.92, 2.2, 3.2, 0.52, 1.0, C_WOOD, M_PROP);
  b.addBox(0, -0.92, -1.6, 3.0, 0.52, 1.0, C_WOOD, M_PROP);
  b.addBox(-5.45, -0.82, 0.85, 1.2, 0.72, 2.6, C_WOOD, M_PROP);
  b.addBox(5.45, -0.82, 0.85, 1.2, 0.72, 2.6, C_WOOD, M_PROP);
  // Warm weathered timber slipway pilings dipping cleanly into the bay
  for (let px = -14; px <= 14; px += 7) {
    b.addCylinder(px, -3.2, 12.2, 0.48, 0.48, 4.2, 8, C_WOOD, M_PROP, 'y');
  }
  // Open-air flanking hangar timber posts & gantry arch on far edges (zero clipping at left edge!)
  for (const side of [-1, 1]) {
    b.addBox(side * 14.8, 3.6, -9.5, 1.1, 10.2, 1.1, C_WOOD, M_PROP);
    b.addBox(side * 14.8, 3.6, 5.5, 1.1, 10.2, 1.1, C_WOOD, M_PROP);
    b.addStrut([side * 14.8, 8.6, -9.5], [side * 14.8, 8.6, 7.2], 0.38, C_WOOD_LIGHT, M_PROP);
    b.addSphere(side * 13.6, 7.8, 2.5, 0.45, 0.32, 0.45, 6, 8, C_AMBER, M_GLOW_BRIGHT);
  }
  // Maintenance tool chest & yellow fuel drum tucked cleanly on near-left dock (well inside frame!)
  b.addBox(-9.2, -0.35, 3.6, 2.0, 1.7, 1.6, C_CRIMSON, M_METAL, 0.25, 0, 0);
  b.addCylinder(-10.4, -0.1, 1.2, 0.78, 0.78, 2.1, 10, C_AMBER, M_METAL, 'y');
  return uploadMesh(gl, b.build());
}

export function buildOceanGrid(gl, res = 84) {
  const verts = [];
  const indices = [];
  for (let z = 0; z <= res; z++) {
    const fz = (z / res) * 2 - 1;
    for (let x = 0; x <= res; x++) {
      const fx = (x / res) * 2 - 1;
      verts.push(fx, 0, fz);
    }
  }
  const stride = res + 1;
  for (let z = 0; z < res; z++) {
    for (let x = 0; x < res; x++) {
      const a = z * stride + x;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, d, a, d, b);
    }
  }
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  const ebo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
  gl.bindVertexArray(null);
  return { vao, vbo, ebo, indexCount: indices.length };
}
