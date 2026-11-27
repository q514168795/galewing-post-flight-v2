// SPDX-License-Identifier: MIT
// Keyboard (event.code) and HiDPI-calibrated mouse yoke / UI click input controller.

import { BASE_HEIGHT, BASE_WIDTH } from './config.js';
import { clamp } from './random.js';

export function createInputController(canvas, actions) {
  const held = new Set();
  const pointer = {
    x: BASE_WIDTH * 0.5,
    y: BASE_HEIGHT * 0.5,
    down: false,
    yokeActive: false,
  };
  const buttons = [];

  function toCanvasCoords(event) {
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / BASE_WIDTH || 1;
    const scaleX = canvas.width / Math.max(1, rect.width) / dpr;
    const scaleY = canvas.height / Math.max(1, rect.height) / dpr;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    held.add(e.code);
    if (actions.onKeyPress) actions.onKeyPress(e.code, e);
  }

  function onKeyUp(e) {
    held.delete(e.code);
  }

  function onPointerMove(e) {
    const pt = toCanvasCoords(e);
    pointer.x = pt.x;
    pointer.y = pt.y;
  }

  function onPointerDown(e) {
    const pt = toCanvasCoords(e);
    pointer.x = pt.x;
    pointer.y = pt.y;
    pointer.down = true;
    for (const btn of buttons) {
      if (pt.x >= btn.x && pt.x <= btn.x + btn.w && pt.y >= btn.y && pt.y <= btn.y + btn.h) {
        if (btn.onClick) btn.onClick();
        return;
      }
    }
    if (actions.onCanvasClick) actions.onCanvasClick(pt.x, pt.y, e.button);
  }

  function onPointerUp() {
    pointer.down = false;
  }

  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);

  return {
    held,
    pointer,
    clearButtons() {
      buttons.length = 0;
    },
    registerButton(rect) {
      buttons.push(rect);
    },
    toggleMouseYoke() {
      pointer.yokeActive = !pointer.yokeActive;
      return pointer.yokeActive;
    },
    sampleFlightControls() {
      let pitch = 0;
      let roll = 0;
      let yaw = 0;
      let throttleDelta = 0;

      // Aviation convention: W pitches nose DOWN (push stick), S pitches nose UP (pull stick)
      if (held.has('KeyS')) pitch += 1;
      if (held.has('KeyW')) pitch -= 1;
      if (held.has('KeyD') || held.has('ArrowRight')) roll += 1;
      if (held.has('KeyA') || held.has('ArrowLeft')) roll -= 1;
      if (held.has('KeyE')) yaw += 1;
      if (held.has('KeyQ')) yaw -= 1;
      if (held.has('ArrowUp') || held.has('Equal')) throttleDelta += 1;
      if (held.has('ArrowDown') || held.has('Minus')) throttleDelta -= 1;

      if (pointer.yokeActive || pointer.down) {
        const nx = clamp((pointer.x - BASE_WIDTH * 0.5) / (BASE_WIDTH * 0.32), -1, 1);
        const ny = clamp((pointer.y - BASE_HEIGHT * 0.45) / (BASE_HEIGHT * 0.32), -1, 1);
        if (Math.abs(nx) > 0.08) roll = clamp(roll + nx, -1, 1);
        if (Math.abs(ny) > 0.08) pitch = clamp(pitch + ny, -1, 1);
      }

      const boost = held.has('ShiftLeft') || held.has('ShiftRight');
      return { pitch, roll, yaw, throttleDelta, boost };
    },
  };
}
