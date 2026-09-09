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
 * Touch: one finger PANS, two fingers zoom. No rotation — a diagram
 * has an up. */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CityDef } from '../engine/city';
import { Game } from '../engine/game';

const LAND_H = 1.2;
const TRACK_Y = LAND_H + 0.35;
const LANE_GAP = 3.2; // v1's approved side-by-side corridor gap
const INK = 0x1a1a1a;

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
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (stroke) {
    ctx.lineWidth = 8;
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, w / 2, h / 2);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, w / 2, h / 2);
  return c;
}

/** A live station-count readout: a small canvas sprite redrawn only
 * when its text changes. */
class CountSprite {
  readonly sprite: THREE.Sprite;
  private canvas = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  private last = '';

  constructor(x: number, z: number) {
    this.canvas.width = 128;
    this.canvas.height = 56;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.tex,
        depthWrite: false,
        transparent: true,
        sizeAttenuation: false, // constant screen size, always legible
      }),
    );
    this.sprite.scale.set(0.105, 0.046, 1);
    this.sprite.position.set(x, TRACK_Y + 1.2, z);
  }

  set(text: string, full: boolean): void {
    const key = `${text}:${full}`;
    if (key === this.last) return;
    this.last = key;
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 128, 56);
    ctx.font = '900 34px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeText(text, 64, 28);
    ctx.fillStyle = full ? '#C62828' : '#1a1a1a';
    ctx.fillText(text, 64, 28);
    this.tex.needsUpdate = true;
  }
}

