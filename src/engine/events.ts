/** Transient event and milestone helpers shared by every layer. */
import { ENGINE } from '../content/engine';
import type { GameEvent, GameState, MilestoneId } from './types';

/** Ships and automatic purchases are frequent and cosmetic; everything else is news. */
function isChatter(event: GameEvent): boolean {
  return event.type === 'ship' || (event.type === 'purchase' && event.auto);
}

/**
 * Queue a transient event for the UI. Chatter is capped per tick so a long step cannot
 * flood the list; news (milestones, reveals, prestiges, phases) always gets through,
 * up to a generous hard limit.
 */
export function pushEvent(state: GameState, event: GameEvent): void {
  if (isChatter(event)) {
    let chatter = 0;
    for (const queued of state.events) if (isChatter(queued)) chatter += 1;
    if (chatter >= ENGINE.maxEventsPerTick) return;
  } else if (state.events.length >= ENGINE.maxEventsPerTick * 8) {
    return;
  }
  state.events.push(event);
}

export function reachMilestone(state: GameState, id: MilestoneId): void {
  if (state.stats.milestones[id] !== undefined) return;
  state.stats.milestones[id] = state.time;
  pushEvent(state, { type: 'milestone', id });
}
