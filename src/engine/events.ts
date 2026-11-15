/** Transient event and milestone helpers shared by every layer. */
import { ENGINE } from '../content/engine';
import type { GameEvent, GameState, MilestoneId } from './types';

export function pushEvent(state: GameState, event: GameEvent): void {
  if (state.events.length < ENGINE.maxEventsPerTick) state.events.push(event);
}

export function reachMilestone(state: GameState, id: MilestoneId): void {
  if (state.stats.milestones[id] !== undefined) return;
  state.stats.milestones[id] = state.time;
  pushEvent(state, { type: 'milestone', id });
}
