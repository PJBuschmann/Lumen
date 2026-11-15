/**
 * The bridge between the pure engine and React.
 *
 * - `live` is the authoritative GameState. It advances every animation frame.
 * - React reads a throttled snapshot from the zustand store (about 10 Hz), so components
 *   re-render calmly while canvases read `getLiveState()` at full frame rate.
 * - The UI never mutates state: it only calls `dispatch(action)`.
 */
import { create } from 'zustand';
import { applyAction, applyOffline, createInitialState, tick } from '../../engine';
import type { Action, GameEvent, GameState, OfflineSummary } from '../../engine';

export interface GameStore {
  /** Throttled snapshot of the game for React. */
  game: GameState;
  /** False until the saved game (if any) has been loaded. */
  ready: boolean;
  /** Set when the player returns after being away; cleared when dismissed. */
  offline: OfflineSummary | null;
}

const PUBLISH_INTERVAL_MS = 100;

let live: GameState = createInitialState(1);
let lastPublish = 0;

export const useGameStore = create<GameStore>(() => ({
  game: live,
  ready: false,
  offline: null,
}));

type EventListener = (event: GameEvent, state: GameState) => void;
const listeners = new Set<EventListener>();

/** Subscribe to transient engine events (ships, purchases, milestones...). */
export function onGameEvent(listener: EventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(state: GameState): void {
  if (state.events.length === 0 || listeners.size === 0) return;
  for (const event of state.events) {
    for (const listener of listeners) listener(event, state);
  }
}

function publish(force: boolean, now: number = performance.now()): void {
  if (!force && now - lastPublish < PUBLISH_INTERVAL_MS) return;
  lastPublish = now;
  useGameStore.setState({ game: live });
}

/** The authoritative state, for canvases and the save system. */
export function getLiveState(): GameState {
  return live;
}

/** Replace the whole game (load, import, new game). */
export function setLiveState(state: GameState): void {
  live = state;
  publish(true);
}

/** Send a player action to the engine. Returns true when it changed the game. */
export function dispatch(action: Action): boolean {
  const next = applyAction(live, action);
  if (next === live) return false;
  live = next;
  emit(next);
  publish(true);
  return true;
}

/** Advance the game by one frame. */
export function stepFrame(dtSeconds: number): void {
  live = tick(live, dtSeconds);
  emit(live);
  publish(false);
}

/** Catch up after time away, using the engine's own offline simulation. */
export function catchUp(elapsedSeconds: number, showSummary: boolean): void {
  const { state, summary } = applyOffline(live, elapsedSeconds);
  live = state;
  useGameStore.setState(showSummary ? { game: live, offline: summary } : { game: live });
}

export function dismissOfflineSummary(): void {
  useGameStore.setState({ offline: null });
}

export function markReady(): void {
  useGameStore.setState({ ready: true, game: live });
}
