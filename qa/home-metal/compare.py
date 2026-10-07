#!/usr/bin/env python3
"""Compose evidence without changing either original browser screenshot."""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
sha = lambda data: hashlib.sha256(data).hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--after-dir', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    after_dir, output_dir = args.after_dir.resolve(), args.output_dir.resolve()
    before_dir = ROOT / 'qa/home-neon/live-captures'
    before_manifest = json.loads((before_dir / 'manifest.json').read_text())
    after_manifest = json.loads((after_dir / 'manifest.json').read_text())
    assert before_manifest['status'] == after_manifest['status'] == 'complete'
    assert len(after_manifest['captures']) == 8
    output_dir.mkdir(parents=True, exist_ok=True)
    font_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    large, small = ImageFont.truetype(font_path, 26), ImageFont.truetype(font_path, 17)
    rows = []
    for item in after_manifest['captures']:
        width, height = item['viewportCssPixels']['width'], item['viewportCssPixels']['height']
        sport = item['sport']
        before_file = before_dir / f'home-{sport}-{width}x{height}-live.png'
        after_file = after_dir / item['file']
        before, after = Image.open(before_file).convert('RGB'), Image.open(after_file).convert('RGB')
        assert before.size == after.size == (width * 2, height * 2)
        margin, header, footer = 24, 98, 60
        board = Image.new('RGB', (before.width * 2 + margin * 3, before.height + header + footer), '#080c12')
        draw = ImageDraw.Draw(board)
        x2 = before.width + margin * 2
        draw.text((margin, 18), f'{sport.upper()} · BEFORE · rejected smooth hoop', font=large, fill='#e9f2ff')
        draw.text((margin, 55), f'{width}×{height} · hosted WebKit · DPR2 · motion running', font=small, fill='#98b4cb')
        draw.text((x2, 18), f'{sport.upper()} · AFTER · metal portal implementation', font=large, fill='#e9f2ff')
        venue = 'hosted' if after_manifest['base'].startswith('https:') else 'local'
        draw.text((x2, 55), f'{width}×{height} · {venue} {after_manifest["engine"]} · DPR2 · motion running', font=small, fill='#98b4cb')
        board.paste(before, (margin, header)); board.paste(after, (x2, header))
        assert ImageChops.difference(board.crop((margin, header, margin + before.width, header + before.height)), before).getbbox() is None
        assert ImageChops.difference(board.crop((x2, header, x2 + after.width, header + after.height)), after).getbbox() is None
        draw.text((margin, header + before.height + 17), 'Unaltered browser pixels. Approved source is the chat render; this board compares actual implementations.', font=small, fill='#98b4cb')
        name = f'comparison-{sport}-{width}x{height}.png'
        board.save(output_dir / name, optimize=True)
        rows.append({'sport':sport,'viewportCssPixels':{'width':width,'height':height},'file':name,'sha256':sha((output_dir/name).read_bytes()),'before':{'file':str(before_file.relative_to(ROOT)),'sha256':sha(before_file.read_bytes())},'after':{'file':str(after_file.relative_to(ROOT)),'sha256':sha(after_file.read_bytes())},'browserPixelsResized':False})
    manifest = {'createdAt':datetime.now(timezone.utc).isoformat(),'comparison':'Previously deployed rejected smooth hoop versus current actual metal-portal implementation','approvedSource':after_manifest['approvedSource'],'pixelRegisteredConceptComparison':False,'beforeManifest':str((before_dir/'manifest.json').relative_to(ROOT)),'afterManifest':str((after_dir/'manifest.json').relative_to(ROOT)),'sourceEngines':{'before':'genuine WebKit','after':after_manifest['engine']},'beforeGitHead':before_manifest.get('localGitHead'),'afterGitHead':after_manifest.get('gitHead'),'composites':rows}
    (output_dir/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    cards='\n'.join(f'<figure><figcaption>{r["sport"].upper()} · {r["viewportCssPixels"]["width"]}×{r["viewportCssPixels"]["height"]}</figcaption><a href="{r["file"]}"><img src="{r["file"]}" alt="Previous and current actual {r["sport"].upper()} Home side by side"></a></figure>' for r in rows)
    (output_dir/'index.html').write_text(f'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Project Dollar — metal portal before/after</title><style>body{{margin:0;padding:24px;background:#080c12;color:#eef4ff;font:16px system-ui}}h1{{font-size:26px}}p{{line-height:1.6;max-width:1050px}}a{{color:#65d5ff}}figure{{margin:32px 0;max-width:1800px}}figcaption{{font-weight:700;margin-bottom:12px}}img{{display:block;width:100%;height:auto}}@media(max-width:600px){{body{{padding:12px}}}}</style><h1>Actual Home before and after</h1><p>Left: preceding deployed implementation rejected by the user for its smooth thin hoops and weak surrounding environment. Right: current actual metal-portal implementation. Both original Retina screenshots remain unaltered, with motion running. Browser and local/hosted qualifications are labelled on each board.</p><p>The approved source remains the reattached four-sport render in chat. Its original bytes are unavailable for a pixel-registered composite; independent design agents compare the actual screenshots against that render. This gallery is actual versus actual evidence and does not independently establish visual acceptance. <a href="manifest.json">Source hashes and qualifications</a>.</p>{cards}</html>')
    print(f'Saved {len(rows)} unaltered browser comparisons under {output_dir.relative_to(ROOT)}')

if __name__=='__main__':
    main()
