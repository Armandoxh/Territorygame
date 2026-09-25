import { Container, Graphics } from 'pixi.js';
import { BUILDINGS, PEASANT_TRAIN_SECONDS, TILE, type BuildingKind } from './config';
import type { Building, Game, Mine, Unit } from './game';
import { depthOf, ISO_H, ISO_W, isoOfTile, isoOfWorld, tileOfIso } from './iso';
import { WATER } from './map';

// Stand-in art drawn in code. Every object is its own display object in a
// depth-sorted container, so swapping any of them for a sprite is local.

const COL = {
  grass: [0x6aa84f, 0x6cab50, 0x68a64d, 0x6ba94e],
  sand: 0xd9c38a,
  water: 0x3f7fc0,
  waterLight: 0x6fa6dc,
  dirtSide: 0x7a5534,
  dirtSideDark: 0x5e3f25,
  pineLight: 0x3f8a3a,
  pineDark: 0x2c6a2c,
  leafLight: 0x5fa845,
  leafDark: 0x3f7d33,
  trunk: 0x6b4526,
  rockLight: 0xa9a39a,
  rockMid: 0x8a847b,
  rockDark: 0x69635b,
  gold: 0xf4cc4a,
  goldDark: 0xc79a1e,
  player: 0x2f6fd6,
  playerDark: 0x214f9c,
  skin: 0xf1c7a0,
  straw: 0xe3c56b,
  select: 0xffffff,
  good: 0x7ee07e,
  bad: 0xe25555,
};

interface Style {
  wallH: number;
  roofH: number;
  wallL: number;
  wallR: number;
  roofL: number;
  roofR: number;
  roofBackL: number;
  roofBackR: number;
}

const STYLE: Record<BuildingKind, Style> = {
  hall: { wallH: 34, roofH: 34, wallL: 0xeadbc0, wallR: 0xcdbb9a, roofL: 0xb2452f, roofR: 0x8a3322, roofBackL: 0xc85a40, roofBackR: 0x9c3b28 },
  house: { wallH: 20, roofH: 22, wallL: 0xe4d2b0, wallR: 0xc4b08c, roofL: 0xa8603a, roofR: 0x824628, roofBackL: 0xbd7449, roofBackR: 0x955233 },
  mill: { wallH: 18, roofH: 16, wallL: 0xa77a4c, wallR: 0x86603a, roofL: 0x5d7a55, roofR: 0x455d40, roofBackL: 0x6f8f66, roofBackR: 0x55704e },
};

/** Peasants are drawn a bit larger than true scale so they read on a phone. */
const UNIT_SCALE = 1.35;

const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Point on a building's left (L→B) or right (B→R) wall: t along the face, h up. */
function wallPt(face: 'L' | 'R', hw: number, hh: number, t: number, h: number): [number, number] {
  return face === 'L' ? [-hw + t * hw, t * hh - h] : [t * hw, hh - t * hh - h];
}

export interface Overlay {
  selectedUnits: Set<number>;
  selectedBuilding: number | null;
  ghost: { kind: BuildingKind; tx: number; ty: number; ok: boolean } | null;
  marker: { x: number; y: number; t: number } | null; // iso px
}

export class Renderer {
  readonly world = new Container();
  private ground = new Graphics();
  private objects = new Container({ sortableChildren: true });
  private overlay = new Graphics();
  private trees = new Map<number, Graphics>();
  private mines = new Map<number, Graphics>();
  private buildings = new Map<number, { g: Graphics; key: string }>();
  private units = new Map<number, Graphics>();
  private treeVersion = -1;

  constructor(private game: Game) {
    this.world.addChild(this.ground, this.objects, this.overlay);
    this.drawGround();
  }

  // ---------- picking (iso px in, entity out) ----------

  pickUnit(ix: number, iy: number, radius: number): Unit | null {
    let best: Unit | null = null;
    let bestD = radius;
    for (const u of this.game.units) {
      const p = isoOfWorld(u.x, u.y);
      const d = Math.hypot(p.x - ix, p.y - 14 * UNIT_SCALE - iy); // aim at the body, not the feet
      if (d < bestD) { bestD = d; best = u; }
    }
    return best;
  }

