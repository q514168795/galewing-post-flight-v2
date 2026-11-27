// SPDX-License-Identifier: MIT
// Sculpted 3D AERO-7 PELICAN amphibious seaplane rig: lofted boat hull, glazed canopy, deflected flaps, nacelles & refits.

import { createMeshBuilder, hexToRgb, uploadMesh } from './meshBuilder.js';

const C_CREAM = hexToRgb('#fff9ec');
const C_CREAM_SHADE = hexToRgb('#efe3ca');
const C_CRIMSON = hexToRgb('#dc2620');
const C_CRIMSON_DARK = hexToRgb('#a61c17');
const C_AMBER = hexToRgb('#f0ae35');
const C_BRASS = hexToRgb('#d29a3b');
const C_DARK_METAL = hexToRgb('#24303a');
const C_CHARCOAL = hexToRgb('#182128');
const C_GLASS = hexToRgb('#153348');
const C_COCKPIT_GLOW = hexToRgb('#ffb84d');
const C_CHROME = hexToRgb('#d8e2e8');
const C_TEAL = hexToRgb('#2d8c91');
const C_PLUM = hexToRgb('#8e5896');

const M_PAINT = [0.42, 0.14, 0.0, 3.0];
const M_METAL = [0.28, 0.65, 0.0, 3.0];
const M_DARK = [0.52, 0.35, 0.0, 3.0];
const M_GLASS = [0.12, 0.45, 0.06, 4.0];
const M_GLOW_RED = [0.2, 0.1, 1.4, 3.0];
const M_GLOW_GRN = [0.2, 0.1, 1.4, 3.0];
const M_GLOW_GOLD = [0.2, 0.2, 1.15, 3.0];

function buildHullAndCanopy(b) {
  // Multi-station lofted amphibious flying-boat fuselage (+Z forward, +Y up, +X right)
  const stations = [
    { z: 7.4, w: 0.14, hTop: 0.22, hBot: -0.05, yOff: 0.18 },
    { z: 6.4, w: 0.72, hTop: 0.62, hBot: -0.48, yOff: 0.08 },
    { z: 4.8, w: 1.12, hTop: 0.92, hBot: -0.92, yOff: 0.0 },
    { z: 3.1, w: 1.24, hTop: 1.14, hBot: -1.04, yOff: 0.0 },
    { z: 1.1, w: 1.28, hTop: 1.24, hBot: -1.08, yOff: 0.0 },
    { z: -1.4, w: 1.16, hTop: 1.16, hBot: -0.96, yOff: 0.04 },
    { z: -3.6, w: 0.86, hTop: 0.92, hBot: -0.58, yOff: 0.16 },
    { z: -6.2, w: 0.46, hTop: 0.64, hBot: -0.24, yOff: 0.36 },
    { z: -8.6, w: 0.16, hTop: 0.38, hBot: -0.06, yOff: 0.56 },
  ];

  const ringPts = 12;
  const rings = stations.map((st) => {
    const pts = [];
    for (let i = 0; i < ringPts; i++) {
      const a = (i / ringPts) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      // Boat-hull chine cross section: V-keel at bottom, rounded cream upper deck
      let x = ca * st.w;
      let y = sa >= 0 ? sa * st.hTop : -Math.pow(-sa, 0.82) * Math.abs(st.hBot);
      if (sa < -0.15 && sa > -0.65) x *= 1.07; // crisp spray-rail chine
      pts.push([x, y + st.yOff, st.z]);
    }
    return { z: st.z, points: pts };
  });

  b.addLoft(
    rings,
    (r, c, p) => {
      // Crisp crimson flying-boat belly, golden postal cheatline, cream upper hull
      if (p[1] < -0.26) return C_CRIMSON;
      if (p[1] < -0.05) return C_AMBER;
      if (r === 0 || r === 1) return C_CRIMSON; // crimson nose cone accent
      return p[1] > 0.65 ? C_CREAM : C_CREAM_SHADE;
    },
    () => M_PAINT,
  );

  // Sleek streamlined nose cap & tail cone (zero clown-nose sphere!)
  b.addCylinder(0, 0.14, 7.45, 0.24, 0.05, 0.36, 10, C_CRIMSON_DARK, M_PAINT, 'z');
  b.addSphere(0, 0.56, -8.62, 0.18, 0.24, 0.34, 5, 8, C_CREAM_SHADE, M_PAINT);

  // Glazed panoramic cockpit greenhouse canopy with warm backlit cabin glow
  b.addSphere(0, 1.18, 2.75, 1.06, 0.68, 2.15, 8, 14, C_GLASS, M_GLASS);
  // Warm amber backlit instrument panel glowing faintly inside canopy
  b.addBox(0, 1.16, 3.55, 1.18, 0.24, 0.34, C_COCKPIT_GLOW, [0.3, 0.1, 0.72, 3.0]);
  // Crisp structural dark cockpit bow frame & dorsal spine fairing
  b.addBox(0, 1.55, 2.55, 0.14, 0.42, 2.25, C_DARK_METAL, M_DARK);
  b.addBox(0, 1.48, 3.82, 1.46, 0.1, 0.12, C_DARK_METAL, M_DARK, 0, -0.35, 0);
  b.addBox(0, 1.28, -0.4, 0.78, 0.58, 3.1, C_CREAM, M_PAINT);
}

