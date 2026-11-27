// SPDX-License-Identifier: MIT
// True 3D symmetric cockpit interior: continuous A-pillars, canopy header, glareshield, radial nacelles & HUD combiner.

import { createMeshBuilder, hexToRgb, uploadMesh } from './meshBuilder.js';

const C_FRAME = hexToRgb('#0e151b');
const C_FRAME_EDGE = hexToRgb('#24323e');
const C_COWL = hexToRgb('#10171f');
const C_BRASS = hexToRgb('#c28c32');
const C_CREAM = hexToRgb('#e6dac0');
const C_CRIMSON = hexToRgb('#a62c22');
const C_DARK = hexToRgb('#11181f');
const C_STEEL = hexToRgb('#4f6270');

const M_COCKPIT = [0.68, 0.24, 0.0, 5.0];
const M_BRASS = [0.28, 0.68, 0.04, 5.0];
const M_COWL = [0.88, 0.05, 0.0, 5.0];
const M_EXT = [0.46, 0.18, 0.0, 3.0];

export function buildCockpit3DMesh(gl) {
  const b = createMeshBuilder();

  // Pilot eye at aircraft-local (0, 1.85, 2.2) looking forward (+Z), FOV=64 deg.
  // 1. Solid curved dark leather-grain 3D glareshield spanning full cockpit width
  b.addBox(0, 1.24, 3.35, 4.6, 0.42, 1.4, C_COWL, M_COWL);
  b.addBox(0, 1.46, 3.16, 3.8, 0.05, 0.16, C_FRAME_EDGE, M_COCKPIT);
  b.addBox(0, 1.49, 3.09, 3.6, 0.022, 0.045, C_BRASS, M_BRASS);

  // Sleek forward nose deck (deep crimson with cream center strip) visible low ahead of glareshield
  b.addBox(0, 0.88, 5.55, 1.62, 0.40, 2.6, C_CRIMSON, M_EXT);
  b.addBox(0, 1.09, 5.55, 0.22, 0.05, 2.5, C_CREAM, M_EXT);

  // 2. Continuous symmetric LEFT & RIGHT dark anodized A-pillars + VISIBLE overhead canopy roof header bar!
  for (const side of [-1, 1]) {
    b.addStrut([side * 1.24, 1.30, 3.34], [side * 1.02, 2.25, 3.04], 0.068, C_FRAME, M_COCKPIT);
    b.addStrut([side * 1.20, 1.32, 3.32], [side * 0.98, 2.23, 3.02], 0.020, C_FRAME_EDGE, M_COCKPIT);
    b.addStrut([side * 1.24, 1.30, 3.34], [side * 1.56, 1.24, 2.1], 0.065, C_FRAME, M_COCKPIT);
  }
  // Solid continuous overhead canopy roof arch framing the top of the windshield cleanly inside FOV!
  b.addStrut([-1.04, 2.25, 3.04], [0, 2.30, 3.08], 0.075, C_FRAME, M_COCKPIT);
  b.addStrut([0, 2.30, 3.08], [1.04, 2.25, 3.04], 0.075, C_FRAME, M_COCKPIT);
  b.addBox(0, 2.36, 2.98, 2.4, 0.14, 0.42, C_FRAME, M_COCKPIT);

  // 3. Sleek dark anodized HUD projector cradle seated solidly on the glareshield
  b.addBox(0, 1.50, 3.44, 0.98, 0.065, 0.22, C_FRAME, M_COCKPIT);
  b.addBox(-0.46, 1.55, 3.44, 0.04, 0.09, 0.14, C_FRAME_EDGE, M_COCKPIT);
  b.addBox(0.46, 1.55, 3.44, 0.04, 0.09, 0.14, C_FRAME_EDGE, M_COCKPIT);

  // 4. Solid detailed Twin Radial Engine Nacelles mounted cleanly outboard (NO floating upper slabs, NO glareshield clipping!)
  for (const side of [-1, 1]) {
    const ex = side * 2.95;
    const ey = 2.02;
    const ez = 5.05;
    // Tapered wing spar extending cleanly outboard behind nacelle
    b.addBox(side * 4.15, 2.18, 4.95, 2.4, 0.16, 1.15, C_CREAM, M_EXT);
    // Solid 20-segment radial engine nacelle + crimson cowling + 7 radial cylinders + brass spinner hub!
    b.addCylinder(ex, ey, ez - 0.55, 0.44, 0.54, 1.75, 20, C_CREAM, M_EXT, 'z', true);
    b.addCylinder(ex, ey, ez + 0.45, 0.56, 0.50, 0.48, 20, C_CRIMSON, M_EXT, 'z', true);
    b.addCylinder(ex, ey, ez + 0.66, 0.42, 0.40, 0.16, 16, C_DARK, M_COCKPIT, 'z', true);
    for (let c = 0; c < 7; c++) {
      const ca = (c * Math.PI * 2) / 7;
      b.addBox(ex + Math.cos(ca) * 0.26, ey + Math.sin(ca) * 0.26, ez + 0.72, 0.11, 0.14, 0.14, C_STEEL, M_COCKPIT, 0, 0, ca);
    }
    b.addCylinder(ex, ey, ez + 0.96, 0.19, 0.03, 0.44, 16, C_BRASS, M_BRASS, 'z', true);
  }

  return uploadMesh(gl, b.build());
}

