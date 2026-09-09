/** The v2 renderer, mark II — THE MAP IS THE GAME (player verdict after
 * playing b46: "remove the city mode"). One view: the top-down transit
 * diagram in v1's approved Live Subway Map language — flat water and
 * land, dashed-gray locked routes, solid ribbons on lane offsets,
 * station dots with live waiting counts, world-scaled name labels that
 * shrink with zoom (never collide, never clip), district names on the
 * ground, trains riding their lanes — GPU-drawn, so the light cycle
 * still turns evening service into a glowing night map. No buildings,
 * no bloom, no shadows: fast and clean on a phone.
 *
 * Touch: one finger PANS (the point under your finger stays under
 * your finger — deltas are computed by projecting the drag onto the
 * map plane), two fingers pinch-zoom toward the pinch. No rotation —
 * a diagram has an up. OrbitControls is gone: its spherical math
 * fought the straight-down camera and leaked drags into zoom. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CityDef, onLand } from '../engine/city';
import { Game } from '../engine/game';

const LAND_H = 1.2;
const TRACK_Y = LAND_H + 0.35;
const LANE_GAP = 3.2; // v1's approved side-by-side corridor gap

interface LaneTable {
  laneOf(lineId: string, segIdx: number): number;
}

function buildLanes(city: CityDef): LaneTable {
  const users = new Map<string, string[]>();
  const keyOf = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const line of city.lines) {
    for (let i = 0; i < line.stationIds.length - 1; i++) {
      const k = keyOf(line.stationIds[i], line.stationIds[i + 1]);
      if (!users.has(k)) users.set(k, []);
      users.get(k)!.push(line.id);
    }
  }
  return {
    laneOf(lineId, segIdx) {
      const line = city.lines.find((l) => l.id === lineId)!;
      const k = keyOf(line.stationIds[segIdx], line.stationIds[segIdx + 1]);
      const list = users.get(k)!;
      return (list.indexOf(lineId) - (list.length - 1) / 2) * LANE_GAP;
    },
  };
}

function textCanvas(
  text: string,
  font: string,
  fill: string,
  stroke: string | null,
  w: number,
  h: number,
  align: 'left' | 'center' | 'right' = 'center',
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const x = align === 'left' ? 10 : align === 'right' ? w - 10 : w / 2;
  if (stroke) {
    ctx.lineWidth = 8;
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, x, h / 2);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, h / 2);
  return c;
}

/** The live platform readout ON the station circle, typeset like a
 * fraction: uptown count top-left, a slash, downtown count bottom-
 * right. Redrawn only when the numbers change. */
class CountSprite {
  readonly sprite: THREE.Sprite;
  private canvas = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  private last = '';

  constructor(x: number, z: number) {
    this.canvas.width = 176;
    this.canvas.height = 176;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.anisotropy = 4;
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.tex,
        depthWrite: false,
        depthTest: false, // never clipped by the disc beneath
        transparent: true,
        sizeAttenuation: false, // constant screen size, always legible
      }),
    );
    this.sprite.renderOrder = 20;
    this.sprite.scale.set(0.05, 0.05, 1);
    this.sprite.position.set(x, TRACK_Y + 0.25, z); // centered on the dot
  }

  set(up: number, down: number, hot: boolean): void {
    const key = `${up}/${down}:${hot}`;
    if (key === this.last) return;
    this.last = key;
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 176, 176);
    if (up + down <= 0) {
      this.tex.needsUpdate = true;
      return;
    }
    // On a heat-colored disc the ink flips WHITE for contrast.
    const ink = hot ? '#ffffff' : '#1a1a1a';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    // A compact fraction hugging the slash — everything stays on the
    // disc. Halo first, ink second, modest weight.
    const halo = hot ? 'rgba(20,24,31,0.85)' : 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 6;
    ctx.strokeStyle = halo;
    ctx.beginPath();
    ctx.moveTo(74, 114);
    ctx.lineTo(102, 62);
    ctx.stroke();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = ink;
    ctx.beginPath();
    ctx.moveTo(74, 114);
    ctx.lineTo(102, 62);
    ctx.stroke();
    ctx.font = '800 40px Inter, sans-serif';
    ctx.lineWidth = 6;
    ctx.strokeStyle = halo;
    ctx.textAlign = 'right';
    ctx.strokeText(String(up), 82, 66);
    ctx.fillStyle = ink;
    ctx.fillText(String(up), 82, 66);
    ctx.textAlign = 'left';
    ctx.strokeText(String(down), 94, 110);
    ctx.fillText(String(down), 94, 110);
    this.tex.needsUpdate = true;
  }
}

