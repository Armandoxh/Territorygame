/** The v2 renderer: the approved New Meridian XL geometry as a living 3D
 * city. Extruded boroughs in the bay, procedural block massing seeded from
 * station demand, track ribbons in the official line colors, trains as lit
 * vehicles, and the same deterministic light cycle as v1 — every rush hour
 * is the night rush, and the city answers the dark with light.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CityDef, onLand } from '../engine/city';
import { Game } from '../engine/game';

const LAND_H = 1.6;
const TRACK_Y = LAND_H + 0.5;
const LANE_GAP = 1.9;

/** Deterministic PRNG for scenery (visual only — the sim stays RNG-free). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function radialTexture(inner: string, outer: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function windowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 32, 64);
  const rnd = mulberry32(7);
  for (let y = 4; y < 60; y += 7) {
    for (let x = 3; x < 29; x += 6) {
      if (rnd() < 0.34) {
        ctx.fillStyle = rnd() < 0.8 ? '#ffd98a' : '#cfe6ff';
        ctx.fillRect(x, y, 3, 4);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

interface LaneTable {
  laneOf(lineId: string, segIdx: number): number;
}

/** Shared corridors fan side-by-side, like v1's lane offsets. */
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

export class CityScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;

  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private nightAmbient: THREE.AmbientLight;
  private water: THREE.MeshStandardMaterial;
  private landMat: THREE.MeshStandardMaterial;
  private buildingMat: THREE.MeshStandardMaterial;
  private trackMats: THREE.MeshStandardMaterial[] = [];
  private lampMat: THREE.SpriteMaterial;
  private trainGroups: THREE.Group[] = [];
  private trainMats: THREE.MeshStandardMaterial[] = [];
  private beamMats: THREE.MeshBasicMaterial[] = [];
  private lanes: LaneTable;
  private fog: THREE.Fog;
  /** Everything that is CITY, not transit — hidden in MAP view. */
  private scenery = new THREE.Group();
  private mapExtras = new THREE.Group();
  private labels = new THREE.Group();
  private labeledStations = new Set<string>();
  mapView = false;
  // Growth infill: instances that rise as stations run hot.
  private infill: THREE.InstancedMesh | null = null;
  private infillMeta: { stIdx: number; tier: number }[] = [];
  private infillSegs: { x: number; z: number; y: number; w: number; h: number; d: number; rot: number }[] = [];
  private infillScale: Float32Array = new Float32Array(0);
  private neon: THREE.InstancedMesh | null = null;
  private neonMat: THREE.MeshBasicMaterial | null = null;
  private neonMeta: number[] = [];
  private neonScale: Float32Array = new Float32Array(0);
  private neonSegsData: { x: number; z: number; w: number; rot: number; stIdx: number }[] = [];
  private growthFrame = 0;

  constructor(
    canvas: HTMLCanvasElement,
    readonly game: Game,
    opts: { bloom: boolean },
  ) {
    const city = game.city;
    const center = new THREE.Vector3(city.size / 2, 0, city.size / 2);
    this.lanes = buildLanes(city);
    this.scene.add(this.scenery);
    this.mapExtras.visible = false;
    this.scene.add(this.mapExtras, this.labels);
    this.labels.visible = false;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;

    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 4000);
    this.camera.position.set(center.x + 210, 240, center.z + 330);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.copy(center);
    this.controls.enableDamping = true;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.maxPolarAngle = 1.32;
    this.controls.minDistance = 60;
    this.controls.maxDistance = 700;

    this.fog = new THREE.Fog(0xcfe2f3, 700, 1900);
    this.scene.fog = this.fog;

    // ---- Lights ----
    this.sun = new THREE.DirectionalLight(0xffffff, 1.55);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -320;
    sc.right = 320;
    sc.top = 320;
    sc.bottom = -320;
    sc.far = 1500;
    this.sun.target.position.copy(center);
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xdfeaf5, 0x9a958c, 0.55);
    this.scene.add(this.hemi);
    this.nightAmbient = new THREE.AmbientLight(0x46506e, 0);
    this.scene.add(this.nightAmbient);

    // ---- Water ----
    this.water = new THREE.MeshStandardMaterial({
      color: 0xbdd3e8,
      roughness: 0.35,
      metalness: 0.1,
    });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), this.water);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(center.x, 0, center.z);
    sea.receiveShadow = true;
    this.scene.add(sea);

    // ---- Land (extruded boroughs) ----
    this.landMat = new THREE.MeshStandardMaterial({
      color: 0xEFEDE6,
      roughness: 0.95,
    });
    for (const ring of city.lands) {
      const shape = new THREE.Shape();
      ring.forEach(([x, y], i) => {
        if (i === 0) shape.moveTo(x, -y);
        else shape.lineTo(x, -y);
      });
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: LAND_H,
        bevelEnabled: true,
        bevelThickness: 0.6,
        bevelSize: 1.2,
        bevelSegments: 2,
      });
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, this.landMat);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      this.scene.add(mesh);
    }

    // ---- Parks ----
    const parkMat = new THREE.MeshStandardMaterial({
      color: 0x7FB57A,
      roughness: 1,
    });
    for (const p of city.parks) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.w, 0.5, p.h), parkMat);
      mesh.position.set(p.cx, LAND_H + 0.25, p.cy);
      mesh.rotation.y = (-p.rot * Math.PI) / 180;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }

    // ---- Track ribbons, one merged mesh per line, on a shared dark
    // ballast bed so routes read as built rail, not floating stripes ----
    const trackSegs: { ax: number; ay: number; bx: number; by: number }[] = [];
    const bedParts: THREE.BufferGeometry[] = [];
    for (const line of city.lines) {
      const path = game.paths.get(line.id)!;
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < path.points.length - 1; i++) {
        const a = path.points[i];
        const b = path.points[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) continue;
        trackSegs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
        const lane = this.lanes.laneOf(line.id, i);
        const nx = (-dy / len) * lane;
        const ny = (dx / len) * lane;
        const g = new THREE.BoxGeometry(len, 0.4, 1.7);
        g.rotateY(-Math.atan2(dy, dx));
        g.translate((a.x + b.x) / 2 + nx, TRACK_Y, (a.y + b.y) / 2 + ny);
        parts.push(g);
        const bed = new THREE.BoxGeometry(len + 0.8, 0.3, 2.6);
        bed.rotateY(-Math.atan2(dy, dx));
        bed.translate((a.x + b.x) / 2 + nx, TRACK_Y - 0.24, (a.y + b.y) / 2 + ny);
        bedParts.push(bed);
      }
      const merged = BufferGeometryUtils.mergeGeometries(parts);
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(line.color),
        emissive: new THREE.Color(line.color),
        emissiveIntensity: 0,
        roughness: 0.6,
        transparent: true,
      });
      this.trackMats.push(mat);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      this.scene.add(mesh);
    }
    const bedMesh = new THREE.Mesh(
      BufferGeometryUtils.mergeGeometries(bedParts),
      new THREE.MeshStandardMaterial({ color: 0x46464a, roughness: 1 }),
    );
    bedMesh.castShadow = true;
    bedMesh.receiveShadow = true;
    this.scene.add(bedMesh);

    // ---- Stations: platform discs + night lamp sprites ----
    const linesAt = new Map<string, number>();
    for (const line of city.lines) {
      for (const id of line.stationIds) {
        linesAt.set(id, (linesAt.get(id) ?? 0) + 1);
      }
    }
    const stationMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.4,
    });
    this.lampMat = new THREE.SpriteMaterial({
      map: radialTexture('rgba(255,217,138,0.95)', 'rgba(255,217,138,0)'),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0,
    });
    const discParts: THREE.BufferGeometry[] = [];
    for (const st of city.stations) {
      const r = (linesAt.get(st.id) ?? 1) > 1 ? 2.3 : 1.55;
      const g = new THREE.CylinderGeometry(r, r, 0.5, 20);
      g.translate(st.x, TRACK_Y + 0.15, st.y);
      discParts.push(g);
      const lamp = new THREE.Sprite(this.lampMat);
      lamp.position.set(st.x, TRACK_Y + 2.4, st.y);
      lamp.scale.setScalar(4.5 + (linesAt.get(st.id) ?? 1) * 1.2);
      this.scene.add(lamp);
    }
    const discs = new THREE.Mesh(
      BufferGeometryUtils.mergeGeometries(discParts),
      stationMat,
    );
    discs.castShadow = true;
    this.scene.add(discs);

    // ---- Procedural city blocks, seeded from station demand ----
    const distToSeg = (px: number, py: number, s: (typeof trackSegs)[0]) => {
      const vx = s.bx - s.ax;
      const vy = s.by - s.ay;
      const wx = px - s.ax;
      const wy = py - s.ay;
      const c1 = vx * wx + vy * wy;
      const c2 = vx * vx + vy * vy;
      const t = c2 > 0 ? Math.min(Math.max(c1 / c2, 0), 1) : 0;
      return Math.hypot(px - (s.ax + vx * t), py - (s.ay + vy * t));
    };
    // Each accepted spot becomes a BUILDING, not a box: simple blocks,
    // towers with setbacks, or podium towers — plus rooftop mechanicals
    // and antennas on the tall ones, all with a little grid-jitter.
    // Ground reserved for the landmarks (verified clear of rail,
    // stations, and parks by the site-search script).
    const STADIUM = { x: 44, z: 336 };
    const AIRPORT = { x: 484, z: 450 }; // vertical runway, y 420-480
    const landmarkBlock = (x: number, y: number) =>
      Math.hypot(x - STADIUM.x, y - STADIUM.z) < 18.5 ||
      (Math.abs(x - AIRPORT.x) < 15 && y > 414 && y < 486);

    type Seg = { x: number; z: number; y: number; w: number; h: number; d: number; rot: number };
    const segs: Seg[] = [];
    const antennas: { x: number; z: number; y: number; h: number }[] = [];
    const footprints: { x: number; z: number; r: number }[] = [];
    city.stations.forEach((st, si) => {
      const rnd = mulberry32(si * 2654435761);
      const n = Math.round(12 + st.demand * 18);
      for (let k = 0; k < n; k++) {
        const ang = rnd() * Math.PI * 2;
        const dist = 4.2 + rnd() * 15;
        const x = st.x + Math.cos(ang) * dist;
        const y = st.y + Math.sin(ang) * dist;
        if (!onLand(city, x, y)) continue;
        if (landmarkBlock(x, y)) continue;
        if (city.stations.some((o) => Math.hypot(o.x - x, o.y - y) < 3.2)) continue;
        if (trackSegs.some((s) => distToSeg(x, y, s) < 2.6)) continue;
        // THE CITY TELLS ITS STORY BY ZONE. Downtown core: towers and
        // podium blocks shoulder to shoulder. Midtown: mixed mid-rise.
        // Suburbs: small houses and rowhouses with yards between —
        // height AND texture change as you leave the center.
        const dc = Math.hypot(x - 220, y - 280);
        const core = 1 + 0.6 * Math.exp(-(dc * dc) / (2 * 110 * 110));
        const zone = dc < 95 ? 2 : dc < 175 ? 1 : 0;
        const roll = rnd();
        let w: number;
        let d: number;
        let h: number;
        const lowShare = zone === 2 ? 0.3 : zone === 1 ? 0.62 : 0.86;
        const midShare = zone === 2 ? 0.72 : zone === 1 ? 0.92 : 0.99;
        if (roll < lowShare) {
          if (rnd() < (zone === 0 ? 0.45 : 0.35)) {
            w = 3.4 + rnd() * 3.0; // a rowhouse slab
            d = 1.9 + rnd() * 1.1;
          } else {
            w = zone === 0 ? 1.5 + rnd() * 1.1 : 1.8 + rnd() * 1.5;
            d = zone === 0 ? 1.5 + rnd() * 1.1 : 1.8 + rnd() * 1.5;
          }
          h = zone === 0 ? 1.1 + rnd() * 1.6 : 1.8 + rnd() * 3.0;
        } else if (roll < midShare) {
          w = 2.6 + rnd() * 2.0;
          d = 2.6 + rnd() * 2.0;
          h = (4.5 + rnd() * 5) * (0.75 + st.demand * 0.5) * (zone === 0 ? 0.7 : 1);
        } else {
          w = 2.3 + rnd() * 1.6;
          d = 2.3 + rnd() * 1.6;
          h = (8 + rnd() * 9) * (0.55 + st.demand) * core;
        }
        const rot = (rnd() - 0.5) * 0.14;
        footprints.push({ x, z: y, r: Math.max(w, d) * 0.75 });
        const kind = rnd();
        if (kind < 0.5 || h < 9) {
          segs.push({ x, z: y, y: LAND_H, w, h, d, rot });
        } else if (kind < 0.82) {
          // Tower with a setback: wide base, slimmer upper mass.
          const hb = h * 0.58;
          segs.push({ x, z: y, y: LAND_H, w, h: hb, d, rot });
          segs.push({ x, z: y, y: LAND_H + hb, w: w * 0.68, h: h - hb, d: d * 0.68, rot });
        } else {
          // Podium tower: low broad podium, tall slender shaft.
          segs.push({ x, z: y, y: LAND_H, w: w * 1.3, h: 2.2, d: d * 1.3, rot });
          segs.push({ x, z: y, y: LAND_H + 2.2, w: w * 0.66, h: h - 2.2, d: d * 0.66, rot });
        }
        if (h > 6.5 && rnd() < 0.6) {
          segs.push({ x, z: y, y: LAND_H + h, w: w * 0.32, h: 0.6, d: d * 0.32, rot });
        }
        if (h > 14 && rnd() < 0.45) {
          antennas.push({ x, z: y, y: LAND_H + h + 0.6, h: 1.6 + rnd() * 2.2 });
        }
      }
      // A LANDMARK tower over every third busy interchange — the
      // skyline's exclamation points.
      if (st.demand >= 0.7 && (linesAt.get(st.id) ?? 1) > 1 && si % 3 === 0) {
        const ang = rnd() * Math.PI * 2;
        const x = st.x + Math.cos(ang) * 6.5;
        const y = st.y + Math.sin(ang) * 6.5;
        if (
          onLand(city, x, y) &&
          !landmarkBlock(x, y) &&
          !trackSegs.some((sg) => distToSeg(x, y, sg) < 2.6) &&
          !city.stations.some((o) => Math.hypot(o.x - x, o.y - y) < 3.2)
        ) {
          const hh = 24 + rnd() * 9;
          const rot = (rnd() - 0.5) * 0.14;
          footprints.push({ x, z: y, r: 3.2 });
          segs.push({ x, z: y, y: LAND_H, w: 4.2, h: hh * 0.16, d: 4.2, rot });
          segs.push({ x, z: y, y: LAND_H + hh * 0.16, w: 2.9, h: hh * 0.6, d: 2.9, rot });
          segs.push({ x, z: y, y: LAND_H + hh * 0.76, w: 2.0, h: hh * 0.24, d: 2.0, rot });
          antennas.push({ x, z: y, y: LAND_H + hh, h: 3.6 });
        }
      }
    });
    const winTex = windowTexture();
    this.buildingMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      emissive: 0xffffff,
      emissiveMap: winTex,
      emissiveIntensity: 0,
    });
    const inst = new THREE.InstancedMesh(
      new RoundedBoxGeometry(1, 1, 1, 2, 0.06),
      this.buildingMat,
      segs.length,
    );
    const m4 = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const v3p = new THREE.Vector3();
    const v3s = new THREE.Vector3();
    const col = new THREE.Color();
    // A muted facade palette — warm grays, sand, slate, a little
    // brick — so the massing reads as many buildings, not one clone.
    const FACADES = [
      0xd9d5cc, 0xd9d5cc, 0xcfcbc1, 0xc4bfb4, 0xb9bec6, 0xa9968a, 0x93856f,
      0x8e9ba6,
    ];
    segs.forEach((b, i) => {
      quat.setFromAxisAngle(yAxis, b.rot);
      m4.compose(
        v3p.set(b.x, b.y + b.h / 2, b.z),
        quat,
        v3s.set(b.w, b.h, b.d),
      );
      inst.setMatrixAt(i, m4);
      col.set(FACADES[i % FACADES.length]);
      col.multiplyScalar(0.9 + ((i * 7) % 5) * 0.035);
      inst.setColorAt(i, col);
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    this.scenery.add(inst);
    if (antennas.length > 0) {
      const antInst = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.07, 0.1, 1, 5),
        new THREE.MeshStandardMaterial({ color: 0x8b8b8b, roughness: 0.7 }),
        antennas.length,
      );
      antennas.forEach((a, i) => {
        m4.makeScale(1, a.h, 1);
        m4.setPosition(a.x, a.y + a.h / 2, a.z);
        antInst.setMatrixAt(i, m4);
      });
      this.scenery.add(antInst);
    }

    // ---- GROWTH INFILL: the city reacts to the game. Each station
    // gets three tiers of extra massing that RISE as it runs hot —
    // service, works, upgrades, and lifetime traffic all feed the
    // heat. Opening a line visibly urbanizes its corridor. ----
    const neonSegs: { x: number; z: number; w: number; rot: number; stIdx: number }[] = [];
    city.stations.forEach((st, si) => {
      const rnd = mulberry32(0xc0ffee ^ (si * 2654435761));
      const dc = Math.hypot(st.x - 220, st.y - 280);
      const core = 1 + 0.6 * Math.exp(-(dc * dc) / (2 * 110 * 110));
      const tiers: [number, number, number][] = [
        [1, 4, 5], // tier, count, base height
        [2, 4, 9],
        [3, 2, 16],
      ];
      for (const [tier, count, baseH] of tiers) {
        for (let k = 0; k < count; k++) {
          const ang = rnd() * Math.PI * 2;
          const dist = 3.8 + rnd() * 9;
          const x = st.x + Math.cos(ang) * dist;
          const y = st.y + Math.sin(ang) * dist;
          if (!onLand(city, x, y)) continue;
          if (landmarkBlock(x, y)) continue;
          if (city.stations.some((o) => Math.hypot(o.x - x, o.y - y) < 3.0)) continue;
          if (trackSegs.some((sg) => distToSeg(x, y, sg) < 2.6)) continue;
          if (footprints.some((f) => Math.hypot(f.x - x, f.z - y) < f.r + 0.5)) continue;
          const w = 2.0 + rnd() * 1.8;
          const d = 2.0 + rnd() * 1.8;
          const h = (baseH + rnd() * baseH * 0.7) * (0.7 + 0.3 * core);
          const rot = (rnd() - 0.5) * 0.14;
          footprints.push({ x, z: y, r: Math.max(w, d) * 0.7 });
          this.infillSegs.push({ x, z: y, y: LAND_H, w, h, d, rot });
          this.infillMeta.push({ stIdx: si, tier });
          if (tier === 2 && neonSegs.length < 500) {
            neonSegs.push({ x, z: y, w: w * 0.92, rot, stIdx: si });
          }
        }
      }
    });
    if (this.infillSegs.length > 0) {
      this.infill = new THREE.InstancedMesh(
        new RoundedBoxGeometry(1, 1, 1, 2, 0.06),
        this.buildingMat,
        this.infillSegs.length,
      );
      this.infillScale = new Float32Array(this.infillSegs.length);
      this.infillSegs.forEach((b, i) => {
        m4.makeScale(0.001, 0.001, 0.001);
        m4.setPosition(b.x, LAND_H, b.z);
        this.infill!.setMatrixAt(i, m4);
        col.set(FACADES[(i * 3) % FACADES.length]);
        col.multiplyScalar(0.92 + (i % 4) * 0.03);
        this.infill!.setColorAt(i, col);
      });
      this.infill.castShadow = true;
      this.scenery.add(this.infill);
    }
    if (neonSegs.length > 0) {
      // Storefront neon: additive strips at the base of tier-2 infill,
      // burning in signage colors once the block has grown in.
      this.neonMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.neon = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 0.5, 0.22),
        this.neonMat,
        neonSegs.length,
      );
      this.neonScale = new Float32Array(neonSegs.length);
      const NEON = [0xff4f9a, 0x2ee6d6, 0xffb347, 0x9a6bff, 0x7dff6b];
      neonSegs.forEach((n, i) => {
        m4.makeScale(0.001, 0.001, 0.001);
        m4.setPosition(n.x, LAND_H + 0.9, n.z);
        this.neon!.setMatrixAt(i, m4);
        this.neon!.setColorAt(i, col.set(NEON[i % NEON.length]));
        this.neonMeta.push(n.stIdx);
      });
      this.scenery.add(this.neon);
    }
    this.neonSegsData = neonSegs;

    // ---- Trees: canopies in every park, plus street trees where the
    // blocks left room. The single biggest organic counterweight to a
    // city of extrusions. ----
    const trees: { x: number; z: number; s: number }[] = [];
    city.parks.forEach((p, pi) => {
      const rnd = mulberry32(0x9e3779b9 + pi);
      const count = Math.max(4, Math.round((p.w * p.h) / 20));
      const th = (-p.rot * Math.PI) / 180;
      for (let i = 0; i < count; i++) {
        const lx = (rnd() - 0.5) * (p.w - 2.5);
        const lz = (rnd() - 0.5) * (p.h - 2.5);
        trees.push({
          x: p.cx + lx * Math.cos(th) + lz * Math.sin(th),
          z: p.cy - lx * Math.sin(th) + lz * Math.cos(th),
          s: 1.0 + rnd() * 0.8,
        });
      }
    });
    city.stations.forEach((st, si) => {
      const rnd = mulberry32(0x85ebca6b ^ (si * 2654435761));
      const dcT = Math.hypot(st.x - 220, st.y - 280);
      for (let k = 0; k < (dcT > 175 ? 10 : dcT > 95 ? 6 : 3); k++) {
        const ang = rnd() * Math.PI * 2;
        const dist = 3.5 + rnd() * 12;
        const x = st.x + Math.cos(ang) * dist;
        const z = st.y + Math.sin(ang) * dist;
        if (!onLand(city, x, z)) continue;
        if (landmarkBlock(x, z)) continue;
        if (trackSegs.some((s) => distToSeg(x, z, s) < 2.4)) continue;
        if (footprints.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + 0.7)) continue;
        trees.push({ x, z, s: 0.7 + rnd() * 0.5 });
      }
    });
    const trunkInst = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.13, 0.18, 1, 5),
      new THREE.MeshStandardMaterial({ color: 0x6d5236, roughness: 1 }),
      trees.length,
    );
    const leafInst = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.85, 1),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }),
      trees.length,
    );
    trees.forEach((t, i) => {
      const trunkH = 1.1 * t.s;
      m4.makeScale(t.s, trunkH, t.s);
      m4.setPosition(t.x, LAND_H + trunkH / 2, t.z);
      trunkInst.setMatrixAt(i, m4);
      m4.makeScale(t.s * 1.5, t.s * 1.35, t.s * 1.5);
      m4.setPosition(t.x, LAND_H + trunkH + t.s * 0.9, t.z);
      leafInst.setMatrixAt(i, m4);
      leafInst.setColorAt(
          i, col.setRGB(0.15 + (i % 3) * 0.03, 0.4 + (i % 5) * 0.045, 0.17));
    });
    trunkInst.castShadow = true;
    leafInst.castShadow = true;
    leafInst.receiveShadow = true;
    this.scenery.add(trunkInst, leafInst);

    // ---- Landmarks ────────────────────────────────────────────────
    // THE MERIDIAN BOWL: an elliptical stadium on the west bank —
    // bowl ring, pitch, four floodlight masts that burn at night.
    {
      const sx = STADIUM.x;
      const sz = STADIUM.z;
      const bowl = new THREE.Mesh(
        new THREE.TorusGeometry(10.5, 3.0, 10, 44),
        new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.8 }),
      );
      bowl.rotation.x = -Math.PI / 2;
      bowl.scale.set(1.25, 1, 0.95);
      bowl.position.set(sx, LAND_H + 1.5, sz);
      bowl.castShadow = true;
      bowl.receiveShadow = true;
      this.scenery.add(bowl);
      const pitch = new THREE.Mesh(
        new THREE.CircleGeometry(9.2, 36),
        new THREE.MeshStandardMaterial({ color: 0x6fa867, roughness: 1 }),
      );
      pitch.rotation.x = -Math.PI / 2;
      pitch.scale.x = 1.25;
      pitch.position.set(sx, LAND_H + 0.32, sz);
      this.scenery.add(pitch);
      this.floodMat = new THREE.MeshStandardMaterial({
        color: 0xfff3cd,
        emissive: 0xffedb0,
        emissiveIntensity: 0,
      });
      const mastMat = new THREE.MeshStandardMaterial({
        color: 0x8b8b8b,
        roughness: 0.7,
      });
      for (const [mx, mz] of [
        [-13.5, -10], [13.5, -10], [-13.5, 10], [13.5, 10],
      ]) {
        const mast = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.24, 7.5, 6),
          mastMat,
        );
        mast.position.set(sx + mx, LAND_H + 3.75, sz + mz);
        this.scenery.add(mast);
        const head = new THREE.Mesh(
          new THREE.BoxGeometry(1.7, 0.9, 0.4),
          this.floodMat,
        );
        head.position.set(sx + mx, LAND_H + 7.7, sz + mz);
        head.lookAt(sx, LAND_H, sz);
        this.scenery.add(head);
      }
    }

    // BAYSIDE FIELD: a small airport on the east shore — runway with
    // centerline dashes, apron, terminal, control tower with a beacon.
    {
      const ax = AIRPORT.x;
      const az = AIRPORT.z;
      const runway = new THREE.Mesh(
        new THREE.BoxGeometry(7, 0.25, 64),
        new THREE.MeshStandardMaterial({ color: 0x3d3d40, roughness: 0.95 }),
      );
      runway.position.set(ax, LAND_H + 0.3, az);
      runway.receiveShadow = true;
      this.scenery.add(runway);
      const dashParts: THREE.BufferGeometry[] = [];
      for (let dz = -28; dz <= 28; dz += 5.6) {
        const g2 = new THREE.BoxGeometry(0.45, 0.06, 2.6);
        g2.translate(ax, LAND_H + 0.45, az + dz);
        dashParts.push(g2);
      }
      this.scenery.add(
        new THREE.Mesh(
          BufferGeometryUtils.mergeGeometries(dashParts),
          new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.8 }),
        ),
      );
      const apron = new THREE.Mesh(
        new THREE.BoxGeometry(11, 0.22, 16),
        new THREE.MeshStandardMaterial({ color: 0x97979b, roughness: 0.95 }),
      );
      apron.position.set(ax - 9.5, LAND_H + 0.27, az + 12);
      apron.receiveShadow = true;
      this.scenery.add(apron);
      const terminal = new THREE.Mesh(
        new RoundedBoxGeometry(4.5, 2.6, 13, 2, 0.5),
        new THREE.MeshStandardMaterial({ color: 0xddd8ce, roughness: 0.7 }),
      );
      terminal.position.set(ax - 15.5, LAND_H + 1.3, az + 12);
      terminal.castShadow = true;
      this.scenery.add(terminal);
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.85, 6.5, 8),
        new THREE.MeshStandardMaterial({ color: 0xcfcbc1, roughness: 0.7 }),
      );
      tower.position.set(ax - 15.5, LAND_H + 3.2, az + 2);
      tower.castShadow = true;
      this.scenery.add(tower);
      const cab = new THREE.Mesh(
        new THREE.CylinderGeometry(1.4, 1.4, 1.1, 8),
        new THREE.MeshStandardMaterial({
          color: 0x2a3340,
          roughness: 0.2,
          metalness: 0.4,
        }),
      );
      cab.position.set(ax - 15.5, LAND_H + 7.0, az + 2);
      this.scenery.add(cab);
      this.beaconMat = new THREE.MeshStandardMaterial({
        color: 0xff5544,
        emissive: 0xff3322,
        emissiveIntensity: 0,
      });
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 8, 8),
        this.beaconMat,
      );
      beacon.position.set(ax - 15.5, LAND_H + 7.9, az + 2);
      this.scenery.add(beacon);
      // Two parked planes on the apron.
      const planeMat = new THREE.MeshStandardMaterial({
        color: 0xf2f3f5,
        roughness: 0.4,
      });
      for (const [px, pz, rot] of [
        [-8.5, 8.5, 0.4], [-8.5, 16, -0.25],
      ]) {
        const plane = new THREE.Group();
        const fus = new THREE.Mesh(
          new RoundedBoxGeometry(1.1, 0.9, 5.4, 2, 0.4),
          planeMat,
        );
        fus.position.y = 0.7;
        plane.add(fus);
        const wing = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.12, 1.1), planeMat);
        wing.position.y = 0.75;
        plane.add(wing);
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.9), planeMat);
        tail.position.set(0, 1.2, 2.4);
        plane.add(tail);
        plane.position.set(ax + px, LAND_H + 0.3, az + pz);
        plane.rotation.y = rot;
        this.scenery.add(plane);
      }
    }

    // ---- Trains (visuals are added lazily, so a growing fleet shows
    // up the moment it is bought) ----
    this.beamTex = radialTexture('rgba(255,243,196,0.9)', 'rgba(255,243,196,0)');

    if (opts.bloom) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.5, 0.85);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.resize();
  }

  private beamTex: THREE.Texture;
  private floodMat!: THREE.MeshStandardMaterial;
  private beaconMat!: THREE.MeshStandardMaterial;

  private addTrainVisual(lineId: string): void {
    {
      const line = this.game.city.lines.find((l) => l.id === lineId)!;
      const beamTex = this.beamTex;
      const group = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(line.color),
        emissive: new THREE.Color(line.color),
        emissiveIntensity: 0,
        roughness: 0.35,
        metalness: 0.2,
      });
      // Rounded car body with a dark window band — rolling stock, not a
      // crate on rails.
      const body = new THREE.Mesh(new RoundedBoxGeometry(4.4, 1.5, 1.7, 3, 0.45), mat);
      body.position.y = 1.1;
      body.castShadow = true;
      group.add(body);
      const band = new THREE.Mesh(
        new RoundedBoxGeometry(4.0, 0.55, 1.74, 2, 0.2),
        new THREE.MeshStandardMaterial({
          color: 0x14181f,
          roughness: 0.25,
          metalness: 0.4,
        }),
      );
      band.position.y = 1.3;
      group.add(band);
      const roof = new THREE.Mesh(
        new RoundedBoxGeometry(3.4, 0.35, 1.3, 2, 0.14),
        new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }),
      );
      roof.position.y = 1.95;
      group.add(roof);
      const beamMat = new THREE.MeshBasicMaterial({
        map: beamTex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      });
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(14, 5), beamMat);
      beam.rotation.x = -Math.PI / 2;
      beam.position.set(9.2, 0.35, 0);
      group.add(beam);
      this.trainMats.push(mat);
      this.beamMats.push(beamMat);
      this.trainGroups.push(group);
      this.scene.add(group);
    }
  }

  /** The station nearest to a screen tap, via a ray onto the track
   * plane — no per-station pick meshes needed. */
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
    // Tap tolerance scales with camera height so street-level taps stay
    // precise and orbit-level taps stay forgiving.
    const tol = Math.max(
      5.5,
      this.camera.position.distanceTo(this.controls.target) * 0.028,
    );
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
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of path.points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.y);
      maxZ = Math.max(maxZ, p.y);
    }
    const target = new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    const span = Math.max(maxX - minX, maxZ - minZ, 50);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const pos = target.clone().add(dir.multiplyScalar(span * 1.55 + 70));
    this.focusFrom = {
      target: this.controls.target.clone(),
      pos: this.camera.position.clone(),
    };
    this.focusTo = { target, pos };
    this.focusT0 = performance.now();
  }

  /** Ease infill (and its neon) toward each station's heat tier.
   * Cheap: runs every ~45 frames, eases a few steps per run. */
  private updateGrowth(): void {
    if (!this.infill) return;
    const g = this.game;
    const heat = g.city.stations.map((st) => g.stationHeat(st.id));
    const thresholds = [0, 3, 8, 15];
    const m4 = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    let dirty = false;
    this.infillMeta.forEach((meta, i) => {
      const target = heat[meta.stIdx] >= thresholds[meta.tier] ? 1 : 0;
      const cur = this.infillScale[i];
      if (Math.abs(target - cur) < 0.01) return;
      const next = cur + (target - cur) * 0.3;
      this.infillScale[i] = next;
      const b = this.infillSegs[i];
      quat.setFromAxisAngle(yAxis, b.rot);
      const sy = Math.max(b.h * next, 0.001);
      m4.compose(
        pos.set(b.x, LAND_H + sy / 2, b.z),
        quat,
        scl.set(Math.max(b.w * Math.min(1, next * 1.6), 0.001), sy,
          Math.max(b.d * Math.min(1, next * 1.6), 0.001)),
      );
      this.infill!.setMatrixAt(i, m4);
      dirty = true;
    });
    if (dirty) this.infill.instanceMatrix.needsUpdate = true;
    if (this.neon) {
      let ndirty = false;
      this.neonMeta.forEach((stIdx, i) => {
        const target = heat[stIdx] >= thresholds[2] ? 1 : 0;
        const cur = this.neonScale[i];
        if (Math.abs(target - cur) < 0.01) return;
        const next = cur + (target - cur) * 0.3;
        this.neonScale[i] = next;
        const n = this.neonSegsData[i];
        quat.setFromAxisAngle(yAxis, n.rot);
        m4.compose(
          pos.set(n.x, LAND_H + 0.9, n.z),
          quat,
          scl.set(Math.max(n.w * next, 0.001), Math.max(0.5 * next, 0.001), 0.22),
        );
        this.neon!.setMatrixAt(i, m4);
        ndirty = true;
      });
      if (ndirty) this.neon.instanceMatrix.needsUpdate = true;
    }
  }

  /** MAP view: the transit diagram — scenery hidden, camera overhead,
   * served stations labeled, district names on the ground. */
  setMapView(on: boolean): void {
    this.mapView = on;
    this.scenery.visible = !on;
    this.mapExtras.visible = on;
    this.labels.visible = on;
    if (on) {
      this.buildMapExtras();
      this.buildLabels();
      const t = this.controls.target;
      const dist = this.camera.position.distanceTo(t);
      this.focusFrom = {
        target: t.clone(),
        pos: this.camera.position.clone(),
      };
      this.focusTo = {
        target: t.clone(),
        pos: new THREE.Vector3(t.x, Math.max(dist, 260), t.z + 1),
      };
      this.focusT0 = performance.now();
      this.controls.maxPolarAngle = 0.06;
    } else {
      this.controls.maxPolarAngle = 1.32;
      const t = this.controls.target;
      const dist = this.camera.position.distanceTo(t);
      this.focusFrom = {
        target: t.clone(),
        pos: this.camera.position.clone(),
      };
      this.focusTo = {
        target: t.clone(),
        pos: t.clone().add(new THREE.Vector3(0.55, 0.75, 1).normalize().multiplyScalar(dist)),
      };
      this.focusT0 = performance.now();
    }
  }

  private mapExtrasBuilt = false;

  private buildMapExtras(): void {
    if (this.mapExtrasBuilt) return;
    this.mapExtrasBuilt = true;
    // District names, laid flat like the printed diagram.
    for (const d of this.game.city.districts) {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 96;
      const ctx = c.getContext('2d')!;
      ctx.font = '800 52px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(110,110,110,0.8)';
      ctx.fillText(d.text, 256, 48);
      const tex = new THREE.CanvasTexture(c);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(96, 18),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(d.x, LAND_H + 0.85, d.y);
      this.mapExtras.add(mesh);
    }
  }

  /** Label sprites for served stations (built lazily, grows on unlock). */
  buildLabels(): void {
    for (const st of this.game.city.stations) {
      if (!this.game.isServed(st.id) || this.labeledStations.has(st.id)) continue;
      this.labeledStations.add(st.id);
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 56;
      const ctx = c.getContext('2d')!;
      ctx.font = '800 26px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeText(st.name, 128, 28);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillText(st.name, 128, 28);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: new THREE.CanvasTexture(c),
          depthWrite: false,
          transparent: true,
          // Constant screen size — readable at any map altitude.
          sizeAttenuation: false,
        }),
      );
      sprite.scale.set(0.14, 0.14 * (56 / 256), 1);
      // Stagger above/below the dot so neighboring names don't collide.
      sprite.center.set(0.5, this.labeledStations.size % 2 === 0 ? -0.55 : 1.55);
      sprite.position.set(st.x, TRACK_Y + 0.5, st.y);
      this.labels.add(sprite);
    }
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
  }

  /** One frame: light cycle + train poses + draw. */
  render(): void {
    const g = this.game;
    const n = g.nightFactor;

    // Sky, fog, water walk day → dusk → night.
    const day = new THREE.Color(0xcfe2f3);
    const dusk = new THREE.Color(0xf0b57e);
    const night = new THREE.Color(0x0a1120);
    const sky =
      n < 0.5
        ? day.clone().lerp(dusk, n * 2)
        : dusk.clone().lerp(night, (n - 0.5) * 2);
    this.scene.background = sky;
    this.fog.color.copy(sky);
    this.water.color
      .set(0xbdd3e8)
      .lerp(new THREE.Color(0x101b2c), n);
    this.landMat.color.set(0xEFEDE6).lerp(new THREE.Color(0x2c3246), n * 0.85);

    // The sun sinks and warms through dusk, then hands off to the city.
    const sunAngle = Math.PI * 0.27 * (1 - n) + 0.06;
    this.sun.position.set(
      this.controls.target.x + Math.cos(sunAngle) * 500,
      Math.sin(sunAngle) * 520 + 30,
      this.controls.target.z + 180,
    );
    this.sun.intensity = 1.55 * (1 - n);
    this.sun.color.set(0xfff2dd).lerp(new THREE.Color(0xff9b52), Math.min(n * 2, 1));
    this.hemi.intensity = 0.55 * (1 - n) + 0.2;
    this.nightAmbient.intensity = 1.25 * n;

    // The city grows toward the game every couple of seconds.
    if (++this.growthFrame % 45 === 0) this.updateGrowth();
    if (this.neonMat) this.neonMat.opacity = 0.9 * n;
    if (this.mapView && this.labels.children.length < 200) this.buildLabels();

    // A newly bought train appears the frame after the purchase.
    while (this.trainGroups.length < g.trains.length) {
      this.addTrainVisual(g.trains[this.trainGroups.length].lineId);
    }

    // Camera glide toward a newly bought line.
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

    // The city answers the dark with light. Locked routes stay ghosts.
    this.trackMats.forEach((mat, i) => {
      const unlocked = g.isUnlocked(g.city.lines[i].id);
      mat.opacity = unlocked ? 1 : 0.3;
      // A touch of self-light by day keeps the route colors saturated
      // against the sun-washed city; night still burns brighter.
      mat.emissiveIntensity = unlocked ? 0.18 + 0.75 * n : 0;
    });
    this.buildingMat.emissiveIntensity = 0.55 * n;
    this.lampMat.opacity = 0.55 * n;
    // Stadium floodlights burn at night; the airfield beacon blinks.
    this.floodMat.emissiveIntensity = 1.5 * n;
    this.beaconMat.emissiveIntensity =
      n * (0.7 + 0.7 * Math.sin(performance.now() / 280));
    for (const mat of this.trainMats) mat.emissiveIntensity = 0.7 * n;
    for (const mat of this.beamMats) mat.opacity = 0.75 * n;
    if (this.bloom) this.bloom.strength = 0.08 + 0.55 * n;

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
      group.position.set(p.x + nx, TRACK_Y + 0.2, p.y + ny);
      const heading = Math.atan2(dy * t.direction, dx * t.direction);
      group.rotation.y = -heading;
    });

    this.controls.update();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
