/** v2 engine guard. v1's Dart harness stays the balance authority; these
 * tests pin that the TS port matches the v1 laws for the systems ported
 * so far: determinism, the light cycle, arrivals/boarding, spawning. */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { CityDef } from '../src/engine/city';
import {
  ANGEL_BAY_TRACKS, GOAL_TRACKS, Game, GLOBALS, STATION_WORKS,
} from '../src/engine/game';

const city = JSON.parse(
  readFileSync(new URL('../src/data/new_meridian.json', import.meta.url), 'utf8'),
) as CityDef;

function run(seconds: number, setup?: (g: Game) => void): Game {
  const g = new Game(city);
  setup?.(g);
  const steps = Math.round(seconds * 10);
  for (let i = 0; i < steps; i++) g.tick(0.1);
  return g;
}

describe('the ported core', () => {
  test('the approved geometry came through the JSON bridge intact', () => {
    expect(city.stations.length).toBe(162);
    expect(city.lines.length).toBe(24);
    for (const line of city.lines) {
      expect(line.stationIds.length).toBeGreaterThanOrEqual(6);
      for (let i = 0; i < line.stationIds.length - 1; i++) {
        const a = city.stations.find((s) => s.id === line.stationIds[i])!;
        const b = city.stations.find((s) => s.id === line.stationIds[i + 1])!;
        const dx = Math.abs(b.x - a.x);
        const dy = Math.abs(b.y - a.y);
        expect(dx === 0 || dy === 0 || dx === dy).toBe(true);
      }
    }
  });

  test('deterministic: two identical runs, identical worlds', () => {
    const a = run(300);
    const b = run(300);
    expect(a.totalEarned).toBe(b.totalEarned);
    expect(a.totalRiders).toBe(b.totalRiders);
    expect(a.trains[0].distance).toBe(b.trains[0].distance);
  });

  test('level-0 line 1 earns in v1 fun-zone territory', () => {
    // v1 pins $1.5–24/s WITH upgrades and rush in play; the bare ported
    // core (no upgrades yet) must still land in a sane band of it.
    const g = run(300);
    const perSec = g.totalEarned / 300;
    expect(perSec).toBeGreaterThan(1.0);
    expect(perSec).toBeLessThan(24);
  });

  test('the light cycle matches v1: day, dusk, night rush, dawn', () => {
    const g = new Game(city);
    expect(g.nightFactor).toBe(0); // a new city opens in daylight
    g.rushClock = 122.5;
    expect(g.nightFactor).toBeCloseTo(0.5, 9);
    g.rushClock = 140;
    expect(g.nightFactor).toBe(1);
    expect(g.rushActive).toBe(true); // the rush IS the night rush
    g.rushClock = 190;
    expect(g.nightFactor).toBeCloseTo(0.5, 9);
    g.rushClock = 200;
    expect(g.nightFactor).toBe(0);
  });

  test('a second train enters exactly opposite the first (v1 spacing law)', () => {
    const g = Game.showcase(city, 2);
    const L = g.paths.get('1')!.length;
    const [t1, t2] = g.trains.filter((t) => t.lineId === '1');
    const phase = (t: typeof t1) =>
      t.direction > 0 ? t.distance : 2 * L - t.distance;
    const gap = Math.abs(phase(t1) - phase(t2)) % (2 * L);
    expect(Math.min(gap, 2 * L - gap)).toBeCloseTo(L, 5);
  });

  test('buying a line unlocks it, spends cash, adds a train', () => {
    const g = new Game(city);
    const second = city.lines[1];
    expect(g.buyLine(second.id)).toBe(false); // can't afford
    g.cash = second.unlockCost + 5;
    expect(g.buyLine(second.id)).toBe(true);
    expect(g.cash).toBeCloseTo(5, 9);
    expect(g.isUnlocked(second.id)).toBe(true);
    expect(g.trains.some((t) => t.lineId === second.id)).toBe(true);
  });

  test('the train cost law: 2nd costs base, then ×2.5 each', () => {
    const g = new Game(city);
    const base = city.lines[0].trainCost;
    expect(g.nextTrainCost('1')).toBeCloseTo(base, 6);
    g.cash = base * 10;
    expect(g.buyTrain('1')).toBe(true);
    expect(g.nextTrainCost('1')).toBeCloseTo(base * 2.5, 6);
    expect(g.buyTrain('A')).toBe(false); // locked line sells no trains
  });

  test('saves round-trip and the offline law pays 50%, capped at 4h (b65)', () => {
    const g = run(300, (s) => {
      s.cash = 1e6;
      s.buyLine(city.lines[1].id);
      s.buyTrain('1');
    });
    expect(g.avgRate).toBeGreaterThan(0);
    const j = JSON.parse(JSON.stringify(g.toJson(1_000_000)));
    const r = Game.fromJson(city, j, 1_000_000);
    expect(r.offlineEarned).toBe(0);
    expect(r.game.cash).toBeCloseTo(g.cash, 3);
    expect(r.game.totalRiders).toBeCloseTo(g.totalRiders, 3);
    expect([...r.game.unlockedLineIds]).toEqual([...g.unlockedLineIds]);
    expect(r.game.trains.length).toBe(g.trains.length);
    expect(r.game.trains[0].distance).toBeCloseTo(g.trains[0].distance, 6);
    expect(r.game.rushClock).toBeCloseTo(g.rushClock, 6);
    for (const [id, w] of g.waitingUp) {
      expect(r.game.waitingUp.get(id)).toBeCloseTo(w, 6);
    }
    // Away for an hour: half the live rate.
    const hour = Game.fromJson(city, j, 1_000_000 + 3600_000);
    expect(hour.offlineEarned).toBeCloseTo(g.avgRate * 3600 * 0.5, 3);
    // Away for a week: capped at 4 hours (b65 — the comeback window).
    const week = Game.fromJson(city, j, 1_000_000 + 7 * 24 * 3600_000);
    expect(week.offlineEarned).toBeCloseTo(g.avgRate * 4 * 3600 * 0.5, 3);
    // And the restored world keeps running.
    const before = hour.game.totalEarned;
    for (let i = 0; i < 600; i++) hour.game.tick(0.1);
    expect(hour.game.totalEarned).toBeGreaterThan(before);
  });

  test('the rider rate tracks, saves, and pays out offline (b62)', () => {
    const g = run(300);
    expect(g.avgRiders).toBeGreaterThan(0);
    const j = JSON.parse(JSON.stringify(g.toJson(1_000_000)));
    const hour = Game.fromJson(city, j, 1_000_000 + 3600_000);
    expect(hour.game.avgRiders).toBeCloseTo(g.avgRiders, 6);
    expect(hour.offlineSeconds).toBeCloseTo(3600, 6);
    expect(hour.offlineRiders).toBeCloseTo(g.avgRiders * 3600 * 0.5, 3);
    expect(hour.game.totalRiders).toBeCloseTo(
      g.totalRiders + hour.offlineRiders, 3);
  });

  test('ENGAGEMENT LAWS (b65): variable contracts, decay, filler, relief, streak', () => {
    // Variable-ratio commissions: deterministic per index, spread out,
    // with GOLDEN (×10) contracts appearing at a real cadence.
    const mults = Array.from({ length: 200 }, (_, i) => Game.commissionPayoutMult(i));
    expect(mults).toEqual(Array.from({ length: 200 }, (_, i) => Game.commissionPayoutMult(i)));
    const golden = mults.filter((m) => m >= 10).length;
    expect(golden).toBeGreaterThanOrEqual(8);
    expect(golden).toBeLessThanOrEqual(40);
    for (const m of mults) {
      expect(m === 10 || (m >= 0.6 && m <= 2.4)).toBe(true);
    }
    const spread = new Set(mults.map((m) => m.toFixed(2)));
    expect(spread.size).toBeGreaterThan(50); // payouts genuinely vary

    // Crowding DECAY: a pinned platform sheds demand, then recovers.
    const g = new Game(city);
    const stop = g.city.lines[0].stationIds[3];
    g.waitingUp.set(stop, g.stationCapAt(stop));
    const before = g.demandMultAt(stop);
    for (let i = 0; i < 400; i++) {
      g.waitingUp.set(stop, g.stationCapAt(stop)); // hold it pinned
      g.tick(0.05);
    }
    expect(g.crowdPenalty.get(stop)!).toBeGreaterThan(0.5);
    expect(g.demandMultAt(stop)).toBeLessThan(before * 0.5);
    g.waitingUp.set(stop, 0); // serve it; recovery is 2× faster
    for (let i = 0; i < 400; i++) g.tick(0.05);
    expect(g.crowdPenalty.get(stop)!).toBeLessThan(0.01);

    // STREET TEAM filler: always priced ≈25s of the live rate.
    g.avgRate = 100;
    expect(g.streetTeamCost).toBeCloseTo(2500, 6);
    g.cash = 2500;
    const dm = g.demandMultAt(stop);
    expect(g.buyStreetTeam()).toBe(true);
    expect(g.cash).toBeCloseTo(0, 6);
    expect(g.streetTeamLevel).toBe(1);
    expect(g.demandMultAt(stop)).toBeCloseTo(dm * 1.005, 9);

    // RELIEF DISPATCH: crowded platform pays out and clears, then
    // cools down for 90s.
    const cap = g.stationCapAt(stop);
    g.waitingUp.set(stop, cap * 0.8);
    g.waitingDown.set(stop, 0); // the decay phase left down-riders here
    expect(g.reliefReady(stop)).toBe(true);
    const pay = g.dispatchRelief(stop);
    expect(pay).toBeCloseTo(cap * 0.8 * g.incomePerRiderAt(stop), 4);
    expect(g.waitingAt(stop)).toBe(0);
    g.waitingUp.set(stop, cap * 0.8);
    expect(g.reliefReady(stop)).toBe(false); // cooldown holds
    expect(g.dispatchRelief(stop)).toBe(0);

    // DAY STREAK: same day keeps it, next day bumps it, a gap resets;
    // the bonus lands on every fare.
    const day = 86_400_000;
    const j = JSON.parse(JSON.stringify(g.toJson(10 * day + 1000)));
    expect(Game.fromJson(city, j, 10 * day + 2000).game.streakDays).toBe(1);
    const bumped = Game.fromJson(city, j, 11 * day + 2000).game;
    expect(bumped.streakDays).toBe(2);
    expect(bumped.streakMult).toBeCloseTo(1.02, 9);
    expect(Game.fromJson(city, j, 14 * day).game.streakDays).toBe(1);
    const j2 = JSON.parse(JSON.stringify(bumped.toJson(11 * day + 3000)));
    expect(Game.fromJson(city, j2, 12 * day).game.streakDays).toBe(3);
    const plainFare = new Game(city).incomePerRiderAt(stop);
    expect(bumped.incomePerRiderAt(stop)).toBeCloseTo(plainFare * 1.02, 9);
  });

  test('UPGRADES WORK: each line-1 upgrade measurably raises earnings', () => {
    // b54 scale: shallow per-level gains — measured at L24 (below the
    // L25 milestone so the income doubling cannot mask a dead stat).
    const base = run(240).totalEarned;
    const faster = run(240, (g) => g.speedLevels.set('1', 24)).totalEarned;
    const bigger = run(240, (g) => g.carLevels.set('1', 24)).totalEarned;
    const access = run(240, (g) => g.accessLevels.set('1', 24)).totalEarned;
    const sets = run(240, (g) => g.trainsetLevels.set('1', 24)).totalEarned;
    // One L10 milestone (×1.5, b64) is inside all runs, so compare
    // against that shared floor: margins above ×1.5.
    expect(faster).toBeGreaterThan(base * 1.5 * 1.08);
    expect(bigger).toBeGreaterThan(base * 1.5 * 1.1);
    expect(access).toBeGreaterThan(base * 1.5 * 1.04);
    expect(sets).toBeGreaterThan(base * 1.5 * 1.03);
  });

  test('line unlocks scale ×1.6 per owned line (b64 pacing law)', () => {
    const g = new Game(city);
    const second = city.lines[1];
    const third = city.lines[2];
    expect(g.lineUnlockCost(second.id)).toBeCloseTo(second.unlockCost, 6);
    g.cash = second.unlockCost;
    expect(g.buyLine(second.id)).toBe(true); // first expansion at map price
    expect(g.lineUnlockCost(third.id)).toBeCloseTo(third.unlockCost * 1.6, 6);
    g.cash = third.unlockCost * 1.6 - 1;
    expect(g.buyLine(third.id)).toBe(false); // the display IS the charge
    g.cash = third.unlockCost * 1.6;
    expect(g.buyLine(third.id)).toBe(true);
    // Three owned: the next one costs ×1.6².
    expect(g.lineUnlockCost(city.lines[3].id)).toBeCloseTo(
      city.lines[3].unlockCost * 1.6 * 1.6, 6);
  });

  test('the displayed price IS the charged price at every level (b59 bug)', () => {
    // b59 field report: buttons showed the b54 ×1.14 curve but buys
    // still charged v1's ×1.9-×2.1 curves — "orange but tapping
    // doesn't purchase". Displayed and charged must be one number.
    const g = new Game(city);
    g.buyLine('1');
    for (const kind of ['speed', 'cars', 'access', 'trainset'] as const) {
      for (const level of [0, 14, 26, 60, 99]) {
        g.speedLevels.set('1', 0);
        g.carLevels.set('1', 0);
        g.accessLevels.set('1', 0);
        g.trainsetLevels.set('1', 0);
        g.lineUpgradeLevel(kind, '1'); // warm the getter path
        const map = {
          speed: g.speedLevels, cars: g.carLevels,
          access: g.accessLevels, trainset: g.trainsetLevels,
        }[kind];
        map.set('1', level);
        const shown = g.lineUpgradeBundle(kind, '1', 1).cost;
        // Exactly the shown price must clear the buy…
        g.cash = shown + 1e-9;
        expect(g.buyLineUpgrades(kind, '1', 1)).toBe(1);
        expect(map.get('1')).toBe(level + 1);
        expect(g.cash).toBeCloseTo(1e-9, 6);
        // …and a hair less must not.
        map.set('1', level);
        g.cash = shown * 0.999;
        expect(g.buyLineUpgrades(kind, '1', 1)).toBe(0);
      }
    }
  });

  test('MILESTONES: every 10/25/50/100 pays ×1.5 line income (b64)', () => {
    const g = new Game(city);
    expect(g.lineMilestoneMult('1')).toBe(1);
    g.speedLevels.set('1', 10);
    expect(g.milestonesFor('speed', '1')).toBe(1);
    expect(g.nextMilestone('speed', '1')).toBe(25);
    expect(g.lineMilestoneMult('1')).toBe(1.5);
    g.carLevels.set('1', 25);
    expect(g.lineMilestoneMult('1')).toBeCloseTo(Math.pow(1.5, 3), 9);
    g.accessLevels.set('1', 100);
    expect(g.milestonesFor('access', '1')).toBe(4);
    expect(g.nextMilestone('access', '1')).toBeNull();
    expect(g.lineMilestoneMult('1')).toBeCloseTo(Math.pow(1.5, 7), 9);
    // And it lands at the fare gate: same physics, ×1.5 money.
    const plain = run(120).totalEarned;
    const stoned = run(120, (s) => s.trainsetLevels.set('1', 10)).totalEarned;
    expect(stoned).toBeGreaterThan(plain * 1.4);
  });

  test('NETWORK upgrades pay (v1 bounds), utilities change what they claim', () => {
    const base = run(240).totalEarned;
    const mustBeat: [string, number][] = [
      ['signal', 1.03],
      ['doors', 1.04],
      ['marketing', 1.02],
      ['fare', 1.4],
      ['billboards', 1.1],
    ];
    for (const [id, factor] of mustBeat) {
      const boosted = run(240, (g) => g.globalLevels.set(id, 5)).totalEarned;
      expect(boosted, id).toBeGreaterThan(base * factor);
    }
    const g = new Game(city);
    expect(g.stationCapNow).toBe(Game.stationCapBase);
    g.globalLevels.set('crowd', 5);
    expect(g.stationCapNow).toBe(Game.stationCapBase + 40);
    expect(g.offlineEfficiencyNow).toBeCloseTo(0.5, 9);
    g.globalLevels.set('night', 5);
    expect(g.offlineEfficiencyNow).toBeCloseTo(0.8, 9);
    const full = g.nextTrainCost('1');
    g.globalLevels.set('yards', 10);
    expect(g.nextTrainCost('1')).toBeCloseTo(full * 0.6, 6);
  });

  test('network upgrade prices escalate to their caps', () => {
    const g = new Game(city);
    g.cash = 1e12;
    for (const def of GLOBALS) {
      let last = 0;
      let bought = 0;
      for (;;) {
        const cost = g.nextGlobalCost(def.id);
        if (!g.buyGlobal(def.id)) break;
        bought++;
        expect(cost, def.id).toBeGreaterThan(last);
        last = cost;
      }
      expect(bought, def.id).toBe(def.maxLevel);
    }
    expect(g.currentFare).toBeCloseTo(Game.fare + 0.25 * 8, 6);
  });

  test('shared stations COMPOUND every serving line upgrade (v1 law)', () => {
    const g = new Game(city);
    g.cash = 1e12;
    for (const id of ['A', 'L', 'M', 'N']) g.buyLine(id);
    const base = g.demandMultAt('s224_282'); // 45 St: lines 1 and N
    g.accessLevels.set('1', 5);
    g.trainsetLevels.set('1', 5);
    g.accessLevels.set('N', 5);
    g.foodLevel.set('s224_282', 5);
    expect(g.demandMultAt('s224_282')).toBeCloseTo(
      base * 1.15 * 1.125 * 1.15 * 1.5, 9);
  });

  test('income is checkable: one boarding pays riders × income model', () => {
    const g = new Game(city);
    g.foodLevel.set('s224_282', 2);
    g.gateLevel.set('s224_282', 1);
    g.securityLevel.set('s224_282', 1);
    g.globalLevels.set('billboards', 1);
    expect(g.incomePerRiderAt('s224_282')).toBeCloseTo(
      (2.0 + 0.4 * 2 + 0.25) * 1.04 * 1.03,
      9,
    );
  });

  test('STATION WORKS: tier-even bulk buy, lowest first, priority is mine', () => {
    const g = new Game(city);
    g.cash = 1e12;
    const stops = city.lines[0].stationIds;
    // Pre-raise all but one station to level 2 — the bulk buy must lift
    // ONLY the laggard until everyone is even.
    for (const sid of stops.slice(1)) g.foodLevel.set(sid, 2);
    expect(g.minStationLevel('1', 'food')).toBe(0);
    expect(g.stationsAtMin('1', 'food')).toBe(1);
    expect(g.buyStationTier('1', 'food')).toBe(1);
    expect(g.foodLevel.get(stops[0])).toBe(1);
    expect(g.buyStationTier('1', 'food')).toBe(1);
    expect(g.minStationLevel('1', 'food')).toBe(2);
    // Now everyone is level 2: the next tier lifts the whole line.
    expect(g.buyStationTier('1', 'food')).toBe(stops.length);
    // Priority reorder drives the planner.
    expect(g.nextPlannedType('1')).toBe('food');
    g.raisePriority('security');
    g.raisePriority('security');
    expect(g.stationPriority[3]).toBe('security');
    for (const sid of stops) g.foodLevel.set(sid, Game.foodMax);
    expect(g.nextPlannedType('1')).toBe('gates');
    // Single buys respect the served gate and the max level.
    expect(g.buyStationWork('food', stops[0])).toBe(false);
    expect(g.buyStationWork('escalators', stops[0])).toBe(true);
    expect(g.stationCapAt(stops[0])).toBe(Game.stationCapBase + 8);
  });

  test('works and upgrades survive the save round-trip', () => {
    const g = new Game(city);
    g.cash = 1e12;
    g.buyLine('A');
    g.buySpeed('1');
    g.buyAccess('1');
    g.buyGlobal('signal');
    g.buyStationWork('food', 's224_282');
    g.raisePriority('platform');
    const r = Game.fromJson(city, JSON.parse(JSON.stringify(g.toJson(1))), 1).game;
    expect(r.speedLevelOf('1')).toBe(1);
    expect(r.accessLevelOf('1')).toBe(1);
    expect(r.globalLevelOf('signal')).toBe(1);
    expect(r.foodLevel.get('s224_282')).toBe(1);
    expect(r.stationPriority).toEqual(g.stationPriority);
    expect(STATION_WORKS.length).toBe(6);
  });

  test('GOAL TRACKS run in parallel with typed benefits', () => {
    const g = new Game(city);
    expect(GOAL_TRACKS.length).toBe(4);
    expect(g.goalMult).toBe(1);
    expect(g.demandGoalMult).toBe(1);
    expect(g.buildCostMult).toBe(1);
    // Drive ONLY ridership: the GROWTH track advances alone.
    g.totalRiders = 60000;
    g.tick(0.05);
    expect(g.trackDone('growth')).toBe(3);
    expect(g.trackDone('profit')).toBe(0);
    expect(g.demandGoalMult).toBeCloseTo(1.1 * 1.1 * 1.15, 9);
    expect(g.goalMult).toBe(1); // growth never touches income
    // Demand rewards reach the arrivals model.
    const base = 1.1 * 1.1 * 1.15;
    expect(g.demandMultAt('s224_282')).toBeCloseTo(base, 9);
    // Money drives PROFIT (income) — and only income.
    g.totalEarned = 1_000_000;
    g.tick(0.05);
    expect(g.trackDone('profit')).toBe(3);
    expect(g.goalMult).toBeCloseTo(1.2 * 1.2 * 1.25, 9);
    expect(g.incomePerRiderAt('s126_452')).toBeCloseTo(Game.fare * 1.2 * 1.2 * 1.25, 6);
    // EXPANSION pays in build discounts, applied to purchase costs.
    const trainBefore = g.nextTrainCost('1');
    const speedBefore = g.nextSpeedCost('1');
    g.cash = 1e9;
    g.buyLine('A');
    g.buyTrain('1');
    g.buyTrain('1'); // lines 2 ✓, trains 4 ✓ -> two EXPANSION rungs
    g.tick(0.05);
    expect(g.trackDone('expansion')).toBe(2);
    expect(g.buildCostMult).toBeCloseTo(0.97 * 0.97, 9);
    expect(g.nextSpeedCost('1')).toBeCloseTo(speedBefore * 0.97 * 0.97, 6);
    expect(g.nextTrainCost('1')).toBeLessThan(trainBefore * 2.5 * 2.5); // discounted growth
    // Line unlocks are never discounted (progression pacing).
    expect(g.lineById('L').unlockCost).toBe(city.lines.find((l) => l.id === 'L')!.unlockCost);
  });

  test('every track completes and the benefits multiply out exactly', () => {
    const g = new Game(city);
    // b64 unlock scaling: the 24th line costs ×1.6²² its map price,
    // so the whole-city stake is bigger now.
    g.cash = 1e15;
    for (const line of city.lines) g.buyLine(line.id);
    for (let i = 0; i < 30; i++) g.buyTrain('1');
    g.totalRiders = 100_000_000;
    g.totalEarned = 2_000_000_000;
    g.commissionsDone = 99;
    g.rushEarnings = 1e8;
    for (const l of ['1', 'A', 'L', 'M', 'N', 'J', 'G', 'E', '7', 'B', 'D', 'F'])
      g.speedLevels.set(l, 10);
    const stops = city.lines[0].stationIds;
    for (let i = 0; i < 12; i++) g.parkingLevel.set(stops[i], 5);
    g.tick(0.05);
    let income = 1;
    let demand = 1;
    let build = 1;
    for (const track of GOAL_TRACKS) {
      expect(g.trackCurrentGoal(track.id), track.id).toBeNull();
      for (const goal of track.goals) {
        if (track.benefit === 'income') income *= goal.reward;
        else if (track.benefit === 'riders') demand *= goal.reward;
        else build *= goal.reward;
      }
    }
    expect(g.goalMult).toBeCloseTo(income, 6);
    expect(g.demandGoalMult).toBeCloseTo(demand, 6);
    expect(g.buildCostMult).toBeCloseTo(build, 6);
    expect(g.incomePerRiderAt('s126_452')).toBeCloseTo(Game.fare * income, 3);
  });

  test('the first commendation fires by itself in normal play', () => {
    const g = run(400, (s) => {
      s.cash = 10000;
      s.buyTrain('1');
    });
    expect(g.goalSeq).toBeGreaterThanOrEqual(1);
    expect(g.demandGoalMult * g.goalMult * (2 - g.buildCostMult)).toBeGreaterThan(1);
  });

  test('contract types rotate through five different jobs', () => {
    const g = new Game(city);
    expect(g.commissionType).toBe('haul');
    g.skipCommission();
    expect(g.commissionType).toBe('express');
    expect(g.commissionQuota).toBe(6);
    g.skipCommission();
    expect(g.commissionType).toBe('station');
    expect(g.commissionStationId).not.toBeNull();
    g.skipCommission();
    expect(g.commissionType).toBe('sweep');
    expect(g.commissionQuota).toBe(city.lines[0].stationIds.length);
    g.skipCommission();
    expect(g.commissionType).toBe('rushCash');
    expect(g.commissionTimeLimit).toBe(240);
    g.skipCommission();
    expect(g.commissionType).toBe('haul');
  });

  test('TURNBACK RUN pays for fleet speed', () => {
    const g = new Game(city);
    g.commissionIndex = 1;
    g.cash = 1e9;
    g.buyTrain('1');
    g.buyTrain('1');
    g.buyTrain('1');
    g.acceptCommission();
    let guard = 0;
    while (g.commissionActive && guard++ < 12000) g.tick(0.1);
    expect(g.lastCommissionWon).toBe(true);
  });

  test('HUB SERVICE: bare service fails, an invested line+hub wins', () => {
    const bare = new Game(city);
    bare.commissionIndex = 2;
    const hub = bare.commissionStationId!;
    expect(city.lines[0].stationIds[0]).not.toBe(hub);
    bare.acceptCommission();
    let guard = 0;
    while (bare.commissionActive && guard++ < 12000) bare.tick(0.1);
    expect(bare.lastCommissionWon).toBe(false);

    const g = new Game(city);
    g.commissionIndex = 2;
    g.carLevels.set('1', 9); // +18/stop, matching the sim-sized quota
    g.foodLevel.set(hub, 5);
    g.parkingLevel.set(hub, 5);
    g.acceptCommission();
    guard = 0;
    while (g.commissionActive && guard++ < 12000) g.tick(0.1);
    expect(g.lastCommissionWon).toBe(true);
  });

  test('CLEAN SWEEP wins the moment every platform is clear', () => {
    const g = new Game(city);
    g.commissionIndex = 3;
    g.acceptCommission();
    g.tick(0.1); // fresh platforms are all under the threshold
    expect(g.lastCommissionWon).toBe(true);
  });

  test('RUSH CONTRACT counts only rush-window earnings', () => {
    const g = new Game(city);
    g.commissionIndex = 4;
    g.acceptCommission();
    for (let i = 0; i < 1340; i++) g.tick(0.1); // to 134s — still calm
    expect(g.commissionProgress).toBe(0);
    for (let i = 0; i < 300; i++) g.tick(0.1); // through the rush window
    expect(g.commissionProgress).toBeGreaterThan(0);
    expect(g.rushEarnings).toBeGreaterThan(0);
  });

  test('a hopeless contract expires and the desk moves on', () => {
    const g = new Game(city);
    g.commissionIndex = 12; // a HUB SERVICE far beyond a level-0 hub
    expect(g.commissionType).toBe('station');
    g.acceptCommission();
    for (let i = 0; i < 1300; i++) g.tick(0.1);
    expect(g.commissionActive).toBe(false);
    expect(g.lastCommissionWon).toBe(false);
    expect(g.commissionIndex).toBe(13);
  });

  test('mid-flight commissions, goals, and rush earnings survive a save', () => {
    const m = new Game(city);
    m.acceptCommission();
    m.goalsDoneByTrack.set('profit', 3);
    m.rushEarnings = 1234.5;
    for (let i = 0; i < 100; i++) m.tick(0.1);
    const r = Game.fromJson(city, JSON.parse(JSON.stringify(m.toJson(1))), 1).game;
    expect(r.commissionActive).toBe(true);
    expect(r.commissionLineId).toBe(m.commissionLineId);
    expect(r.commissionProgress).toBeCloseTo(m.commissionProgress, 3);
    expect(r.commissionTimeLeft).toBeCloseTo(m.commissionTimeLeft, 3);
    expect(r.trackDone('profit')).toBeGreaterThanOrEqual(3);
    // The restore RECOMPUTES the multiplier from the tracks — at least
    // the three saved PROFIT rungs are in the product.
    expect(r.goalMult).toBeGreaterThanOrEqual(1.2 * 1.2 * 1.25 - 1e-9);
    expect(r.rushEarnings).toBeCloseTo(m.rushEarnings + 0, 1);
  });

  test('every train keeps serving with the whole network unlocked', () => {
    const g = Game.showcase(city, 2);
    for (let i = 0; i < 1200; i++) g.tick(0.1);
    expect(g.totalEarned).toBeGreaterThan(0);
    for (const t of g.trains) {
      const path = g.paths.get(t.lineId)!;
      expect(t.distance).toBeGreaterThanOrEqual(-1e-9);
      expect(t.distance).toBeLessThanOrEqual(path.length + 1e-9);
    }
  });

  test('platform caps hold; unserved stations stay empty', () => {
    const g = run(1200);
    for (const st of city.stations) {
      expect(g.waitingAt(st.id)).toBeLessThanOrEqual(Game.stationCapBase + 1e-6);
      if (!g.isServed(st.id)) expect(g.waitingAt(st.id)).toBe(0);
    }
  });
});

