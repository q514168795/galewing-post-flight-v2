// SPDX-License-Identifier: MIT
// Galewing Post: Amber Archipelago — deterministic make.fun submission packager.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

interface ShotSpec {
  name: string;
  query: string;
}

const MAX_SHOT_BYTES = 262144;
const MAX_DOSSIER_BYTES = 1572864;
const here = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function cleanOutputContents(dir: string): void {
  mkdirSync(dir, { recursive: true });
  for (const entry of readdirSync(dir)) {
    if (entry === 'lost+found') continue;
    rmSync(join(dir, entry), { recursive: true, force: true });
  }
}

function validateScreenshots(repoRoot: string): ShotSpec[] {
  const shotsMetaPath = join(repoRoot, 'shots.json');
  const raw = JSON.parse(readFileSync(shotsMetaPath, 'utf8')) as unknown;
  if (!Array.isArray(raw) || raw.length !== 4) {
    throw new Error(`Expected exactly 4 entries in shots.json, found ${Array.isArray(raw) ? raw.length : 'non-array'}`);
  }
  const specs = raw as ShotSpec[];
  for (const spec of specs) {
    if (typeof spec.name !== 'string' || !spec.name.endsWith('.jpg')) {
      throw new Error(`Invalid screenshot name in shots.json: ${String(spec.name)}`);
    }
    const shotPath = join(repoRoot, 'screenshots', spec.name);
    if (!existsSync(shotPath)) {
      throw new Error(`Missing screenshot file: screenshots/${spec.name}`);
    }
    const st = statSync(shotPath);
    if (!st.isFile() || st.size <= 0 || st.size > MAX_SHOT_BYTES) {
      throw new Error(`Screenshot screenshots/${spec.name} invalid size: ${st.size} bytes (limit ${MAX_SHOT_BYTES})`);
    }
    const bytes = readFileSync(shotPath);
    if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      throw new Error(`Screenshot screenshots/${spec.name} is not a valid JPEG`);
    }
  }
  return specs;
}

function packageEntry(): void {
  const specs = validateScreenshots(here);
  cleanOutputContents(outputDir);
  cpSync(join(here, 'game'), join(outputDir, 'game'), { recursive: true });
  const outShotsDir = join(outputDir, 'screenshots');
  mkdirSync(outShotsDir, { recursive: true });
  for (const spec of specs) {
    cpSync(join(here, 'screenshots', spec.name), join(outShotsDir, spec.name));
  }
  const dossier = buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: MAX_SHOT_BYTES },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  });
  if (dossier.byteLength > MAX_DOSSIER_BYTES) {
    throw new Error(`dossier.json exceeds 1.5 MiB cap: ${dossier.byteLength} bytes`);
  }
  writeFileSync(join(outputDir, 'dossier.json'), dossier);
}

packageEntry();
