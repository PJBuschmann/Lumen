import { describe, expect, it } from 'vitest';
import {
  D,
  activeRules,
  advanceInPlace,
  applyAction,
  auroraPower,
  canEnterChallenge,
  challengeGoal,
  challengeMaxTier,
  challengeTier,
  cloneState,
  createInitialState,
  getDerived,
  nightUpgradeLocked,
  pow10,
  starsAutomated,
  tick,
  totalCompletions,
} from '../../src/engine';
import type { GameState } from '../../src/engine';
import { AURORA, CHALLENGE_ORDER } from '../../src/content/aurora';
import type { ChallengeId } from '../../src/content/aurora';

/** A late-game keeper: every layer built up, the Aurora just unlocked. */
function atAurora(): GameState {
  const state = createInitialState(97);
  state.dawn.dawns = 80;
  state.coast.revealed = true;
  state.coast.surveys = 200;
  state.coast.record = 300;
  state.coast.levels = state.coast.levels.map((_, i) => 200 + (i % 3));
  state.tides.revealed = true;
  state.tides.turns = 300;
  state.tides.phaseEndsAt = 90;
  state.tides.swell = state.tides.swell.map(() => 150);
  state.stars.revealed = true;
  state.stars.ascensions = 400;
  state.stars.levels = state.stars.levels.map(() => 1);
  state.stars.stardustTotal = D(AURORA.unlockStardust * 1.01);
  return tick(state, 2); // a heartbeat unlocks the aurora
}

function inChallenge(id: ChallengeId): GameState {
  return applyAction(atAurora(), { type: 'enterChallenge', id });
}

