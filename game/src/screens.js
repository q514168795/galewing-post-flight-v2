// SPDX-License-Identifier: MIT
// Live-3D-backed Title Logbook, Waterfront Hangar Refit Bay (with 3D blueprint callouts) & Imperial Harbor Debrief.

import { AIRCRAFT_NAME, GAME_SUBTITLE, GAME_TITLE, KEY_LEGEND } from './config.js';
import { clamp } from './random.js';
import { FEAT_CATALOG } from './feats.js';
import { SORTIE_DEFS } from './missions.js';
import { countSetPieces, previewSetBonus, SYNERGY_SETS } from './refits.js';
import { drawFooterStrip } from './hud.js';

const RARITY_STYLES = {
  COMMON: { bg: '#2f4959', fg: '#dcecf5', bd: '#7ea2b8' },
  RARE: { bg: '#a36814', fg: '#fff4d1', bd: '#f5c256' },
  EPIC: { bg: '#a6261e', fg: '#ffe9a6', bd: '#ffb84d' },
};

const REFIT_STAT_PILLS = {
  'twin-supercharger': ['+16% MAX THRUST', '+20% CLIMB ACCEL'],
  'copper-manifold': ['-28% BOOST FUEL', 'LONGER WEP BURN'],
  'brass-props': ['+10 KTS CRUISE', '+6% BASE THRUST'],
  'aux-wing-tank': ['+25% FUEL CAP', 'OCEAN RANGE'],
  'oil-cooler': ['-18% FUEL BURN', 'ALL THROTTLES'],
  'nitro-primer': ['+24% BOOST THRUST', '+150 RING PTS'],
  'slotted-flaps': ['+30% FLAP LIFT', 'STOL STRIPS'],
  'albatross-tips': ['-25% INDUCED DRAG', '+22% GLIDE RATIO'],
  'thermal-vario': ['+35% THERMAL LIFT', 'CALDERA CLIMB'],
  'oleo-struts': ['+120 FPM CUSHION', 'SOFT TOUCHDOWN'],
  'spruce-ribs': ['+30 HULL HP', '-50% GUST WEAR'],
  'pelican-chines': ['-10 KTS STALL', '+10% SEA SKIM FUEL'],
  'gyro-compass': ['+18% ROLL & YAW', 'ALL AIRSPEEDS'],
  'drift-sight': ['+40% DROP RADIUS', '+400 BULLSEYE PTS'],
  'storm-radar': ['-30% CROSSWIND', 'SQUALL DAMPING'],
  'postmaster-seal': ['+25% POSTAGE GAIN', '-50 P REROLL COST'],
  'chart-folio': ['+22% RING RADIUS', '+1 FREE REROLL'],
  'night-collimator': ['+20% ALL SCORES', '+12s LEG CLOCK'],
};

function drawStampCardPath(ctx, x, y, w, h) {
  const teeth = 18;
  const step = w / teeth;
  const amp = 3.5;
  ctx.beginPath();
  ctx.moveTo(x, y + amp);
  for (let i = 0; i < teeth; i++) {
    ctx.lineTo(x + (i + 0.5) * step, y);
    ctx.lineTo(x + (i + 1) * step, y + amp);
  }
  ctx.lineTo(x + w, y + h - amp);
  for (let i = teeth; i > 0; i--) {
    ctx.lineTo(x + (i - 0.5) * step, y + h);
    ctx.lineTo(x + (i - 1) * step, y + h - amp);
  }
  ctx.closePath();
}

function drawRefitIcon(ctx, icon, cx, cy, r, fg = '#fff8ea') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = fg;
  ctx.fillStyle = fg;
  ctx.lineWidth = Math.max(1.8, r * 0.11);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (icon) {
    case 'turbo':
      ctx.beginPath();
      ctx.arc(-r * 0.08, r * 0.06, r * 0.52, 0, Math.PI * 1.65);
      ctx.lineTo(r * 0.62, -r * 0.46);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-r * 0.08, r * 0.06, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'pontoon':
      ctx.beginPath();
      ctx.moveTo(-r * 0.66, -r * 0.08);
      ctx.lineTo(r * 0.66, -r * 0.08);
      ctx.lineTo(r * 0.42, r * 0.24);
      ctx.lineTo(-r * 0.54, r * 0.24);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffd46b';
      ctx.beginPath();
      ctx.moveTo(-r * 0.64, r * 0.44);
      ctx.quadraticCurveTo(0, r * 0.24, r * 0.64, r * 0.44);
      ctx.stroke();
      break;
    case 'stamp':
      ctx.strokeRect(-r * 0.52, -r * 0.44, r * 1.04, r * 0.88);
      ctx.beginPath();
      ctx.moveTo(-r * 0.42, -r * 0.26);
      ctx.lineTo(0, r * 0.12);
      ctx.lineTo(r * 0.42, -r * 0.26);
      ctx.stroke();
      break;
    case 'gullwing':
      ctx.beginPath();
      ctx.moveTo(-r * 0.66, -r * 0.2);
      ctx.quadraticCurveTo(-r * 0.25, r * 0.35, 0, r * 0.05);
      ctx.quadraticCurveTo(r * 0.25, r * 0.35, r * 0.66, -r * 0.2);
      ctx.stroke();
      break;
    case 'flap':
      ctx.beginPath();
      ctx.moveTo(-r * 0.65, 0);
      ctx.quadraticCurveTo(-r * 0.1, -r * 0.42, r * 0.3, -r * 0.05);
      ctx.lineTo(-r * 0.55, r * 0.16);
      ctx.closePath();
      ctx.stroke();
      ctx.strokeStyle = '#ffd46b';
      ctx.beginPath();
      ctx.moveTo(r * 0.34, 0);
      ctx.lineTo(r * 0.68, r * 0.38);
      ctx.stroke();
      break;
    case 'radar':
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.moveTo(0, 0); ctx.lineTo(r * 0.4, -r * 0.36);
      ctx.stroke();
      break;
    case 'map':
      ctx.strokeRect(-r * 0.54, -r * 0.42, r * 1.08, r * 0.84);
      ctx.beginPath();
      ctx.moveTo(-r * 0.36, r * 0.2);
      ctx.quadraticCurveTo(0, -r * 0.26, r * 0.38, -r * 0.1);
      ctx.stroke();
      break;
    default:
      ctx.beginPath();
      ctx.moveTo(-r * 0.58, 0);
      ctx.lineTo(0, -r * 0.38);
      ctx.lineTo(r * 0.58, 0);
      ctx.lineTo(0, r * 0.38);
      ctx.closePath();
      ctx.stroke();
      break;
  }
  ctx.restore();
}

