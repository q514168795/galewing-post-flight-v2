// SPDX-License-Identifier: MIT
// Dynamic 3/4 high-chase camera, first-person lit cockpit camera, and 3D perspective projection.

import { lerp, wrapAngleRad } from './random.js';

export function createCameraState(plane) {
  return {
    mode: 'chase', // 'chase' | 'cockpit'
    x: plane.x - Math.sin(plane.yaw) * 34 - Math.cos(plane.yaw) * 5.2,
    y: plane.y + 11.2,
    z: plane.z - Math.cos(plane.yaw) * 34 + Math.sin(plane.yaw) * 5.2,
    yaw: plane.yaw + 0.055,
    pitch: plane.pitch * 0.45 - 0.11,
    roll: plane.roll * 0.16,
    fovDeg: 60,
  };
}

export function snapCameraToPlane(cam, plane) {
  if (cam.mode === 'cockpit') {
    const cosP = Math.cos(plane.pitch);
    const sinP = Math.sin(plane.pitch);
    const sinY = Math.sin(plane.yaw);
    const cosY = Math.cos(plane.yaw);
    const fwdX = sinY * cosP;
    const fwdY = sinP;
    const fwdZ = cosY * cosP;
    const r0x = cosY;
    const r0z = -sinY;
    const u0x = -sinY * sinP;
    const u0y = cosP;
    const u0z = -cosY * sinP;
    const cr = Math.cos(plane.roll);
    const sr = Math.sin(plane.roll);
    // Aircraft-local UP vector so cockpit eye stays locked symmetrically on cockpit centerline during bank!
    const upX = u0x * cr + r0x * sr;
    const upY = u0y * cr;
    const upZ = u0z * cr + r0z * sr;
    cam.x = plane.x + fwdX * 2.2 + upX * 1.85;
    cam.y = plane.y + fwdY * 2.2 + upY * 1.85;
    cam.z = plane.z + fwdZ * 2.2 + upZ * 1.85;
    cam.yaw = plane.yaw;
    cam.pitch = plane.pitch - 0.03;
    cam.roll = plane.roll;
    cam.fovDeg = 64;
    return;
  }
  const dist = 33;
  const sideOffset = -5.4;
  cam.x = plane.x - Math.sin(plane.yaw) * dist + Math.cos(plane.yaw) * sideOffset;
  cam.y = plane.y + 10.6 - Math.sin(plane.pitch) * 11;
  cam.z = plane.z - Math.cos(plane.yaw) * dist - Math.sin(plane.yaw) * sideOffset;
  cam.yaw = wrapAngleRad(plane.yaw + 0.048);
  cam.pitch = plane.pitch * 0.4 - 0.115;
  cam.roll = plane.roll * 0.12;
  cam.fovDeg = 60;
}

