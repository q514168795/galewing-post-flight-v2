// SPDX-License-Identifier: MIT
// 3-slot localStorage pilot logbook (bypassed automatically during deterministic ?shot= capture).

const STORAGE_KEY = 'galewing_post_logbook_v1';

export function createEmptySlots() {
  return [
    { slot: 1, callsign: 'LOGBOOK I', bestScore: 0, bestGrade: '-', sorties: 0, feats: 0, seed: 1740 },
    { slot: 2, callsign: 'LOGBOOK II', bestScore: 0, bestGrade: '-', sorties: 0, feats: 0, seed: 2408 },
    { slot: 3, callsign: 'LOGBOOK III', bestScore: 0, bestGrade: '-', sorties: 0, feats: 0, seed: 3192 },
  ];
}

export function loadLogbookSlots(isShotMode = false) {
  if (isShotMode) return createEmptySlots();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptySlots();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== 3) return createEmptySlots();
    return parsed;
  } catch {
    return createEmptySlots();
  }
}

export function saveLogbookSlot(slotIndex, summary, isShotMode = false) {
  if (isShotMode) return;
  try {
    const slots = loadLogbookSlots(false);
    const idx = Math.max(0, Math.min(2, slotIndex));
    const cur = slots[idx];
    const gradeOrder = { '-': 0, C: 1, B: 2, A: 3, S: 4 };
    const nextGrade = (gradeOrder[summary.grade] || 0) >= (gradeOrder[cur.bestGrade] || 0)
      ? summary.grade
      : cur.bestGrade;
    slots[idx] = {
      ...cur,
      bestScore: Math.max(cur.bestScore, Math.round(summary.score || 0)),
      bestGrade: nextGrade,
      sorties: Math.max(cur.sorties, summary.sorties || 0),
      feats: Math.max(cur.feats, summary.feats || 0),
      seed: summary.seed || cur.seed,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
  } catch {
    // Ignore storage quota or sandbox errors cleanly
  }
}
