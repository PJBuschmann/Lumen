/**
 * Saving and loading through Capacitor Preferences (native key-value storage on iOS and
 * Android, localStorage on the web).
 */
import { Preferences } from '@capacitor/preferences';
import { createInitialState, exportSave, importSave, loadFromJson, saveToJson } from '../../engine';
import type { GameState } from '../../engine';
import { ENGINE } from '../../content/engine';
import { catchUp, getLiveState, markReady, setLiveState } from './store';

const SAVE_KEY = 'lumen.save';
const BACKUP_KEY = 'lumen.save.backup';
const CORRUPT_KEY = 'lumen.save.unreadable';

function randomSeed(): number {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return buffer[0];
}

/** Load the saved game (or start a new one) and apply offline progress. */
export async function loadGame(): Promise<void> {
  let state: GameState | null = null;
  let savedAt = 0;
  try {
    const { value } = await Preferences.get({ key: SAVE_KEY });
    if (value) {
      const result = loadFromJson(value);
      if (result.ok) {
        state = result.state;
        savedAt = result.savedAt;
        // Keep the pre-migration save around in case a migration misbehaves.
        if (result.migratedFrom !== state.schema) {
          await Preferences.set({ key: BACKUP_KEY, value });
        }
      } else {
        // Never silently destroy a save we could not read.
        await Preferences.set({ key: CORRUPT_KEY, value });
      }
    }
  } catch {
    state = null;
  }

  if (state === null) {
    setLiveState(createInitialState(randomSeed()));
  } else {
    setLiveState(state);
    const elapsed = savedAt > 0 ? (Date.now() - savedAt) / 1000 : 0;
    if (elapsed > 1) catchUp(elapsed, elapsed >= ENGINE.offline.minSummarySeconds);
  }
  markReady();
}

export async function saveGame(): Promise<void> {
  try {
    await Preferences.set({ key: SAVE_KEY, value: saveToJson(getLiveState(), Date.now()) });
  } catch {
    // Storage can be full or unavailable; the next autosave will try again.
  }
}

/** The current game as a copy-pasteable string. */
export function exportGame(): string {
  return exportSave(getLiveState(), Date.now());
}

/** Replace the current game with an exported one. Returns an error message on failure. */
export async function importGame(text: string): Promise<string | null> {
  const result = importSave(text);
  if (!result.ok) return result.error;
  await Preferences.set({ key: BACKUP_KEY, value: saveToJson(getLiveState(), Date.now()) });
  setLiveState(result.state);
  await saveGame();
  return null;
}

/** Start over. The old game is kept as a backup. */
export async function resetGame(): Promise<void> {
  await Preferences.set({ key: BACKUP_KEY, value: saveToJson(getLiveState(), Date.now()) });
  setLiveState(createInitialState(randomSeed()));
  await saveGame();
}
