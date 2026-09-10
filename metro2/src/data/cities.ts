/** The city registry: every approved city, in ladder order. Geometry is
 * GENERATED from metro/lib/data/cities.dart by tools/dart2json.py. */
import { CityDef } from '../engine/city';
import newMeridian from './new_meridian.json';
import angelBay from './angel_bay.json';

export const CITIES: CityDef[] = [newMeridian as CityDef, angelBay as CityDef];

export function cityById(id: string | undefined): CityDef {
  return CITIES.find((c) => c.id === id) ?? CITIES[0];
}