describe('the city ladder (M3c) — v1 moveOn law, v2 track shape', () => {
  const angelBay = JSON.parse(
    readFileSync(new URL('../src/data/angel_bay.json', import.meta.url), 'utf8'),
  ) as CityDef;

  /** A New Meridian world with all four tracks finished. */
  function finished(): Game {
    const g = new Game(city);
    g.cash = 1e15;
    for (const l of g.city.lines) if (!g.isUnlocked(l.id)) g.buyLine(l.id);
    while (g.trains.length < 25) g.buyTrain('1');
    g.totalRiders = 100000000;
    g.totalEarned = 2000000000;
    g.commissionsDone = 12;
    g.rushEarnings = 10000000;
    g.speedLevels.set('1', 100);
    g.speedLevels.set('A', 20); // 120 line-upgrade levels
    const stops = g.city.lines[0].stationIds;
    for (let i = 0; i < 12; i++) g.parkingLevel.set(stops[i], 5); // 60 works
    g.tick(0.05);
    return g;
  }

  test('the approved Angel Bay geometry came through the bridge', () => {
    expect(angelBay.stations.length).toBe(59);
    expect(angelBay.lines.length).toBe(9);
    expect((angelBay as { costScale?: number }).costScale).toBe(10);
    expect((angelBay as { fareScale?: number }).fareScale).toBe(8);
  });

  test('finish every track in New Meridian, open Angel Bay', () => {
    const g = new Game(city);
    expect(g.nextCityId).toBe('angel_bay');
    expect(g.canMoveOn).toBe(false);
    const done = finished();
    for (const t of GOAL_TRACKS) expect(done.trackCurrentGoal(t.id)).toBeNull();
    expect(done.canMoveOn).toBe(true);
    const multBefore = done.goalMult;
    const demandBefore = done.demandGoalMult;
    const buildBefore = done.buildCostMult;
    const cashBefore = done.cash;

    const ab = done.moveOn(angelBay);
    expect(ab.city.id).toBe('angel_bay');
    expect(ab.cash).toBe(cashBefore); // cash moves with you
    expect(ab.goalMult).toBeCloseTo(multBefore, 9); // every commendation carries
    expect(ab.demandGoalMult).toBeCloseTo(demandBefore, 9);
    expect(ab.buildCostMult).toBeCloseTo(buildBefore, 9);
    expect([...ab.unlockedLineIds]).toEqual(['1']); // the network starts fresh
    expect(ab.trains.length).toBe(1);
    expect(ab.speedLevelOf('1')).toBe(0);
    expect(ab.trackDone('growth')).toBe(0); // Angel Bay's own tracks start at 0
    expect(ab.trackCurrentGoal('expansion')!.name).toBe('WEST SHORE OPENS');
    expect(ab.nextCityId).toBeNull(); // Angel Bay is the frontier for now
    expect(ab.currentFare).toBeCloseTo(Game.fare * 8, 9); // bay riders pay 8×

    // Carried lifetime counters sit BELOW every Angel Bay target — no
    // track completes for free on arrival.
    ab.tick(0.05);
    for (const t of ANGEL_BAY_TRACKS) expect(ab.trackDone(t.id)).toBe(0);

    // And the new city earns from its own line 1 immediately.
    const before = ab.totalEarned;
    for (let i = 0; i < 2400; i++) ab.tick(0.1);
    expect(ab.totalEarned).toBeGreaterThan(before);
    expect(ab.totalRiders).toBeGreaterThan(100000000);
  });

  test('moveOn is refused before the ladder is finished', () => {
    const g = new Game(city);
    expect(() => g.moveOn(angelBay)).toThrow();
  });

  test('Angel Bay serves with everything unlocked, at 10× build costs', () => {
    const g = new Game(angelBay);
    // costScale reaches every purchase lane.
    expect(g.nextGlobalCost('signal')).toBeCloseTo(2500 * 10, 6);
    g.cash = 1e15;
    for (const l of g.city.lines) {
      if (!g.isUnlocked(l.id)) expect(g.buyLine(l.id)).toBe(true);
    }
    g.buyTrain('1');
    for (let i = 0; i < 6000; i++) g.tick(0.1);
    expect(g.totalRiders).toBeGreaterThan(0);
    for (const st of g.city.stations) {
      expect(g.waitingAt(st.id)).toBeLessThanOrEqual(g.stationCapAt(st.id) + 1e-6);
    }
  });

  test('the whole ladder survives a save round-trip', () => {
    const ab = finished().moveOn(angelBay);
    ab.cash = 12345;
    for (let i = 0; i < 200; i++) ab.tick(0.05);
    const j = ab.toJson(1_000_000);
    expect(j.cityId).toBe('angel_bay');
    const r = Game.fromJson(angelBay, j as Record<string, unknown>, 1_000_000);
    expect(r.game.city.id).toBe('angel_bay');
    expect(r.game.goalMult).toBeCloseTo(ab.goalMult, 9);
    expect(r.game.demandGoalMult).toBeCloseTo(ab.demandGoalMult, 9);
    expect(r.game.buildCostMult).toBeCloseTo(ab.buildCostMult, 9);
    // The New Meridian bank came through complete, field for field.
    expect(r.game.priorGoals.new_meridian).toEqual(
      Object.fromEntries(GOAL_TRACKS.map((t) => [t.id, t.goals.length])),
    );
    expect(r.game.priorGoals).toEqual(ab.priorGoals);
  });
});
