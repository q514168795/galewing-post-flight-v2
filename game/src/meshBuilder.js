// SPDX-License-Identifier: MIT
// Procedural WebGL2 3D geometry builder: lofted fuselages, cambered airfoils, sculpted terrain, toruses, and VAOs.

export const STRIDE_FLOATS = 13; // pos(3) + normal(3) + color(3) + mat(rough, metal, emissive, kind)(4)

export function createMeshBuilder() {
  const verts = [];
  const indices = [];

  function pushVertex(px, py, pz, nx, ny, nz, r, g, b, rough = 0.72, metal = 0.05, emissive = 0.0, kind = 0.0) {
    const idx = verts.length / STRIDE_FLOATS;
    verts.push(px, py, pz, nx, ny, nz, r, g, b, rough, metal, emissive, kind);
    return idx;
  }

  function addSmoothTri(i0, i1, i2) {
    indices.push(i0, i1, i2);
  }

  function addTri(a, b, c, color, mat = [0.72, 0.05, 0, 0], normalOverride = null) {
    let nx, ny, nz;
    if (normalOverride) {
      [nx, ny, nz] = normalOverride;
    } else {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      nx = uy * vz - uz * vy;
      ny = uz * vx - ux * vz;
      nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
    }
    const i0 = pushVertex(a[0], a[1], a[2], nx, ny, nz, color[0], color[1], color[2], mat[0], mat[1], mat[2], mat[3]);
    const i1 = pushVertex(b[0], b[1], b[2], nx, ny, nz, color[0], color[1], color[2], mat[0], mat[1], mat[2], mat[3]);
    const i2 = pushVertex(c[0], c[1], c[2], nx, ny, nz, color[0], color[1], color[2], mat[0], mat[1], mat[2], mat[3]);
    indices.push(i0, i1, i2);
  }

  function addQuad(a, b, c, d, color, mat = [0.72, 0.05, 0, 0], normalOverride = null) {
    addTri(a, b, c, color, mat, normalOverride);
    addTri(a, c, d, color, mat, normalOverride);
  }

  function addBox(cx, cy, cz, sx, sy, sz, color, mat = [0.65, 0.1, 0, 0], yaw = 0, pitch = 0, roll = 0) {
    const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
    const corners = [
      [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
      [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
    ].map(([x, y, z]) => transformPoint(x, y, z, cx, cy, cz, yaw, pitch, roll));

    const faces = [
      [0, 1, 2, 3, [0, 0, -1]],
      [5, 4, 7, 6, [0, 0, 1]],
      [4, 0, 3, 7, [-1, 0, 0]],
      [1, 5, 6, 2, [1, 0, 0]],
      [3, 2, 6, 7, [0, 1, 0]],
      [4, 5, 1, 0, [0, -1, 0]],
    ];
    for (const [i0, i1, i2, i3, n] of faces) {
      const rn = rotateNormal(n[0], n[1], n[2], yaw, pitch, roll);
      addQuad(corners[i0], corners[i1], corners[i2], corners[i3], color, mat, rn);
    }
  }

  function addCylinder(cx, cy, cz, rBottom, rTop, height, segs, color, mat = [0.6, 0.15, 0, 0], axis = 'y', cap = true) {
    const half = height * 0.5;
    const makePt = (a, rad, t) => {
      const ca = Math.cos(a), sa = Math.sin(a);
      if (axis === 'z') return [cx + ca * rad, cy + sa * rad, cz + t];
      if (axis === 'x') return [cx + t, cy + sa * rad, cz + ca * rad];
      return [cx + ca * rad, cy + t, cz + sa * rad];
    };
    const makeNorm = (a) => {
      const ca = Math.cos(a), sa = Math.sin(a);
      const slope = (rBottom - rTop) / Math.max(0.001, height);
      const inv = 1 / Math.hypot(1, slope);
      if (axis === 'z') return [ca * inv, sa * inv, slope * inv];
      if (axis === 'x') return [slope * inv, sa * inv, ca * inv];
      return [ca * inv, slope * inv, sa * inv];
    };

    const base = verts.length / STRIDE_FLOATS;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const n = makeNorm(a);
      const pb = makePt(a, rBottom, -half);
      const pt = makePt(a, rTop, half);
      pushVertex(pb[0], pb[1], pb[2], n[0], n[1], n[2], color[0], color[1], color[2], mat[0], mat[1], mat[2], mat[3]);
      pushVertex(pt[0], pt[1], pt[2], n[0], n[1], n[2], color[0], color[1], color[2], mat[0], mat[1], mat[2], mat[3]);
    }
    for (let i = 0; i < segs; i++) {
      const k = base + i * 2;
      indices.push(k, k + 1, k + 3, k, k + 3, k + 2);
    }
    if (cap) {
      const cBot = axis === 'z' ? [cx, cy, cz - half] : axis === 'x' ? [cx - half, cy, cz] : [cx, cy - half, cz];
      const cTop = axis === 'z' ? [cx, cy, cz + half] : axis === 'x' ? [cx + half, cy, cz] : [cx, cy + half, cz];
      const nBot = axis === 'z' ? [0, 0, -1] : axis === 'x' ? [-1, 0, 0] : [0, -1, 0];
      const nTop = axis === 'z' ? [0, 0, 1] : axis === 'x' ? [1, 0, 0] : [0, 1, 0];
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        if (rBottom > 0.001) addTri(cBot, makePt(a1, rBottom, -half), makePt(a0, rBottom, -half), color, mat, nBot);
        if (rTop > 0.001) addTri(cTop, makePt(a0, rTop, half), makePt(a1, rTop, half), color, mat, nTop);
      }
    }
  }

  function addLoft(rings, colorFn, matFn) {
    // rings: array of { points: [[x,y,z], ...], ... }, all same ring vertex count
    if (rings.length < 2) return;
    const cols = rings[0].points.length;
    const grid = [];
    for (let r = 0; r < rings.length; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        const p = rings[r].points[c];
        const pPrevC = rings[r].points[(c - 1 + cols) % cols];
        const pNextC = rings[r].points[(c + 1) % cols];
        const pPrevR = rings[Math.max(0, r - 1)].points[c];
        const pNextR = rings[Math.min(rings.length - 1, r + 1)].points[c];
        const tx = pNextC[0] - pPrevC[0], ty = pNextC[1] - pPrevC[1], tz = pNextC[2] - pPrevC[2];
        const bx = pNextR[0] - pPrevR[0], by = pNextR[1] - pPrevR[1], bz = pNextR[2] - pPrevR[2];
        let nx = ty * bz - tz * by;
        let ny = tz * bx - tx * bz;
        let nz = tx * by - ty * bx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
        const col = colorFn(r, c, p, [nx, ny, nz]);
        const mat = matFn ? matFn(r, c, p, [nx, ny, nz]) : [0.5, 0.15, 0, 0];
        row.push(pushVertex(p[0], p[1], p[2], nx, ny, nz, col[0], col[1], col[2], mat[0], mat[1], mat[2], mat[3]));
      }
      grid.push(row);
    }
    for (let r = 0; r < rings.length - 1; r++) {
      for (let c = 0; c < cols; c++) {
        const nc = (c + 1) % cols;
        const i00 = grid[r][c], i01 = grid[r][nc];
        const i10 = grid[r + 1][c], i11 = grid[r + 1][nc];
        indices.push(i00, i10, i11, i00, i11, i01);
      }
    }
  }

  function addTorus(cx, cy, cz, majorR, minorR, majorSegs, minorSegs, colorFn, mat = [0.35, 0.4, 0.65, 0]) {
    const grid = [];
    for (let i = 0; i <= majorSegs; i++) {
      const u = (i / majorSegs) * Math.PI * 2;
      const cu = Math.cos(u), su = Math.sin(u);
      const row = [];
      for (let j = 0; j <= minorSegs; j++) {
        const v = (j / minorSegs) * Math.PI * 2;
        const cv = Math.cos(v), sv = Math.sin(v);
        const rr = majorR + minorR * cv;
        const px = cx + cu * rr;
        const py = cy + su * rr;
        const pz = cz + sv * minorR;
        const nx = cu * cv, ny = su * cv, nz = sv;
        const col = typeof colorFn === 'function' ? colorFn(i, j, u, v) : colorFn;
        row.push(pushVertex(px, py, pz, nx, ny, nz, col[0], col[1], col[2], mat[0], mat[1], mat[2], mat[3]));
      }
      grid.push(row);
    }
    for (let i = 0; i < majorSegs; i++) {
      for (let j = 0; j < minorSegs; j++) {
        const a = grid[i][j], b = grid[i + 1][j], c = grid[i + 1][j + 1], d = grid[i][j + 1];
        indices.push(a, b, c, a, c, d);
      }
    }
  }

  function addSphere(cx, cy, cz, rx, ry, rz, rings, segs, color, mat = [0.4, 0.2, 0, 0]) {
    const grid = [];
    for (let r = 0; r <= rings; r++) {
      const phi = (r / rings) * Math.PI;
      const sp = Math.sin(phi), cp = Math.cos(phi);
      const row = [];
      for (let s = 0; s <= segs; s++) {
        const theta = (s / segs) * Math.PI * 2;
        const nx = sp * Math.cos(theta), ny = cp, nz = sp * Math.sin(theta);
        row.push(pushVertex(
          cx + nx * rx, cy + ny * ry, cz + nz * rz,
          nx, ny, nz,
          color[0], color[1], color[2],
          mat[0], mat[1], mat[2], mat[3],
        ));
      }
      grid.push(row);
    }
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < segs; s++) {
        const a = grid[r][s], b = grid[r + 1][s], c = grid[r + 1][s + 1], d = grid[r][s + 1];
        indices.push(a, b, c, a, c, d);
      }
    }
  }

  function addStrut(a, b, radius, color, mat = [0.4, 0.55, 0, 0]) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.001) return;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    const ref = Math.abs(uy) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let sx = uy * ref[2] - uz * ref[1];
    let sy = uz * ref[0] - ux * ref[2];
    let sz = ux * ref[1] - uy * ref[0];
    const sl = Math.hypot(sx, sy, sz) || 1;
    sx /= sl; sy /= sl; sz /= sl;
    const tx = sy * uz - sz * uy;
    const ty = sz * ux - sx * uz;
    const tz = sx * uy - sy * ux;
    const segs = 6;
    const base = verts.length / STRIDE_FLOATS;
    for (let i = 0; i <= segs; i++) {
      const ang = (i / segs) * Math.PI * 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const nx = sx * ca + tx * sa, ny = sy * ca + ty * sa, nz = sz * ca + tz * sa;
      pushVertex(a[0] + nx * radius, a[1] + ny * radius, a[2] + nz * radius, nx, ny, nz, color[0], color[1], color[2], mat[0], mat[1], mat[2], mat[3]);
      pushVertex(b[0] + nx * radius, b[1] + ny * radius, b[2] + nz * radius, nx, ny, nz, color[0], color[1], color[2], mat[0], mat[1], mat[2], mat[3]);
    }
    for (let i = 0; i < segs; i++) {
      const k = base + i * 2;
      indices.push(k, k + 1, k + 3, k, k + 3, k + 2);
    }
  }

  function build() {
    return {
      vertices: new Float32Array(verts),
      indices: new Uint32Array(indices),
      indexCount: indices.length,
    };
  }

  return {
    pushVertex,
    addSmoothTri,
    addTri,
    addQuad,
    addBox,
    addCylinder,
    addLoft,
    addTorus,
    addSphere,
    addStrut,
    build,
  };
}

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rotateNormal(x, y, z, yaw, pitch, roll) {
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const x1 = x * cr + y * sr;
  const y1 = -x * sr + y * cr;
  const z1 = z;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const y2 = y1 * cp + z1 * sp;
  const z2 = -y1 * sp + z1 * cp;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  return [x1 * cy + z2 * sy, y2, -x1 * sy + z2 * cy];
}

export function transformPoint(x, y, z, cx, cy, cz, yaw, pitch, roll) {
  const r = rotateNormal(x, y, z, yaw, pitch, roll);
  return [cx + r[0], cy + r[1], cz + r[2]];
}

export function uploadMesh(gl, data) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, data.vertices, gl.STATIC_DRAW);

  const ebo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);

  const stride = STRIDE_FLOATS * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 36);

  gl.bindVertexArray(null);
  return { vao, vbo, ebo, indexCount: data.indexCount };
}