/** Flat-map pan/zoom: drag grabs the map, pinch/wheel zooms toward
 * the gesture. Camera stays straight-down; only target + height move. */
class MapControls {
  readonly target = new THREE.Vector3();
  height = 420;
  minHeight = 55;
  maxHeight = 620;
  private pointers = new Map<number, { x: number; y: number }>();

  constructor(
    private camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
    private boundsMax: number,
  ) {
    dom.addEventListener('pointerdown', (e) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const prev = this.pointers.get(e.pointerId)!;
      if (this.pointers.size === 1) {
        const a = this.planePoint(prev.x, prev.y);
        const b = this.planePoint(e.clientX, e.clientY);
        if (a && b) {
          this.target.x += a.x - b.x;
          this.target.z += a.z - b.z;
          this.apply();
        }
      } else if (this.pointers.size === 2) {
        const [p1, p2] = [...this.pointers.values()];
        const other = p1 === prev ? p2 : p1;
        const before = Math.hypot(prev.x - other.x, prev.y - other.y);
        const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        const midX = (e.clientX + other.x) / 2;
        const midY = (e.clientY + other.y) / 2;
        const prevMidX = (prev.x + other.x) / 2;
        const prevMidY = (prev.y + other.y) / 2;
        // Pan by the midpoint drag…
        const a = this.planePoint(prevMidX, prevMidY);
        const b = this.planePoint(midX, midY);
        if (a && b) {
          this.target.x += a.x - b.x;
          this.target.z += a.z - b.z;
          this.apply();
        }
        // …then zoom toward the midpoint.
        if (before > 8 && after > 8) this.zoomAt(midX, midY, before / after);
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    const drop = (e: PointerEvent) => this.pointers.delete(e.pointerId);
    dom.addEventListener('pointerup', drop);
    dom.addEventListener('pointercancel', drop);
    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0012));
      },
      { passive: false },
    );
    this.apply();
  }

  private planePoint(clientX: number, clientY: number): THREE.Vector3 | null {
    const ndc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    if (Math.abs(d.y) < 1e-6) return null;
    const t = (TRACK_Y - o.y) / d.y;
    if (t <= 0) return null;
    return new THREE.Vector3(o.x + d.x * t, TRACK_Y, o.z + d.z * t);
  }

  private zoomAt(clientX: number, clientY: number, factor: number): void {
    const before = this.planePoint(clientX, clientY);
    this.height = Math.min(Math.max(this.height * factor, this.minHeight), this.maxHeight);
    this.apply();
    const after = this.planePoint(clientX, clientY);
    if (before && after) {
      this.target.x += before.x - after.x;
      this.target.z += before.z - after.z;
      this.apply();
    }
  }

  /** Reposition the camera from target + height (with bounds). */
  apply(): void {
    const m = 60;
    this.target.x = Math.min(Math.max(this.target.x, -m), this.boundsMax + m);
    this.target.z = Math.min(Math.max(this.target.z, -m), this.boundsMax + m);
    this.camera.position.set(this.target.x, this.height, this.target.z + 0.001);
    this.camera.lookAt(this.target.x, TRACK_Y, this.target.z);
  }

  update(): void {
    /* input-driven; nothing per-frame */
  }
}

