import { Container, Graphics } from 'pixi.js';
import { BUILDINGS, PEASANT_TRAIN_SECONDS, TILE, type BuildingKind } from './config';
import type { Building, Game, Unit } from './game';
import { WATER } from './map';

const COL = {
  grass: [0x5b8c3a, 0x5f9140, 0x578636],
  water: 0x3b6ea8,
  waterEdge: 0x5a8cc2,
  treeDark: 0x2f5a24,
  treeLight: 0x3f7430,
  trunk: 0x5b3b1e,
  mineRock: 0x7b7468,
  mineGold: 0xf2c94c,
  wall: 0xc8a878,
  roof: { hall: 0x9c3b2e, house: 0xb0553a, mill: 0x6e4a2a } as Record<BuildingKind, number>,
  player: 0x3d7bd9,
  select: 0xffffff,
  good: 0x6fdc6f,
  bad: 0xe25555,
};

/** Cheap deterministic per-tile hash for texture variation. */
const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export interface Overlay {
  selectedUnits: Set<number>;
  selectedBuilding: number | null;
  ghost: { kind: BuildingKind; tx: number; ty: number; ok: boolean } | null;
  marker: { x: number; y: number; t: number } | null;
}

export class Renderer {
  readonly world = new Container();
  private ground = new Graphics();
  private trees = new Graphics();
  private dynamic = new Graphics();
  private treeVersion = -1;

  constructor(private game: Game) {
    this.world.addChild(this.ground, this.trees, this.dynamic);
    this.drawGround();
  }

  private drawGround(): void {
    const { map } = this.game;
    const g = this.ground;
    for (let y = 0; y < map.h; y++)
      for (let x = 0; x < map.w; x++) {
        const water = map.terrain[map.idx(x, y)] === WATER;
        const c = water ? COL.water : COL.grass[Math.floor(hash(x, y) * 3)]!;
        g.rect(x * TILE, y * TILE, TILE, TILE).fill(c);
        if (!water && hash(y, x) < 0.25) {
          // Grass tufts so the ground reads as texture, not a flat fill.
          g.rect(x * TILE + hash(x + 7, y) * 26, y * TILE + hash(x, y + 7) * 26, 3, 2).fill(0x6fa04a);
        }
        if (water && hash(x, y) < 0.3) g.rect(x * TILE + 8, y * TILE + 12, 12, 2).fill(COL.waterEdge);
      }
  }

  private drawTrees(): void {
    const { map } = this.game;
    const g = this.trees.clear();
    for (let y = 0; y < map.h; y++)
      for (let x = 0; x < map.w; x++) {
        if (!map.hasTree(x, y)) continue;
        const ox = x * TILE + 16 + (hash(x, y) - 0.5) * 6;
        const oy = y * TILE + 16 + (hash(y, x) - 0.5) * 6;
        g.rect(ox - 2, oy + 4, 4, 9).fill(COL.trunk);
        g.circle(ox, oy, 11).fill(COL.treeDark);
        g.circle(ox - 3, oy - 3, 6).fill(COL.treeLight);
      }
    this.treeVersion = map.treeVersion;
  }

  draw(o: Overlay): void {
    if (this.treeVersion !== this.game.map.treeVersion) this.drawTrees();
    const g = this.dynamic.clear();
    const game = this.game;

    for (const m of game.mines.values()) {
      const px = m.tx * TILE;
      const py = m.ty * TILE;
      const s = m.size * TILE;
      g.roundRect(px + 3, py + 6, s - 6, s - 8, 10).fill(COL.mineRock);
      g.roundRect(px + s / 2 - 9, py + s / 2 - 2, 18, 16, 4).fill(0x2a2620);
      for (const [dx, dy] of [[12, 14], [s - 16, 18], [20, s - 14], [s - 20, s - 12]] as const)
        g.circle(px + dx, py + dy, 3).fill(COL.mineGold);
    }

    for (const b of game.buildings.values()) this.drawBuilding(g, b, b.id === o.selectedBuilding);

    for (const u of game.units) this.drawUnit(g, u, o.selectedUnits.has(u.id));

    if (o.marker) {
      const age = game.time - o.marker.t;
      if (age < 0.6) {
        const r = 6 + age * 20;
        g.circle(o.marker.x, o.marker.y, r).stroke({ width: 2, color: COL.good, alpha: 1 - age / 0.6 });
      }
    }

    if (o.ghost) {
      const s = BUILDINGS[o.ghost.kind].size * TILE;
      const c = o.ghost.ok ? COL.good : COL.bad;
      g.rect(o.ghost.tx * TILE, o.ghost.ty * TILE, s, s).fill({ color: c, alpha: 0.35 }).stroke({ width: 2, color: c });
    }
  }

