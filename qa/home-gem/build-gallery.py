#!/usr/bin/env python3
"""Publish original, completed Home captures and real before/after pairs."""
import argparse
import hashlib
import html
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read_report(name):
    path = ROOT / name
    report = json.loads(path.read_text())
    assert report["status"] == "passed" and report.get("completedAt")
    assert report.get("browserClosed") is True
    images = []
    for row in report["originals"]:
        image = path.parent / row["file"]
        assert image.is_file()
        assert hashlib.sha256(image.read_bytes()).hexdigest() == row["sha256"]
        images.append({**row, "path": image.relative_to(ROOT).as_posix()})
    return report, images


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", required=True)
    parser.add_argument("--reports", required=True, nargs="+")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output = ROOT / args.output
    before, baseline = read_report(args.baseline)
    baseline_by_case = {(x["viewport"]["width"], x["sport"]): x for x in baseline}
    sections, inventory = [], list(baseline)

    def figure(row, label):
        link = html.escape(os.path.relpath(ROOT / row["path"], output.parent))
        return f'<figure><a href="{link}" target="_blank"><img src="{link}" loading="lazy" alt="{html.escape(label)}"></a><figcaption>{html.escape(label)}</figcaption></figure>'

    for name in args.reports:
        report, images = read_report(name)
        inventory.extend(images)
        pairs = []
        for row in images:
            width, height = row["viewport"]["width"], row["viewport"]["height"]
            label = f'{row["sport"].upper()} · {width} × {height}'
            earlier = baseline_by_case.get((width, row["sport"]))
            content = figure(earlier, "Before · " + label) if earlier else ""
            content += figure(row, "After · " + label)
            pairs.append(f'<article><h3>{html.escape(label)}</h3><div class="pair">{content}</div></article>')
        link = html.escape(os.path.relpath(ROOT / name, output.parent))
        scope = "Actual hosted" if report.get("base", "").startswith("https:") else "Local"
        title = scope + " " + report["engine"]
        sections.append(f'<section><h2>{html.escape(title)}</h2><p><a href="{link}">Completed native browser report</a> · {html.escape(report["completedAt"])}<br>Application/source identity: <code>{html.escape(report["runtimeManifestSha256"])}</code></p>{"".join(pairs)}</section>')

    document = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Project Dollar · Home gemstone QA</title><style>
    *{box-sizing:border-box}body{margin:0;background:#020710;color:#eaf5ff;font:15px/1.55 system-ui,sans-serif}main{max-width:1080px;margin:auto;padding:24px 18px}h1{line-height:1.15}h2{margin-top:36px}p{max-width:850px;color:#adc6dc}a{color:#46dbff}code{overflow-wrap:anywhere}article{margin:24px 0}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:start}figure{margin:0;background:#06111d;border:1px solid #245373;border-radius:12px;overflow:hidden}img{width:100%;height:auto;display:block}figcaption{padding:10px 12px;color:#bcd3e8}nav{display:flex;gap:18px;flex-wrap:wrap}@media(max-width:560px){.pair{gap:8px}figcaption{font-size:11px;padding:8px}}
    </style><main><h1>Project Dollar · Home gemstone entrance</h1><p>Original browser screenshots of all four sport states. The before/after pairs show the actual previous app beside the refined implementation at the same viewport. Open a capture to view its untouched original resolution.</p><nav><a href="../../index.html#home">Open Home</a><a href="RELEASE.md">Release and six reviews</a><a href="../../reference/HOME_GEM_CHAT_SOURCE.md">Approved reference record</a></nav><p>The approved design source is the four-sport chat attachment. Its original image bytes were unavailable; these are actual app captures, not fabricated reference panels. Motion ran naturally during capture; no animation clock, screenshot CSS or source-response substitution was used. Reduced-motion and paused-state checks are documented separately in the native reports.</p>''' + "".join(sections) + "</main></html>\n"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(document)
    output.with_suffix(".inventory.json").write_text(json.dumps({"status": "completed-native-originals", "baseline": args.baseline, "reports": args.reports, "originals": inventory}, indent=2) + "\n")
    print(json.dumps({"gallery": args.output, "originals": len(inventory)}))


if __name__ == "__main__":
    main()
