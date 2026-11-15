/** Child process: receives run configs, sends back results. */
import { applyOverrides } from './params';
import { runBot } from './runner';
import type { RunConfig } from './runner';

applyOverrides(process.env.LUMEN_SIM_OVERRIDES || undefined);

process.on('message', (message: { type: string; index: number; config: RunConfig }) => {
  if (message.type === 'exit') {
    process.exit(0);
  }
  if (message.type === 'run') {
    try {
      const result = runBot(message.config);
      process.send?.({ type: 'result', index: message.index, result });
    } catch (error) {
      process.send?.({ type: 'error', error: error instanceof Error ? error.stack ?? error.message : String(error) });
    }
  }
});

process.send?.({ type: 'ready' });
