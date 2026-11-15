/**
 * The frame loop: advances the engine every animation frame, autosaves, and turns
 * time spent in the background into offline progress.
 */
import { ENGINE } from '../../content/engine';
import { saveGame } from './persistence';
import { catchUp, stepFrame } from './store';

const AUTOSAVE_MS = 10_000;
/** Frames longer than this are treated as "the app was away", not as one long frame. */
const AWAY_THRESHOLD_S = 5;
const MAX_FRAME_S = 0.25;

export function startLoop(): () => void {
  let raf = 0;
  let last = performance.now();
  let lastWall = Date.now();
  let lastSave = performance.now();
  let running = true;

  const frame = (now: number) => {
    if (!running) return;
    // Wall-clock time also covers a suspended device, where performance.now() may pause.
    const wall = Date.now();
    const dt = Math.max((now - last) / 1000, (wall - lastWall) / 1000);
    last = now;
    lastWall = wall;
    if (dt > AWAY_THRESHOLD_S) {
      catchUp(dt, dt >= ENGINE.offline.minSummarySeconds);
    } else if (dt > 0) {
      stepFrame(Math.min(dt, MAX_FRAME_S));
    }
    if (now - lastSave > AUTOSAVE_MS) {
      lastSave = now;
      void saveGame();
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') void saveGame();
  };
  const onPageHide = () => {
    void saveGame();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    void saveGame();
  };
}
