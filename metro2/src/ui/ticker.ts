/** THE WIRE — a one-line news ticker that reacts to the network.
 * Pure presentation: it watches engine seq counters and live state,
 * queues headlines, and rotates them. Visual-only PRNG (seeded) picks
 * phrasings; the sim stays deterministic.
 */
import { Game } from '../engine/game';

const SHOW_MS = 7000;
const CROWD_COOLDOWN_MS = 180000;

/** Tiny seeded PRNG — renderer-side only. */
function makeRnd(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a * 1103515245 + 12345) & 0x7fffffff;
    return a / 0x7fffffff;
  };
}

export class Ticker {
  private el: HTMLElement;
  private queue: string[] = [];
  private lastShown = '';
  private shownAt = 0;
  private rnd = makeRnd(0xa11ce);

  private unlockSeq: number;
  private goalSeq: number;
  private commSeq: number;
  private rushWas = false;
  private rushWarned = -1;
  private goldenWarned = -1;
  private superSeq = 0;
  private superShownAt = 0;
  private milesWas: number;
  private crowdShownAt = new Map<string, number>();
  private lastFiller = 0;

  constructor(private game: Game, el: HTMLElement) {
    this.el = el;
    this.unlockSeq = game.unlockSeq;
    this.goalSeq = game.goalSeq;
    this.commSeq = game.commissionSeq;
    this.milesWas = this.milesNow();
    this.push(`THE ${game.city.name.toUpperCase()} WIRE — service update feed`);
  }

  private milesNow(): number {
    let n = 0;
    for (const l of this.game.city.lines) {
      if (this.game.isUnlocked(l.id)) n += this.game.lineMilestoneCount(l.id);
    }
    return n;
  }

  private pick(lines: string[]): string {
    return lines[Math.floor(this.rnd() * lines.length)];
  }

  push(line: string): void {
    if (this.queue.length < 6 && line !== this.lastShown) this.queue.push(line);
  }

  /** Call ~every frame; cheap. */
  update(nowMs: number): void {
    const g = this.game;
    if (g.unlockSeq !== this.unlockSeq) {
      this.unlockSeq = g.unlockSeq;
      const name = g.lineById(g.lastUnlockedLineId)?.name ?? 'a new line';
      this.push(this.pick([
        `Transit Board approves the ${name} — first train enters service`,
        `Ribbon cut on the ${name}; Mayor takes credit`,
        `${name} opens to full platforms across ${g.city.name}`,
      ]));
    }
    if (g.goalSeq !== this.goalSeq) {
      this.goalSeq = g.goalSeq;
      this.push(this.pick([
        `City Hall commends the network — "${g.lastGoalName}" achieved`,
        `"${g.lastGoalName}" — front page of the ${g.city.name} Herald`,
        `Commendation posted: ${g.lastGoalName}. Riders notice.`,
      ]));
    }
    if (g.commissionSeq !== this.commSeq) {
      this.commSeq = g.commissionSeq;
      this.push(
        g.lastCommissionWon
          ? this.pick([
              'Contract delivered — City Hall pays out on time',
              'Freight desk clears another commission; broker impressed',
            ])
          : this.pick([
              'Contract lapses — the commission desk moves on',
              'City Hall lets a contract expire; no payout',
            ]),
      );
    }
    // Cliffhanger: the rush announces itself 30s out.
    const untilRush = g.secondsUntilRushStart(0);
    if (!g.rushActive && untilRush <= 30 && this.rushWarned !== g.rushCycleId) {
      this.rushWarned = g.rushCycleId;
      this.push('⚡ Night rush in 30 seconds — position your trains');
    }
    // A GOLDEN CONTRACT on the desk is front-page news.
    if (!g.commissionActive && g.commissionIsGolden && this.goldenWarned !== g.commissionIndex) {
      this.goldenWarned = g.commissionIndex;
      this.push('★ GOLDEN CONTRACT on the commission desk — ×10 the usual fee');
    }
    if (g.rushActive !== this.rushWas) {
      this.rushWas = g.rushActive;
      if (g.rushActive) {
        this.push(this.pick([
          `Night rush — platforms packed across ${g.city.name}`,
          'Evening bell: every fare rides ×2.5 until the rush clears',
        ]));
      }
    }
    if (g.superSeq !== this.superSeq) {
      const line = g.lineById(g.lastSuperLineId);
      this.superSeq = g.superSeq;
      if (line && nowMs - this.superShownAt > 45000) {
        this.superShownAt = nowMs;
        this.push(this.pick([
          `${line.name} superintendent signs off another upgrade`,
          `Depot memo: the ${line.name} desk keeps investing`,
          `${line.name} crews upgraded again — the superintendent never sleeps`,
        ]));
      }
    }
    const miles = this.milesNow();
    if (miles > this.milesWas) {
      this.milesWas = miles;
      this.push('Service milestone reached — depot adds a car to the flagship run');
    }
    // Crowding complaints: any served platform pinned at capacity.
    for (const st of g.city.stations) {
      if (!g.isServed(st.id)) continue;
      if (g.waitingAt(st.id) < g.stationCapAt(st.id) * 0.98) continue;
      const last = this.crowdShownAt.get(st.id) ?? 0;
      if (nowMs - last < CROWD_COOLDOWN_MS) continue;
      this.crowdShownAt.set(st.id, nowMs);
      this.push(this.pick([
        `${st.name} crowding draws complaints from residents`,
        `Platform crush at ${st.name} — riders left waiting`,
        `${st.name} at capacity; local paper runs photos`,
      ]));
      break;
    }
    // Idle filler so the wire never goes dead, at most every ~25s.
    if (this.queue.length === 0 && nowMs - this.lastFiller > 25000) {
      this.lastFiller = nowMs;
      const lines = g.city.lines.filter((l) => g.isUnlocked(l.id)).length;
      this.push(this.pick([
        `Ridership steady at ${Math.round(g.avgRiders)} boardings/s across ${lines} line${lines === 1 ? '' : 's'}`,
        `Fare desk reports $${g.currentFare.toFixed(2)} per boarding citywide`,
        `${g.trains.length} trainsets in service this evening`,
        'Weather desk: clear skies over the harbor, normal service',
      ]));
    }
    // Rotate.
    if (nowMs - this.shownAt >= SHOW_MS && this.queue.length > 0) {
      this.shownAt = nowMs;
      this.lastShown = this.queue.shift()!;
      this.el.classList.remove('flash');
      void this.el.offsetWidth; // restart the CSS transition
      this.el.classList.add('flash');
      this.el.textContent = this.lastShown;
    }
  }
}