export function updateCamera(cam, plane, weather, dt) {
  const blend = 1 - Math.exp(-dt * 7.2);
  if (cam.mode === 'cockpit') {
    const cosP = Math.cos(plane.pitch);
    const sinP = Math.sin(plane.pitch);
    const sinY = Math.sin(plane.yaw);
    const cosY = Math.cos(plane.yaw);
    const fwdX = sinY * cosP;
    const fwdY = sinP;
    const fwdZ = cosY * cosP;
    const r0x = cosY;
    const r0z = -sinY;
    const u0x = -sinY * sinP;
    const u0y = cosP;
    const u0z = -cosY * sinP;
    const cr = Math.cos(plane.roll);
    const sr = Math.sin(plane.roll);
    const upX = u0x * cr + r0x * sr;
    const upY = u0y * cr;
    const upZ = u0z * cr + r0z * sr;
    const shake = (plane.stalling ? 0.01 : 0) + weather.preset.turbulence * 0.004;
    const jitterY = Math.sin(weather.time * 24) * shake;
    const jitterR = Math.cos(weather.time * 19) * shake;
    cam.x = plane.x + fwdX * 2.2 + upX * (1.85 + jitterY);
    cam.y = plane.y + fwdY * 2.2 + upY * (1.85 + jitterY);
    cam.z = plane.z + fwdZ * 2.2 + upZ * (1.85 + jitterY);
    cam.yaw = plane.yaw;
    cam.pitch = plane.pitch - 0.03 + jitterY * 0.45;
    cam.roll = plane.roll + jitterR;
    cam.fovDeg = 64;
    return;
  }

  const dist = 33 + Math.max(0, (plane.speedKts - 95) * 0.07);
  const sideOffset = -5.2 - plane.roll * 3.8;
  const yawDiff = wrapAngleRad(plane.yaw + 0.045 - cam.yaw);
  cam.yaw = wrapAngleRad(cam.yaw + yawDiff * blend);

  const targetX = plane.x - Math.sin(plane.yaw) * dist + Math.cos(plane.yaw) * sideOffset;
  const targetY = Math.max(6, plane.y + 10.6 - Math.sin(plane.pitch) * 10);
  const targetZ = plane.z - Math.cos(plane.yaw) * dist - Math.sin(plane.yaw) * sideOffset;

  cam.x = lerp(cam.x, targetX, blend);
  cam.y = lerp(cam.y, targetY, blend);
  cam.z = lerp(cam.z, targetZ, blend);
  cam.pitch = lerp(cam.pitch, plane.pitch * 0.4 - 0.115, blend);
  cam.roll = lerp(cam.roll, plane.roll * 0.16, blend);
  cam.fovDeg = 60;
}

export function buildCameraBasis(cam, width, height) {
  const cosP = Math.cos(cam.pitch);
  const sinP = Math.sin(cam.pitch);
  const sinY = Math.sin(cam.yaw);
  const cosY = Math.cos(cam.yaw);

  const fwdX = sinY * cosP;
  const fwdY = sinP;
  const fwdZ = cosY * cosP;

  const right0X = cosY;
  const right0Y = 0;
  const right0Z = -sinY;

  const up0X = -sinY * sinP;
  const up0Y = cosP;
  const up0Z = -cosY * sinP;

  const cosR = Math.cos(cam.roll);
  const sinR = Math.sin(cam.roll);

  const rightX = right0X * cosR - up0X * sinR;
  const rightY = right0Y * cosR - up0Y * sinR;
  const rightZ = right0Z * cosR - up0Z * sinR;

  const upX = up0X * cosR + right0X * sinR;
  const upY = up0Y * cosR + right0Y * sinR;
  const upZ = up0Z * cosR + right0Z * sinR;

  const focal = (height * 0.5) / Math.tan(((cam.fovDeg * Math.PI) / 180) * 0.5);
  const cx = width * 0.5;
  const cy = cam.mode === 'cockpit' ? height * 0.42 : height * 0.45;

  return {
    x: cam.x,
    y: cam.y,
    z: cam.z,
    fwdX, fwdY, fwdZ,
    rightX, rightY, rightZ,
    upX, upY, upZ,
    focal,
    cx,
    cy,
    width,
    height,
  };
}

export function projectPoint(basis, wx, wy, wz) {
  const dx = wx - basis.x;
  const dy = wy - basis.y;
  const dz = wz - basis.z;

  const z = dx * basis.fwdX + dy * basis.fwdY + dz * basis.fwdZ;
  if (z <= 1.2) return null;

  const rx = dx * basis.rightX + dy * basis.rightY + dz * basis.rightZ;
  const ry = dx * basis.upX + dy * basis.upY + dz * basis.upZ;

  const invZ = basis.focal / z;
  return {
    sx: basis.cx + rx * invZ,
    sy: basis.cy - ry * invZ,
    z,
    scale: invZ,
  };
}

export function projectRingPoints(basis, cx, cy, cz, radius, yaw, segments = 28) {
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const px = cx + rightX * Math.cos(a) * radius;
    const py = cy + Math.sin(a) * radius;
    const pz = cz + rightZ * Math.cos(a) * radius;
    const p = projectPoint(basis, px, py, pz);
    if (!p) return null;
    pts.push(p);
  }
  return pts;
}
