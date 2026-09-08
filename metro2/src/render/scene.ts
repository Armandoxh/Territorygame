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

  constructor(
    canvas: HTMLCanvasElement,
    readonly game: Game,
    opts: { bloom: boolean },
  ) {
    const city = game.city;
    const center = new THREE.Vector3(city.size / 2, 0, city.size / 2);
    this.lanes = buildLanes(city);

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
        const g = new THREE.BoxGeometry(len, 0.35, 1.25);
        g.rotateY(-Math.atan2(dy, dx));
        g.translate((a.x + b.x) / 2 + nx, TRACK_Y, (a.y + b.y) / 2 + ny);
        parts.push(g);
        const bed = new THREE.BoxGeometry(len + 0.8, 0.28, 2.1);
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
      });
      this.trackMats.push(mat);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      this.scene.add(mesh);
    }
    const bedMesh = new THREE.Mesh(
      BufferGeometryUtils.mergeGeometries(bedParts),
      new THREE.MeshStandardMaterial({ color: 0x5b5a58, roughness: 1 }),
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
    type Seg = { x: number; z: number; y: number; w: number; h: number; d: number; rot: number };
    const segs: Seg[] = [];
    const antennas: { x: number; z: number; y: number; h: number }[] = [];
    const footprints: { x: number; z: number; r: number }[] = [];
    city.stations.forEach((st, si) => {
      const rnd = mulberry32(si * 2654435761);
      const n = Math.round(8 + st.demand * 14);
      for (let k = 0; k < n; k++) {
        const ang = rnd() * Math.PI * 2;
        const dist = 4.5 + rnd() * 13;
        const x = st.x + Math.cos(ang) * dist;
        const y = st.y + Math.sin(ang) * dist;
        if (!onLand(city, x, y)) continue;
        if (city.stations.some((o) => Math.hypot(o.x - x, o.y - y) < 3.2)) continue;
        if (trackSegs.some((s) => distToSeg(x, y, s) < 2.6)) continue;
        const w = 2.2 + rnd() * 2.6;
        const d = 2.2 + rnd() * 2.6;
        const h = (2.5 + rnd() * 8) * (0.55 + st.demand) * 1.5;
        const rot = (rnd() - 0.5) * 0.14;
        footprints.push({ x, z: y, r: Math.max(w, d) * 0.75 });
        const kind = rnd();
        if (kind < 0.5 || h < 5) {
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
        if (h > 8) {
          segs.push({ x, z: y, y: LAND_H + h, w: w * 0.32, h: 0.6, d: d * 0.32, rot });
        }
        if (h > 12 && rnd() < 0.5) {
          antennas.push({ x, z: y, y: LAND_H + h + 0.6, h: 1.6 + rnd() * 2.2 });
        }
      }
    });
    const winTex = windowTexture();
    this.buildingMat = new THREE.MeshStandardMaterial({
      color: 0xD9D5CC,
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
    segs.forEach((b, i) => {
      quat.setFromAxisAngle(yAxis, b.rot);
      m4.compose(
        v3p.set(b.x, b.y + b.h / 2, b.z),
        quat,
        v3s.set(b.w, b.h, b.d),
      );
      inst.setMatrixAt(i, m4);
      const shade = 0.86 + (i % 7) * 0.02;
      inst.setColorAt(i, col.setRGB(shade, shade, shade * 0.99));
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    this.scene.add(inst);
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
      this.scene.add(antInst);
    }

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
      for (let k = 0; k < 5; k++) {
        const ang = rnd() * Math.PI * 2;
        const dist = 3.5 + rnd() * 12;
        const x = st.x + Math.cos(ang) * dist;
        const z = st.y + Math.sin(ang) * dist;
        if (!onLand(city, x, z)) continue;
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
    this.scene.add(trunkInst, leafInst);

    // ---- Trains ----
    const beamTex = radialTexture('rgba(255,243,196,0.9)', 'rgba(255,243,196,0)');
    for (const t of game.trains) {
      const line = game.city.lines.find((l) => l.id === t.lineId)!;
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

    if (opts.bloom) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.5, 0.85);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.resize();
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

    // The city answers the dark with light.
    for (const mat of this.trackMats) mat.emissiveIntensity = 0.85 * n;
    this.buildingMat.emissiveIntensity = 0.55 * n;
    this.lampMat.opacity = 0.55 * n;
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
