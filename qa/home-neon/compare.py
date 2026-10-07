#!/usr/bin/env python3
"""Compose labelled evidence; source browser pixels remain unchanged."""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
HOME = ROOT / "qa/home-neon"
SPORTS = ("nfl", "nba", "nrl", "ufc")
VIEWS = ((393, 852), (430, 896))
sha = lambda data: hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--after-dir", type=Path, default=HOME / "live-captures")
    parser.add_argument("--output-dir", type=Path, default=HOME / "before-after")
    parser.add_argument("--local-paused", action="store_true")
    args = parser.parse_args()
    args.after_dir = args.after_dir.resolve()
    args.output_dir = args.output_dir.resolve()
    before_dir = ROOT / "qa/home-gate/live-captures"
    before_manifest = json.loads((before_dir / "manifest.json").read_text())
    after_manifest = json.loads((args.after_dir / ("results.json" if args.local_paused else "manifest.json")).read_text())
    assert before_manifest["status"] == "complete", "Prior live evidence is complete"
    assert after_manifest["status"] == ("passed" if args.local_paused else "complete"), "New evidence completed"
    assert after_manifest["engine"] == ("webkit" if args.local_paused else "Genuine official Playwright WebKit 26 Linux WPE"), "Like browser engine"
    args.output_dir.mkdir(parents=True, exist_ok=True)
    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    title_font, small_font = ImageFont.truetype(font_path, 26), ImageFont.truetype(font_path, 18)
    rows = []
    for width, height in VIEWS:
        for sport in SPORTS:
            before_file = before_dir / f"home-{sport}-{width}x{height}-live.png"
            after_file = args.after_dir / f"home-{sport}-{width}x{height}{'' if args.local_paused else '-live'}.png"
            before, after = Image.open(before_file).convert("RGB"), Image.open(after_file).convert("RGB")
            assert before.size == after.size == (width * 2, height * 2), "Both original Retina captures match viewport/DPR"
            margin, header, footer = 24, 98, 60
            board = Image.new("RGB", (before.width * 2 + margin * 3, before.height + header + footer), "#080c12")
            draw = ImageDraw.Draw(board)
            draw.text((margin, 18), f"{sport.upper()} · BEFORE · preceding deployed Home", font=title_font, fill="#e9f2ff")
            draw.text((margin, 55), f"{width}×{height} · WebKit · DPR2 · actual hosted · motion running", font=small_font, fill="#98b4cb")
            after_x = before.width + margin * 2
            draw.text((after_x, 18), f"{sport.upper()} · AFTER · stronger neon refinement", font=title_font, fill="#e9f2ff")
            suffix = "local · exposure paused" if args.local_paused else "actual hosted · motion running"
            draw.text((after_x, 55), f"{width}×{height} · WebKit · DPR2 · {suffix}", font=small_font, fill="#98b4cb")
            board.paste(before, (margin, header))
            board.paste(after, (after_x, header))
            draw.text((margin, header + before.height + 17), "Unaltered browser pixels. This is old actual versus new actual, not a pixel-registered concept comparison.", font=small_font, fill="#98b4cb")
            filename = f"comparison-{sport}-{width}x{height}.png"
            board.save(args.output_dir / filename, optimize=True)
            rows.append({"sport": sport, "viewportCssPixels": {"width": width, "height": height}, "deviceScaleFactor": 2, "file": filename, "compositeSha256": sha((args.output_dir / filename).read_bytes()), "before": {"file": str(before_file.relative_to(ROOT)), "sha256": sha(before_file.read_bytes())}, "after": {"file": str(after_file.relative_to(ROOT)), "sha256": sha(after_file.read_bytes())}, "browserPixelsResized": False, "afterExposurePaused": args.local_paused})
    manifest = {"createdAt": datetime.now(timezone.utc).isoformat(), "comparison": "Preceding actual deployed Home versus current actual browser output", "approvedSource": "Approved four-sport gate render supplied in chat; original attachment bytes unavailable. Latest explicit stronger-neon/removed-heading changes take precedence.", "beforeManifest": str((before_dir / "manifest.json").relative_to(ROOT)), "beforeGitHead": before_manifest["localGitHead"], "afterManifest": str((args.after_dir / ("results.json" if args.local_paused else "manifest.json")).relative_to(ROOT)), "afterGitHead": after_manifest.get("localGitHead", after_manifest.get("gitHead")), "pixelRegisteredConceptComparison": False, "composites": rows}
    (args.output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    cards = "\n".join(f'<figure><figcaption>{row["sport"].upper()} · {row["viewportCssPixels"]["width"]}×{row["viewportCssPixels"]["height"]}</figcaption><a href="{row["file"]}"><img src="{row["file"]}" alt="{row["sport"].upper()} old actual and refined actual Home side by side"></a><a href="{row["file"]}" download>Download original comparison</a></figure>' for row in rows)
    qualification = "New images are local genuine WebKit captures, paused only during screenshot exposure; previous images are unpaused hosted WebKit captures." if args.local_paused else "Both columns are actual hosted genuine WebKit captures with motion running; a still image cannot display continuous animation."
    (args.output_dir / "index.html").write_text(f'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Project Dollar — Home before/after</title><style>body{{background:#080c12;color:#eef4ff;font:16px system-ui;margin:0;padding:24px}}h1{{font-size:26px}}p{{line-height:1.6;max-width:1050px}}a{{color:#65d5ff}}figure{{margin:32px 0;max-width:1800px}}figcaption{{font-weight:700;margin-bottom:12px}}img{{display:block;width:100%;height:auto;margin-bottom:10px}}@media(max-width:600px){{body{{padding:12px}}}}</style><h1>Project Dollar — actual Home before and after</h1><p>Left: the preceding deployed Home. Right: the approved stronger-neon refinement, with the repeated league heading removed, a thicker illuminated gate and more prominent entry/selection borders. Browser screenshot pixels remain unaltered at their original Retina resolution.</p><p>{qualification} The approved concept remains the chat attachment; its bytes are unavailable for a registered source-panel composite. These boards document the material change between two working implementations.</p><p><a href="../live-captures/index.html">All refined actual hosted captures</a> · <a href="manifest.json">Source hashes and comparison qualification</a></p>{cards}</html>')
    print(f"Saved {len(rows)} labelled browser comparisons to {args.output_dir.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