  /** Building or mine whose drawn silhouette contains the point; front-most wins. */
  pickStructure(ix: number, iy: number): Building | Mine | null {
    let best: Building | Mine | null = null;
    let bestDepth = -Infinity;
    const test = (e: Building | Mine, height: number) => {
      const c = isoOfTile(e.tx + e.size / 2, e.ty + e.size / 2);
      const hw = (e.size * ISO_W) / 2;
      const hh = (e.size * ISO_H) / 2;
      const dx = Math.abs(ix - c.x);
      if (dx > hw) return;
      const k = 1 - dx / hw;
      if (iy < c.y - hh * k - height || iy > c.y + hh * k) return;
      const d = depthOf(e.tx + e.size / 2, e.ty + e.size / 2);
      if (d > bestDepth) { bestDepth = d; best = e; }
    };
    for (const b of this.game.buildings.values()) {
      const s = STYLE[b.kind];
      test(b, b.progress < 1 ? s.wallH : s.wallH + s.roofH);
    }
    for (const m of this.game.mines.values()) test(m, 30);
    return best;
  }

  /** Tree whose canopy covers the point (canopies stand ~1.3 tiles tall). */
  pickTree(ix: number, iy: number): { x: number; y: number } | null {
    const map = this.game.map;
    for (let k = 1.3; k >= 0; k -= 0.2) {
      const t = tileOfIso(ix, iy + k * ISO_H);
      const tx = Math.floor(t.x);
      const ty = Math.floor(t.y);
      if (!map.hasTree(tx, ty)) continue;
      const c = isoOfTile(tx + 0.5, ty + 0.5);
      if (Math.abs(c.x - ix) < 16) return { x: tx, y: ty };
    }
    return null;
  }

  // ---------- per-frame ----------

  draw(o: Overlay): void {
    const game = this.game;
    if (this.treeVersion !== game.map.treeVersion) this.syncTrees();

    for (const [id, g] of this.mines) if (!game.mines.has(id)) { g.destroy(); this.mines.delete(id); }
    for (const m of game.mines.values())
      if (!this.mines.has(m.id)) this.mines.set(m.id, this.addAt(this.drawMine(new Graphics(), m), m.tx + m.size / 2, m.ty + m.size / 2));

    for (const b of game.buildings.values()) {
      const sel = b.id === o.selectedBuilding;
      const train = b.queue > 0 ? Math.floor((b.trainTimer / PEASANT_TRAIN_SECONDS) * 30) : '-';
      const key = `${b.progress >= 1 ? 'done' : Math.floor(b.progress * 50)}|${sel}|${train}`;
      let entry = this.buildings.get(b.id);
      if (!entry) {
        entry = { g: this.addAt(new Graphics(), b.tx + b.size / 2, b.ty + b.size / 2), key: '' };
        this.buildings.set(b.id, entry);
      }
      if (entry.key !== key) {
        entry.key = key;
        this.drawBuilding(entry.g.clear(), b, sel);
      }
    }

    const alive = new Set<number>();
    for (const u of game.units) {
      alive.add(u.id);
      let g = this.units.get(u.id);
      if (!g) { g = new Graphics(); this.objects.addChild(g); this.units.set(u.id, g); }
      const p = isoOfWorld(u.x, u.y);
      g.position.set(p.x, p.y);
      g.zIndex = depthOf(u.x / TILE, u.y / TILE) + 0.01;
      g.scale.set(UNIT_SCALE);
      this.drawUnit(g.clear(), u, o.selectedUnits.has(u.id));
    }
    for (const [id, g] of this.units) if (!alive.has(id)) { g.destroy(); this.units.delete(id); }

    const ov = this.overlay.clear();
    if (o.marker) {
      const age = game.time - o.marker.t;
      if (age < 0.6) {
        const s = 1 + age * 2;
        ov.ellipse(o.marker.x, o.marker.y, 10 * s, 5 * s).stroke({ width: 2, color: COL.good, alpha: 1 - age / 0.6 });
      }
    }
    if (o.ghost) {
      const s = BUILDINGS[o.ghost.kind].size;
      const c = o.ghost.ok ? COL.good : COL.bad;
      const pts = [
        isoOfTile(o.ghost.tx, o.ghost.ty), isoOfTile(o.ghost.tx + s, o.ghost.ty),
        isoOfTile(o.ghost.tx + s, o.ghost.ty + s), isoOfTile(o.ghost.tx, o.ghost.ty + s),
      ].flatMap((p) => [p.x, p.y]);
      ov.poly(pts).fill({ color: c, alpha: 0.35 }).stroke({ width: 2, color: c });
    }
  }