function buildHighWingAndNacelles(b, options) {
  const { flapsDeg = 0, aileron = 0, highlightZone = null, refits = [] } = options;
  const hasTurbo = refits.includes('twin-supercharger') || highlightZone === 'turbocharger';
  const hasAlbatross = refits.includes('albatross-tips') || highlightZone === 'glider';
  const hasAvionics = refits.includes('storm-radar') || refits.includes('chart-folio') || highlightZone === 'avionics';

  // Streamlined central parasol wing pylon + V-struts connecting hull to high wing
  b.addBox(0, 1.92, 0.65, 1.05, 1.05, 2.7, C_CREAM_SHADE, M_PAINT);
  b.addStrut([-1.08, 0.35, 1.3], [-3.85, 2.38, 1.05], 0.085, C_DARK_METAL, M_METAL);
  b.addStrut([1.08, 0.35, 1.3], [3.85, 2.38, 1.05], 0.085, C_DARK_METAL, M_METAL);
  b.addStrut([-1.02, 0.35, -0.4], [-3.85, 2.38, -0.15], 0.075, C_DARK_METAL, M_METAL);
  b.addStrut([1.02, 0.35, -0.4], [3.85, 2.38, -0.15], 0.075, C_DARK_METAL, M_METAL);

  // High parasol cambered airfoil wing spanning X = [-8.8, +8.8] with gentle dihedral
  const spanHalf = hasAlbatross ? 9.6 : 8.8;
  const wingSegs = 8;
  for (const side of [-1, 1]) {
    const stations = [];
    for (let i = 0; i <= wingSegs; i++) {
      const t = i / wingSegs;
      const x = side * (t * spanHalf);
      const y = 2.34 + t * 0.42 + (hasAlbatross && t > 0.85 ? (t - 0.85) * 4.4 : 0);
      const chord = 2.65 * (1.0 - t * 0.38);
      const thick = 0.38 * (1.0 - t * 0.45);
      const zLead = 2.05 - t * 0.32;
      const zTrail = zLead - chord;
      const pts = [
        [x, y, zLead],
        [x, y + thick * 0.56, zLead - chord * 0.25],
        [x, y + thick * 0.42, zLead - chord * 0.62],
        [x, y + 0.03, zTrail],
        [x, y - thick * 0.16, zLead - chord * 0.55],
        [x, y - thick * 0.24, zLead - chord * 0.22],
      ];
      stations.push({ t, points: pts });
    }
    // Crisp bold postal vermilion wingtip bands + leading livery stripes so hero aircraft pops off sunset!
    b.addLoft(
      stations,
      (r, c) => {
        const t = r / wingSegs;
        if (c === 0) return C_DARK_METAL;
        if (t > 0.62 && t < 0.84) return C_CRIMSON;
        if (t >= 0.84) return C_CRIMSON_DARK;
        if (t > 0.28 && t < 0.42) return C_CRIMSON;
        return C_CREAM;
      },
      (r) => {
        const t = r / wingSegs;
        if (highlightZone === 'glider' && t >= 0.78) return M_GLOW_GOLD;
        return M_PAINT;
      },
    );

    // Visibly deflected trailing-edge flaps (inner wing span 1.2..4.8) — HUGE aviation detail!
    const flapRad = (flapsDeg * Math.PI) / 180;
    const fx = side * 3.0;
    const fy = 2.48 - Math.sin(flapRad) * 0.34;
    const fz = -0.62 - (1 - Math.cos(flapRad)) * 0.16;
    b.addBox(fx, fy, fz, 3.1, 0.11, 0.68, C_CRIMSON_DARK, M_PAINT, 0, -flapRad, side * 0.045);

    // Outboard ailerons reacting live to roll input
    const ailRad = side * aileron * 0.34;
    b.addBox(side * 6.5, 2.66, -0.32, 2.5, 0.09, 0.48, C_AMBER, M_PAINT, 0, ailRad, side * 0.045);

    // Crisp aviation-scale wingtip navigation lights: Port RED (-X) & Starboard GREEN (+X)
    const navCol = side < 0 ? hexToRgb('#ff2e24') : hexToRgb('#24f07a');
    const navMat = [0.15, 0.1, 1.85, 3.0];
    const tipY = 2.76 + (hasAlbatross ? 0.64 : 0);
    b.addSphere(side * (spanHalf + 0.08), tipY, 1.48, 0.16, 0.14, 0.24, 8, 10, navCol, navMat);

    // Streamlined under-wing stabilizing pontoon floats (cleanly outboard at X=±5.4, symmetrical, zero tail overlap!)
    const px = side * 5.45;
    const py = 0.32;
    const pz = 0.85;
    b.addBox(px, py + 0.12, pz, 0.72, 0.56, 3.45, C_CREAM, M_PAINT);
    b.addBox(px, py - 0.14, pz, 0.68, 0.22, 3.3, C_CRIMSON, M_PAINT);
    b.addCylinder(px, py + 0.05, pz + 2.15, 0.34, 0.04, 0.92, 8, C_CRIMSON, M_PAINT, 'z');
    b.addCylinder(px, py + 0.08, pz - 2.12, 0.3, 0.04, 0.88, 8, C_CREAM_SHADE, M_PAINT, 'z');
    // Clean V-struts from pontoon to wing underside
    b.addStrut([px, py + 0.38, pz + 0.65], [px - side * 0.45, 2.52, pz + 0.55], 0.065, C_DARK_METAL, M_METAL);
    b.addStrut([px, py + 0.38, pz - 0.65], [px - side * 0.45, 2.52, pz - 0.45], 0.065, C_DARK_METAL, M_METAL);
    b.addStrut([px, py + 0.32, pz + 0.1], [px + side * 0.55, 2.58, pz + 0.1], 0.055, C_DARK_METAL, M_METAL);

    // Twin radial engine nacelles mounted cleanly ahead of the high wing (X = ±2.85)
    const ex = side * 2.85;
    const ey = 2.52;
    const ez = 2.15;
    const nacMat = highlightZone === 'turbocharger' ? M_GLOW_GOLD : M_PAINT;
    b.addCylinder(ex, ey, ez - 0.35, 0.64, 0.76, 2.3, 14, C_CREAM, nacMat, 'z');
    b.addCylinder(ex, ey, ez + 0.95, 0.78, 0.68, 0.62, 14, C_CRIMSON, nacMat, 'z');
    b.addCylinder(ex, ey, ez + 1.18, 0.56, 0.52, 0.24, 12, C_CHARCOAL, M_DARK, 'z');
    b.addCylinder(ex, ey, ez + 1.56, 0.26, 0.04, 0.56, 12, C_AMBER, M_METAL, 'z');
    b.addStrut([ex + side * 0.56, ey - 0.28, ez + 0.55], [ex + side * 0.62, ey - 0.42, ez - 0.85], 0.09, C_BRASS, M_METAL);
    if (hasTurbo) {
      b.addBox(ex, ey + 0.78, ez + 0.35, 0.48, 0.36, 1.38, C_CHROME, highlightZone === 'turbocharger' ? M_GLOW_GOLD : M_METAL);
      b.addBox(ex, ey + 0.82, ez + 1.04, 0.40, 0.26, 0.14, C_CRIMSON, M_GLOW_RED);
    }
    // Sculpted 3-blade brass-tipped propellers radiating cleanly from spinner center (exact rotation sign!)
    if (options.parkedProps) {
      for (let k = 0; k < 3; k++) {
        const ang = (k * Math.PI * 2) / 3 + (side < 0 ? 0.35 : -0.25);
        const rotZ = Math.PI * 0.5 - ang;
        const bx = ex + Math.cos(ang) * 0.80;
        const by = ey + Math.sin(ang) * 0.80;
        b.addBox(bx, by, ez + 1.48, 0.18, 1.56, 0.055, C_DARK_METAL, M_METAL, 0, 0, rotZ);
        const tx = ex + Math.cos(ang) * 1.46;
        const ty = ey + Math.sin(ang) * 1.46;
        b.addBox(tx, ty, ez + 1.48, 0.19, 0.26, 0.06, C_AMBER, M_PAINT, 0, 0, rotZ);
      }
    }
  }

  // Sleek streamlined brass avionics VHF antenna mast (clean rear silhouette — no ugly purple dorsal blob!)
  if (hasAvionics) {
    const avMat = highlightZone === 'avionics' ? M_GLOW_GOLD : M_METAL;
    b.addStrut([0, 2.68, 0.35], [0, 3.65, -0.25], 0.055, C_BRASS, avMat);
    b.addStrut([0, 3.65, -0.25], [0, 3.35, -7.2], 0.025, C_BRASS, avMat);
  }
}

