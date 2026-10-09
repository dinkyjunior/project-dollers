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
    parser.add_argument("--backup", default="backups/project-dollar-matchup-source.zip")
    parser.add_argument("--review", default="qa/matchup-breakdown/release/review.json")
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
        qualification = report.get("qualification", {})
        actual_hosted = report.get("hosted") or (report.get("base", "").startswith("https://dinkyjunior.github.io/project-dollers/") and qualification.get("strictTLS") is True)
        heading = "Actual hosted WebKit" if actual_hosted else "Local " + engine
        if report.get("scopedDelta") or qualification.get("additiveDeltaAudit") or qualification.get("additiveAvailabilityDelta"):
            heading += " — scoped source and upcoming-fixture regression"
        elif "incoming-live-header" in report_path.as_posix():
            heading += " — current live score and clock"
        elif "incoming-injury-detail" in report_path.as_posix():
            heading += " — current provider injury report"
        import os
        report_link = html.escape(os.path.relpath(report_path, output.parent))
        runtime = report.get("source", {}).get("runtimeFiles", {})
        identity = hashlib.sha256(json.dumps(runtime, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
        sections.append(f'<section><h2>{heading}</h2><p><a href="{report_link}">Completed browser report</a> · {html.escape(report["completedAt"])}<br>Exact application/source manifest: <code>{identity}</code></p><div class="gallery">{"".join(cards)}</div></section>')
    import os
    backup = (ROOT / args.backup).resolve()
    review = (ROOT / args.review).resolve()
    assert backup.is_relative_to(ROOT) and backup.is_file()
    assert review.is_relative_to(ROOT) and review.is_file()
    backup_link = html.escape(os.path.relpath(backup, output.parent))
    review_link = html.escape(os.path.relpath(review, output.parent))
    document = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Project Dollar — Matchup QA</title><style>
    *{box-sizing:border-box}body{margin:0;background:#030911;color:#ecf5ff;font:15px/1.55 system-ui,sans-serif}main{max-width:1440px;margin:auto;padding:28px 20px}h1{font-size:30px;line-height:1.2}h2{margin-top:36px}p{max-width:850px;color:#b5c9dc}a{color:#36dcff}code{overflow-wrap:anywhere}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:20px;align-items:start}figure{margin:0;background:#061322;border:1px solid #204c68;border-radius:12px;overflow:hidden}figure img{display:block;width:100%;height:auto}figcaption{padding:12px;font-size:13px}small{display:block;color:#90aabd;margin-top:4px}nav{display:flex;gap:20px;flex-wrap:wrap}</style><main>
    <h1>Project Dollar — Matchup Breakdown</h1><p>Untouched browser screenshots of the approved screen at 393 × 852 and 430 × 896, with tablet and desktop checks. Open an image to view its original resolution. Animation was running naturally when each frame was captured.</p>
    <nav><a href="../../index.html#matchup/DAL">Open the app</a><a href="RELEASE.md">Release evidence</a><a href="../../reference/MATCHUP_BREAKDOWN_CHAT_SOURCE.md">Approved reference record</a><a href="REVIEW_LINK">Six specialist reviews</a><a href="BACKUP_LINK" download="BACKUP_NAME">Download source backup</a></nav>
    <p>The approved visual source is the user’s chat attachment. Its original image file was unavailable in this workspace; these screenshots are actual application output, not copies of that reference. Full-content images expose internal scrolling for inspection; normal viewport captures establish framing. Data uses verified sources, with unavailable, disputed and inferred fields identified.</p>
    '''.replace("REVIEW_LINK", review_link).replace("BACKUP_LINK", backup_link).replace("BACKUP_NAME", html.escape(backup.name)) + "".join(sections) + "</main></html>\n"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(document)
    output.with_suffix(".inventory.json").write_text(json.dumps({"status": "actual-completed-browser-originals", "reports": args.reports, "originals": inventory}, indent=2) + "\n")
    print(json.dumps({"gallery": output.relative_to(ROOT).as_posix(), "originals": len(inventory)}))


if __name__ == "__main__":
    main()