export class CityScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: MapControls;

  private hemi: THREE.HemisphereLight;
  private water: THREE.MeshStandardMaterial;
  private landMat: THREE.MeshStandardMaterial;
  private solidMats: THREE.MeshStandardMaterial[] = [];
  private solidMeshes: THREE.Mesh[] = [];
  private dashedMeshes: THREE.Mesh[] = [];
  private servedDiscs = new Map<string, THREE.Group>();
  private discMats = new Map<string, THREE.MeshBasicMaterial>();
  private streetMat: THREE.MeshBasicMaterial | null = null;
  private blockMat: THREE.MeshBasicMaterial | null = null;
  private counts = new Map<string, CountSprite>();
  private labels = new Map<string, THREE.Sprite>();
  private trainGroups: THREE.Group[] = [];
  private trainMats: THREE.MeshStandardMaterial[] = [];
  private lanes: LaneTable;
  private countFrame = 0;

  constructor(
    canvas: HTMLCanvasElement,
    readonly game: Game,
    _opts: { bloom: boolean } = { bloom: false },
  ) {
    const city = game.city;
    const center = new THREE.Vector3(city.size / 2, 0, city.size / 2);
    this.lanes = buildLanes(city);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.camera = new THREE.PerspectiveCamera(40, 1, 1, 3000);
    this.camera.up.set(0, 0, -1);
    this.controls = new MapControls(this.camera, canvas, city.size);
    this.controls.target.copy(center);
    this.controls.apply();

    // Flat, even light — the print-map look needs no sun.
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xdddddd, 1.9);
    this.scene.add(this.hemi);

    // ---- Water + land + parks, v1's exact flat palette ----
    this.water = new THREE.MeshStandardMaterial({ color: 0xbdd3e8, roughness: 1 });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), this.water);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(center.x, 0, center.z);
    this.scene.add(sea);

    this.landMat = new THREE.MeshStandardMaterial({ color: 0xfaf9f6, roughness: 1 });
    for (const ring of city.lands) {
      const shape = new THREE.Shape();
      ring.forEach(([x, y], i) => {
        if (i === 0) shape.moveTo(x, -y);
        else shape.lineTo(x, -y);
      });
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: LAND_H,
        bevelEnabled: false,
      });
      geo.rotateX(-Math.PI / 2);
      this.scene.add(new THREE.Mesh(geo, this.landMat));
    }
    // A faint street grid, clipped to the landmass — the texture that
    // says "city" without saying "clutter". One merged mesh.
    {
      const streetParts: THREE.BufferGeometry[] = [];
      const step = 13;
      const sample = 3;
      const addRuns = (
        fixed: number,
        vertical: boolean,
      ): void => {
        let runStart: number | null = null;
        for (let t = 0; t <= city.size + sample; t += sample) {
          const x = vertical ? fixed : t;
          const y = vertical ? t : fixed;
          const inside = t <= city.size && onLand(city, x, y);
          if (inside && runStart === null) runStart = t;
          if (!inside && runStart !== null) {
            const len = t - sample - runStart;
            if (len > 6) {
              const mid = runStart + len / 2;
              const g = new THREE.BoxGeometry(
                vertical ? 0.5 : len,
                0.05,
                vertical ? len : 0.5,
              );
              g.translate(
                vertical ? fixed : mid,
                LAND_H + 0.03,
                vertical ? mid : fixed,
              );
              streetParts.push(g);
            }
            runStart = null;
          }
        }
      };
      for (let v = step / 2; v < city.size; v += step) {
        addRuns(v, true);
        addRuns(v, false);
      }
      if (streetParts.length > 0) {
        const streets = new THREE.Mesh(
          BufferGeometryUtils.mergeGeometries(streetParts),
          new THREE.MeshBasicMaterial({ color: 0xe9e7e1 }),
        );
        this.streetMat = streets.material as THREE.MeshBasicMaterial;
        this.scene.add(streets);
      }
    }

    // Coastline: a slim contour where land meets water, so the bay has
    // a drawn edge instead of a color boundary.
    {
      const coastParts: THREE.BufferGeometry[] = [];
      for (const ring of city.lands) {
        for (let i = 0; i < ring.length; i++) {
          const [ax, ay] = ring[i];
          const [bx, by] = ring[(i + 1) % ring.length];
          const dx = bx - ax;
          const dy = by - ay;
          const len = Math.hypot(dx, dy);
          if (len < 0.001) continue;
          const g = new THREE.BoxGeometry(len, 0.06, 1.0);
          g.rotateY(-Math.atan2(dy, dx));
          g.translate((ax + bx) / 2, LAND_H + 0.04, (ay + by) / 2);
          coastParts.push(g);
        }
      }
      this.scene.add(
        new THREE.Mesh(
          BufferGeometryUtils.mergeGeometries(coastParts),
          new THREE.MeshBasicMaterial({ color: 0x9db4c8 }),
        ),
      );
    }

    // Building-block footprints in the street cells (flat, subtle).
    {
      const rnd = (() => {
        let a = 0xbeef;
        return () => {
          a = (a * 1103515245 + 12345) & 0x7fffffff;
          return a / 0x7fffffff;
        };
      })();
      const blockParts: THREE.BufferGeometry[] = [];
      const step = 13;
      for (let cx = step; cx < city.size; cx += step) {
        for (let cy = step; cy < city.size; cy += step) {
          if (rnd() > 0.34) continue;
          const x = cx - step / 2 + (rnd() - 0.5) * 3;
          const y = cy - step / 2 + (rnd() - 0.5) * 3;
          if (!onLand(city, x, y)) continue;
          if (city.stations.some((st) => Math.hypot(st.x - x, st.y - y) < 7)) continue;
          const w = 5 + rnd() * 3.5;
          const h = 5 + rnd() * 3.5;
          const g = new THREE.BoxGeometry(w, 0.04, h);
          g.translate(x, LAND_H + 0.02, y);
          blockParts.push(g);
        }
      }
      if (blockParts.length > 0) {
        const blocks = new THREE.Mesh(
          BufferGeometryUtils.mergeGeometries(blockParts),
          new THREE.MeshBasicMaterial({ color: 0xe3e1da }),
        );
        this.blockMat = blocks.material as THREE.MeshBasicMaterial;
        this.scene.add(blocks);
      }
    }

    const parkMat = new THREE.MeshStandardMaterial({ color: 0xcbe2c6, roughness: 1 });
    for (const p of city.parks) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.w, 0.25, p.h), parkMat);
      mesh.position.set(p.cx, LAND_H + 0.12, p.cy);
      mesh.rotation.y = (-p.rot * Math.PI) / 180;
      this.scene.add(mesh);
    }

    // District names, printed on the ground like the real diagram.
    for (const d of city.districts) {
      const tex = new THREE.CanvasTexture(
        textCanvas(d.text, '800 46px Inter, sans-serif', 'rgba(150,150,150,0.5)', null, 512, 96),
      );
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(52, 9.75),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(d.x, LAND_H + 0.15, d.y);
      this.scene.add(mesh);
    }

    // ---- Routes: every line gets BOTH treatments prebuilt — dashed
    // gray while locked (v1's approved look), solid color when owned —
    // and unlocking swaps visibility. No ugly fades. ----
    for (const line of city.lines) {
      const path = game.paths.get(line.id)!;
      const solidParts: THREE.BufferGeometry[] = [];
      const dashParts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < path.points.length - 1; i++) {
        const a = path.points[i];
        const b = path.points[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) continue;
        const lane = this.lanes.laneOf(line.id, i);
        const nx = (-dy / len) * lane;
        const ny = (dx / len) * lane;
        const ang = -Math.atan2(dy, dx);
        const g = new THREE.BoxGeometry(len, 0.3, 2.0);
        g.rotateY(ang);
        g.translate((a.x + b.x) / 2 + nx, TRACK_Y, (a.y + b.y) / 2 + ny);
        solidParts.push(g);
        // v1 dash rhythm: 3.8 on, 2.4 off.
        const ux = dx / len;
        const uy = dy / len;
        for (let d = 0; d < len; d += 6.2) {
          const seg = Math.min(3.8, len - d);
          const gd = new THREE.BoxGeometry(seg, 0.22, 0.9);
          gd.rotateY(ang);
          gd.translate(
            a.x + ux * (d + seg / 2) + nx,
            TRACK_Y - 0.05,
            a.y + uy * (d + seg / 2) + ny,
          );
          dashParts.push(gd);
        }
      }
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(line.color),
        emissive: new THREE.Color(line.color),
        emissiveIntensity: 0,
        roughness: 1,
      });
      this.solidMats.push(mat);
      const solid = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(solidParts), mat);
      this.solidMeshes.push(solid);
      this.scene.add(solid);
      const dashColor = new THREE.Color(line.color).lerp(new THREE.Color(0xffffff), 0.25);
      const dashed = new THREE.Mesh(
        BufferGeometryUtils.mergeGeometries(dashParts),
        new THREE.MeshStandardMaterial({ color: dashColor, roughness: 1 }),
      );
      this.dashedMeshes.push(dashed);
      this.scene.add(dashed);
    }

    // ---- Stations: v1's marker language. Every stop starts as a tiny
    // gray dot; service upgrades it to the white disc + ink ring with a
    // live count and a name label. ----
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xbdbdbd });
    const dotParts: THREE.BufferGeometry[] = [];
    for (const st of city.stations) {
      const g = new THREE.CylinderGeometry(0.6, 0.6, 0.35, 10);
      g.translate(st.x, TRACK_Y + 0.05, st.y);
      dotParts.push(g);
    }
    this.scene.add(new THREE.Mesh(BufferGeometryUtils.mergeGeometries(dotParts), dotMat));
    this.refreshService();

    this.resize();
  }

  /** Build served-station markers + labels; called again on unlock. */
  refreshService(): void {
    const g = this.game;
    const city = g.city;
    const linesAt = new Map<string, number>();
    for (const line of city.lines) {
      if (!g.isUnlocked(line.id)) continue;
      for (const id of line.stationIds) linesAt.set(id, (linesAt.get(id) ?? 0) + 1);
    }
    for (const st of city.stations) {
      if (!g.isServed(st.id) || this.servedDiscs.has(st.id)) continue;
      const group = new THREE.Group();
      const interchange = (linesAt.get(st.id) ?? 1) > 1;
      const r = interchange ? 2.4 : 1.9;
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(r + 0.5, r + 0.5, 0.3, 24),
        new THREE.MeshBasicMaterial({ color: 0x3a3f4c }),
      );
      ring.position.set(st.x, TRACK_Y + 0.1, st.y);
      const discMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      this.discMats.set(st.id, discMat);
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, 0.34, 24),
        discMat,
      );
      disc.position.set(st.x, TRACK_Y + 0.14, st.y);
      group.add(ring, disc);
      this.scene.add(group);
      this.servedDiscs.set(st.id, group);

      const count = new CountSprite(st.x, st.y);
      this.counts.set(st.id, count);
      this.scene.add(count.sprite);

      // World-scaled name label below the dot — shrinks with zoom, so
      // it never collides or clips; zooming in is how you read it.
      const side = st.labelSide ?? 0;
      const tex = new THREE.CanvasTexture(
        textCanvas(
          st.name, '800 52px Inter, sans-serif', '#1a1a1a',
          'rgba(255,255,255,0.95)', 640, 112,
          side > 0 ? 'left' : side < 0 ? 'right' : 'center',
        ),
      );
      tex.anisotropy = 4;
      const label = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex,
          depthWrite: false,
          depthTest: false,
          transparent: true,
          sizeAttenuation: false,
        }),
      );
      label.renderOrder = 19;
      label.scale.set(0.15, 0.02625, 1);
      // v1's hand-tuned anchor: left, right, or below its dot — never
      // floating between stations. Text hugs the near edge of its
      // canvas so the visible offset is tight.
      if (side > 0) label.center.set(-0.22, 0.5);
      else if (side < 0) label.center.set(1.22, 0.5);
      else label.center.set(0.5, 1.85);
      label.position.set(st.x, TRACK_Y + 0.2, st.y);
      this.scene.add(label);
      this.labels.set(st.id, label);
    }
  }

  /** Consists GROW with progress: one car per line milestone (b54),
   * up to five — rolling stock as a visible trophy. */
  private fillTrainGroup(
    group: THREE.Group,
    mat: THREE.MeshStandardMaterial,
    cars: number,
  ): void {
    group.clear();
    const len = 4.6;
    const gap = 0.5;
    const total = cars * len + (cars - 1) * gap;
    for (let i = 0; i < cars; i++) {
      const x = -total / 2 + len / 2 + i * (len + gap);
      const outline = new THREE.Mesh(
        new RoundedBoxGeometry(len + 0.7, 0.7, 3.0, 2, 0.7),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      outline.position.set(x, 0.42, 0);
      group.add(outline);
      const body = new THREE.Mesh(new RoundedBoxGeometry(len, 0.8, 2.3, 2, 0.55), mat);
      body.position.set(x, 0.5, 0);
      group.add(body);
      const roof = new THREE.Mesh(
        new RoundedBoxGeometry(len - 1.4, 0.3, 1.5, 2, 0.3),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }),
      );
      roof.position.set(x, 1.0, 0);
      group.add(roof);
    }
    group.userData.cars = cars;
  }

  private trainCars(lineId: string): number {
    return Math.min(5, 1 + this.game.lineMilestoneCount(lineId));
  }

  private addTrainVisual(lineId: string): void {
    const line = this.game.city.lines.find((l) => l.id === lineId)!;
    const group = new THREE.Group();
    group.userData.lineId = lineId;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(line.color),
      emissive: new THREE.Color(line.color),
      emissiveIntensity: 0,
      roughness: 0.6,
    });
    this.fillTrainGroup(group, mat, this.trainCars(lineId));
    this.trainMats.push(mat);
    this.trainGroups.push(group);
    this.scene.add(group);
  }

  /** The station nearest a tap, via ray onto the track plane. */
  pickStation(clientX: number, clientY: number): string | null {
    const ndc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    if (Math.abs(d.y) < 1e-6) return null;
    const t = (TRACK_Y - o.y) / d.y;
    if (t <= 0) return null;
    const px = o.x + d.x * t;
    const pz = o.z + d.z * t;
    const tol = Math.max(5.5, this.controls.height * 0.028);
    let best: string | null = null;
    let bestD = tol;
    for (const st of this.game.city.stations) {
      const dist = Math.hypot(st.x - px, st.y - pz);
      if (dist < bestD) {
        bestD = dist;
        best = st.id;
      }
    }
    return best;
  }

  // Camera glide toward a newly bought line.
  private focusFrom: { target: THREE.Vector3; h: number } | null = null;
  private focusTo: { target: THREE.Vector3; h: number } | null = null;
  private focusT0 = 0;

  focusLine(lineId: string): void {
    const path = this.game.paths.get(lineId)!;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of path.points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.y);
      maxZ = Math.max(maxZ, p.y);
    }
    const target = new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    const span = Math.max(maxX - minX, maxZ - minZ, 60);
    this.focusFrom = { target: this.controls.target.clone(), h: this.controls.height };
    this.focusTo = { target, h: Math.min(span * 1.6 + 60, 620) };
    this.focusT0 = performance.now();
  }

  /** Jump the view (used by tests and the unlock glide's endpoint). */
  setView(x: number, z: number, h: number): void {
    this.controls.target.set(x, 0, z);
    this.controls.height = h;
    this.controls.apply();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  /** [alpha] blends each train between its previous and current sim
   * positions (0 = previous tick, 1 = current) for fluid motion. */
  render(alpha = 1, prevDistances: number[] = []): void {
    const g = this.game;
    const n = g.nightFactor;

    // The light cycle on a flat map: paper by day, glowing diagram by
    // night — clean color shifts, no bloom, no haze.
    this.scene.background = new THREE.Color(0xbdd3e8).lerp(new THREE.Color(0x141b29), n);
    this.water.color.set(0xbdd3e8).lerp(new THREE.Color(0x141b29), n);
    this.landMat.color.set(0xfaf9f6).lerp(new THREE.Color(0x2b3040), n);
    this.streetMat?.color.set(0xe9e7e1).lerp(new THREE.Color(0x3a4053), n);
    this.blockMat?.color.set(0xe3e1da).lerp(new THREE.Color(0x333a4e), n);
    this.hemi.intensity = 1.9 - 1.1 * n;
    this.solidMats.forEach((mat, i) => {
      const unlocked = g.isUnlocked(g.city.lines[i].id);
      this.solidMeshes[i].visible = unlocked;
      this.dashedMeshes[i].visible = !unlocked;
      const rushing = g.rushActive && g.rushLineId === g.city.lines[i].id;
      mat.emissiveIntensity = (rushing ? 0.65 : 0.4) * n;
    });
    for (const mat of this.trainMats) mat.emissiveIntensity = 0.5 * n;

    // Camera glide.
    if (this.focusTo && this.focusFrom) {
      const e = Math.min((performance.now() - this.focusT0) / 1300, 1);
      const k = e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2;
      this.controls.target.lerpVectors(this.focusFrom.target, this.focusTo.target, k);
      this.controls.height = this.focusFrom.h + (this.focusTo.h - this.focusFrom.h) * k;
      this.controls.apply();
      if (e >= 1) {
        this.focusTo = null;
        this.focusFrom = null;
      }
    }

    // New trains and newly served stations appear as they happen.
    while (this.trainGroups.length < g.trains.length) {
      this.addTrainVisual(g.trains[this.trainGroups.length].lineId);
    }

    // Live waiting counts + CONGESTION HEAT at 4 Hz, plus the zoom
    // policy: wide stays clean, zooming reveals names then numbers.
    // Discs read as a heat map at EVERY zoom: white = clear, amber =
    // filling, red = at capacity.
    if (++this.countFrame % 15 === 0) {
      const camH = this.controls.height;
      const showNames = camH < 360;
      const showCounts = camH < 300;
      const white = new THREE.Color(0xffffff);
      const amber = new THREE.Color(0xffc94d);
      const red = new THREE.Color(0xe03a2f);
      for (const label of this.labels.values()) label.visible = showNames;
      for (const [id, count] of this.counts) {
        const ratio = Math.min(g.waitingAt(id) / g.stationCapAt(id), 1);
        const mat = this.discMats.get(id);
        if (mat) {
          if (ratio < 0.5) mat.color.copy(white).lerp(amber, ratio * 2);
          else mat.color.copy(amber).lerp(red, (ratio - 0.5) * 2);
        }
        count.sprite.visible = showCounts;
        if (!showCounts) continue;
        const up = Math.floor(g.waitingUp.get(id) ?? 0);
        const down = Math.floor(g.waitingDown.get(id) ?? 0);
        count.set(up, down, ratio > 0.45);
      }
    }

    // Trains ride their lanes — and grow a car at each milestone.
    g.trains.forEach((t, i) => {
      const group = this.trainGroups[i];
      if (!group) return;
      const wantCars = this.trainCars(t.lineId);
      if (group.userData.cars !== wantCars) {
        this.fillTrainGroup(group, this.trainMats[i], wantCars);
      }
      const path = g.paths.get(t.lineId)!;
      const prev = prevDistances[i];
      const d =
        prev === undefined ? t.distance : prev + (t.distance - prev) * alpha;
      const segIdx = path.segmentAt(d);
      const a = path.points[segIdx];
      const b = path.points[segIdx + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      const lane = len < 0.001 ? 0 : this.lanes.laneOf(t.lineId, segIdx);
      const nx = len < 0.001 ? 0 : (-dy / len) * lane;
      const ny = len < 0.001 ? 0 : (dx / len) * lane;
      const p = path.posAt(d);
      group.position.set(p.x + nx, TRACK_Y + 0.3, p.y + ny);
      group.rotation.y = -Math.atan2(dy * t.direction, dx * t.direction);
    });

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
