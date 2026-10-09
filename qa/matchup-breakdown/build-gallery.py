#!/usr/bin/env python3
"""Make a gallery of untouched, completed actual browser evidence."""
import argparse
import hashlib
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reports", nargs="+", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output = (ROOT / args.output).resolve()
    assert output.is_relative_to(ROOT)
    sections, inventory = [], []
    for name in args.reports:
        report_path = (ROOT / name).resolve()
        assert report_path.is_relative_to(ROOT)
        report = json.loads(report_path.read_text())
        assert report["status"] == "passed" and report.get("completedAt")
        images = sorted(report_path.parent.glob("*.png"))
        cards = []
        for image in images:
            relative = image.relative_to(ROOT).as_posix()
            inventory.append({"path": relative, "sha256": hashlib.sha256(image.read_bytes()).hexdigest()})
            import os
            link = html.escape(os.path.relpath(image, output.parent))
            label = html.escape(image.stem.replace("-", " "))
            full = "full-content" in image.name
            qualification = "Full content: internal scroll exposed for inspection" if full else "Actual native browser capture"
            cards.append(f'<figure><a href="{link}" target="_blank"><img src="{link}" loading="lazy" alt="{label}"></a><figcaption>{label}<small>{qualification}</small></figcaption></figure>')
        engine = html.escape(report["engine"])
        heading = "Actual hosted WebKit" if report.get("hosted") else "Local " + engine
        import os
        report_link = html.escape(os.path.relpath(report_path, output.parent))
        sections.append(f'<section><h2>{heading}</h2><p><a href="{report_link}">Completed browser report</a> · {html.escape(report["completedAt"])}</p><div class="gallery">{"".join(cards)}</div></section>')
    document = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Project Dollar — Matchup QA</title><style>
    *{box-sizing:border-box}body{margin:0;background:#030911;color:#ecf5ff;font:15px/1.55 system-ui,sans-serif}main{max-width:1440px;margin:auto;padding:28px 20px}h1{font-size:30px;line-height:1.2}h2{margin-top:36px}p{max-width:850px;color:#b5c9dc}a{color:#36dcff}code{overflow-wrap:anywhere}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:20px;align-items:start}figure{margin:0;background:#061322;border:1px solid #204c68;border-radius:12px;overflow:hidden}figure img{display:block;width:100%;height:auto}figcaption{padding:12px;font-size:13px}small{display:block;color:#90aabd;margin-top:4px}nav{display:flex;gap:20px;flex-wrap:wrap}</style><main>
    <h1>Project Dollar — Matchup Breakdown</h1><p>Untouched browser screenshots of the approved screen at 393 × 852 and 430 × 896, with tablet and desktop checks. Open an image to view its original resolution. Animation was running naturally when each frame was captured.</p>
    <nav><a href="../../index.html#matchup/DAL">Open the app</a><a href="RELEASE.md">Release evidence</a><a href="../../reference/MATCHUP_BREAKDOWN_CHAT_SOURCE.md">Approved reference record</a><a href="release/review.json">Six specialist reviews</a><a href="../../backups/project-dollar-matchup-source.zip" download="project-dollar-matchup-source.zip">Download source backup</a></nav>
    <p>The approved visual source is the user’s chat attachment. Its original image file was unavailable in this workspace; these screenshots are actual application output, not copies of that reference. Full-content images expose internal scrolling for inspection; normal viewport captures establish framing. Data uses verified sources, with unavailable, disputed and inferred fields identified.</p>
    ''' + "".join(sections) + "</main></html>\n"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(document)
    output.with_suffix(".inventory.json").write_text(json.dumps({"status": "actual-completed-browser-originals", "reports": args.reports, "originals": inventory}, indent=2) + "\n")
    print(json.dumps({"gallery": output.relative_to(ROOT).as_posix(), "originals": len(inventory)}))


if __name__ == "__main__":
    main()
