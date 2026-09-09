/** City data types for the v2 WebGL client.
 *
 * The single source of truth is still the approved design-rig output in
 * `metro/lib/data/cities.dart`; `tools/dart2json.py` converts it to the
 * JSON this module loads. Never hand-edit coordinates here or in the JSON.
 */

export interface StationDef {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Riders per second who want to board here (before upgrades). */
  demand: number;
  /** Label placement: 0 = below; -1 = left of the dot; 1 = right. */
  labelSide?: number;
}

export interface LineDef {
  id: string;
  name: string;
  bullet: string;
  color: string; // '#RRGGBB'
  stationIds: string[];
  unlockCost: number;
  trainCost: number;
}

export interface ParkDef {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
}

export interface CityDef {
  id: string;
  name: string;
  size: number;
  stations: StationDef[];
  lines: LineDef[];
  /** Land polygons as [x, y] rings in map space. */
  lands: number[][][];
  parks: ParkDef[];
  districts: { text: string; x: number; y: number }[];
}

/** Faithful port of the Dart LinePath: cumulative station distances plus
 * interpolation along the route polyline. */
export class LinePath {
  readonly points: { x: number; y: number }[];
  readonly stationDistance: number[];

  constructor(city: CityDef, line: LineDef) {
    const byId = new Map(city.stations.map((s) => [s.id, s]));
    this.points = line.stationIds.map((id) => {
      const s = byId.get(id)!;
      return { x: s.x, y: s.y };
    });
    this.stationDistance = [0];
    let d = 0;
    for (let i = 1; i < this.points.length; i++) {
      d += Math.hypot(
        this.points[i].x - this.points[i - 1].x,
        this.points[i].y - this.points[i - 1].y,
      );
      this.stationDistance.push(d);
    }
  }

  get length(): number {
    return this.stationDistance[this.stationDistance.length - 1];
  }

  segmentAt(d: number): number {
    for (let i = 1; i < this.stationDistance.length; i++) {
      if (d <= this.stationDistance[i]) return i - 1;
    }
    return this.stationDistance.length - 2;
  }

  posAt(d: number): { x: number; y: number } {
    const clamped = Math.min(Math.max(d, 0), this.length);
    for (let i = 1; i < this.points.length; i++) {
      if (clamped <= this.stationDistance[i]) {
        const segLen = this.stationDistance[i] - this.stationDistance[i - 1];
        const t =
          segLen === 0 ? 0 : (clamped - this.stationDistance[i - 1]) / segLen;
        return {
          x: this.points[i - 1].x + (this.points[i].x - this.points[i - 1].x) * t,
          y: this.points[i - 1].y + (this.points[i].y - this.points[i - 1].y) * t,
        };
      }
    }
    return this.points[this.points.length - 1];
  }
}

/** Point-in-polygon (even-odd) for placing scenery on land only. */
export function pointInPoly(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function onLand(city: CityDef, x: number, y: number): boolean {
  return city.lands.some((ring) => pointInPoly(x, y, ring));
}
