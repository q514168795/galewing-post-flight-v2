// SPDX-License-Identifier: MIT
// 16 pilot medals/feats with concise readable descriptions, categories, and bespoke icon identifiers.

export const FEAT_CATALOG = [
  { id: 'first-wings', name: 'FIRST WINGS', desc: 'Complete Sortie 1 safely', icon: 'wings', cat: 'flight' },
  { id: 'silk-touch', name: 'SILK TOUCHDOWN', desc: 'Grease under 210 FPM', icon: 'feather', cat: 'precision' },
  { id: 'centerline-ace', name: 'DEAD CENTER', desc: 'Land within 12 FT of stripe', icon: 'target', cat: 'precision' },
  { id: 'ring-streak-4', name: 'RING RUNNER x4', desc: 'Chain 4x ring streak', icon: 'ring', cat: 'flight' },
  { id: 'ring-streak-6', name: 'AMBER STREAK x6', desc: 'Chain 6x ring streak', icon: 'crown', cat: 'flight' },
  { id: 'bullseye-drop', name: 'BULLSEYE MAIL', desc: 'Drop mail within 60 FT', icon: 'parachute', cat: 'precision' },
  { id: 'storm-runner', name: 'MONSOON RUNNER', desc: 'Clear 28 KTS Squall', icon: 'bolt', cat: 'storm' },
  { id: 'thermal-rider', name: 'THERMAL RIDER', desc: 'Climb 450 FT thermals', icon: 'thermal', cat: 'storm' },
  { id: 'dead-stick', name: 'BINGO GLIDER', desc: 'Land under 12% fuel', icon: 'gauge', cat: 'storm' },
  { id: 'cockpit-ifr', name: 'IFR INSTRUMENT', desc: 'Fly a leg in Cockpit', icon: 'dial', cat: 'precision' },
  { id: 'iron-pelican', name: 'IRON PELICAN', desc: 'Finish at 90%+ hull', icon: 'shield', cat: 'storm' },
  { id: 'synergy-2', name: 'RIGGED AIRFRAME', desc: 'Unlock a 2-piece set', icon: 'wrench', cat: 'hangar' },
  { id: 'synergy-3', name: 'MASTER MECHANIC', desc: 'Unlock a 3-piece set', icon: 'gear', cat: 'hangar' },
  { id: 'flap-short', name: 'STOL SPECIALIST', desc: 'Touch down at 35° flaps', icon: 'flap', cat: 'hangar' },
  { id: 'high-roller', name: 'POSTMASTER', desc: 'Score 120,000+ points', icon: 'stamp', cat: 'flight' },
  { id: 'grand-circuit', name: 'ARCHIPELAGO ACE', desc: 'Finish all 7 sorties', icon: 'star', cat: 'flight' },
];

export function evaluateFeats(campaign) {
  const unlocked = new Set(campaign.feats || []);
  const s = campaign.stats || {};
  if ((campaign.completedSorties || 0) >= 1) unlocked.add('first-wings');
  if (s.greasedLandings >= 1) unlocked.add('silk-touch');
  if (s.centerlineHits >= 1) unlocked.add('centerline-ace');
  if (s.bestStreak >= 4) unlocked.add('ring-streak-4');
  if (s.bestStreak >= 6) unlocked.add('ring-streak-6');
  if (s.bullseyeDrops >= 1) unlocked.add('bullseye-drop');
  if (s.stormCleared) unlocked.add('storm-runner');
  if (s.thermalClimbFt >= 450) unlocked.add('thermal-rider');
  if (s.bingoLandings >= 1) unlocked.add('dead-stick');
  if (s.usedCockpit) unlocked.add('cockpit-ifr');
  if (s.cleanHullSorties >= 1) unlocked.add('iron-pelican');
  if (s.maxSetPieces >= 2) unlocked.add('synergy-2');
  if (s.maxSetPieces >= 3) unlocked.add('synergy-3');
  if (s.fullFlapLanding) unlocked.add('flap-short');
  if ((campaign.totalScore || 0) >= 120000) unlocked.add('high-roller');
  if ((campaign.completedSorties || 0) >= 7) unlocked.add('grand-circuit');
  campaign.feats = [...unlocked];
  return campaign.feats;
}
