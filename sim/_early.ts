import { runBot } from './runner';
import { applyOverrides } from './params';
import { createInitialState, advanceInPlace, applyActionInPlace } from '../src/engine';
import { createBot } from './bots/brain';
import { POLICIES } from './bots/policies';
applyOverrides(process.argv[2]);
const r = runBot({ policy: 'greedy-best-roi', seed: 1, horizonSeconds: 3600, stopAfter: 'firstDawn' });
console.log('firstDawn', (r.milestones.firstDawn ?? 0) / 60, 'min; purchases before', r.purchases, 'gaps', r.gapHistogram.join(','));
// purchase times in the first 3 minutes
const bot = createBot(POLICIES['greedy-best-roi']);
const s = createInitialState(1); let t = 0; const times: number[] = [];
while (t < 240) { const a = bot.decide(s); if (a && applyActionInPlace(s, a)) { times.push(Math.round(t)); advanceInPlace(s, 0.7); t += 0.7; } else { const dt = Math.max(0.05, bot.patience(s)); advanceInPlace(s, dt); t += dt; } }
console.log('purchase times (s):', times.join(' '));