describe('aurora', () => {
  it('stays dark until enough Stardust has been gathered', () => {
    const state = createInitialState(5);
    state.stars.revealed = true;
    state.stars.stardustTotal = D(AURORA.unlockStardust * 0.5);
    const next = tick(state, 30);
    expect(next.aurora.unlocked).toBe(false);
    expect(canEnterChallenge(next, 'bareGlass')).toBe(false);
    expect(applyAction(next, { type: 'enterChallenge', id: 'bareGlass' })).toBe(next);
    expect(applyAction(next, { type: 'leaveChallenge' })).toBe(next);
  });

  it('unlocks at the gate', () => {
    const state = atAurora();
    expect(state.aurora.unlocked).toBe(true);
    expect(state.stats.milestones.auroraUnlocked).toBeDefined();
    expect(state.aurora.active).toBeNull();
    expect(activeRules(state)).toEqual({});
    for (const id of CHALLENGE_ORDER) {
      expect(canEnterChallenge(state, id)).toBe(true);
      expect(challengeTier(state, id)).toBe(0);
      expect(challengeGoal(state, id)).toBe(AURORA.challenges[id].goals[0]);
      expect(challengeMaxTier(id)).toBe(AURORA.challenges[id].goals.length);
    }
    expect(auroraPower(state)).toBe(0);
    expect(totalCompletions(state)).toBe(0);
  });

  it('every challenge has rising goals and a reward', () => {
    for (const id of CHALLENGE_ORDER) {
      const def = AURORA.challenges[id];
      expect(def.id).toBe(id);
      expect(def.reward).toBeGreaterThan(0);
      expect(def.goals.length).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < def.goals.length; i++) expect(def.goals[i]).toBeGreaterThan(def.goals[i - 1]);
      expect(Object.keys(def.rules).length).toBeGreaterThan(0);
    }
    expect(new Set(CHALLENGE_ORDER).size).toBe(Object.keys(AURORA.challenges).length);
  });

  it('entering begins a fresh night under the rule; only one at a time', () => {
    const base = atAurora();
    base.night.runLight = D('1e50');
    const state = applyAction(base, { type: 'enterChallenge', id: 'bareGlass' });
    expect(state.aurora.active).toBe('bareGlass');
    expect(state.night.runLight.toNumber()).toBe(0);
    expect(state.night.runTime).toBe(0);
    expect(state.events.some((e) => e.type === 'challengeStart')).toBe(true);
    expect(activeRules(state)).toBe(AURORA.challenges.bareGlass.rules);
    expect(applyAction(state, { type: 'enterChallenge', id: 'fogbound' })).toBe(state);
    expect(applyAction(state, { type: 'enterChallenge', id: 'nope' as ChallengeId })).toBe(state);
    // Structures are untouched.
    expect(state.coast.levels).toEqual(base.coast.levels);
    expect(state.stars.levels).toEqual(base.stars.levels);
  });

  it('Bare Glass: no lens upgrades, for you or the apprentice', () => {
    const state = inChallenge('bareGlass');
    expect(nightUpgradeLocked(state, 'lens')).toBe(true);
    expect(nightUpgradeLocked(state, 'wick')).toBe(false);
    state.night.light = D('1e40');
    expect(applyAction(state, { type: 'buyNightUpgrade', id: 'lens' })).toBe(state);
    const later = tick(state, 120);
    expect(later.night.upgrades.lens).toBe(0);
    expect(later.night.upgrades.wick).toBeGreaterThan(0);
    expect(later.night.upgrades.oil).toBeGreaterThan(0);
    expect(nightUpgradeLocked(atAurora(), 'lens')).toBe(false);
  });

  it('Fogbound: fewer ships guided and dimmer Light', () => {
    const base = atAurora();
    const fog = inChallenge('fogbound');
    const rules = AURORA.challenges.fogbound.rules;
    // Same lamp in both: fully turning, wick untrimmed.
    base.night.upgrades.wick = 0;
    base.night.upgrades.rotation = 10;
    fog.night.upgrades.rotation = 10;
    base.derived = null;
    fog.derived = null;
    expect(getDerived(base).guideChance).toBe(1);
    expect(getDerived(fog).guideChance).toBeCloseTo(rules.guideMult!, 12);
    expect(getDerived(fog).lightPerShip.log10()).toBeCloseTo(
      getDerived(base).lightPerShip.log10() * rules.lightPower!,
      6,
    );
  });

  it('Dark of the Moon: the moon is held and the tides weakened', () => {
    const base = atAurora();
    const dark = inChallenge('darkMoon');
    // Move the real phase on; the challenge still sees the new moon.
    const later = tick(dark, 400);
    expect(later.tides.phase).not.toBe(0);
    expect(getDerived(later).parts.glow).toBe(2);
    expect(getDerived(dark).tidePower).toBeCloseTo(getDerived(base).tidePower * 0.5, 9);
  });

  it('Lonely Shore, Starless and The Long Night remove their layer', () => {
    const base = getDerived(atAurora());
    const lonely = getDerived(inChallenge('lonelyShore'));
    expect(lonely.coastPower).toBeLessThan(base.coastPower * AURORA.challenges.lonelyShore.rules.coastPowerMult!);
    expect(getDerived(inChallenge('starless')).starPower).toBe(0);
    expect(base.starPower).toBeGreaterThan(0);

    const night = inChallenge('noDawn');
    night.dawn.glimmerTotal = D('1e80');
    night.dawn.upgrades.radiance = 5;
    night.derived = null;
    expect(getDerived(night).parts.glimmer.toNumber()).toBe(1);
    expect(getDerived(night).parts.radiance.toNumber()).toBe(1);
  });

  it('Empty Lanes and Short Wick bite where they say', () => {
    const base = getDerived(atAurora());
    const empty = inChallenge('emptyLanes');
    expect(getDerived(empty).shipsPerSecond).toBeCloseTo(base.shipsPerSecond * 0.1, 12);
    expect(nightUpgradeLocked(empty, 'oil')).toBe(true);
    expect(nightUpgradeLocked(inChallenge('shortWick'), 'wick')).toBe(true);
  });

  it('a challenge never slows the wider layers down', () => {
    const base = getDerived(atAurora());
    for (const id of CHALLENGE_ORDER) {
      const d = getDerived(inChallenge(id));
      expect(d.stonePerSecond.eq(base.stonePerSecond)).toBe(true);
      expect(d.tidePerSecond.eq(base.tidePerSecond)).toBe(true);
      expect(d.stardustPerSecond.eq(base.stardustPerSecond)).toBe(true);
    }
  });

  it('leaving costs nothing', () => {
    const base = atAurora();
    const state = inChallenge('fogbound');
    const left = applyAction(state, { type: 'leaveChallenge' });
    expect(left.aurora.active).toBeNull();
    expect(left.aurora.completions).toEqual(base.aurora.completions);
    expect(left.coast.levels).toEqual(base.coast.levels);
    expect(left.events.some((e) => e.type === 'challengeLeave')).toBe(true);
    expect(canEnterChallenge(left, 'fogbound')).toBe(true);
    expect(applyAction(left, { type: 'leaveChallenge' })).toBe(left);
  });

  it('reaching the goal completes the tier, grants power for good, and frees the stars', () => {
    const state = inChallenge('bareGlass');
    state.stars.pending = D(1234);
    const goal = challengeGoal(state, 'bareGlass')!;
    state.night.runLight = pow10(goal - 0.5);
    const notYet = tick(state, 2);
    expect(notYet.aurora.active).toBe('bareGlass');

    state.night.runLight = pow10(goal + 0.01);
    const done = tick(state, 2);
    expect(done.aurora.active).toBeNull();
    expect(challengeTier(done, 'bareGlass')).toBe(1);
    expect(totalCompletions(done)).toBe(1);
    expect(auroraPower(done)).toBeCloseTo(AURORA.challenges.bareGlass.reward, 12);
    expect(getDerived(done).auroraPower).toBeCloseTo(AURORA.challenges.bareGlass.reward, 12);
    expect(done.stats.milestones.firstChallenge).toBeDefined();
    expect(done.events.some((e) => e.type === 'challengeComplete' && e.tier === 1)).toBe(true);
    expect(done.night.runTime).toBeLessThan(2); // a fresh night
    expect(challengeGoal(done, 'bareGlass')).toBe(AURORA.challenges.bareGlass.goals[1]);
    // The star map now charts itself; waiting Stardust was collected.
    expect(starsAutomated(done)).toBe(true);
    expect(done.stars.pending.toNumber()).toBeLessThan(1);
    expect(done.stars.stardustTotal.toNumber()).toBeGreaterThan(AURORA.unlockStardust + 1000);
    expect(applyAction(done, { type: 'ascend' })).toBe(done);
  });

  it('a challenge with every tier done cannot be entered again', () => {
    const state = atAurora();
    state.aurora.completions.starless = challengeMaxTier('starless');
    expect(canEnterChallenge(state, 'starless')).toBe(false);
    expect(challengeGoal(state, 'starless')).toBeNull();
    expect(applyAction(state, { type: 'enterChallenge', id: 'starless' })).toBe(state);
  });

  it('a fully automated late game plays the same online and offline', () => {
    const base = atAurora();
    base.aurora.completions.bareGlass = 1; // stars automated
    base.structure = null;
    base.derived = null;
    const seconds = 3600;
    const offline = cloneState(base);
    advanceInPlace(offline, seconds);
    let online = cloneState(base);
    for (let i = 0; i < seconds * 10; i++) online = tick(online, 0.1);

    const near = (a: number, b: number) => expect(Math.abs(a / b - 1)).toBeLessThan(1e-6);
    near(offline.stats.totalLight.log10(), online.stats.totalLight.log10());
    near(offline.coast.stoneTotal.toNumber(), online.coast.stoneTotal.toNumber());
    near(offline.tides.tideTotal.toNumber(), online.tides.tideTotal.toNumber());
    near(offline.stars.stardustTotal.toNumber(), online.stars.stardustTotal.toNumber());
    expect(offline.coast.levels).toEqual(online.coast.levels);
    expect(offline.tides.swell).toEqual(online.tides.swell);
    expect(offline.stars.levels).toEqual(online.stars.levels);
    expect(offline.night.upgrades).toEqual(online.night.upgrades);
    expect(offline.stats.autoPurchases).toBe(online.stats.autoPurchases);
  });
});
