import type { Policy } from './types';

export const POLICIES: Record<string, Policy> = {
  'greedy-cheapest': {
    name: 'greedy-cheapest',
    description: 'Always buys the cheapest thing on offer; prestiges when it would double.',
    choice: 'cheapest',
    prestige: 'double',
    sessions: 'always',
  },
  'greedy-best-roi': {
    name: 'greedy-best-roi',
    description: 'Buys the best return on investment; prestiges when it would double.',
    choice: 'roi',
    prestige: 'double',
    sessions: 'always',
  },
  'prestige-optimal': {
    name: 'prestige-optimal',
    description: 'Best-ROI purchases; prestiges when the gain per second has peaked.',
    choice: 'roi',
    prestige: 'optimal',
    sessions: 'always',
  },
  'offline-heavy': {
    name: 'offline-heavy',
    description: 'Best-ROI purchases in four 15-minute sessions a day; away the rest.',
    choice: 'roi',
    prestige: 'double',
    sessions: 'offlineHeavy',
  },
};

export const POLICY_ORDER = ['greedy-cheapest', 'greedy-best-roi', 'prestige-optimal', 'offline-heavy'] as const;
export type PolicyName = (typeof POLICY_ORDER)[number];
