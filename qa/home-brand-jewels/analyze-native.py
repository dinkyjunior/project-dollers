"""Read-only verification of exact native originals, face-mask pixels and clocks."""
import hashlib
import json
import re
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter
import numpy as np

folder = Path(sys.argv[1])
raw = (folder / 'results.json').read_bytes()
report = json.loads(raw)
assert report['status'] == 'passed' and report['browserClosed'] and report['sourceStable']
assert len(report['servedBodies']) == 22
for body in report['servedBodies']:
    assert body['status'] == 200 and body['sha256'] == body['expectedSha256']

def polygons(d):
    tokens = re.findall(r'[A-Za-z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?', d)
    result, polygon, i, command, x, y = [], [], 0, None, 0, 0
    while i < len(tokens):
        if tokens[i].isalpha():
            command = tokens[i]
            i += 1
            assert command in ['M', 'L', 'H', 'V', 'Z'], 'Unsupported native clip command ' + command
            if command == 'Z':
                result.append(polygon)
                polygon = []
                continue
        if command in ['M', 'L']:
            x, y = float(tokens[i]), float(tokens[i + 1])
            i += 2
            if command == 'M':
                if polygon:
                    result.append(polygon)
                polygon = []
                command = 'L'
        elif command == 'H':
            x = float(tokens[i])
            i += 1
        elif command == 'V':
            y = float(tokens[i])
            i += 1
        else:
            raise AssertionError('Native clip path data expected')
        polygon.append((x, y))
    if polygon:
        result.append(polygon)
    return result

def face_mask(size, group, native, clip):
    matrix, scale = native['matrix'], native['nativeDPR']
    mask = Image.new('1', size)
    for d in group['paths']:
        for polygon in polygons(d):
            points = [((matrix['a'] * x + matrix['c'] * y + matrix['e'] - clip['x']) * scale,
                       (matrix['b'] * x + matrix['d'] * y + matrix['f'] - clip['y']) * scale)
                      for x, y in polygon]
            part = Image.new('1', size)
            ImageDraw.Draw(part).polygon(points, fill=1)
            mask = ImageChops.logical_xor(mask, part)
    # A one-pixel interior excludes antialiased boundary rounding from the proof.
    return np.asarray(mask.convert('L').filter(ImageFilter.MinFilter(3))) > 0

originals = {}
def find_originals(value):
    if isinstance(value, dict):
        if str(value.get('file', '')).endswith('.png'):
            originals[value['file']] = value
        for child in value.values():
            find_originals(child)
    elif isinstance(value, list):
        for child in value:
            find_originals(child)
find_originals(report)
proof = {'readOnly': True, 'reportSha256': hashlib.sha256(raw).hexdigest(),
         'sourceInputs': len(report['source']), 'exactHomeAndDataBodies': 22,
         'originals': [], 'brandFaces': [], 'lifecycle': []}
for filename, metadata in originals.items():
    data = (folder / filename).read_bytes()
    assert hashlib.sha256(data).hexdigest() == metadata['sha256']
    image = Image.open(folder / filename)
    assert image.width > 0 and image.height > 0
    proof['originals'].append({'file': filename, 'sha256': metadata['sha256'],
                               'bytes': len(data), 'size': list(image.size)})

for row in report['results']:
    assert not row['errors'] and not row['http'] and not row['failures']
    series = row['brandMotion']['series']
    first = Image.open(folder / series[0]['paint']['file']).convert('RGB')
    first_pixels = np.asarray(first, dtype=np.int16)
    native, clip = series[0]['native'], series[0]['paint']['clip']
    maximum = np.zeros(first_pixels.shape[:2], dtype=np.int16)
    for shot in series[1:]:
        image = Image.open(folder / shot['paint']['file']).convert('RGB')
        assert image.size == first.size
        maximum = np.maximum(maximum, np.max(np.abs(np.asarray(image, dtype=np.int16) - first_pixels), axis=2))
    faces = []
    for group in native['groups']:
        mask = face_mask(first.size, group, native, clip)
        area = int(np.count_nonzero(mask))
        changed = int(np.count_nonzero((maximum > 3) & mask))
        assert area > 0 and changed > 0, ('Every actual letter face must visibly advance', group['material'], group['letter'])
        faces.append({'material': group['material'], 'letter': group['letter'], 'clipId': group['clipId'],
                      'interiorMaskPixels': area, 'changedPixelsAbove3': changed,
                      'changedPercent': round(100 * changed / area, 3), 'maximumDelta': int(maximum[mask].max())})
    moneybag = {'paths': ['M1450 90H1740V620H1450Z']}
    bag_mask = face_mask(first.size, moneybag, native, clip)
    bag_changed = int(np.count_nonzero(maximum[bag_mask]))
    assert bag_changed == 0, 'The original green moneybag region must retain exactly static pixels'
    proof['brandFaces'].append({'viewport': row['viewport'], 'naturalSampleTimes': [s['native']['observedAt'] for s in series],
                                'originalFiles': [s['paint']['file'] for s in series], 'faces': faces,
                                'moneybagRegionChangedPixels': bag_changed,
                                'advancingOriginalBrandObjects': row['brandMotion']['advancingOriginalBrandObjects']})
    for phase, field, running in [('reduced', 'reducedBrand', False), ('inactive', 'inactiveBrand', False),
                                  ('restored', 'restoredBrand', True), ('returned', 'returnedBrand', True)]:
        nodes = row[field]['nodes']
        clocks = [clock for node in nodes for clock in node['clocks']]
        if running:
            assert len(clocks) == len(nodes) and all(c['state'] == 'running' for c in clocks)
        else:
            assert not any(c['state'] == 'running' for c in clocks)
        proof['lifecycle'].append({'viewport': row['viewport'], 'phase': phase,
                                    'brandObjects': len(nodes), 'nativeClocks': len(clocks),
                                    'runningNativeClocks': sum(c['state'] == 'running' for c in clocks)})
    for sample in row['synchronizedSamples']:
        assert len(sample['paths']) == 17 and len(set(sample['startTimes'])) == 1
        assert max(sample['nativeTimes']) - min(sample['nativeTimes']) < 1 and sample['dashSpread'] < .2
    for phase, a, b in [('natural', row['motion']['paintA'], row['motion']['paintB']),
                        ('restored', row['motion']['resumedPaintA'], row['motion']['resumedPaintB']),
                        ('returned', row['returnPaintA'], row['returnPaintB'])]:
        x = np.asarray(Image.open(folder / a['file']).convert('RGB'), dtype=np.int16)
        y = np.asarray(Image.open(folder / b['file']).convert('RGB'), dtype=np.int16)
        assert np.count_nonzero(np.max(np.abs(x - y), axis=2) > 3) > 0, 'Native brand pixels change after ' + phase

proof['allSeventeenBorderClocksSynchronized'] = True
proof['qualification'] = 'Genuine native browser originals and original face-clip interior pixel masks; no artwork, clock, DOM, style or image-byte replacement. Conservative moneybag interior is exactly static. Mobile emulation is not physical iPhone or frame-rate certification; approved chat attachment was not available as a local registered pixel reference.'
out = folder / 'pixel-native-proof.json'
out.write_text(json.dumps(proof, indent=2) + '\n')
print(json.dumps({'output': str(out), 'sha256': hashlib.sha256(out.read_bytes()).hexdigest(),
                  'originals': len(proof['originals']), 'verifiedLetterFaces': sum(len(row['faces']) for row in proof['brandFaces']),
                  'originalBytes': sum(row['bytes'] for row in proof['originals'])}))