function buildCruciformTail(b, rudder = 0, elevator = 0) {
  // Elevated Cruciform / High T-Tail completely clear of floats & boat hull!
  // Swept vertical stabilizer fin
  const finVerts = [
    [-0.14, 0.72, -5.6], [0.14, 0.72, -5.6], [0.1, 3.65, -7.75], [-0.1, 3.65, -7.75],
    [-0.12, 0.72, -8.55], [0.12, 0.72, -8.55], [0.08, 3.65, -8.78], [-0.08, 3.65, -8.78],
  ];
  b.addQuad(finVerts[0], finVerts[4], finVerts[7], finVerts[3], C_CRIMSON, M_PAINT);
  b.addQuad(finVerts[5], finVerts[1], finVerts[2], finVerts[6], C_CRIMSON, M_PAINT);
  b.addQuad(finVerts[0], finVerts[1], finVerts[2], finVerts[3], C_AMBER, M_PAINT);
  b.addQuad(finVerts[3], finVerts[2], finVerts[6], finVerts[7], C_AMBER, M_PAINT);
  b.addQuad(finVerts[5], finVerts[4], finVerts[7], finVerts[6], C_CRIMSON_DARK, M_PAINT);

  // Animated tail rudder tab
  b.addBox(Math.sin(rudder * 0.35) * 0.14, 2.25, -8.92, 0.14, 2.55, 0.52, C_AMBER, M_PAINT, rudder * 0.35, 0, 0);

  // High-mounted horizontal tailplane at Y = 2.65 (gives iconic amphibious flying-boat silhouette!)
  b.addBox(0, 2.68, -7.9, 6.2, 0.16, 1.38, C_CREAM, M_PAINT);
  b.addBox(-2.55, 2.69, -7.9, 0.95, 0.17, 1.38, C_CRIMSON, M_PAINT);
  b.addBox(2.55, 2.69, -7.9, 0.95, 0.17, 1.38, C_CRIMSON, M_PAINT);
  // Animated trailing elevator
  b.addBox(0, 2.66 - Math.sin(elevator * 0.3) * 0.18, -8.72, 5.8, 0.1, 0.48, C_AMBER, M_PAINT, 0, elevator * 0.3, 0);

  // White tail beacon strobe
  b.addSphere(0, 3.74, -8.32, 0.16, 0.16, 0.22, 5, 8, hexToRgb('#fff6d9'), M_GLOW_GOLD);
}

