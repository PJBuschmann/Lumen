/**
 * Runs many bot games across child processes. Each child is a plain Node process
 * loading TypeScript through tsx, so the engine code is exactly what ships.
 */
import { fork } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { RunConfig, RunResult } from './runner';

export interface PoolOptions {
  jobs?: number;
  /** Balance overrides ("A.b=1,C.d=2") applied in every child. */
  overrides?: string;
  onProgress?: (done: number, total: number) => void;
}

export function defaultJobs(): number {
  return Math.max(1, availableParallelism() - 1);
}

export function runAll(configs: RunConfig[], options: PoolOptions = {}): Promise<RunResult[]> {
  const jobs = Math.max(1, Math.min(options.jobs ?? defaultJobs(), configs.length));
  const workerPath = fileURLToPath(new URL('./worker.ts', import.meta.url));
  const results: RunResult[] = new Array(configs.length);
  let next = 0;
  let done = 0;

  return new Promise((resolve, reject) => {
    let failed = false;
    let alive = 0;
    const fail = (error: Error) => {
      if (failed) return;
      failed = true;
      reject(error);
    };

    for (let w = 0; w < jobs; w++) {
      const child = fork(workerPath, [], {
        execArgv: ['--import', 'tsx'],
        env: { ...process.env, LUMEN_SIM_OVERRIDES: options.overrides ?? '' },
      });
      alive += 1;
      const feed = () => {
        if (next >= configs.length) {
          child.send({ type: 'exit' });
          return;
        }
        const index = next++;
        child.send({ type: 'run', index, config: configs[index] });
      };
      child.on('message', (message: { type: string; index: number; result: RunResult; error?: string }) => {
        if (message.type === 'ready') {
          feed();
        } else if (message.type === 'result') {
          results[message.index] = message.result;
          done += 1;
          options.onProgress?.(done, configs.length);
          feed();
        } else if (message.type === 'error') {
          fail(new Error(message.error ?? 'simulation worker failed'));
          child.kill();
        }
      });
      child.on('error', fail);
      child.on('exit', (code) => {
        alive -= 1;
        if (code !== 0 && code !== null) fail(new Error(`simulation worker exited with code ${code}`));
        if (alive === 0 && !failed) resolve(results);
      });
    }
  });
}
