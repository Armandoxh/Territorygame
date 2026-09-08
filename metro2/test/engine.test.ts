/** v2 engine guard. v1's Dart harness stays the balance authority; these
 * tests pin that the TS port matches the v1 laws for the systems ported
 * so far: determinism, the light cycle, arrivals/boarding, spawning. */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { CityDef } from '../src/engine/city';
import { Game } from '../src/engine/game';

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

  test('saves round-trip and the offline law pays 50%, capped at 8h', () => {
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
    // Away for a week: capped at 8 hours.
    const week = Game.fromJson(city, j, 1_000_000 + 7 * 24 * 3600_000);
    expect(week.offlineEarned).toBeCloseTo(g.avgRate * 8 * 3600 * 0.5, 3);
    // And the restored world keeps running.
    const before = hour.game.totalEarned;
    for (let i = 0; i < 600; i++) hour.game.tick(0.1);
    expect(hour.game.totalEarned).toBeGreaterThan(before);
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
