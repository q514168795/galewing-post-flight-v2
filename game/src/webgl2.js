// SPDX-License-Identifier: MIT
// WebGL2 3D rendering engine: 2048x2048 PCF shadow maps, Rayleigh/Mie sky, Fresnel ocean, aircraft & live 3D screens.

import { SKY_VS, SKY_FS, SHADOW_VS, SHADOW_FS, OCEAN_VS, OCEAN_FS, WORLD_VS, WORLD_FS, FX_VS, FX_FS } from './shaders.js';
import { hexToRgb } from './meshBuilder.js';
import { buildCameraBasis, projectPoint } from './camera.js';
import { computePapiLights } from './terrain.js';
import { buildAircraftMesh, buildPropellerFxVerts } from './meshAircraft.js';
import { buildCockpit3DMesh, buildCockpitGlassFxVerts } from './cockpit3d.js';
import {
  buildHangarBayMesh,
  buildOceanGrid,
  buildPapiLightsMesh,
  buildParachuteSackMesh,
  buildTargetRingMesh,
  buildWindsockMesh,
  buildWorldStaticMesh,
} from './meshWorld.js';

const SHADOW_SIZE = 2048;

function compileProgram(gl, vsSrc, fsSrc) {
  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      throw new Error(`GLSL compile error: ${log}`);
    }
    return sh;
  };
  const prog = gl.createProgram();
  const vs = compile(gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`GLSL link error: ${gl.getProgramInfoLog(prog)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

function mulMat4(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

function identityMat4() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

function makeBasisModelMat4(px, py, pz, rx, ry, rz, ux, uy, uz, fx, fy, fz, scale = 1) {
  const m = new Float32Array(16);
  m[0] = rx * scale; m[1] = ry * scale; m[2] = rz * scale; m[3] = 0;
  m[4] = ux * scale; m[5] = uy * scale; m[6] = uz * scale; m[7] = 0;
  m[8] = fx * scale; m[9] = fy * scale; m[10] = fz * scale; m[11] = 0;
  m[12] = px; m[13] = py; m[14] = pz; m[15] = 1;
  return m;
}

function normalMat3FromModel(m) {
  // Assumes uniform scale / orthonormal basis
  const s = Math.hypot(m[0], m[1], m[2]) || 1;
  return new Float32Array([
    m[0] / s, m[1] / s, m[2] / s,
    m[4] / s, m[5] / s, m[6] / s,
    m[8] / s, m[9] / s, m[10] / s,
  ]);
}

function buildAircraftModelMat4(plane) {
  const cosP = Math.cos(plane.pitch), sinP = Math.sin(plane.pitch);
  const sinY = Math.sin(plane.yaw), cosY = Math.cos(plane.yaw);
  const fx = sinY * cosP, fy = sinP, fz = cosY * cosP;
  const r0x = cosY, r0y = 0, r0z = -sinY;
  const u0x = -sinY * sinP, u0y = cosP, u0z = -cosY * sinP;
  const cr = Math.cos(plane.roll), sr = Math.sin(plane.roll);
  // Consistent aviation roll: +roll = right wing DOWN, left wing UP!
  const rx = r0x * cr - u0x * sr;
  const ry = r0y * cr - u0y * sr;
  const rz = r0z * cr - u0z * sr;
  const ux = u0x * cr + r0x * sr;
  const uy = u0y * cr + r0y * sr;
  const uz = u0z * cr + r0z * sr;
  return makeBasisModelMat4(plane.x, plane.y, plane.z, rx, ry, rz, ux, uy, uz, fx, fy, fz, 1.0);
}

function buildViewProjFromBasis(basis, near = 0.65, far = 9500) {
  // Exact match to camera.js projection (including cx/cy offset: proj[8]=-cxShift, proj[9]=-cyShift!)
  const rx = basis.rightX, ry = basis.rightY, rz = basis.rightZ;
  const ux = basis.upX, uy = basis.upY, uz = basis.upZ;
  const bx = -basis.fwdX, by = -basis.fwdY, bz = -basis.fwdZ;

  const view = new Float32Array([
    rx, ux, bx, 0,
    ry, uy, by, 0,
    rz, uz, bz, 0,
    -(rx * basis.x + ry * basis.y + rz * basis.z),
    -(ux * basis.x + uy * basis.y + uz * basis.z),
    -(bx * basis.x + by * basis.y + bz * basis.z),
    1,
  ]);

  const f = (2 * basis.focal) / basis.height;
  const aspect = basis.width / basis.height;
  const cxShift = (2 * basis.cx) / basis.width - 1;
  const cyShift = 1 - (2 * basis.cy) / basis.height;
  const nf = 1 / (near - far);
  const proj = new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    -cxShift, -cyShift, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);

  return { view, proj, viewProj: mulMat4(proj, view), cxShift, cyShift, tanHalfFovY: basis.height / (2 * basis.focal), aspect };
}

function buildOrthoLightVP(centerX, centerY, centerZ, sunDir, radius = 620) {
  const lx = sunDir[0], ly = sunDir[1], lz = sunDir[2];
  const dist = radius * 1.65;
  const ex = centerX + lx * dist;
  const ey = centerY + ly * dist;
  const ez = centerZ + lz * dist;
  const fx = -lx, fy = -ly, fz = -lz;
  const ref = Math.abs(fy) < 0.92 ? [0, 1, 0] : [1, 0, 0];
  let rx = ref[1] * fz - ref[2] * fy;
  let ry = ref[2] * fx - ref[0] * fz;
  let rz = ref[0] * fy - ref[1] * fx;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl; ry /= rl; rz /= rl;
  const ux = fy * rz - fz * ry;
  const uy = fz * rx - fx * rz;
  const uz = fx * ry - fy * rx;
  const bx = -fx, by = -fy, bz = -fz;

  const view = new Float32Array([
    rx, ux, bx, 0,
    ry, uy, by, 0,
    rz, uz, bz, 0,
    -(rx * ex + ry * ey + rz * ez),
    -(ux * ex + uy * ey + uz * ez),
    -(bx * ex + by * ey + bz * ez),
    1,
  ]);

  const l = -radius, r = radius, b = -radius, t = radius, n = 10, f = radius * 3.8;
  const ortho = new Float32Array([
    2 / (r - l), 0, 0, 0,
    0, 2 / (t - b), 0, 0,
    0, 0, -2 / (f - n), 0,
    -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1,
  ]);
  return mulMat4(ortho, view);
}

function sunDirFromPreset(preset) {
  const el = preset.sunElevation;
  const az = preset.sunAzimuth;
  const cosE = Math.cos(el);
  return [Math.sin(az) * cosE, Math.sin(el), Math.cos(az) * cosE];
}

export function createWebGL2Renderer(glCanvas) {
  let gl = null;
  try {
    gl = glCanvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      depth: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    }) || glCanvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: true,
      preserveDrawingBuffer: true,
    });
  } catch {
    return null;
  }
  if (!gl || gl.isContextLost()) return null;

  let skyProg, shadowProg, oceanProg, worldProg, fxProg;
  try {
    skyProg = compileProgram(gl, SKY_VS, SKY_FS);
    shadowProg = compileProgram(gl, SHADOW_VS, SHADOW_FS);
    oceanProg = compileProgram(gl, OCEAN_VS, OCEAN_FS);
    worldProg = compileProgram(gl, WORLD_VS, WORLD_FS);
    fxProg = compileProgram(gl, FX_VS, FX_FS);
  } catch {
    return null;
  }

  // Empty VAO for fullscreen sky triangle
  const emptyVao = gl.createVertexArray();

  // Dynamic FX buffer (pos3 + rgba4 = 7 floats)
  const fxVao = gl.createVertexArray();
  const fxVbo = gl.createBuffer();
  gl.bindVertexArray(fxVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, fxVbo);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
  gl.bindVertexArray(null);

  // 2048x2048 Directional Shadow Map Framebuffer
  const shadowTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, shadowTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SHADOW_SIZE, SHADOW_SIZE, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const shadowFbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return null;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // Shared procedural meshes
  const oceanMesh = buildOceanGrid(gl, 84);
  const approachRingMesh = buildTargetRingMesh(gl, '#ff9829', true);
  const wayRingMesh = buildTargetRingMesh(gl, '#3dd9a8', false);
  const windsockMesh = buildWindsockMesh(gl);
  const sackMesh = buildParachuteSackMesh(gl);
  const cockpitMesh = buildCockpit3DMesh(gl);
  const hangarBayMesh = buildHangarBayMesh(gl);

  let cachedSeed = null;
  let worldMesh = null;
  let islandUniforms = new Float32Array(64);
  let islandCount = 0;

  // Cached aircraft meshes keyed by flaps/highlight signature
  const aircraftCache = new Map();
  function getAircraftMesh(key, opts) {
    if (!aircraftCache.has(key)) {
      if (aircraftCache.size > 12) {
        const first = aircraftCache.keys().next().value;
        const old = aircraftCache.get(first);
        gl.deleteVertexArray(old.vao);
        gl.deleteBuffer(old.vbo);
        gl.deleteBuffer(old.ebo);
        aircraftCache.delete(first);
      }
      aircraftCache.set(key, buildAircraftMesh(gl, opts));
    }
    return aircraftCache.get(key);
  }

  const papiCache = new Map();
  function getPapiMesh(states) {
    const key = states.join(',');
    if (!papiCache.has(key)) {
      papiCache.set(key, buildPapiLightsMesh(gl, states));
    }
    return papiCache.get(key);
  }

  function ensureWorldBuilt(world) {
    if (cachedSeed === world.seed && worldMesh) return;
    if (worldMesh) {
      gl.deleteVertexArray(worldMesh.vao);
      gl.deleteBuffer(worldMesh.vbo);
      gl.deleteBuffer(worldMesh.ebo);
    }
    worldMesh = buildWorldStaticMesh(gl, world);
    cachedSeed = world.seed;
    islandCount = Math.min(16, world.islands.length);
    for (let i = 0; i < islandCount; i++) {
      const isl = world.islands[i];
      islandUniforms[i * 4 + 0] = isl.x;
      islandUniforms[i * 4 + 1] = isl.z;
      islandUniforms[i * 4 + 2] = isl.radius;
      islandUniforms[i * 4 + 3] = i;
    }
  }

  function drawMesh(mesh, prog, modelMat, setNormal = true) {
    gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'uModel'), false, modelMat);
    if (setNormal) {
      gl.uniformMatrix3fv(gl.getUniformLocation(prog, 'uNormalMat'), false, normalMat3FromModel(modelMat));
    }
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);
  }

  function drawFxVerts(verts, viewProj, modelMat, camPos, fogDensity, additive = false) {
    if (!verts || verts.length === 0) return;
    gl.useProgram(fxProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(fxProg, 'uViewProj'), false, viewProj);
    gl.uniformMatrix4fv(gl.getUniformLocation(fxProg, 'uModel'), false, modelMat);
    gl.uniform3f(gl.getUniformLocation(fxProg, 'uCamPos'), camPos[0], camPos[1], camPos[2]);
    gl.uniform1f(gl.getUniformLocation(fxProg, 'uFogDensity'), fogDensity);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.bindVertexArray(fxVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, fxVbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, verts.length / 7);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  function buildWingtipRibbonVerts(plane, hasAlbatross = false) {
    if (!plane.trail || plane.trail.length < 3) return null;
    const verts = [];
    const push = (x, y, z, r, g, b, a) => verts.push(x, y, z, r, g, b, a);
    const n = plane.trail.length;
    const spanHalf = hasAlbatross ? 9.6 : 8.8;
    const tipLocalY = hasAlbatross ? 3.38 : 2.76;
    for (const side of [-1, 1]) {
      for (let i = 0; i < n - 1; i++) {
        const a = plane.trail[i];
        const b = plane.trail[i + 1];
        const t0 = i / (n - 1);
        const t1 = (i + 1) / (n - 1);
        const tipPt = (st, offY) => {
          const cr = Math.cos(st.roll), sr = Math.sin(st.roll);
          const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw);
          const rx = cy * cr, ry = -sr, rz = -sy * cr;
          const ux = cy * sr, uy = cr, uz = -sy * sr;
          const span = spanHalf * side;
          return [
            st.x + rx * span + ux * (tipLocalY + offY),
            st.y + ry * span + uy * (tipLocalY + offY),
            st.z + rz * span + uz * (tipLocalY + offY),
          ];
        };
        const w0 = 0.05 + (1 - t0) * 0.16;
        const w1 = 0.05 + (1 - t1) * 0.16;
        const a0 = Math.pow(t0, 2.0) * 0.34;
        const a1 = Math.pow(t1, 2.0) * 0.34;
        const p0u = tipPt(a, w0), p0d = tipPt(a, -w0);
        const p1u = tipPt(b, w1), p1d = tipPt(b, -w1);
        push(...p0u, 1.0, 0.94, 0.84, a0);
        push(...p0d, 1.0, 0.94, 0.84, a0);
        push(...p1u, 1.0, 0.94, 0.84, a1);
        push(...p0d, 1.0, 0.94, 0.84, a0);
        push(...p1d, 1.0, 0.94, 0.84, a1);
        push(...p1u, 1.0, 0.94, 0.84, a1);
      }
    }
    return new Float32Array(verts);
  }

  function buildLighthouseBeamsVerts(world, time, isStorm) {
    const verts = [];
    const push = (x, y, z, r, g, b, a) => verts.push(x, y, z, r, g, b, a);
    const beamLen = isStorm ? 270 : 230;
    const beamHalfW = 24;
    const alphaNear = isStorm ? 0.28 : 0.19;
    for (const lh of world.lighthouses) {
      // Sweep cleanly out across the coastal approach bay (never backward into mountain!)
      const ang = lh.phase + Math.sin(time * 0.45) * 0.32;
      const dx = Math.sin(ang), dz = Math.cos(ang);
      const px = Math.cos(ang), pz = -Math.sin(ang);
      const ly = lh.y + lh.height - 4.5;
      const tipX = lh.x + dx * beamLen;
      const tipZ = lh.z + dz * beamLen;
      const tipY = ly - 16;
      push(lh.x, ly, lh.z, 1.0, 0.88, 0.52, alphaNear);
      push(tipX - px * beamHalfW, tipY, tipZ - pz * beamHalfW, 1.0, 0.86, 0.48, 0.0);
      push(tipX + px * beamHalfW, tipY, tipZ + pz * beamHalfW, 1.0, 0.86, 0.48, 0.0);

      push(lh.x, ly, lh.z, 1.0, 0.88, 0.52, alphaNear * 0.75);
      push(tipX, tipY + beamHalfW * 0.65, tipZ, 1.0, 0.86, 0.48, 0.0);
      push(tipX, tipY - beamHalfW * 0.65, tipZ, 1.0, 0.86, 0.48, 0.0);
    }
    return new Float32Array(verts);
  }

  function buildThermalRibbonsVerts(weather) {
    if (!weather.thermals || weather.thermals.length === 0) return null;
    const verts = [];
    const push = (x, y, z, r, g, b, a) => verts.push(x, y, z, r, g, b, a);
    for (const th of weather.thermals) {
      for (let h = 24; h < Math.min(240, th.topY); h += 24) {
        const a0 = weather.time * 1.4 + th.phase + h * 0.04;
        const a1 = a0 + 0.55;
        const r = th.radius * 0.45;
        const x0 = th.x + Math.cos(a0) * r, z0 = th.z + Math.sin(a0) * r;
        const x1 = th.x + Math.cos(a1) * r, z1 = th.z + Math.sin(a1) * r;
        push(x0, h, z0, 1.0, 0.85, 0.45, 0.22);
        push(x0, h + 7, z0, 1.0, 0.92, 0.65, 0.05);
        push(x1, h + 9, z1, 1.0, 0.85, 0.45, 0.22);
      }
    }
    return new Float32Array(verts);
  }

  function renderSkyPass(basis, vpInfo, weather, sunDir) {
    const p = weather.preset;
    const isStorm = p.rainIntensity > 0.5 ? 1.0 : 0.0;
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(skyProg);
    gl.uniform3f(gl.getUniformLocation(skyProg, 'uCamFwd'), basis.fwdX, basis.fwdY, basis.fwdZ);
    gl.uniform3f(gl.getUniformLocation(skyProg, 'uCamRight'), basis.rightX, basis.rightY, basis.rightZ);
    gl.uniform3f(gl.getUniformLocation(skyProg, 'uCamUp'), basis.upX, basis.upY, basis.upZ);
    gl.uniform2f(gl.getUniformLocation(skyProg, 'uFovScale'), vpInfo.tanHalfFovY * vpInfo.aspect, vpInfo.tanHalfFovY);
    gl.uniform2f(gl.getUniformLocation(skyProg, 'uCenterOffset'), vpInfo.cxShift, vpInfo.cyShift);
    gl.uniform3fv(gl.getUniformLocation(skyProg, 'uSunDir'), sunDir);
    gl.uniform3fv(gl.getUniformLocation(skyProg, 'uSkyTop'), hexToRgb(p.skyTop));
    gl.uniform3fv(gl.getUniformLocation(skyProg, 'uSkyMid'), hexToRgb(p.skyMid));
    gl.uniform3fv(gl.getUniformLocation(skyProg, 'uSkyHorizon'), hexToRgb(p.skyHorizon));
    gl.uniform3fv(gl.getUniformLocation(skyProg, 'uSunColor'), hexToRgb(p.sunColor));
    gl.uniform1f(gl.getUniformLocation(skyProg, 'uTime'), weather.time || 0);
    gl.uniform1f(gl.getUniformLocation(skyProg, 'uStorm'), isStorm);
    gl.uniform1f(gl.getUniformLocation(skyProg, 'uLightning'), weather.lightningFlash || 0);
    gl.uniform1f(gl.getUniformLocation(skyProg, 'uLightningX'), weather.lightningBoltX || 0.72);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
  }

  function bindWorldUniforms(prog, basis, viewProj, lightVP, weather, sunDir, disableFog = 0) {
    const p = weather.preset;
    const isStorm = p.rainIntensity > 0.5 ? 1.0 : 0.0;
    gl.useProgram(prog);
    gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'uViewProj'), false, viewProj);
    gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'uLightVP'), false, lightVP);
    gl.uniform3f(gl.getUniformLocation(prog, 'uCamPos'), basis.x, basis.y, basis.z);
    gl.uniform3fv(gl.getUniformLocation(prog, 'uSunDir'), sunDir);
    gl.uniform3fv(gl.getUniformLocation(prog, 'uSunColor'), hexToRgb(p.sunColor));
    gl.uniform3fv(gl.getUniformLocation(prog, 'uSkyTop'), hexToRgb(p.skyTop));
    gl.uniform3fv(gl.getUniformLocation(prog, 'uSkyHorizon'), hexToRgb(p.skyHorizon));
    gl.uniform3fv(gl.getUniformLocation(prog, 'uFogColor'), hexToRgb(p.fogColor));
    gl.uniform1f(gl.getUniformLocation(prog, 'uFogDensity'), p.fogDensity);
    gl.uniform1f(gl.getUniformLocation(prog, 'uStorm'), isStorm);
    gl.uniform1f(gl.getUniformLocation(prog, 'uLightning'), weather.lightningFlash || 0);
    gl.uniform1f(gl.getUniformLocation(prog, 'uDisableFog'), disableFog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);
    gl.uniform1i(gl.getUniformLocation(prog, 'uShadowMap'), 0);
  }

  function renderOceanPass(basis, viewProj, lightVP, weather, sunDir) {
    const p = weather.preset;
    const isStorm = p.rainIntensity > 0.5 ? 1.0 : 0.0;
    gl.useProgram(oceanProg);
    gl.uniform3f(gl.getUniformLocation(oceanProg, 'uCamPos'), basis.x, basis.y, basis.z);
    gl.uniformMatrix4fv(gl.getUniformLocation(oceanProg, 'uViewProj'), false, viewProj);
    gl.uniformMatrix4fv(gl.getUniformLocation(oceanProg, 'uLightVP'), false, lightVP);
    gl.uniform1f(gl.getUniformLocation(oceanProg, 'uTime'), weather.time || 0);
    gl.uniform1f(gl.getUniformLocation(oceanProg, 'uStorm'), isStorm);
    gl.uniform1f(gl.getUniformLocation(oceanProg, 'uLightning'), weather.lightningFlash || 0);
    gl.uniform3fv(gl.getUniformLocation(oceanProg, 'uSunDir'), sunDir);
    gl.uniform3fv(gl.getUniformLocation(oceanProg, 'uSunColor'), hexToRgb(p.sunColor));
    gl.uniform3fv(gl.getUniformLocation(oceanProg, 'uOceanDeep'), hexToRgb(p.oceanDeep));
    gl.uniform3fv(gl.getUniformLocation(oceanProg, 'uOceanShallow'), isStorm ? hexToRgb('#1f5768') : hexToRgb('#2aa5a4'));
    gl.uniform3fv(gl.getUniformLocation(oceanProg, 'uFogColor'), hexToRgb(p.fogColor));
    gl.uniform3fv(gl.getUniformLocation(oceanProg, 'uSkyHorizon'), hexToRgb(p.skyHorizon));
    gl.uniform3fv(gl.getUniformLocation(oceanProg, 'uSkyTop'), hexToRgb(p.skyTop));
    gl.uniform1f(gl.getUniformLocation(oceanProg, 'uFogDensity'), p.fogDensity);
    gl.uniform4fv(gl.getUniformLocation(oceanProg, 'uIslands'), islandUniforms);
    gl.uniform1i(gl.getUniformLocation(oceanProg, 'uIslandCount'), islandCount);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);
    gl.uniform1i(gl.getUniformLocation(oceanProg, 'uShadowMap'), 0);
    gl.bindVertexArray(oceanMesh.vao);
    gl.drawElements(gl.TRIANGLES, oceanMesh.indexCount, gl.UNSIGNED_INT, 0);
  }

  function renderWorldWebGL(state, width, height) {
    const { world, weather, plane, mission, camera } = state;
    ensureWorldBuilt(world);

    const basis = buildCameraBasis(camera, width, height);
    const vpInfo = buildViewProjFromBasis(basis, 0.55, 10000);
    const sunDir = sunDirFromPreset(weather.preset);
    const idMat = identityMat4();

    // Pick aircraft mesh reflecting live flaps & installed visual refits
    const refits = (state.campaign && state.campaign.refits) || [];
    const aKey = `f${plane.flapsDeg}_a${Math.round(plane.aileronDeflect * 2)}_r${refits.includes('twin-supercharger') ? 1 : 0}${refits.includes('albatross-tips') ? 1 : 0}${refits.includes('storm-radar') ? 1 : 0}`;
    const planeMesh = getAircraftMesh(aKey, {
      flapsDeg: plane.flapsDeg,
      aileron: plane.aileronDeflect,
      rudder: plane.rudderDeflect,
      elevator: plane.elevatorDeflect,
      refits,
    });
    const planeMat = buildAircraftModelMat4(plane);

    // 1) 2048x2048 Directional Shadow Map Pass centered ahead of plane
    const focusX = plane.x + Math.sin(plane.yaw) * 180;
    const focusZ = plane.z + Math.cos(plane.yaw) * 180;
    const lightVP = buildOrthoLightVP(focusX, plane.y * 0.4, focusZ, sunDir, 680);

    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
    gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2.0, 4.0);
    gl.useProgram(shadowProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(shadowProg, 'uLightVP'), false, lightVP);
    drawMesh(worldMesh, shadowProg, idMat, false);
    if (camera.mode !== 'cockpit') {
      drawMesh(planeMesh, shadowProg, planeMat, false);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // 2) Main Viewport Pass
    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    gl.clearColor(0.06, 0.12, 0.18, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.CULL_FACE);

    // Sky Dome + Volumetric Clouds + Storm Lightning
    renderSkyPass(basis, vpInfo, weather, sunDir);

    // Fresnel Glittering Ocean with Turquoise Coastal Shallows & Surf Foam
    gl.enable(gl.DEPTH_TEST);
    renderOceanPass(basis, vpInfo.viewProj, lightVP, weather, sunDir);

    // Sculpted Archipelago Terrain, Runways, Lighthouses, Hangars, Piers, Boats, Pines
    bindWorldUniforms(worldProg, basis, vpInfo.viewProj, lightVP, weather, sunDir, 0.0);
    drawMesh(worldMesh, worldProg, idMat, true);

    // Dynamic PAPI lights & animated Windsock at every runway
    const windRad = ((weather.windDirDeg + 180) * Math.PI) / 180;
    const wCos = Math.cos(windRad), wSin = Math.sin(windRad);
    for (const rwy of world.runways) {
      const papiStates = computePapiLights(plane, rwy);
      const papiMesh = getPapiMesh(papiStates);
      const px = rwy.x - rwy.dirX * (rwy.length * 0.5 - 58) - rwy.rightX * (rwy.width * 0.5 + 30);
      const pz = rwy.z - rwy.dirZ * (rwy.length * 0.5 - 58) - rwy.rightZ * (rwy.width * 0.5 + 30);
      const pMat = makeBasisModelMat4(px, rwy.y, pz, rwy.rightX, 0, rwy.rightZ, 0, 1, 0, rwy.dirX, 0, rwy.dirZ, 1.0);
      drawMesh(papiMesh, worldProg, pMat, true);

      // Animated windsock beside right side of runway threshold
      const sx = rwy.x - rwy.dirX * (rwy.length * 0.5 - 24) + rwy.rightX * (rwy.width * 0.5 + 16);
      const sz = rwy.z - rwy.dirZ * (rwy.length * 0.5 - 24) + rwy.rightZ * (rwy.width * 0.5 + 16);
      const sMat = makeBasisModelMat4(sx, rwy.y, sz, wCos, 0, -wSin, 0, 1, 0, wSin, 0, wCos, 1.0);
      drawMesh(windsockMesh, worldProg, sMat, true);
    }

    // Glowing 3D Torus Target Rings
    if (mission && mission.rings) {
      for (const ring of mission.rings) {
        if (ring.cleared) continue;
        const rCos = Math.cos(ring.yaw), rSin = Math.sin(ring.yaw);
        const rMat = makeBasisModelMat4(ring.x, ring.y, ring.z, rCos, 0, -rSin, 0, 1, 0, rSin, 0, rCos, ring.radius);
        drawMesh(ring.kind === 'approach' ? approachRingMesh : wayRingMesh, worldProg, rMat, true);
      }
      // Falling 3D Parachute Mail Sacks
      for (const sack of mission.activeSacks || []) {
        const sMat = makeBasisModelMat4(sack.x, sack.y, sack.z, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1.0);
        drawMesh(sackMesh, worldProg, sMat, true);
      }
    }

    // Translucent Volumetric World FX: Lighthouse Beams, Thermal Ribbons, Wingtip Vortices
    const camArr = [basis.x, basis.y, basis.z];
    const beams = buildLighthouseBeamsVerts(world, weather.time || 0, weather.preset.rainIntensity > 0.5);
    drawFxVerts(beams, vpInfo.viewProj, idMat, camArr, weather.preset.fogDensity, true);
    const thermals = buildThermalRibbonsVerts(weather);
    if (thermals) drawFxVerts(thermals, vpInfo.viewProj, idMat, camArr, weather.preset.fogDensity, true);

    if (camera.mode === 'cockpit') {
      // True 3D perspective cockpit interior (skip distance fog, clear depth slightly for clean cockpit framing)
      gl.clear(gl.DEPTH_BUFFER_BIT);
      bindWorldUniforms(worldProg, basis, vpInfo.viewProj, lightVP, weather, sunDir, 1.0);
      drawMesh(cockpitMesh, worldProg, planeMat, true);
      const glassVerts = buildCockpitGlassFxVerts(plane.propAngle || 0);
      drawFxVerts(glassVerts, vpInfo.viewProj, planeMat, camArr, 0.0, false);
    } else {
      // Chase / Title Hero Sculpted 3D Aircraft + Spinning Blurred Prop Discs + Wingtip Vortices
      const ribbon = buildWingtipRibbonVerts(plane, refits.includes('albatross-tips'));
      if (ribbon) drawFxVerts(ribbon, vpInfo.viewProj, idMat, camArr, weather.preset.fogDensity, false);
      bindWorldUniforms(worldProg, basis, vpInfo.viewProj, lightVP, weather, sunDir, 0.0);
      drawMesh(planeMesh, worldProg, planeMat, true);
      const props = buildPropellerFxVerts(plane.propAngle || 0, plane.boosting);
      drawFxVerts(props, vpInfo.viewProj, planeMat, camArr, weather.preset.fogDensity, false);
    }
  }

  function renderHangarWebGL(state, width, height) {
    // Live 3D Waterfront Timber Seaplane Dock over open turquoise bay overlooking Amber Channel!
    const { world, weather, hangar, campaign } = state;
    ensureWorldBuilt(world);
    const selectedChoice = hangar && hangar.choices ? hangar.choices[hangar.selectedIndex || 0] : null;
    const highlightZone = selectedChoice ? selectedChoice.set : null;
    const owned = (campaign && campaign.refits) || [];

    const isl = world.islands[Math.min(world.islands.length - 1, Math.max(0, (campaign ? campaign.sortieIndex : 5) - 1))];
    // Anchor waterfront slipway cleanly out over open bay water (ZERO colliding mountain or foliage!)
    const baseX = isl.x - 160;
    const baseY = 2.8;
    const baseZ = isl.z - isl.radius - 290;
    const yawPlane = 0.62; // Hero 3/4 front-starboard angle catching golden sunset rim-light!

    // Aim camera directly at plane center from crisp 3/4 dock vantage with balanced top & bottom breathing margin!
    const camX = baseX + 20.6;
    const camY = baseY + 6.8;
    const camZ = baseZ + 20.6;
    const lookX = baseX - 0.5;
    const lookY = baseY + 1.9;
    const lookZ = baseZ;
    const dx = lookX - camX;
    const dy = lookY - camY;
    const dz = lookZ - camZ;
    const horiz = Math.hypot(dx, dz);

    const cam = {
      mode: 'chase',
      x: camX,
      y: camY,
      z: camZ,
      yaw: Math.atan2(dx, dz),
      pitch: Math.atan2(dy, horiz),
      roll: 0,
      fovDeg: 40,
    };
    const basis = buildCameraBasis(cam, width, height);
    basis.cx = width * 0.35;
    basis.cy = height * 0.285;
    const vpInfo = buildViewProjFromBasis(basis, 0.5, 9500);
    const sunDir = [0.68, 0.24, -0.68];

    const key = `hangar_p_${highlightZone || 'none'}_${owned.length}`;
    const planeMesh = getAircraftMesh(key, {
      flapsDeg: 15,
      aileron: 0,
      refits: owned,
      highlightZone,
      parkedProps: true,
    });
    const pMat = makeBasisModelMat4(
      baseX, baseY + 1.18, baseZ,
      Math.cos(yawPlane), 0, -Math.sin(yawPlane),
      0, 1, 0,
      Math.sin(yawPlane), 0, Math.cos(yawPlane),
      1.05,
    );
    const hMat = makeBasisModelMat4(
      baseX, baseY + 1.18, baseZ,
      Math.cos(yawPlane), 0, -Math.sin(yawPlane),
      0, 1, 0,
      Math.sin(yawPlane), 0, Math.cos(yawPlane),
      1.05,
    );

    const lightVP = buildOrthoLightVP(baseX, baseY, baseZ, sunDir, 65);
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
    gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2.0, 4.0);
    gl.useProgram(shadowProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(shadowProg, 'uLightVP'), false, lightVP);
    drawMesh(hangarBayMesh, shadowProg, hMat, false);
    drawMesh(planeMesh, shadowProg, pMat, false);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.CULL_FACE);

    renderSkyPass(basis, vpInfo, weather, sunDir);
    gl.enable(gl.DEPTH_TEST);
    renderOceanPass(basis, vpInfo.viewProj, lightVP, weather, sunDir);
    bindWorldUniforms(worldProg, basis, vpInfo.viewProj, lightVP, weather, sunDir, 0.0);
    drawMesh(worldMesh, worldProg, identityMat4(), true);
    bindWorldUniforms(worldProg, basis, vpInfo.viewProj, lightVP, weather, sunDir, 1.0);
    drawMesh(hangarBayMesh, worldProg, hMat, true);
    drawMesh(planeMesh, worldProg, pMat, true);

    // Project BOTH twin nacelles and pick the right-most closer one so leader line NEVER crosses the tail fin!
    const candidates =
      highlightZone === 'turbocharger' ? [[-2.85, 3.0, 2.35], [2.85, 3.0, 2.35]] :
      highlightZone === 'glider' ? [[-8.2, 3.0, 0.7], [8.2, 3.0, 0.7]] :
      [[0.0, 3.2, 0.4]];
    const cosY = Math.cos(yawPlane), sinY = Math.sin(yawPlane);
    let best = null;
    for (const loc of candidates) {
      const wx = baseX + (loc[0] * cosY + loc[2] * sinY) * 1.05;
      const wy = baseY + 1.18 + loc[1] * 1.05;
      const wz = baseZ + (-loc[0] * sinY + loc[2] * cosY) * 1.05;
      const p = projectPoint(basis, wx, wy, wz);
      if (p && (!best || p.sx > best.sx)) best = p;
    }
    return best ? { sx: best.sx, sy: best.sy } : { sx: width * 0.46, sy: height * 0.24 };
  }

  function renderDebriefWebGL(state, width, height) {
    // Live 3D Imperial Harbor Golden-Hour Sunset vista framing parked Aero-7 Pelican cleanly in upper hero showcase!
    const { world, weather, campaign } = state;
    ensureWorldBuilt(world);
    const rwy = world.islands[world.islands.length - 1].runway;
    const px = rwy.x - rwy.dirX * 145;
    const py = rwy.y + 1.12;
    const pz = rwy.z - rwy.dirZ * 145;
    const yawP = rwy.headingRad - 0.55;

    const camX = px + Math.sin(yawP + 0.65) * 30;
    const camY = py + 7.2;
    const camZ = pz + Math.cos(yawP + 0.65) * 30;
    const dx = px - camX, dy = (py + 1.8) - camY, dz = pz - camZ;

    const cam = {
      mode: 'chase',
      x: camX,
      y: camY,
      z: camZ,
      yaw: Math.atan2(dx, dz),
      pitch: Math.atan2(dy, Math.hypot(dx, dz)),
      roll: 0,
      fovDeg: 48,
    };
    const basis = buildCameraBasis(cam, width, height);
    basis.cx = width * 0.72;
    basis.cy = height * 0.25;
    const vpInfo = buildViewProjFromBasis(basis, 0.6, 10000);
    const sunDir = sunDirFromPreset(weather.preset);
    const lightVP = buildOrthoLightVP(px, py, pz, sunDir, 420);

    const owned = (campaign && campaign.refits) || [];
    const planeMesh = getAircraftMesh(`debrief_p_${owned.length}`, { flapsDeg: 35, refits: owned, parkedProps: true });
    const pMat = makeBasisModelMat4(
      px, py, pz,
      Math.cos(yawP), 0, -Math.sin(yawP),
      0, 1, 0,
      Math.sin(yawP), 0, Math.cos(yawP),
      1.0,
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
    gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2.0, 4.0);
    gl.useProgram(shadowProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(shadowProg, 'uLightVP'), false, lightVP);
    drawMesh(worldMesh, shadowProg, identityMat4(), false);
    drawMesh(planeMesh, shadowProg, pMat, false);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.CULL_FACE);

    renderSkyPass(basis, vpInfo, weather, sunDir);
    gl.enable(gl.DEPTH_TEST);
    renderOceanPass(basis, vpInfo.viewProj, lightVP, weather, sunDir);
    bindWorldUniforms(worldProg, basis, vpInfo.viewProj, lightVP, weather, sunDir, 0.0);
    drawMesh(worldMesh, worldProg, identityMat4(), true);
    drawMesh(planeMesh, worldProg, pMat, true);
  }

  return {
    renderWorldWebGL,
    renderHangarWebGL,
    renderDebriefWebGL,
  };
}
