/**
 * Named access to balance data, so tuning tools can read and override a value by path
 * (for example "DAWN.threshold") inside the simulator process without editing files.
 */
import { COAST } from '../src/content/coast';
import { DAWN } from '../src/content/dawn';
import { ENGINE } from '../src/content/engine';
import { NIGHT } from '../src/content/night';
import { PACING } from '../src/content/pacing';
import { TIDES } from '../src/content/tides';

export const CONTENT: Record<string, unknown> = { NIGHT, DAWN, COAST, TIDES, ENGINE, PACING };

function resolve(path: string): { holder: Record<string, unknown>; key: string } {
  const parts = path.split('.');
  let holder: unknown = CONTENT;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof holder !== 'object' || holder === null || !(parts[i] in holder)) {
      throw new Error(`Unknown balance path: ${path}`);
    }
    holder = (holder as Record<string, unknown>)[parts[i]];
  }
  const key = parts[parts.length - 1];
  if (typeof holder !== 'object' || holder === null || !(key in holder)) {
    throw new Error(`Unknown balance path: ${path}`);
  }
  return { holder: holder as Record<string, unknown>, key };
}

export function getParam(path: string): number {
  const { holder, key } = resolve(path);
  const value = holder[key];
  if (typeof value !== 'number') throw new Error(`Balance path ${path} is not a number`);
  return value;
}

/** Override a balance value for this process only. */
export function setParam(path: string, value: number): void {
  const { holder, key } = resolve(path);
  if (typeof holder[key] !== 'number') throw new Error(`Balance path ${path} is not a number`);
  holder[key] = value;
}

/** Apply "A.b=1,C.d=2" style overrides (used by --set on the command line). */
export function applyOverrides(spec: string | undefined): Record<string, number> {
  const applied: Record<string, number> = {};
  if (!spec) return applied;
  for (const pair of spec.split(',')) {
    const [path, raw] = pair.split('=');
    const value = Number(raw);
    if (!path || !Number.isFinite(value)) throw new Error(`Bad override: ${pair}`);
    setParam(path.trim(), value);
    applied[path.trim()] = value;
  }
  return applied;
}