  // ---------- helpers ----------

  private addAt(g: Graphics, fx: number, fy: number): Graphics {
    const p = isoOfTile(fx, fy);
    g.position.set(p.x, p.y);
    g.zIndex = depthOf(fx, fy);
    this.objects.addChild(g);
    return g;
  }

  private drawGround(): void {
    const { map } = this.game;
    const g = this.ground;
    const isWater = (x: number, y: number) => map.inBounds(x, y) && map.terrain[map.idx(x, y)] === WATER;
    for (let y = 0; y < map.h; y++)
      for (let x = 0; x < map.w; x++) {
        const a = isoOfTile(x, y);
        const b = isoOfTile(x + 1, y);
        const c = isoOfTile(x + 1, y + 1);
        const d = isoOfTile(x, y + 1);
        const pts = [a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y];
        if (isWater(x, y)) {
          g.poly(pts).fill(COL.water);
          if (hash(x, y) < 0.35) {
            const m = isoOfTile(x + 0.5, y + 0.5);
            g.moveTo(m.x - 8, m.y).lineTo(m.x + 6, m.y).stroke({ width: 1.5, color: COL.waterLight, alpha: 0.7 });
          }
          continue;
        }
        let beach = false;
        for (let dy = -1; dy <= 1 && !beach; dy++)
          for (let dx = -1; dx <= 1 && !beach; dx++) beach = isWater(x + dx, y + dy);
        g.poly(pts).fill(beach ? COL.sand : COL.grass[Math.floor(hash(x, y) * 4)]!);
        if (!beach && hash(y, x) < 0.3) {
          // Grass tufts: tiny V strokes so the ground reads as texture.
          const m = isoOfTile(x + 0.2 + hash(x + 3, y) * 0.6, y + 0.2 + hash(x, y + 3) * 0.6);
          g.moveTo(m.x - 2, m.y - 3).lineTo(m.x, m.y).lineTo(m.x + 2, m.y - 3).stroke({ width: 1, color: 0x4f8a3a });
        }
      }
    // Earth sides along the two front edges so the map reads as a raised slab.
    const D = 18;
    for (let x = 0; x < map.w; x++) {
      const l = isoOfTile(x, map.h);
      const r = isoOfTile(x + 1, map.h);
      g.poly([l.x, l.y, r.x, r.y, r.x, r.y + D, l.x, l.y + D]).fill(COL.dirtSide);
    }
    for (let y = 0; y < map.h; y++) {
      const t = isoOfTile(map.w, y);
      const b = isoOfTile(map.w, y + 1);
      g.poly([t.x, t.y, b.x, b.y, b.x, b.y + D, t.x, t.y + D]).fill(COL.dirtSideDark);
    }
  }

  private syncTrees(): void {
    const { map } = this.game;
    for (const [i, g] of this.trees) if (map.tree[i] === 0) { g.destroy(); this.trees.delete(i); }
    for (let y = 0; y < map.h; y++)
      for (let x = 0; x < map.w; x++) {
        const i = map.idx(x, y);
        if (map.tree[i]! > 0 && !this.trees.has(i)) this.trees.set(i, this.addAt(this.drawTree(new Graphics(), x, y), x + 0.5, y + 0.5));
      }
    this.treeVersion = map.treeVersion;
  }