export class CityScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  private hemi: THREE.HemisphereLight;
  private water: THREE.MeshStandardMaterial;
  private landMat: THREE.MeshStandardMaterial;
  private solidMats: THREE.MeshStandardMaterial[] = [];
  private solidMeshes: THREE.Mesh[] = [];
  private dashedMeshes: THREE.Mesh[] = [];
  private servedDiscs = new Map<string, THREE.Group>();
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.camera = new THREE.PerspectiveCamera(40, 1, 1, 3000);
    this.camera.position.set(center.x, 420, center.z + 0.001);
    this.camera.up.set(0, 0, -1);

    // A diagram has an up: no rotation. One finger pans, two zoom.
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.copy(center);
    this.controls.enableDamping = true;
    this.controls.enableRotate = false;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 55;
    this.controls.maxDistance = 620;
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };

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
        bevelEnabled: true,
        bevelThickness: 0.3,
        bevelSize: 1.2,
        bevelSegments: 1,
      });
      geo.rotateX(-Math.PI / 2);
      this.scene.add(new THREE.Mesh(geo, this.landMat));
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
        textCanvas(d.text, '800 52px Inter, sans-serif', 'rgba(180,180,180,0.8)', null, 512, 96),
      );
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(88, 16.5),
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
      const dashed = new THREE.Mesh(
        BufferGeometryUtils.mergeGeometries(dashParts),
        new THREE.MeshStandardMaterial({ color: 0xd2d2d2, roughness: 1 }),
      );
      this.dashedMeshes.push(dashed);
      this.scene.add(dashed);
    }

    // ---- Stations: v1's marker language. Every stop starts as a tiny
    // gray dot; service upgrades it to the white disc + ink ring with a
    // live count and a name label. ----
    const dotMat = new THREE.MeshStandardMaterial({ color: 0xbdbdbd, roughness: 1 });
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
        new THREE.MeshStandardMaterial({ color: INK, roughness: 1 }),
      );
      ring.position.set(st.x, TRACK_Y + 0.1, st.y);
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, 0.34, 24),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
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
      const tex = new THREE.CanvasTexture(
        textCanvas(st.name, '800 30px Inter, sans-serif', '#1a1a1a', 'rgba(255,255,255,0.95)', 320, 64),
      );
      const label = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex,
          depthWrite: false,
          transparent: true,
          sizeAttenuation: false,
        }),
      );
      label.scale.set(0.19, 0.038, 1);
      label.center.set(0.5, 2.1);
      label.position.set(st.x, TRACK_Y + 0.4, st.y);
      this.scene.add(label);
      this.labels.set(st.id, label);
    }
  }

  private addTrainVisual(lineId: string): void {
    const line = this.game.city.lines.find((l) => l.id === lineId)!;
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(line.color),
      emissive: new THREE.Color(line.color),
      emissiveIntensity: 0,
      roughness: 0.6,
    });
    const body = new THREE.Mesh(new RoundedBoxGeometry(5.2, 0.8, 2.3, 2, 0.6), mat);
    body.position.y = 0.5;
    group.add(body);
    const roof = new THREE.Mesh(
      new RoundedBoxGeometry(3.6, 0.3, 1.5, 2, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }),
    );
    roof.position.y = 1.0;
    group.add(roof);
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
    const tol = Math.max(5.5, this.camera.position.distanceTo(this.controls.target) * 0.028);
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
  private focusFrom: { target: THREE.Vector3; pos: THREE.Vector3 } | null = null;
  private focusTo: { target: THREE.Vector3; pos: THREE.Vector3 } | null = null;
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
    this.focusFrom = {
      target: this.controls.target.clone(),
      pos: this.camera.position.clone(),
    };
    this.focusTo = {
      target,
      pos: new THREE.Vector3(target.x, Math.min(span * 1.6 + 60, 620), target.z + 0.001),
    };
    this.focusT0 = performance.now();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  render(): void {
    const g = this.game;
    const n = g.nightFactor;

    // The light cycle on a flat map: paper by day, glowing diagram by
    // night — clean color shifts, no bloom, no haze.
    this.scene.background = new THREE.Color(0xbdd3e8).lerp(new THREE.Color(0x141b29), n);
    this.water.color.set(0xbdd3e8).lerp(new THREE.Color(0x141b29), n);
    this.landMat.color.set(0xfaf9f6).lerp(new THREE.Color(0x2b3040), n);
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
      this.camera.position.lerpVectors(this.focusFrom.pos, this.focusTo.pos, k);
      if (e >= 1) {
        this.focusTo = null;
        this.focusFrom = null;
      }
    }

    // New trains and newly served stations appear as they happen.
    while (this.trainGroups.length < g.trains.length) {
      this.addTrainVisual(g.trains[this.trainGroups.length].lineId);
    }

    // Live waiting counts at 4 Hz, plus the zoom policy: a wide view
    // stays a clean diagram; zooming in reveals names, then numbers.
    if (++this.countFrame % 15 === 0) {
      const camH = this.camera.position.y;
      const showNames = camH < 360;
      const showCounts = camH < 300;
      for (const label of this.labels.values()) label.visible = showNames;
      for (const [id, count] of this.counts) {
        count.sprite.visible = showCounts;
        if (!showCounts) continue;
        const up = Math.floor(g.waitingUp.get(id) ?? 0);
        const down = Math.floor(g.waitingDown.get(id) ?? 0);
        const full = g.waitingAt(id) >= g.stationCapAt(id) - 0.001;
        count.set(up + down > 0 ? `${up}/${down}` : '', full);
      }
    }

    // Trains ride their lanes.
    g.trains.forEach((t, i) => {
      const group = this.trainGroups[i];
      if (!group) return;
      const path = g.paths.get(t.lineId)!;
      const segIdx = path.segmentAt(t.distance);
      const a = path.points[segIdx];
      const b = path.points[segIdx + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      const lane = len < 0.001 ? 0 : this.lanes.laneOf(t.lineId, segIdx);
      const nx = len < 0.001 ? 0 : (-dy / len) * lane;
      const ny = len < 0.001 ? 0 : (dx / len) * lane;
      const p = path.posAt(t.distance);
      group.position.set(p.x + nx, TRACK_Y + 0.3, p.y + ny);
      group.rotation.y = -Math.atan2(dy * t.direction, dx * t.direction);
    });

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
