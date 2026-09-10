#!/usr/bin/env python3
"""Convert the GENERATED metro/lib/data/cities.dart into JSON for the v2
WebGL client. The Dart file stays the single source of truth (emitted from
the approved design rigs); run this after any re-emit.

  python3 metro2/tools/dart2json.py
"""
import json, pathlib, re

SRC = pathlib.Path(__file__).resolve().parents[2] / 'metro/lib/data/cities.dart'
OUTDIR = pathlib.Path(__file__).resolve().parents[1] / 'src/data'

CITIES = {'newMeridian': 'new_meridian.json', 'angelBay': 'angel_bay.json'}

def city_block(src, name):
    start = src.index(f'static const {name} = CityDef(')
    depth, i = 0, src.index('(', start)
    for j in range(i, len(src)):
        if src[j] == '(': depth += 1
        elif src[j] == ')':
            depth -= 1
            if depth == 0: return src[start:j+1]
    raise ValueError(name)

def emit(block, out):
    city = {
        'id': re.search(r"id: '([^']+)'", block).group(1),
        'name': re.search(r"name: '([^']+)'", block).group(1),
        'size': float(re.search(r"size: ([\d.]+)", block).group(1)),
    }
    for scale in ('costScale', 'fareScale'):
        m = re.search(scale + r": ([\d.]+)", block)
        city[scale] = float(m.group(1)) if m else 1.0
    city['stations'] = [
        {'id': m.group(1), 'name': m.group(2), 'x': float(m.group(3)),
         'y': float(m.group(4)), 'demand': float(m.group(5)),
         'labelSide': int(m.group(6) or 0)}
        for m in re.finditer(
            r"StationDef\(id: '([^']+)', name: '([^']+)', x: ([\d.]+), "
            r"y: ([\d.]+), demand: ([\d.]+)(?:, labelSide: (-?\d+))?", block)
    ]
    city['lines'] = []
    for m in re.finditer(
            r"LineDef\(\s*id: '([^']+)',\s*name: '([^']+)',\s*bullet: '([^']+)',"
            r"\s*color: Color\(0x([0-9A-Fa-f]{8})\),\s*stationIds: \[([^\]]*)\],"
            r"\s*unlockCost: ([\d.]+),\s*trainCost: ([\d.]+)", block):
        city['lines'].append({
            'id': m.group(1), 'name': m.group(2), 'bullet': m.group(3),
            'color': '#' + m.group(4)[2:],
            'stationIds': re.findall(r"'([^']+)'", m.group(5)),
            'unlockCost': float(m.group(6)), 'trainCost': float(m.group(7)),
        })
    lands_m = re.search(r"lands: \[(.*?)\n    \],", block, re.S)
    city['lands'] = [] if not lands_m else [
        [[float(a), float(b)] for a, b in re.findall(r"Offset\((-?[\d.]+), (-?[\d.]+)\)", poly)]
        for poly in re.findall(r"\[(.*?)\]", lands_m.group(1), re.S)
    ]
    parks_m = re.search(r"parks: \[(.*?)\],", block, re.S)
    city['parks'] = [] if not parks_m else [
        {'cx': float(a), 'cy': float(b), 'w': float(c), 'h': float(d), 'rot': float(e)}
        for a, b, c, d, e in re.findall(
            r"ParkDef\(([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+), (-?[\d.]+)\)", parks_m.group(1))
    ]
    dist_m = re.search(r"districts: \[(.*?)\],", block, re.S)
    city['districts'] = [] if not dist_m else [
        {'text': t, 'x': float(x), 'y': float(y)}
        for t, x, y in re.findall(r"WaterLabel\('([^']+)', ([\d.]+), ([\d.]+)", dist_m.group(1))
    ]
    out.write_text(json.dumps(city, indent=1))
    print(f"{city['name']}: {len(city['stations'])} stations, "
          f"{len(city['lines'])} lines, {len(city['lands'])} land polys, "
          f"{len(city['parks'])} parks, {len(city['districts'])} districts -> {out}")

src = SRC.read_text()
for name, fname in CITIES.items():
    emit(city_block(src, name), OUTDIR / fname)