  private drawTree(g: Graphics, x: number, y: number): Graphics {
    const s = 0.85 + hash(x, y) * 0.35;
    const ox = (hash(y, x) - 0.5) * 8;
    g.ellipse(ox + 3, 1, 14 * s, 6 * s).fill({ color: 0x000000, alpha: 0.18 });
    g.rect(ox - 2, -12 * s, 4, 12 * s).fill(COL.trunk);
    if (hash(x + 11, y) < 0.7) {
      // Pine: three stacked tiers, lit from the left.
      for (let k = 0; k < 3; k++) {
        const base = -10 * s - k * 11 * s;
        const w = (15 - k * 3.5) * s;
        const top = base - 17 * s;
        g.poly([ox - w, base, ox, base + 3, ox, top]).fill(COL.pineLight);
        g.poly([ox, base + 3, ox + w, base, ox, top]).fill(COL.pineDark);
      }
    } else {
      // Broadleaf: overlapping lumps.
      g.circle(ox + 4, -22 * s, 12 * s).fill(COL.leafDark);
      g.circle(ox - 5, -24 * s, 11 * s).fill(COL.leafDark);
      g.circle(ox - 3, -28 * s, 10 * s).fill(COL.leafLight);
      g.circle(ox - 7, -24 * s, 6 * s).fill(0x74bd57);
    }
    return g;
  }

  private drawMine(g: Graphics, m: Mine): Graphics {
    const hw = (m.size * ISO_W) / 2;
    const hh = (m.size * ISO_H) / 2;
    g.ellipse(0, 4, hw * 0.95, hh * 0.95).fill({ color: 0x000000, alpha: 0.18 });
    // Rock mound: lit left facets, shaded right.
    g.poly([-hw * 0.9, 0, -hw * 0.4, -26, 0, -34, 0, hh * 0.8]).fill(COL.rockLight);
    g.poly([0, -34, hw * 0.45, -24, hw * 0.9, 0, 0, hh * 0.8]).fill(COL.rockMid);
    g.poly([-hw * 0.5, -22, -hw * 0.1, -40, hw * 0.25, -30, 0, -16]).fill(COL.rockLight);
    g.poly([hw * 0.25, -30, hw * 0.55, -14, 0, -16]).fill(COL.rockDark);
    // Entrance with a timber frame on the front-left face.
    g.poly([-20, 10, -4, 18, -4, 2, -20, -6]).fill(0x2a2118);
    g.poly([-22, 11, -20, 12, -20, -8, -22, -9]).fill(COL.trunk);
    g.poly([-4, 19, -2, 20, -2, 0, -4, -1]).fill(COL.trunk);
    g.poly([-22, -9, -2, 1, -2, -2, -22, -12]).fill(COL.trunk);
    for (const [x, y, r] of [[-hw * 0.45, -14, 3.5], [hw * 0.3, -12, 3], [-6, -28, 3], [hw * 0.55, -4, 2.5], [10, -22, 2.5]] as const) {
      g.circle(x, y, r).fill(COL.gold);
      g.circle(x + r * 0.3, y + r * 0.3, r * 0.5).fill(COL.goldDark);
    }
    // Gold pile out front.
    g.ellipse(10, 18, 9, 4).fill(COL.goldDark);
    g.ellipse(9, 16, 7, 3).fill(COL.gold);
    return g;
  }