export function buildAircraftMesh(gl, options = {}) {
  const b = createMeshBuilder();
  buildHullAndCanopy(b);
  buildHighWingAndNacelles(b, options);
  buildCruciformTail(b, options.rudder || 0, options.elevator || 0);
  return uploadMesh(gl, b.build());
}

export function buildPropellerFxVerts(propAngle, boosting) {
  // Translucent motion-blurred spinning propeller discs + rotating dark blades for left & right nacelles
  const verts = [];
  const push = (x, y, z, r, g, b, a) => verts.push(x, y, z, r, g, b, a);
  const segs = 24;
  const radius = 1.62;

  for (const side of [-1, 1]) {
    const cx = side * 2.85;
    const cy = 2.52;
    const cz = 3.72;
    const spin = propAngle * (side < 0 ? 1 : -1);

    // Subtle glowing translucent sweep disc (never a flat solid cartoon circle!)
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2 + spin;
      const a1 = ((i + 1) / segs) * Math.PI * 2 + spin;
      const bladePulse = Math.pow(Math.abs(Math.cos(a0 * 1.5)), 4.0);
      const alpha = 0.08 + bladePulse * 0.24;
      const cr = 0.96, cg = 0.88, cb = 0.72;
      push(cx, cy, cz, cr, cg, cb, alpha * 0.5);
      push(cx + Math.cos(a0) * radius, cy + Math.sin(a0) * radius, cz, cr, cg, cb, alpha);
      push(cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius, cz, cr, cg, cb, alpha);

      // Yellow prop-tip warning safety ring
      const rIn = radius * 0.91;
      const ta = 0.18 + bladePulse * 0.25;
      push(cx + Math.cos(a0) * rIn, cy + Math.sin(a0) * rIn, cz + 0.02, 1.0, 0.82, 0.32, ta);
      push(cx + Math.cos(a0) * radius, cy + Math.sin(a0) * radius, cz + 0.02, 1.0, 0.82, 0.32, ta);
      push(cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius, cz + 0.02, 1.0, 0.82, 0.32, ta);
    }

    // 3 sharp spinning blade streaks
    for (let k = 0; k < 3; k++) {
      const ba = spin + (k * Math.PI * 2) / 3;
      const dx = Math.cos(ba), dy = Math.sin(ba);
      const px = -dy * 0.11, py = dx * 0.11;
      const tipX = cx + dx * radius * 0.96;
      const tipY = cy + dy * radius * 0.96;
      push(cx - px * 0.4, cy - py * 0.4, cz + 0.03, 0.15, 0.18, 0.22, 0.62);
      push(cx + px * 0.4, cy + py * 0.4, cz + 0.03, 0.15, 0.18, 0.22, 0.62);
      push(tipX + px * 0.25, tipY + py * 0.25, cz + 0.03, 0.22, 0.25, 0.28, 0.45);
      push(cx - px * 0.4, cy - py * 0.4, cz + 0.03, 0.15, 0.18, 0.22, 0.62);
      push(tipX + px * 0.25, tipY + py * 0.25, cz + 0.03, 0.22, 0.25, 0.28, 0.45);
      push(tipX - px * 0.25, tipY - py * 0.25, cz + 0.03, 0.22, 0.25, 0.28, 0.45);
    }

    // WEP boost exhaust flame plume when boosting
    if (boosting) {
      const fx = cx + side * 0.6;
      const fy = cy - 0.42;
      const fz = 1.2;
      push(fx, fy + 0.16, fz, 1.0, 0.62, 0.18, 0.85);
      push(fx, fy - 0.16, fz, 1.0, 0.62, 0.18, 0.85);
      push(fx, fy, fz - 2.4, 1.0, 0.95, 0.65, 0.05);
    }
  }
  return new Float32Array(verts);
}
