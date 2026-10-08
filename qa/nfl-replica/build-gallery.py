"""Build a gallery from original browser PNGs, without altering image pixels."""
import hashlib
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
panels = []
images = []
for engine in ("chromium", "webkit"):
    for width, height in ((393, 852), (430, 896)):
        for kind, suffix in (("Native phone viewport", "top"),
                             ("Entire screen, capture-only unrolled scroller", "full-content")):
            cells = []
            for stage in ("before", "after"):
                directory = f"before-{engine}" if stage == "before" else f"common-{engine}"
                file = ROOT / directory / f"nfl-{width}x{height}-{suffix}.png"
                assert file.is_file(), file
                relative = file.relative_to(ROOT).as_posix()
                images.append({"path": relative, "sha256": sha(file), "bytes": file.stat().st_size})
                cells.append(f'<figure><figcaption>{stage.title()}</figcaption><a href="{html.escape(relative)}"><img src="{html.escape(relative)}" width="{width}" alt="{stage.title()} NFL {engine} {width} by {height}; {html.escape(kind)}" loading="lazy"></a></figure>')
            panels.append(f'<section><h2>{engine.title()} · {width} × {height}</h2><p>{html.escape(kind)}</p><div class="compare">{"".join(cells)}</div></section>')

content = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="../../assets/icons.svg"><title>Project Dollar — NFL refinement evidence</title><style>body{margin:0;background:#040a10;color:#eef8ff;font:16px/1.5 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:24px}h1{font-size:25px}h2{margin-bottom:0;font-size:20px}p{color:#a6c3d4}a{color:#62dcff}section{margin:28px 0;padding-top:10px;border-top:1px solid #176088}.compare{display:flex;gap:20px;align-items:flex-start;overflow-x:auto;padding-bottom:16px}figure{margin:0;flex:0 0 auto}figcaption{padding:8px 0;font-weight:700}img{display:block;max-width:none;height:auto;border:1px solid #1b566b}small{display:block;color:#9cbdce}</style><main><h1>Project Dollar — NFL refinement evidence</h1><p>Original browser screenshots of the previous published implementation and the refined NFL screen. Both phone sizes were captured in genuine Chromium and WebKit at device scale factor 2. Click an image to inspect its original PNG.</p><p>The approved tall NFL render was supplied in chat. Its original binary was unavailable to this workspace; six specialists and the primary agent compared against the chat attachment. These pairs show actual before/after browser output and are not a substituted approved-reference image or a registered pixel-difference measurement.</p><p>The native viewport pairs preserve the compact app enclosure and normal internal scrolling. Full-screen pairs temporarily expose the actual scroller content for capture only. They do not represent a physically taller phone. Real sourced statistics differ from the illustrative numbers in the approved render.</p><p><a href="release-review.json">Release review and source hashes</a> · <a href="gallery-images.json">Original PNG hashes</a> · <a href="../../#nfl">Open the NFL screen</a></p>'''
content += "".join(panels) + '<small>Engine emulation does not establish physical iPhone frame rate or Safari browser-control coverage.</small></main></html>'
(ROOT / "index.html").write_text(content)
(ROOT / "gallery-images.json").write_text(json.dumps(images, indent=2) + "\n")
print(f"Gallery built from {len(images)} original images")