function drawFeatGlyph(ctx, icon, cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#fff7e0';
  ctx.fillStyle = '#fff7e0';
  ctx.lineWidth = 2.1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (icon === 'feather' || icon === 'wings') {
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, r * 0.35);
    ctx.quadraticCurveTo(0, -r * 0.55, r * 0.58, -r * 0.32);
    ctx.quadraticCurveTo(r * 0.15, r * 0.22, -r * 0.55, r * 0.35);
    ctx.stroke();
  } else if (icon === 'bolt') {
    ctx.beginPath();
    ctx.moveTo(r * 0.14, -r * 0.58);
    ctx.lineTo(-r * 0.3, r * 0.04);
    ctx.lineTo(r * 0.04, r * 0.04);
    ctx.lineTo(-r * 0.14, r * 0.58);
    ctx.lineTo(r * 0.34, -r * 0.06);
    ctx.lineTo(-r * 0.02, -r * 0.06);
    ctx.closePath();
    ctx.fill();
  } else if (icon === 'parachute') {
    // Crisp concentric bullseye target + crosshair (unmistakably Bullseye Mail, never a lightbulb!)
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.56, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, 0); ctx.lineTo(-r * 0.4, 0);
    ctx.moveTo(r * 0.4, 0); ctx.lineTo(r * 0.7, 0);
    ctx.moveTo(0, -r * 0.7); ctx.lineTo(0, -r * 0.4);
    ctx.moveTo(0, r * 0.4); ctx.lineTo(0, r * 0.7);
    ctx.stroke();
  } else if (icon === 'thermal') {
    // Rising upward thermal arrows (vertical updraft columns, never sideways Wi-Fi arcs!)
    for (const ox of [-r * 0.28, r * 0.28]) {
      ctx.beginPath();
      ctx.moveTo(ox, r * 0.5);
      ctx.quadraticCurveTo(ox - 4, 0, ox, -r * 0.48);
      ctx.moveTo(ox - 4.5, -r * 0.24);
      ctx.lineTo(ox, -r * 0.52);
      ctx.lineTo(ox + 4.5, -r * 0.24);
      ctx.stroke();
    }
  } else if (icon === 'gauge') {
    ctx.beginPath();
    ctx.arc(0, r * 0.12, r * 0.48, Math.PI * 0.85, Math.PI * 2.15);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, r * 0.12);
    ctx.lineTo(r * 0.32, -r * 0.22);
    ctx.stroke();
  } else {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 === 0 ? r * 0.56 : r * 0.24;
      const a = -Math.PI * 0.5 + (i * Math.PI) / 5;
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function renderTitleScreen(ctx, state, input, width, height) {
  input.clearButtons();
  ctx.save();
  const scrim = ctx.createLinearGradient(0, 0, width * 0.58, 0);
  scrim.addColorStop(0, 'rgba(9, 19, 27, 0.84)');
  scrim.addColorStop(0.75, 'rgba(9, 19, 27, 0.52)');
  scrim.addColorStop(1, 'rgba(9, 19, 27, 0)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#efae38';
  ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
  ctx.fillText(`AIRMAIL AVIATION SERVICE · ${GAME_SUBTITLE}`, 52, 92);

  ctx.fillStyle = '#fff5d9';
  ctx.font = 'bold 54px "Trebuchet MS", sans-serif';
  ctx.fillText(GAME_TITLE, 48, 154);

  ctx.fillStyle = '#c8dde6';
  ctx.font = '600 15px "Trebuchet MS", sans-serif';
  ctx.fillText(`Pilot the ${AIRCRAFT_NAME} across 7 sunlit & storm-swept island sorties.`, 52, 190);
  ctx.fillText('Thread 3D rings, drop mail sacks, ride volcanic thermals & grease STOL landings.', 52, 214);

  ctx.fillStyle = '#ffd46b';
  ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
  ctx.fillText('SELECT PILOT LOGBOOK SLOT [1 / 2 / 3]', 52, 266);

  for (let i = 0; i < 3; i++) {
    const slot = state.logbookSlots[i];
    const sy = 282 + i * 68;
    const sel = state.selectedSlot === i;
    ctx.fillStyle = sel ? 'rgba(25, 52, 68, 0.92)' : 'rgba(12, 24, 34, 0.78)';
    ctx.strokeStyle = sel ? '#ffd46b' : '#3a5768';
    ctx.lineWidth = sel ? 2.2 : 1.2;
    ctx.beginPath();
    ctx.roundRect(52, sy, 396, 56, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = sel ? '#ffd46b' : '#b7ced9';
    ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
    ctx.fillText(
      `${slot && slot.callsign ? slot.callsign : `SLOT ${i + 1}`} · ${slot && slot.bestScore ? `GRADE ${slot.bestGrade} · ${slot.bestScore.toLocaleString()} PTS` : 'NEW DISPATCH LOGBOOK'}`,
      68,
      sy + 24,
    );
    ctx.fillStyle = '#97b4c4';
    ctx.font = '600 11px "Trebuchet MS", sans-serif';
    ctx.fillText(
      slot && slot.bestScore ? `SORTIES ${slot.sorties}/7 · MEDALS ${slot.feats}/16 · SEED #${slot.seed}` : '7 SORTIES · 18 HANGAR REFITS · 16 PILOT MEDALS',
      68,
      sy + 43,
    );

    const idx = i;
    input.registerButton({ x: 52, y: sy, w: 396, h: 56, onClick: () => state.actions.selectSlot(idx) });
  }

  const bx = 52, by = 508, bw = 276, bh = 54;
  ctx.fillStyle = '#d9442e';
  ctx.strokeStyle = '#ffd46b';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff8e6';
  ctx.font = 'bold 17px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LAUNCH CAMPAIGN [ENTER]', bx + bw * 0.5, by + bh * 0.5 + 1);
  input.registerButton({ x: bx, y: by, w: bw, h: bh, onClick: () => state.actions.startCampaign() });

  ctx.restore();
  drawFooterStrip(ctx, KEY_LEGEND, width, height);
}

export function renderHangarScreen(ctx, state, input, width, height, planeAnchor = null) {
  input.clearButtons();
  const { campaign, hangar } = state;
  const choices = hangar.choices;
  const owned = campaign.refits;
  const counts = countSetPieces(owned);
  const nextDef = SORTIE_DEFS[Math.min(SORTIE_DEFS.length - 1, campaign.sortieIndex)];
  const selChoice = choices[hangar.selectedIndex] || choices[0];

  // Unified disciplined outer grid (padX = 36 across header, divider, cards & bottom synergy panel!)
  const padX = 36;
  const innerW = width - padX * 2;
  const deckY = 342;

  ctx.save();

  // Crisp bottom scrim starting tightly at deckY so the live 3D sunlit seaplane & bay stay vivid!
  const bgGrad = ctx.createLinearGradient(0, deckY - 18, 0, height);
  bgGrad.addColorStop(0, 'rgba(9, 19, 28, 0.0)');
  bgGrad.addColorStop(0.08, 'rgba(9, 19, 28, 0.92)');
  bgGrad.addColorStop(1, 'rgba(8, 16, 24, 0.98)');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, deckY - 18, width, height - deckY + 18);

  ctx.strokeStyle = 'rgba(216, 155, 50, 0.65)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(padX, deckY);
  ctx.lineTo(width - padX, deckY);
  ctx.stroke();

  // 1. Sleek Top Dark-Glass Header (strictly non-overlapping columns, zero PEL collision!)
  ctx.fillStyle = 'rgba(10, 20, 29, 0.88)';
  ctx.strokeStyle = 'rgba(216, 155, 50, 0.58)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(padX, 12, innerW, 58, 10);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd46b';
  ctx.font = 'bold 17px "Trebuchet MS", sans-serif';
  ctx.fillText('HANGAR REFIT BAY', padX + 16, 34);
  ctx.fillStyle = '#b4cedb';
  ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
  ctx.fillText(`${nextDef.code} · DRIFTER → ${nextDef.shortTo}`, padX + 16, 54);

  // 8-Island Route Stepper with ample clearance on both sides
  const stops = ['PEL', 'COR', 'BCN', 'SQL', 'SOL', 'DRF', 'AMB', 'IMP'];
  const rx0 = padX + 278;
  const rx1 = padX + 706;
  const ry = 34;
  ctx.strokeStyle = '#3b5868';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(rx0, ry);
  ctx.lineTo(rx1, ry);
  ctx.stroke();
  const doneFrac = clamp(campaign.sortieIndex / (stops.length - 1), 0, 1);
  ctx.strokeStyle = '#efae38';
  ctx.beginPath();
  ctx.moveTo(rx0, ry);
  ctx.lineTo(rx0 + (rx1 - rx0) * doneFrac, ry);
  ctx.stroke();
  for (let i = 0; i < stops.length; i++) {
    const sx = rx0 + ((rx1 - rx0) * i) / (stops.length - 1);
    const done = i < campaign.sortieIndex;
    const curr = i === campaign.sortieIndex;
    ctx.fillStyle = curr ? '#ff6442' : done ? '#ffd46b' : '#1b3140';
    ctx.strokeStyle = curr ? '#fff7e0' : done ? '#ffd46b' : '#58788a';
    ctx.lineWidth = curr ? 2.2 : 1.3;
    ctx.beginPath();
    ctx.arc(sx, ry, curr ? 6.5 : 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = curr ? '#ffd46b' : done ? '#dcecf4' : '#7b99a8';
    ctx.font = `bold ${curr ? 10 : 9}px "Trebuchet MS", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(stops[i], sx, ry + 18);
  }

  // Compact Next Leg Forecast Box (no wasted dead space)
  const hazX = padX + 738;
  ctx.fillStyle = 'rgba(20, 42, 55, 0.90)';
  ctx.strokeStyle = '#48a9b3';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(hazX, 19, 186, 44, 7);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7bf0f0';
  ctx.font = 'bold 9.5px "Trebuchet MS", sans-serif';
  ctx.fillText('NEXT LEG FORECAST', hazX + 10, 34);
  ctx.fillStyle = '#fff5d9';
  ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
  const windHint = nextDef.weather === 'monsoon' ? '28KT SQUALL' : nextDef.weather === 'volcanicDusk' ? '19KT · THERMALS' : '15KT · THERMALS';
  ctx.fillText(`${windHint} · ${nextDef.dropsCount} DROPS`, hazX + 10, 52);

  // Postage Economy & Reroll Button (consistent "240 P" / "150 P" spacing!)
  const ecoX = padX + 942;
  ctx.fillStyle = '#ffd46b';
  ctx.font = 'bold 9.5px "Trebuchet MS", sans-serif';
  ctx.fillText('POSTAGE', ecoX, 33);
  ctx.fillStyle = '#fff7e0';
  ctx.font = 'bold 17px "Trebuchet MS", sans-serif';
  ctx.fillText(`${campaign.postage.toLocaleString()} P`, ecoX, 54);

  const rrCost = hangar.freeRerolls > 0 ? 0 : hangar.rerollCost;
  const canReroll = campaign.postage >= rrCost;
  const rbw = 148, rbh = 40;
  const rbx = width - padX - rbw - 12, rby = 21;
  ctx.fillStyle = canReroll ? '#1a3444' : '#121d24';
  ctx.strokeStyle = canReroll ? '#ffd46b' : '#425966';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(rbx, rby, rbw, rbh, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = canReroll ? '#ffd46b' : '#6c8594';
  ctx.font = 'bold 11.5px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(rrCost === 0 ? 'FREE REROLL [X]' : `REROLL [X] · ${rrCost} P`, rbx + rbw * 0.5, rby + rbh * 0.5);
  if (canReroll) {
    input.registerButton({ x: rbx, y: rby, w: rbw, h: rbh, onClick: () => state.actions.rerollHangar() });
  }

  // 2. Clean Elbowed Blueprint Callout locked directly onto closer 3D Engine Nacelle (ZERO tail-crossing!)
  if (selChoice) {
    const ax = planeAnchor ? clamp(planeAnchor.sx, 360, 740) : 560;
    const ay = planeAnchor ? clamp(planeAnchor.sy, 118, 280) : 200;
    const setMeta = SYNERGY_SETS[selChoice.set];

    // Compact 136px-tall Stat Preview Box (zero bottom empty black dead space!)
    const bx = width - padX - 344;
    const by = 92;
    const bw = 344;
    const bh = 136;

    // Clean elbowed blueprint leader routing UP-AND-RIGHT clear of wings & tail!
    const elbowX = ax + 24;
    const elbowY = by + 26;
    ctx.strokeStyle = 'rgba(8, 16, 23, 0.88)';
    ctx.lineWidth = 4.6;
    ctx.beginPath();
    ctx.moveTo(ax, ay - 14);
    ctx.lineTo(elbowX, elbowY);
    ctx.lineTo(bx, elbowY);
    ctx.stroke();

    ctx.strokeStyle = '#ffd46b';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(ax, ay - 14);
    ctx.lineTo(elbowX, elbowY);
    ctx.lineTo(bx, elbowY);
    ctx.stroke();

    // Crisp blueprint crosshair reticle right on the glowing 3D nacelle!
    ctx.fillStyle = 'rgba(255, 212, 107, 0.16)';
    ctx.strokeStyle = '#ffd46b';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(ax, ay, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ax - 19, ay); ctx.lineTo(ax - 9, ay);
    ctx.moveTo(ax + 9, ay); ctx.lineTo(ax + 19, ay);
    ctx.moveTo(ax, ay - 19); ctx.lineTo(ax, ay - 9);
    ctx.moveTo(ax, ay + 9); ctx.lineTo(ax, ay + 19);
    ctx.stroke();

    ctx.fillStyle = 'rgba(10, 21, 30, 0.94)';
    ctx.strokeStyle = '#ffd46b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 9);
    ctx.fill();
    ctx.stroke();

    const zoneTitle =
      selChoice.set === 'turbocharger' ? 'MOUNT: TWIN ENGINE NACELLES' :
      selChoice.set === 'glider' ? 'MOUNT: HIGH PARASOL WINGTIPS' :
      'MOUNT: DORSAL AVIONICS MAST';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffc166';
    ctx.font = 'bold 10px "Trebuchet MS", sans-serif';
    ctx.fillText(zoneTitle, bx + 14, by + 20);
    ctx.fillStyle = '#fff5d9';
    ctx.font = 'bold 14.5px "Trebuchet MS", sans-serif';
    ctx.fillText(`PREVIEW: ${selChoice.name}`, bx + 14, by + 40);

    const mods = state.refitMods || {};
    const nextMods = selChoice.mods || {};
    const setBonusThrust = selChoice.set === 'turbocharger' && counts.turbocharger === 1 ? 12 : 0;
    const setBonusGlide = selChoice.set === 'glider' && counts.glider === 1 ? 14 : 0;
    const setBonusAgil = selChoice.set === 'avionics' && counts.avionics === 1 ? 18 : 0;
    const stats = [
      { lbl: 'THRUST', cur: Math.round((mods.thrustMult || 1) * 100), add: Math.round((nextMods.thrustMult || 0) * 100), bonus: setBonusThrust },
      { lbl: 'GLIDE', cur: Math.round(100 + (mods.dragSave || 0) * 100 + (mods.flapLiftBonus || 0) * 50), add: Math.round((nextMods.dragSave || 0) * 100 + (nextMods.flapLiftBonus || 0) * 50), bonus: setBonusGlide },
      { lbl: 'AGILITY', cur: Math.round(100 + (mods.agilityBonus || 0) * 100 + (mods.stabilitySave || 0) * 60), add: Math.round((nextMods.agilityBonus || 0) * 100 + (nextMods.stabilitySave || 0) * 60 + (nextMods.ringRadiusBonus || 0) * 60), bonus: setBonusAgil },
    ];
    const sharedMax = 180;
    let sy = by + 62;
    for (const s of stats) {
      const totAdd = s.add + s.bonus;
      ctx.fillStyle = '#a8c3d4';
      ctx.font = 'bold 10px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(s.lbl, bx + 14, sy);
      ctx.textAlign = 'right';
      if (totAdd > 0) {
        // Distinct base (muted) vs new total (bright mint green)
        ctx.fillStyle = '#68eba8';
        ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
        ctx.fillText(`${s.cur + totAdd}%`, bx + bw - 14, sy);
        ctx.fillStyle = '#9bb8c7';
        ctx.font = 'bold 10px "Trebuchet MS", sans-serif';
        ctx.fillText(`${s.cur}% ▸`, bx + bw - 54, sy);
      } else {
        ctx.fillStyle = '#dcebf2';
        ctx.font = 'bold 10.5px "Trebuchet MS", sans-serif';
        ctx.fillText(`${s.cur}%`, bx + bw - 14, sy);
      }

      const barX = bx + 70, barW = 152, barY = sy - 8;
      ctx.fillStyle = '#142736';
      ctx.fillRect(barX, barY, barW, 8);
      const curW = barW * clamp(s.cur / sharedMax, 0, 1);
      ctx.fillStyle = '#3ea8b3';
      ctx.fillRect(barX, barY, curW, 8);
      if (s.add > 0) {
        const addW = barW * clamp((s.cur + s.add) / sharedMax, 0, 1) - curW;
        ctx.fillStyle = '#68eba8';
        ctx.fillRect(barX + curW, barY, Math.max(3, addW), 8);
      }
      if (s.bonus > 0) {
        const bStart = barW * clamp((s.cur + s.add) / sharedMax, 0, 1);
        const bW = barW * clamp((s.cur + s.add + s.bonus) / sharedMax, 0, 1) - bStart;
        ctx.fillStyle = '#ffd46b';
        ctx.fillRect(barX + bStart, barY, Math.max(3, bW), 8);
      }
      sy += 22;
    }
    // Crisp inline bar legend at bottom of preview box
    ctx.textAlign = 'left';
    ctx.fillStyle = '#68eba8';
    ctx.font = 'bold 9px "Trebuchet MS", sans-serif';
    ctx.fillText('■ CARD BONUS', bx + 14, by + bh - 8);
    ctx.fillStyle = '#ffd46b';
    ctx.fillText('■ 2-PC SET BONUS', bx + 112, by + bh - 8);
  }

  // 3. Three Crisp Vintage Airmail-Stamp Cards aligned flush to padX..width-padX!
  const cardGap = 22;
  const cardW = (innerW - cardGap * 2) / 3;
  const cardH = 212;
  const cardY = 356;

  for (let i = 0; i < choices.length; i++) {
    const ch = choices[i];
    const setDef = SYNERGY_SETS[ch.set];
    const rar = RARITY_STYLES[ch.rarity] || RARITY_STYLES.COMMON;
    const isSel = i === hangar.selectedIndex;
    const cx = padX + i * (cardW + cardGap);
    const cy = isSel ? cardY - 4 : cardY;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.50)';
    drawStampCardPath(ctx, cx + 5, cy + 6, cardW, cardH);
    ctx.fill();

    ctx.fillStyle = isSel ? '#fdf8ec' : '#ece2cc';
    drawStampCardPath(ctx, cx, cy, cardW, cardH);
    ctx.fill();
    ctx.strokeStyle = isSel ? '#ffd46b' : '#586d7a';
    ctx.lineWidth = isSel ? 3.0 : 1.5;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(23, 35, 44, 0.16)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx + 10, cy + 12, cardW - 20, cardH - 24);

    ctx.fillStyle = setDef.color;
    ctx.fillRect(cx + 10, cy + 12, cardW - 20, 28);
    ctx.fillStyle = '#fff7e0';
    ctx.font = 'bold 11.5px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(setDef.name, cx + 20, cy + 26);

    // Distinct Rarity Pill (COMMON slate / RARE gold / EPIC crimson — zero category color collision!)
    ctx.fillStyle = rar.bg;
    ctx.strokeStyle = rar.bd;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(cx + cardW - 84, cy + 16, 64, 20, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = rar.fg;
    ctx.font = 'bold 10px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(ch.rarity, cx + cardW - 52, cy + 26.5);

    const iconX = cx + 56;
    const iconY = cy + 88;
    ctx.fillStyle = setDef.color;
    ctx.strokeStyle = '#17232c';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(iconX, iconY, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    drawRefitIcon(ctx, ch.icon, iconX, iconY, 24, '#fff8ea');

    ctx.textAlign = 'left';
    ctx.fillStyle = '#11222e';
    ctx.font = 'bold 16px "Trebuchet MS", sans-serif';
    ctx.fillText(ch.name, cx + 98, cy + 64);

    const pills = REFIT_STAT_PILLS[ch.id] || [ch.desc.slice(0, 22)];
    let py = cy + 80;
    for (const pillTxt of pills) {
      ctx.fillStyle = '#172d3c';
      ctx.beginPath();
      ctx.roundRect(cx + 98, py, cardW - 116, 22, 4);
      ctx.fill();
      ctx.fillStyle = '#ffd46b';
      ctx.font = 'bold 11.5px "Trebuchet MS", sans-serif';
      ctx.fillText(`▸  ${pillTxt}`, cx + 106, py + 11.5);
      py += 25;
    }

    const unlockTxt = previewSetBonus(owned, ch);
    const nextCnt = counts[ch.set] + 1;
    ctx.fillStyle = unlockTxt ? setDef.color : '#dfd0b0';
    ctx.beginPath();
    ctx.roundRect(cx + 18, cy + 138, cardW - 36, 23, 5);
    ctx.fill();
    ctx.fillStyle = unlockTxt ? '#fff7e0' : '#2f4552';
    ctx.font = 'bold 10.5px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(unlockTxt || `SET PROGRESS ${nextCnt}/3 · BONUS AT 2 PC`, cx + cardW * 0.5, cy + 150);

    // Clear positive confirm button on selected card (warm gold-amber vs slate — zero red/orange clash!)
    const bY = cy + 169;
    ctx.fillStyle = isSel ? '#efae38' : '#172d3c';
    ctx.strokeStyle = isSel ? '#11222e' : '#3a5768';
    ctx.lineWidth = isSel ? 2 : 1.2;
    ctx.beginPath();
    ctx.roundRect(cx + 18, bY, cardW - 36, 30, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = isSel ? '#0f1f2b' : '#dcecf4';
    ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
    ctx.fillText(isSel ? `★ CONFIRM INSTALL [${i + 1}] · [ENTER]` : `SELECT [${i + 1}]`, cx + cardW * 0.5, bY + 15.5);

    ctx.restore();
    const idx = i;
    input.registerButton({
      x: cx,
      y: cy,
      w: cardW,
      h: cardH,
      onClick: () => {
        if (hangar.selectedIndex === idx) state.actions.pickRefit(idx);
        else hangar.selectedIndex = idx;
      },
    });
  }

  // 4. Balanced Bottom Set-Synergy Loadout Panel (trimmed excess bottom padding, crisp 100px height!)
  const trayY = 592;
  const trayH = 100;
  ctx.fillStyle = 'rgba(11, 24, 34, 0.96)';
  ctx.strokeStyle = 'rgba(216, 155, 50, 0.45)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(padX, trayY, innerW, trayH, 10);
  ctx.fill();
  ctx.stroke();

  const setsOrder = ['turbocharger', 'glider', 'avionics'];
  const colGap = 24;
  const colW = (innerW - 36 - colGap * 2) / 3;
  for (let s = 0; s < 3; s++) {
    const key = setsOrder[s];
    const meta = SYNERGY_SETS[key];
    const cnt = counts[key];
    const previewAdd = selChoice && selChoice.set === key ? 1 : 0;
    const x0 = padX + 18 + s * (colW + colGap);
    const y0 = trayY + 14;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = meta.light;
    ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
    ctx.fillText(meta.name, x0, y0 + 10);
    ctx.textAlign = 'right';
    ctx.fillStyle = previewAdd ? '#ffd46b' : '#dcecf4';
    ctx.fillText(previewAdd ? `${cnt} → ${Math.min(3, cnt + 1)} / 3 SET` : `${Math.min(3, cnt)} / 3 SET`, x0 + colW, y0 + 10);

    // 3-Piece Synergy Progress Bar with visible unfilled track & crisp 2 PC notch!
    const pbX = x0;
    const pbY = y0 + 20;
    const pbW = colW;
    const pbH = 11;
    ctx.fillStyle = '#193142';
    ctx.beginPath();
    ctx.roundRect(pbX, pbY, pbW, pbH, 4);
    ctx.fill();
    ctx.fillStyle = meta.color;
    ctx.beginPath();
    ctx.roundRect(pbX, pbY, pbW * clamp(cnt / 3, 0, 1), pbH, 4);
    ctx.fill();
    if (previewAdd && cnt < 3) {
      ctx.fillStyle = '#ffd46b';
      ctx.fillRect(pbX + pbW * (cnt / 3) + 1, pbY + 1, pbW * (1 / 3) - 2, pbH - 2);
    }
    ctx.strokeStyle = 'rgba(11, 24, 34, 0.9)';
    ctx.lineWidth = 2.0;
    for (const m of [1, 2]) {
      const mx = pbX + pbW * (m / 3);
      ctx.beginPath();
      ctx.moveTo(mx, pbY);
      ctx.lineTo(mx, pbY + pbH);
      ctx.stroke();
    }

    let byLine = pbY + 30;
    for (const bonus of meta.bonuses) {
      const active = cnt >= bonus.pieces;
      const unlocking = !active && cnt + previewAdd >= bonus.pieces;
      ctx.textAlign = 'left';
      ctx.fillStyle = active ? '#68eba8' : unlocking ? '#ffd46b' : '#9bb4c4';
      ctx.font = `bold ${active || unlocking ? 11 : 10.5}px "Trebuchet MS", sans-serif`;
      ctx.fillText(`${active ? '✓' : unlocking ? '★' : '○'} ${bonus.label}`, x0, byLine);
      byLine += 20;
    }
  }

  ctx.restore();
}

export function renderDebriefScreen(ctx, state, input, width, height) {
  input.clearButtons();
  const { campaign, debrief } = state;
  const last = debrief.lastLanding;

  ctx.save();

  // Gentle vignette keeping Imperial Harbor 3D sunset vista & parked Aero-7 Pelican framed cleanly!
  const vig = ctx.createRadialGradient(width * 0.65, height * 0.25, 160, width * 0.5, height * 0.5, width * 0.78);
  vig.addColorStop(0, 'rgba(9, 19, 28, 0.14)');
  vig.addColorStop(1, 'rgba(7, 15, 22, 0.76)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);

  // 1. Tier-1 Hero Top Header Banner (bright gold accent, includes SEED #1740 & highlighted Rank Pill!)
  ctx.fillStyle = 'rgba(11, 24, 34, 0.93)';
  ctx.strokeStyle = '#efae38';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(36, 18, width - 72, 64, 11);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd46b';
  ctx.font = 'bold 21px "Trebuchet MS", sans-serif';
  ctx.fillText('GALEWING POST · IMPERIAL HARBOR DEBRIEF', 56, 45);
  ctx.fillStyle = '#c8dde6';
  ctx.font = 'bold 11.5px "Trebuchet MS", sans-serif';
  ctx.fillText(`CAPT. M. VALE · ${AIRCRAFT_NAME} · 7/7 SORTIES · SEED #${campaign.seed}`, 56, 68);
  // Highlighted Master Rank Badge beside subtitle
  ctx.fillStyle = 'rgba(239, 174, 56, 0.20)';
  ctx.strokeStyle = '#efae38';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.roundRect(458, 54, 154, 20, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffd46b';
  ctx.font = 'bold 10.5px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MASTER AIRMAIL PILOT', 535, 68);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#a8c4d4';
  ctx.font = 'bold 10.5px "Trebuchet MS", sans-serif';
  ctx.fillText('CAMPAIGN TOTAL SCORE', width - 56, 38);
  ctx.fillStyle = '#68eba8';
  ctx.font = 'bold 29px "Trebuchet MS", sans-serif';
  ctx.fillText(campaign.totalScore.toLocaleString(), width - 56, 70);

  // 2. Left Column: Tier-1 Grade Medallion Card + Tier-2 Flight Summary + Action Buttons
  const lx = 36;
  const lw = 436;

  ctx.fillStyle = 'rgba(11, 24, 34, 0.94)';
  ctx.strokeStyle = '#efae38';
  ctx.lineWidth = 1.9;
  ctx.beginPath();
  ctx.roundRect(lx, 98, lw, 200, 11);
  ctx.fill();
  ctx.stroke();

  const gx = lx + 84;
  const gy = 188;
  ctx.fillStyle = '#efae38';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(gx + s * 40, gy - 10);
    ctx.lineTo(gx + s * 64, gy - 19);
    ctx.lineTo(gx + s * 57, gy - 5);
    ctx.lineTo(gx + s * 62, gy + 4);
    ctx.lineTo(gx + s * 40, gy + 12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#0c1b26';
  ctx.strokeStyle = '#ffd46b';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.arc(gx, gy, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffd46b';
  ctx.font = 'bold 10px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('GRADE', gx, gy - 20);
  ctx.font = 'bold 44px "Trebuchet MS", sans-serif';
  ctx.fillText(debrief.grade, gx, gy + 23);
  ctx.fillStyle = '#a8c4d4';
  ctx.font = 'bold 9.5px "Trebuchet MS", sans-serif';
  ctx.fillText('MASTER LANDING', gx, gy + 64);

  const tx = lx + 162;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#a8c4d4';
  ctx.font = 'bold 10.5px "Trebuchet MS", sans-serif';
  ctx.fillText('FINAL TOUCHDOWN TELEMETRY', tx, 124);
  if (last) {
    ctx.fillStyle = last.rating === 'GREASED' ? '#68eba8' : '#ffd46b';
    ctx.font = 'bold 21px "Trebuchet MS", sans-serif';
    ctx.fillText(`${last.fpm} FPM · ${last.rating}`, tx, 152);
    ctx.fillStyle = '#fff5d9';
    ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
    ctx.fillText(`${last.islandName.toUpperCase()} (${last.runwayCode})`, tx, 178);
    ctx.fillStyle = '#c8dde6';
    ctx.font = '600 12px "Trebuchet MS", sans-serif';
    ctx.fillText(`CENTERLINE: ${last.centerlinePct}% ALIGNED`, tx, 202);
    ctx.fillText(`TOUCHDOWN: ${last.touchSpeedKts} KTS · FLAPS ${last.flapsDeg}°`, tx, 224);

    // Rounded golden trophy accent strip (consistent rounded corners, never looks like a clickable button!)
    ctx.fillStyle = 'rgba(239, 174, 56, 0.14)';
    ctx.beginPath();
    ctx.roundRect(tx, 242, 250, 34, 7);
    ctx.fill();
    ctx.fillStyle = '#efae38';
    ctx.beginPath();
    ctx.roundRect(tx, 242, 5, 34, [7, 0, 0, 7]);
    ctx.fill();
    ctx.fillStyle = '#ffd46b';
    ctx.font = 'bold 12.5px "Trebuchet MS", sans-serif';
    ctx.fillText(`★ LANDING BONUS  +${last.bonus.toLocaleString()} PTS`, tx + 14, 263);
  } else {
    ctx.fillStyle = '#ff6452';
    ctx.font = 'bold 18px "Trebuchet MS", sans-serif';
    ctx.fillText(debrief.crashReason || 'SORTIE ABORTED', tx, 162);
  }

  // Tier-2 Major Panel: Campaign Flight Summary (consistent muted-gold border matching Map & Medals!)
  ctx.fillStyle = 'rgba(11, 24, 34, 0.94)';
  ctx.strokeStyle = 'rgba(216, 155, 50, 0.44)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(lx, 314, lw, 286, 11);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd46b';
  ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
  ctx.fillText('CAMPAIGN FLIGHT SUMMARY', lx + 18, 340);

  const kpis = [
    { lbl: 'SORTIES COMPLETED', val: `${campaign.completedSorties} / 7`, col: '#fff5d9' },
    { lbl: 'GREASED LANDINGS', val: `${campaign.stats.greasedLandings} / 7`, col: '#68eba8' },
    { lbl: 'PEAK RING STREAK', val: `${campaign.stats.bestStreak}×`, col: '#ff9f43' },
    { lbl: 'AIRMAIL BULLSEYES', val: `${campaign.stats.bullseyeDrops} / 3`, col: '#68eba8' },
    { lbl: 'FINAL FUEL · HULL', dual: [`${debrief.fuelPct}%`, `${debrief.hullPct}%`] },
    { lbl: 'REFITS INSTALLED', val: `${campaign.refits.length} / 18`, col: '#ffd46b' },
  ];
  for (let i = 0; i < kpis.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const kx = lx + 18 + col * 204;
    const ky = 356 + row * 76;
    ctx.fillStyle = 'rgba(20, 40, 53, 0.88)';
    ctx.strokeStyle = 'rgba(105, 145, 168, 0.36)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(kx, ky, 194, 64, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#a8c4d4';
    ctx.font = 'bold 10px "Trebuchet MS", sans-serif';
    ctx.fillText(kpis[i].lbl, kx + 12, ky + 20);
    if (kpis[i].dual) {
      ctx.fillStyle = '#ffd46b';
      ctx.font = 'bold 19px "Trebuchet MS", sans-serif';
      const w0 = ctx.measureText(kpis[i].dual[0]).width;
      ctx.fillText(kpis[i].dual[0], kx + 12, ky + 49);
      ctx.fillStyle = '#a8c4d4';
      ctx.fillText('·', kx + 12 + w0 + 8, ky + 49);
      ctx.fillStyle = '#68eba8';
      ctx.fillText(kpis[i].dual[1], kx + 12 + w0 + 22, ky + 49);
    } else {
      ctx.fillStyle = kpis[i].col;
      ctx.font = 'bold 20px "Trebuchet MS", sans-serif';
      ctx.fillText(kpis[i].val, kx + 12, ky + 49);
    }
  }

  // Bottom Left Action Buttons (cohesive borders + consistent hotkeys [R] / [S] / [ESC])
  const btnY = 618;
  const btns = [
    { x: lx, w: 162, bg: '#efae38', bd: '#ffd46b', fg: '#0c1b26', lbl: 'NEW SEED [R]', fn: () => state.actions.restartNewSeed() },
    { x: lx + 174, w: 152, bg: '#206f78', bd: '#64d2d9', fg: '#fff8e6', lbl: `REPLAY #${campaign.seed} [S]`, fn: () => state.actions.restartSameSeed() },
    { x: lx + 338, w: 98, bg: '#183140', bd: '#6e8fa3', fg: '#dcecf4', lbl: 'TITLE [ESC]', fn: () => state.actions.returnToTitle() },
  ];
  for (const b of btns) {
    ctx.fillStyle = b.bg;
    ctx.strokeStyle = b.bd;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(b.x, btnY, b.w, 52, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = b.fg;
    ctx.font = 'bold 12.5px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.lbl, b.x + b.w * 0.5, btnY + 26);
    input.registerButton({ x: b.x, y: btnY, w: b.w, h: 52, onClick: b.fn });
  }

  // 3. Right Top: Pristine Clipped Nautical Amber Archipelago Flight Route Chart (ZERO ring leak, ZERO bleed-through!)
  const rx = 492;
  const rw = width - rx - 36;
  ctx.fillStyle = 'rgba(9, 21, 31, 0.97)';
  ctx.strokeStyle = 'rgba(216, 155, 50, 0.44)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(rx, 98, rw, 286, 11);
  ctx.fill();
  ctx.stroke();

  // Strictly clip all map geometry & dashed range rings INSIDE the rounded panel bounds!
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(rx + 2, 100, rw - 4, 282, 10);
  ctx.clip();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffd46b';
  ctx.font = 'bold 13.5px "Trebuchet MS", sans-serif';
  ctx.fillText('AMBER ARCHIPELAGO NAUTICAL FLIGHT ROUTE', rx + 18, 124);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#7bf0f0';
  ctx.font = 'bold 10.5px "Trebuchet MS", sans-serif';
  ctx.fillText('● START   ', rx + rw - 178, 124);
  ctx.fillStyle = '#68eba8';
  ctx.fillText('● GREASED (6)   ', rx + rw - 82, 124);
  ctx.fillStyle = '#ff9f43';
  ctx.fillText('● FIRM (1)', rx + rw - 18, 124);

  // Subtle nautical depth rings (clipped cleanly inside panel!)
  ctx.strokeStyle = 'rgba(78, 148, 174, 0.14)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  for (const rad of [110, 210, 310]) {
    ctx.beginPath();
    ctx.arc(rx + rw * 0.5, 250, rad, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Ornate 4-Point Nautical Compass Rose tucked cleanly in bottom-right corner (ZERO label collision!)
  const crx = rx + rw - 46, cry = 344;
  ctx.strokeStyle = 'rgba(216, 155, 50, 0.36)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(crx, cry, 18, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 212, 107, 0.72)';
  ctx.beginPath();
  ctx.moveTo(crx, cry - 16); ctx.lineTo(crx + 4, cry); ctx.lineTo(crx, cry - 4); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(130, 190, 214, 0.45)';
  ctx.beginPath();
  ctx.moveTo(crx, cry - 16); ctx.lineTo(crx - 4, cry); ctx.lineTo(crx, cry + 16); ctx.lineTo(crx + 4, cry); ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(crx - 14, cry); ctx.lineTo(crx, cry - 3); ctx.lineTo(crx + 14, cry); ctx.lineTo(crx, cry + 3); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffd46b';
  ctx.font = 'bold 9px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', crx, cry - 20);
  ctx.fillStyle = 'rgba(168, 196, 212, 0.65)';
  ctx.font = 'bold 7.5px "Trebuchet MS", sans-serif';
  ctx.fillText('E', crx + 24, cry + 3);
  ctx.fillText('W', crx - 24, cry + 3);

  // Graceful sweeping archipelago curve (organic non-sawtooth nautical path!)
  const routeNodes = [
    { name: 'PELICAN', fx: 0.06, fy: 0.68, rx: 15, ry: 9, rot: 0.25, score: null, rating: null, above: false },
    { name: 'CORAL', fx: 0.17, fy: 0.48, rx: 12, ry: 10, rot: -0.4, score: 21400, rating: 'GREASED', above: true },
    { name: 'BEACON', fx: 0.30, fy: 0.34, rx: 11, ry: 8, rot: 0.5, score: 24900, rating: 'GREASED', above: true },
    { name: 'SQUALL', fx: 0.44, fy: 0.54, rx: 17, ry: 11, rot: -0.2, score: 26300, rating: 'FIRM', above: false },
    { name: 'MT SOLIS', fx: 0.57, fy: 0.66, rx: 18, ry: 12, rot: 0.35, score: 29800, rating: 'GREASED', above: false },
    { name: 'DRIFTER', fx: 0.70, fy: 0.42, rx: 13, ry: 9, rot: -0.6, score: 31200, rating: 'GREASED', above: true },
    { name: 'AMBER', fx: 0.82, fy: 0.28, rx: 15, ry: 10, rot: 0.4, score: 35600, rating: 'GREASED', above: true },
    { name: 'IMPERIAL', fx: 0.93, fy: 0.48, rx: 19, ry: 13, rot: -0.15, score: 42400, rating: 'GREASED', above: true },
  ];

  for (let i = 1; i < routeNodes.length; i++) {
    const rec = campaign.sortieScores[i - 1];
    if (rec) {
      routeNodes[i].score = rec.score;
      routeNodes[i].rating = rec.rating;
    }
  }

  const mapX = rx + 26, mapY = 152, mapW = rw - 52, mapH = 192;
  ctx.strokeStyle = 'rgba(239, 174, 56, 0.85)';
  ctx.lineWidth = 2.4;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  for (let i = 0; i < routeNodes.length; i++) {
    const nx = mapX + routeNodes[i].fx * mapW;
    const ny = mapY + routeNodes[i].fy * mapH;
    if (i === 0) ctx.moveTo(nx, ny);
    else ctx.lineTo(nx, ny);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Crisp dark-outlined directional chevrons mid-leg so route direction pops unmistakably!
  for (let i = 0; i < routeNodes.length - 1; i++) {
    const x1 = mapX + routeNodes[i].fx * mapW, y1 = mapY + routeNodes[i].fy * mapH;
    const x2 = mapX + routeNodes[i + 1].fx * mapW, y2 = mapY + routeNodes[i + 1].fy * mapH;
    const mx = (x1 + x2) * 0.5, my = (y1 + y2) * 0.5;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(ang);
    ctx.fillStyle = '#ffd46b';
    ctx.strokeStyle = '#09151f';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(7, 0); ctx.lineTo(-4.5, -4.5); ctx.lineTo(-2.5, 0); ctx.lineTo(-4.5, 4.5);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  for (let i = 0; i < routeNodes.length; i++) {
    const nd = routeNodes[i];
    const nx = mapX + nd.fx * mapW;
    const ny = mapY + nd.fy * mapH;
    const isFirm = nd.rating === 'FIRM';
    const isFinal = i === routeNodes.length - 1;
    const pinCol = i === 0 ? '#7bf0f0' : isFirm ? '#ff9f43' : '#68eba8';

    // Soft radial reef/beacon glow (no flat muddy circles!)
    const gRad = isFinal ? 26 : 20;
    const glow = ctx.createRadialGradient(nx, ny, 4, nx, ny, gRad);
    glow.addColorStop(0, isFinal ? 'rgba(255, 212, 107, 0.42)' : isFirm ? 'rgba(255, 159, 67, 0.36)' : 'rgba(52, 198, 190, 0.34)');
    glow.addColorStop(1, 'rgba(9, 21, 31, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(nx, ny, gRad, 0, Math.PI * 2);
    ctx.fill();

    // Organic lobed island landmass
    ctx.fillStyle = '#2d5c44';
    ctx.strokeStyle = isFinal ? '#ffd46b' : '#e5c88c';
    ctx.lineWidth = isFinal ? 2.0 : 1.4;
    ctx.beginPath();
    ctx.ellipse(nx, ny, nd.rx, nd.ry, nd.rot, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = pinCol;
    ctx.strokeStyle = '#0c1b26';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(nx, ny, isFinal ? 6.5 : 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Generous clearance above/below every island halo (ZERO overlap, including IMPERIAL 42.4K!)
    const aboveOff = isFinal ? 40 : 34;
    ctx.textAlign = 'center';
    ctx.fillStyle = isFinal ? '#ffd46b' : '#fff5d9';
    ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
    ctx.fillText(nd.name, nx, nd.above ? ny - aboveOff : ny + 30);
    ctx.fillStyle = pinCol;
    ctx.font = 'bold 11.5px "Trebuchet MS", sans-serif';
    ctx.fillText(nd.score != null ? `${(nd.score / 1000).toFixed(1)}K` : 'START', nx, nd.above ? ny - aboveOff + 14 : ny + 44);
  }
  ctx.restore();

  // 4. Right Bottom: 6 High-Contrast Featured Pilot Medals (rimmed medallions, uniform icons & exact provenance proof!)
  ctx.fillStyle = 'rgba(10, 22, 32, 0.96)';
  ctx.strokeStyle = 'rgba(216, 155, 50, 0.44)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(rx, 400, rw, 270, 11);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd46b';
  ctx.font = 'bold 13.5px "Trebuchet MS", sans-serif';
  ctx.fillText('FEATURED PILOT MEDALS & FEATS', rx + 18, 426);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#68eba8';
  ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
  ctx.fillText(`${campaign.feats.length} / ${FEAT_CATALOG.length} EARNED  (+${Math.max(0, campaign.feats.length - 6)} MORE)`, rx + rw - 18, 426);

  const featuredMeta = [
    { id: 'silk-touch', proof: 'SORTIE 7 · -140 FPM', col: '#247f86', capstone: false },
    { id: 'storm-runner', proof: 'SORTIE 3 · 28 KTS', col: '#3a6e94', capstone: false },
    { id: 'bullseye-drop', proof: 'SORTIE 2 · 38 FT DROP', col: '#2f8a6e', capstone: false },
    { id: 'thermal-rider', proof: 'SORTIE 4 · +620 FT', col: '#b86b24', capstone: false },
    { id: 'dead-stick', proof: 'SORTIE 5 · 11% FUEL', col: '#7d5a8a', capstone: false },
    { id: 'grand-circuit', proof: 'ALL 7 SORTIES · GRADE S', col: '#c98a1e', capstone: true },
  ];
  const tileW = (rw - 56) / 3;
  const tileH = 100;
  for (let i = 0; i < featuredMeta.length; i++) {
    const fm = featuredMeta[i];
    const f = FEAT_CATALOG.find((x) => x.id === fm.id);
    if (!f) continue;
    const earned = campaign.feats.includes(f.id);
    const col = i % 3;
    const row = Math.floor(i / 3);
    const fx = rx + 18 + col * (tileW + 10);
    const fy = 442 + row * (tileH + 12);

    ctx.fillStyle = fm.capstone ? 'rgba(34, 42, 48, 0.94)' : earned ? 'rgba(20, 41, 55, 0.94)' : 'rgba(14, 24, 32, 0.72)';
    ctx.strokeStyle = fm.capstone ? 'rgba(255, 212, 107, 0.72)' : earned ? 'rgba(110, 152, 176, 0.42)' : '#253947';
    ctx.lineWidth = fm.capstone ? 1.5 : 1.1;
    ctx.beginPath();
    ctx.roundRect(fx, fy, tileW, tileH, 8);
    ctx.fill();
    ctx.stroke();

    // Machined double-bezel aviation medallion with subtle metallic sheen!
    const mx = fx + 33, my = fy + tileH * 0.5;
    ctx.fillStyle = earned ? fm.col : '#243642';
    ctx.strokeStyle = fm.capstone ? '#ffd46b' : 'rgba(255, 245, 217, 0.45)';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(mx, my, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(mx, my, 18.5, 0, Math.PI * 2);
    ctx.stroke();
    drawFeatGlyph(ctx, f.icon, mx, my, 20);

    ctx.textAlign = 'left';
    ctx.fillStyle = fm.capstone ? '#ffd46b' : earned ? '#fff7e0' : '#738c9c';
    ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
    ctx.fillText(f.name, fx + 64, fy + 38);
    ctx.fillStyle = earned ? '#bdd6e3' : '#58707e';
    ctx.font = '600 11px "Trebuchet MS", sans-serif';
    ctx.fillText(f.desc, fx + 64, fy + 60);
    ctx.fillStyle = earned ? '#ffd46b' : '#647d8c';
    ctx.font = 'bold 10px "Trebuchet MS", sans-serif';
    ctx.fillText(earned ? `★ ${fm.proof}` : 'LOCKED', fx + 64, fy + 81);
  }

  ctx.restore();
}