export function buildCockpitGlassFxVerts(propAngle) {
  const verts = [];
  const push = (x, y, z, r, g, b, a) => verts.push(x, y, z, r, g, b, a);

  // Subtle ultra-clean optical HUD glass pane (low opacity 0.06 so runway & storm contrast stays razor-sharp!)
  const w = 0.46;
  const y0 = 1.56, y1 = 2.15;
  const z0 = 3.44, z1 = 3.56;
  push(-w, y0, z0, 0.10, 0.72, 0.52, 0.055);
  push(w, y0, z0, 0.10, 0.72, 0.52, 0.055);
  push(w, y1, z1, 0.14, 0.85, 0.62, 0.075);
  push(-w, y0, z0, 0.10, 0.72, 0.52, 0.055);
  push(w, y1, z1, 0.14, 0.85, 0.62, 0.075);
  push(-w, y1, z1, 0.14, 0.85, 0.62, 0.075);

  const t = 0.008;
  const edges = [
    [[-w, y1, z1], [w, y1, z1], [w, y1 - t, z1], [-w, y1 - t, z1]],
    [[-w, y0, z0], [-w + t, y0, z0], [-w + t, y1, z1], [-w, y1, z1]],
    [[w - t, y0, z0], [w, y0, z0], [w, y1, z1], [w - t, y1, z1]],
  ];
  for (const q of edges) {
    push(...q[0], 0.35, 0.96, 0.76, 0.36);
    push(...q[1], 0.35, 0.96, 0.76, 0.36);
    push(...q[2], 0.35, 0.96, 0.76, 0.36);
    push(...q[0], 0.35, 0.96, 0.76, 0.36);
    push(...q[2], 0.35, 0.96, 0.76, 0.36);
    push(...q[3], 0.35, 0.96, 0.76, 0.36);
  }

  // Smooth 48-segment FULL QUAD-STRIP spinning propeller arcs centered EXACTLY on the nacelle spinners (2.95, 2.02, 5.88)!
  const segs = 48;
  const radius = 0.96;
  for (const side of [-1, 1]) {
    const cx = side * 2.95;
    const cy = 2.02;
    const cz = 5.88;
    const spin = propAngle * (side < 0 ? 1 : -1);
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2 + spin;
      const a1 = ((i + 1) / segs) * Math.PI * 2 + spin;
      const blade = Math.pow(Math.abs(Math.cos(a0 * 1.5)), 8.0);
      const a = 0.03 + blade * 0.22;
      push(cx, cy, cz, 0.12, 0.16, 0.20, a * 0.5);
      push(cx + Math.cos(a0) * radius, cy + Math.sin(a0) * radius, cz, 0.22, 0.28, 0.32, a);
      push(cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius, cz, 0.22, 0.28, 0.32, a);

      // Full 2-triangle quad for smooth continuous yellow tip-warning blur ring (ZERO sawtooth wedges!)
      const rIn = radius * 0.92;
      const ta = 0.08 + blade * 0.26;
      const i0x = cx + Math.cos(a0) * rIn, i0y = cy + Math.sin(a0) * rIn;
      const o0x = cx + Math.cos(a0) * radius, o0y = cy + Math.sin(a0) * radius;
      const i1x = cx + Math.cos(a1) * rIn, i1y = cy + Math.sin(a1) * rIn;
      const o1x = cx + Math.cos(a1) * radius, o1y = cy + Math.sin(a1) * radius;
      push(i0x, i0y, cz + 0.01, 0.96, 0.78, 0.28, ta);
      push(o0x, o0y, cz + 0.01, 0.96, 0.78, 0.28, ta);
      push(o1x, o1y, cz + 0.01, 0.96, 0.78, 0.28, ta);
      push(i0x, i0y, cz + 0.01, 0.96, 0.78, 0.28, ta);
      push(o1x, o1y, cz + 0.01, 0.96, 0.78, 0.28, ta);
      push(i1x, i1y, cz + 0.01, 0.96, 0.78, 0.28, ta);
    }
  }

  return new Float32Array(verts);
}
