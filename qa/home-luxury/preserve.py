"""Verify the Page 1 pass preserves every existing unrelated runtime byte."""
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASELINE = "78fd6b51709cacd217a1bf45f5f8315c0f2b65bb"
CHANGED = {"index.html", "assets/home-premium.css", "assets/home-gate-motion.css", "assets/home-gate-motion.js"}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def old(path):
    return subprocess.check_output(["git", "show", f"{BASELINE}:{path}"], cwd=ROOT)


class Sections(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.source = source
        self.offsets = [0]
        for line in source.splitlines(keepends=True):
            self.offsets.append(self.offsets[-1] + len(line))
        self.stack = []
        self.pages = {}
        self.feed(source)

    def source_offset(self):
        line, column = self.getpos()
        return self.offsets[line - 1] + column

    def handle_starttag(self, tag, attrs):
        if tag == "section":
            self.stack.append((dict(attrs).get("data-page"), self.source_offset()))

    def handle_endtag(self, tag):
        if tag == "section":
            page, start = self.stack.pop()
            if page:
                self.pages[page] = self.source[start:self.source_offset() + len("</section>")]


def main():
    files = subprocess.check_output(["git", "ls-tree", "-r", "--name-only", BASELINE, "assets"], cwd=ROOT, text=True).splitlines()
    unchanged = {}
    for path in files:
        if path in CHANGED:
            continue
        raw = (ROOT / path).read_bytes()
        assert raw == old(path), f"Unrelated runtime changed: {path}"
        unchanged[path] = sha(raw)
    before = Sections(old("index.html").decode()).pages
    after = Sections((ROOT / "index.html").read_text()).pages
    assert set(after) == set(before) == {"home", "nfl", "steelers"}
    pages = {}
    for page in ["nfl", "steelers"]:
        assert after[page] == before[page], f"Page {page} markup changed"
        pages[page] = sha(after[page].encode())
    report = {
        "status": "passed", "checkedAt": datetime.now(timezone.utc).isoformat(),
        "baselineCommit": BASELINE, "scope": "Page 1 native architecture, typography, lighting, composition and motion only",
        "unchangedExistingAssetFiles": len(unchanged), "unchangedAssets": unchanged,
        "pages2and3MarkupByteIdentical": True, "pageMarkupSha256": pages,
        "dataThreeFilesByteIdentical": True, "page4Added": False,
        "allowedExistingRuntimeChanges": sorted(CHANGED),
        "qualification": "Subsequent incoming source updates require a separate recursive data comparison and current-data browser verification before publication."
    }
    (ROOT / "qa/home-luxury/preservation.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k not in ["unchangedAssets", "qualification"]}))


if __name__ == "__main__":
    main()