  private drawBuilding(g: Graphics, b: Building, selected: boolean): void {
    const px = b.tx * TILE;
    const py = b.ty * TILE;
    const s = b.size * TILE;
    const pad = 3;
    if (b.progress < 1) {
      // Construction site: dirt pad + scaffold outline + progress bar.
      g.rect(px + pad, py + pad, s - pad * 2, s - pad * 2).fill({ color: 0x8a6a42, alpha: 0.8 });
      g.rect(px + pad, py + pad, s - pad * 2, s - pad * 2).stroke({ width: 2, color: 0x4a3420 });
      g.moveTo(px + pad, py + pad).lineTo(px + s - pad, py + s - pad).stroke({ width: 1.5, color: 0x4a3420 });
      g.moveTo(px + s - pad, py + pad).lineTo(px + pad, py + s - pad).stroke({ width: 1.5, color: 0x4a3420 });
      this.bar(g, px + pad, py - 6, s - pad * 2, b.progress, 0xf2c94c);
    } else {
      const wallH = s * 0.45;
      g.rect(px + pad, py + s - wallH - pad, s - pad * 2, wallH).fill(COL.wall);
      g.poly([px + pad - 2, py + s - wallH - pad, px + s / 2, py + pad + 2, px + s - pad + 2, py + s - wallH - pad])
        .fill(COL.roof[b.kind]);
      g.rect(px + s / 2 - 5, py + s - pad - 12, 10, 12).fill(0x4a3420);
      if (b.kind === 'mill') {
        for (let i = 0; i < 3; i++) g.circle(px + 10 + i * 7, py + s - 6, 3).fill(COL.trunk);
      }
      if (b.kind === 'hall') {
        g.rect(px + s / 2 - 1, py - 6, 2, 12).fill(0x333333);
        g.rect(px + s / 2 + 1, py - 6, 10, 7).fill(COL.player);
      }
      if (b.queue > 0) this.bar(g, px + pad, py + s + 2, s - pad * 2, b.trainTimer / PEASANT_TRAIN_SECONDS, COL.player);
    }
    if (selected) g.rect(px, py, s, s).stroke({ width: 2, color: COL.select });
  }

  private drawUnit(g: Graphics, u: Unit, selected: boolean): void {
    const working = u.job && u.path.length === 0 && 'phase' in u.job && u.job.phase === 'work';
    const bob = working ? Math.sin(this.game.time * 14) * 1.5 : 0;
    const x = u.x;
    const y = u.y + bob;
    g.ellipse(u.x, u.y + 9, 7, 3).fill({ color: 0x000000, alpha: 0.25 });
    if (selected) g.ellipse(u.x, u.y + 9, 10, 5).stroke({ width: 2, color: COL.select });
    g.roundRect(x - 5, y - 4, 10, 12, 3).fill(COL.player);
    g.circle(x, y - 8, 4.5).fill(0xf0c8a0);
    if (u.carry) g.rect(x + 3, y - 2, 6, 6).fill(u.carry.kind === 'wood' ? COL.trunk : COL.mineGold);
  }

  private bar(g: Graphics, x: number, y: number, w: number, frac: number, color: number): void {
    g.rect(x, y, w, 4).fill(0x000000);
    g.rect(x, y, w * Math.max(0, Math.min(1, frac)), 4).fill(color);
  }
}