  private drawBuilding(g: Graphics, b: Building, selected: boolean): void {
    const st = STYLE[b.kind];
    const inset = 0.84;
    const hw = ((b.size * ISO_W) / 2) * inset;
    const hh = ((b.size * ISO_H) / 2) * inset;
    const fhw = (b.size * ISO_W) / 2;
    const fhh = (b.size * ISO_H) / 2;

    if (selected) g.poly([0, -fhh, fhw, 0, 0, fhh, -fhw, 0]).stroke({ width: 2, color: COL.select });
    g.poly([0, -hh - 2, hw + 6, 0, 0, hh + 6, -hw, 2]).fill({ color: 0x000000, alpha: 0.18 });

    if (b.progress < 1) {
      // Foundation, rising plank walls, corner posts, progress bar.
      g.poly([0, -hh, hw, 0, 0, hh, -hw, 0]).fill(0x9a7a50);
      const H = Math.max(3, st.wallH * b.progress);
      g.poly([-hw, 0, 0, hh, 0, hh - H, -hw, -H]).fill(0xd8b680);
      g.poly([0, hh, hw, 0, hw, -H, 0, hh - H]).fill(0xb8945e);
      const post = st.wallH + 8;
      for (const [x, y] of [[-hw, 0], [0, hh], [hw, 0], [0, -hh]] as const)
        g.rect(x - 1.5, y - post, 3, post).fill(0x5b3b1e);
      g.moveTo(-hw, -post + 4).lineTo(0, hh - post + 4).lineTo(hw, -post + 4).stroke({ width: 2, color: 0x5b3b1e });
      this.bar(g, -hw * 0.6, -post - 12, hw * 1.2, b.progress, COL.gold);
      return;
    }

    const H = st.wallH;
    // Walls
    g.poly([-hw, 0, 0, hh, 0, hh - H, -hw, -H]).fill(st.wallL);
    g.poly([0, hh, hw, 0, hw, -H, 0, hh - H]).fill(st.wallR);
    // Timber framing (plaster buildings) or plank lines (mill) on the lit face.
    if (b.kind !== 'mill') {
      for (const t of [0.02, 0.5, 0.98]) {
        const [x0, y0] = wallPt('L', hw, hh, t, 0);
        g.moveTo(x0, y0).lineTo(x0, y0 - H).stroke({ width: 2, color: 0x6b4526 });
      }
      const [ax, ay] = wallPt('L', hw, hh, 0, H * 0.55);
      const [bx, by] = wallPt('L', hw, hh, 1, H * 0.55);
      g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 2, color: 0x6b4526 });
    } else {
      for (let k = 1; k < 4; k++) {
        const [ax, ay] = wallPt('L', hw, hh, 0, (H * k) / 4);
        const [bx, by] = wallPt('L', hw, hh, 1, (H * k) / 4);
        g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 1, color: 0x6b4526, alpha: 0.6 });
      }
    }
    // Door on the left face, windows on both faces.
    const quad = (face: 'L' | 'R', t0: number, t1: number, h0: number, h1: number, color: number) => {
      const p = [wallPt(face, hw, hh, t0, h0), wallPt(face, hw, hh, t1, h0), wallPt(face, hw, hh, t1, h1), wallPt(face, hw, hh, t0, h1)];
      g.poly(p.flat()).fill(color);
    };
    quad('L', 0.62, 0.8, 0, Math.min(16, H * 0.62), 0x4a2e18);
    for (const t of b.kind === 'hall' ? [0.25, 0.6] : [0.45]) quad('R', t, t + 0.12, H * 0.45, H * 0.75, 0x3a3040);
    if (b.kind !== 'hall') quad('L', 0.2, 0.36, H * 0.45, H * 0.75, 0x3a3040);

    // Hip roof with overhang.
    const o = 1.12;
    const rw = hw * o;
    const rh = hh * o;
    const T = [0, -rh - H];
    const R = [rw, -H];
    const B = [0, rh - H];
    const L = [-rw, -H];
    const A = [0, -H - st.roofH];
    g.poly([...T, ...L, ...A]).fill(st.roofBackL);
    g.poly([...R, ...T, ...A]).fill(st.roofBackR);
    g.poly([...L, ...B, ...A]).fill(st.roofL);
    g.poly([...B, ...R, ...A]).fill(st.roofR);
    g.moveTo(B[0]!, B[1]!).lineTo(A[0]!, A[1]!).stroke({ width: 1, color: 0x000000, alpha: 0.25 });

    if (b.kind === 'hall') {
      // Chimney + banner on the peak.
      g.poly([rw * 0.35, -H - 16, rw * 0.47, -H - 13, rw * 0.47, -H - 32, rw * 0.35, -H - 35]).fill(0x8a8178);
      g.rect(-1, A[1]! - 24, 2, 26).fill(0x3a3a3a);
      g.poly([1, A[1]! - 24, 16, A[1]! - 20, 1, A[1]! - 15]).fill(COL.player);
    }
    if (b.kind === 'mill') {
      // Log pile out front-right.
      for (let k = 0; k < 3; k++) {
        const [x, y] = wallPt('R', hw, hh, 0.35 + k * 0.1, -8);
        g.circle(x, y + 4, 4).fill(COL.trunk);
        g.circle(x, y + 4, 2).fill(0xc9a26b);
      }
    }
    if (b.queue > 0) this.bar(g, -hw * 0.6, A[1]! - 34, hw * 1.2, b.trainTimer / PEASANT_TRAIN_SECONDS, COL.player);
  }

  private drawUnit(g: Graphics, u: Unit, selected: boolean): void {
    const t = this.game.time;
    const moving = u.path.length > 0;
    const working = !moving && u.job !== null && 'phase' in u.job && u.job.phase === 'work';
    // Face the direction of travel.
    const next = u.path[0];
    const face = next ? Math.sign(isoOfTile(next.x + 0.5, next.y + 0.5).x - isoOfWorld(u.x, u.y).x) || 1 : 1;
    const step = moving ? Math.sin(t * 14 + u.id) : 0;
    const bob = moving ? Math.abs(step) * 1.5 : 0;

    g.ellipse(0, 0, 7, 3.5).fill({ color: 0x000000, alpha: 0.25 });
    if (selected) g.ellipse(0, 0, 11, 5.5).stroke({ width: 2, color: COL.select });
    // Legs
    g.rect(-3 + step * 1.5, -7, 2.5, 7).fill(0x4a3a2a);
    g.rect(0.5 - step * 1.5, -7, 2.5, 7).fill(0x4a3a2a);
    const y = -bob;
    // Carried load on the back
    if (u.carry) {
      if (u.carry.kind === 'wood') {
        g.roundRect(-face * 9 - 4, y - 19, 8, 11, 2).fill(COL.trunk);
        g.rect(-face * 9 - 4, y - 16, 8, 1.5).fill(0x4a2e18);
      } else {
        g.circle(-face * 8, y - 13, 5).fill(COL.goldDark);
        g.circle(-face * 8 - 1, y - 14, 3).fill(COL.gold);
      }
    }
    // Tunic, belt, head, straw hat
    g.roundRect(-5, y - 17, 10, 11, 3).fill(COL.player);
    g.rect(-5, y - 17, 3, 11).fill(COL.playerDark);
    g.rect(-5, y - 9.5, 10, 1.5).fill(0x5b3b1e);
    g.circle(0, y - 21, 4).fill(COL.skin);
    g.ellipse(0, y - 24, 6.5, 2.2).fill(COL.straw);
    g.ellipse(0, y - 25.5, 3.5, 2).fill(0xd4b25a);
    // Tool swing while working: axe / pick for gathering, hammer for building.
    if (working && u.job?.type !== 'build') {
      const a = Math.sin(t * 10 + u.id) * 0.9 - 0.3;
      const hx = face * 5;
      const ex = hx + face * Math.cos(a) * 10;
      const ey = y - 14 - Math.sin(a) * 10;
      g.moveTo(hx, y - 12).lineTo(ex, ey).stroke({ width: 2, color: COL.trunk });
      g.circle(ex, ey, 2.5).fill(0x9a9a9a);
    } else if (working) {
      const a = Math.abs(Math.sin(t * 9 + u.id));
      g.moveTo(face * 5, y - 12).lineTo(face * 11, y - 16 - a * 6).stroke({ width: 2, color: COL.trunk });
      g.rect(face * 11 - 2, y - 18 - a * 6, 4, 3).fill(0x777777);
    }
  }

  private bar(g: Graphics, x: number, y: number, w: number, frac: number, color: number): void {
    g.roundRect(x - 1, y - 1, w + 2, 6, 2).fill(0x1a140c);
    g.roundRect(x, y, w * Math.max(0, Math.min(1, frac)), 4, 1.5).fill(color);
  }
}
