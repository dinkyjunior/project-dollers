"""Read-only independent verification of completed native browser evidence.

Computes UI values again from the frozen JSON, without trusting expected values
stored in the browser auditor's receipts. Does not run or mutate the app.
"""
from pathlib import Path
from itertools import product
import datetime
import hashlib
import json
import math
import re

ROOT = Path(__file__).resolve().parents[4]
SHA = lambda p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest()
read = lambda p: json.loads((ROOT / p).read_text())
manifest_path = "qa/team-details/candidate-runtime-manifest.json"
manifest = read(manifest_path)
assert SHA(manifest_path) == "fe69378eb4a1fb9d7e766788b80410b6b568c834359bc9805c802820ed5d2e01"
assert len(manifest) == 231
assert all(SHA(path) == value for path, value in manifest.items())
dataset = read("assets/data/team-details.json")
team = dataset["teams"]["DAL"]
known = lambda value: value is not None and isinstance(value, (int, float)) and math.isfinite(value)


def number(text):
    text = str(text).strip().replace("−", "-").replace("–", "-").replace(",", "")
    if text.lower() in ("—", "-", "n/a", "na", "unavailable"):
        return None
    value = re.search(r"[+-]?\d+(?:\.\d+)?", text)
    return float(value[0]) if value else None


def same(text, expected, tolerance=0.051):
    actual = number(text)
    assert (actual is None) == (expected is None), (text, expected)
    if expected is not None:
        assert abs(actual - expected) <= tolerance, (text, expected)


def opponent(game, abbr="DAL"):
    return game["away_team"] if game["home_team"] == abbr else game["home_team"]


def venue(game, abbr="DAL"):
    if game.get("neutral") is True:
        return "neutral"
    if game.get("neutral") is None:
        return "unknown"
    return "home" if game["home_team"] == abbr else "away"


def selected(selection, club=team):
    games = [g for g in club["games"] if g["status"] == "final"
             and club["abbr"] in (g["home_team"], g["away_team"])
             and g["season"] <= dataset["season"]
             and (selection["season"] != "current" or g["season"] == dataset["season"])
             and str(g.get("seasonType", "REG")) in ("REG", "regular", "regular-season", "2")
             and (selection["venue"] == "all" or venue(g, club["abbr"]) == selection["venue"])]
    games.sort(key=lambda g: (g.get("kickoffUtc") or g.get("gameday") or "", g["season"], g["week"], str(g["id"])), reverse=True)
    return games[:selection["window"]]


def aggregate(values, mode):
    count = sum(known(v) for v in values)
    value = sum(values) / (1 if mode == "total" else len(values)) if values and count == len(values) else None
    return value, count, len(values)


def stats(game, side):
    return game.get("stats", {}).get("DAL" if side == "gained" else opponent(game), {})


def metric_value(games, metric, mode):
    if metric in ("thirdDown", "redZoneTD"):
        made, attempted = ("thirdDownMade", "thirdDownAttempts") if metric == "thirdDown" else ("redZoneTD", "redZoneAttempts")
        pairs = [(stats(g, "gained").get(made), stats(g, "gained").get(attempted)) for g in games]
        pairs = [p for p in pairs if all(known(v) for v in p)]
        denominator = sum(p[1] for p in pairs)
        value = 100 * sum(p[0] for p in pairs) / denominator if denominator and len(pairs) == len(games) else None
        return value, len(pairs), len(games)
    values = []
    for game in games:
        home = game["home_team"] == "DAL"
        if metric == "pointsFor":
            value = game["home_score"] if home else game["away_score"]
        elif metric == "pointsAgainst":
            value = game["away_score"] if home else game["home_score"]
        elif metric == "turnoverMargin":
            own, other = stats(game, "gained").get("turnovers"), stats(game, "allowed").get("turnovers")
            value = other - own if known(own) and known(other) else None
        else:
            value = stats(game, "gained").get(metric)
        values.append(value)
    return aggregate(values, mode)


counts = {key: 0 for key in ("cases", "recordedInputs", "nativeButtonInputs", "nativeTouches", "pointerClicks", "nativeOptionSelections", "separatePlayerOpenCloseInputs", "filterCases", "yardCells", "snapshotCells", "reportCells", "playerHistoryCells", "sourceCitations")}
reports = []
for engine, raw_hash, sizes in [
    ("chromium", "f7223a619e1715481feb582b49d74e21b8ef5f880335a68a6ac67902ca480c46", [(393, 852), (430, 896), (768, 1024), (1440, 1000)]),
    ("webkit", "35b9d9c471f3d0000fac14f1e680a7d6e7d930d107e9926577de19a416c49e39", [(393, 852), (430, 896)]),
]:
    path = f"qa/team-details/local-{engine}-final-v3/results.json"
    report = read(path)
    assert SHA(path) == raw_hash
    assert report["status"] == "passed" and report["completedAt"]
    assert report["unchangedDuringQA"] and report["testLogicUnchangedDuringQA"]
    assert report["source"]["runtimeFiles"] == manifest
    assert all(SHA(path) == value for path, value in report["source"]["testFiles"].items())
    assert [(r["viewport"]["width"], r["viewport"]["height"]) for r in report["results"]] == sizes
    for case in report["results"]:
        assert case["status"] == "passed" and case["phase"] == "scenario-complete" and case["completedAt"]
        assert case["directLoadReload"]
        assert all(not values for values in case["errors"].values())
        assert case["initialGeometry"]["clipped"] == case["finalGeometry"]["clipped"] == []
        controls = case["controls"]
        assert controls["status"] == "passed" and controls["completedAt"]
        assert controls["directLoad"] and controls["refresh"] and controls["tabKeyboard"] and controls["ladderRoundTrip"] and controls["homeEntry"]
        assert len(controls["nativeClicks"]) == 312
        option_count = sum("option" in x for x in controls["nativeClicks"])
        assert option_count == 94
        counts["recordedInputs"] += 312
        counts["nativeOptionSelections"] += option_count
        counts["nativeButtonInputs"] += 312 - option_count
        counts["nativeTouches" if case["mobile"] else "pointerClicks"] += 312 - option_count
        assert len(controls["coverage"]["observed"]) == len(controls["coverage"]["exercised"]) == 83
        assert set(controls["coverage"]["observed"]) == set(controls["coverage"]["exercised"])
        assert controls["coverage"]["untested"] == controls["coverage"]["disabled"] == []
        assert len(controls["schedule"]) == 17 and len(controls["positions"]) == 7 and len(controls["tabs"]) == 3
        assert len(controls["homeSports"]) == 4
        assert len(controls["filterCases"]) == 24
        combinations = {(r["selection"]["window"], r["selection"]["season"], r["selection"]["venue"]) for r in controls["filterCases"]}
        assert combinations == set(product((3, 5, 10), ("cross", "current"), ("all", "home", "away", "neutral")))
        for record in controls["filterCases"]:
            games = selected(record["selection"])
            assert record["gameIds"] == [g["id"] for g in games]
            assert record["geometry"]["clipped"] == []
            for choice in record["geometry"]["selects"]:
                assert choice["selectedTextWidth"] <= choice["availableWidth"] + 0.5
            for mode in ("average", "total"):
                panel = record[mode]
                assert len(panel["items"]) == len(panel["snapshot"]) == 6
                for item in panel["items"]:
                    value, _, _ = aggregate([stats(g, item["side"]).get(item["metric"]) for g in games], mode)
                    same(item["text"], value, 0.001 if mode == "total" else 0.051)
                    counts["yardCells"] += 1
                for item in panel["snapshot"]:
                    value, known_count, eligible = metric_value(games, item["metric"], mode)
                    same(item["text"], value)
                    assert item["coverage"] == f"{known_count}/{eligible}"
                    counts["snapshotCells"] += 1
            counts["filterCases"] += 1
        assert len(controls["gameReports"]) == 20
        source_by_id = {g["id"]: g for g in team["games"]}
        fields = ("netPassing", "rushing", "totalOffense", "thirdDownMade", "thirdDownAttempts", "redZoneTD", "redZoneAttempts", "turnovers", "penaltyYards")
        for result in controls["gameReports"]:
            source = source_by_id[result["id"]]
            assert str(source["season"]) in result["content"] and f"Week {source['week']}" in result["content"]
            assert len(result["metrics"]) == 9
            for row, field in zip(result["metrics"], fields):
                for column, side in ((1, "gained"), (2, "allowed")):
                    same(row[column], stats(source, side).get(field), 0.001)
                    counts["reportCells"] += 1
        assert len(controls["playerDisclosures"]) == len(team["roster"]) == 83
        for disclosure, source in zip(controls["playerDisclosures"], team["roster"]):
            assert disclosure["name"] == source["name"]
            assert len(disclosure["historyRows"]) == len(source.get("last5", []))
            for row, game in zip(disclosure["historyRows"], source.get("last5", [])):
                assert str(game["season"]) in row[0] and str(game["week"]) in row[0] and game["opponent"] in row[0]
                for column, metric in ((1, "passingYards"), (2, "rushingYards"), (3, "receivingYards"), (4, "totalTD")):
                    same(row[column], game.get("stats", {}).get(metric), 0.001)
                    counts["playerHistoryCells"] += 1
        counts["separatePlayerOpenCloseInputs"] += 166
        refresh = controls["manualRefresh"]
        assert refresh["status"] == 200 and refresh["focusPreserved"]
        assert len(refresh["domIdentity"]["nodes"]) == 7 and all(node["exists"] and node["same"] and node["connected"] for node in refresh["domIdentity"]["nodes"])
        assert refresh["domIdentity"]["events"] == [{"changed": False}]
        if case["mobile"]:
            assert case["motion"]["visibleAdvancingClocks"] > 0 and case["motion"]["paint"]["actualNaturalPixelChange"]
            assert case["motion"]["paint"]["sha256"] != case["motion"]["paint"]["laterSha256"]
        if "allTeamRoutes" in case:
            routes = case["allTeamRoutes"]
            assert routes["status"] == "passed" and len(routes["results"]) == 32
            assert set(r["team"] for r in routes["results"]) == set(dataset["teams"])
            for route in routes["results"]:
                assert route["route"] == "#team/" + route["team"]
                assert route["sourceLinks"] == [source["url"] for source in dataset["sources"]]
                assert not route["geometry"]["clipped"]
        counts["cases"] += 1
    reports.append({"file": path, "sha256": raw_hash, "status": "passed", "completedAt": report["completedAt"], "scenarios": len(sizes)})

sources_path = "qa/team-details/reviews/sources/source-ui-refresh-final-audit.json"
sources = read(sources_path)
assert sources["status"] == "passed" and sources["unchangedDuringAudit"] and sources["source"]["runtimeFiles"] == manifest
for case in sources["results"]:
    assert case["status"] == "passed" and all(not values for values in case["errors"].values())
    citations = case["sourcePanel"]["citations"]
    assert len(citations) == len(dataset["sources"]) == 31 and case["sourcePanel"]["disputes"] == len(dataset["disagreements"]) == 4
    assert [c["href"] for c in citations] == [s["url"] for s in dataset["sources"]]
    assert all(c["href"].startswith("https://") and c["target"] == "_blank" and {"noopener", "noreferrer"}.issubset(set(c["rel"].split())) for c in citations)
    assert case["historicalReport"]["season"] == 2025 and case["historicalReport"]["week"] == 18
    counts["sourceCitations"] += len(citations)

bridge_path = "qa/team-details/reviews/control-evidence/independent-32-final-fe69378e/results.json"
bridge = read(bridge_path)
assert bridge["status"] == "passed" and bridge["unchangedDuringRun"] and len(bridge["routes"]) == 32
assert bridge["steelersBridge"]["status"] == "passed" and bridge["steelersBridge"]["historyStatus"] == "ready"

output = ROOT / "qa/team-details/reviews/control-evidence/native-v3-independent-verification-v2.json"
assert not output.exists(), "Immutable evidence must not be overwritten"
output.write_text(json.dumps({"status": "passed-evidence-review", "agent": "team_controls_audit", "auditedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "method": "Read-only independent Python recomputation from actual frozen source JSON; recorded browser expected fields were not trusted.", "reports": reports, "runtimeManifest": {"file": manifest_path, "sha256": SHA(manifest_path), "files": len(manifest)}, "datasetSha256": SHA("assets/data/team-details.json"), "sourceUIReceipt": {"file": sources_path, "sha256": SHA(sources_path)}, "independentRoutesReceipt": {"file": bridge_path, "sha256": SHA(bridge_path)}, "counts": counts, "qualifiedCounts": "312 recorded interactions per scenario =218 native touches plus94 native option selections.83 disclosures add166 separately observed open/close inputs per scenario. Desktop inputs are pointer clicks.", "protectedNativeGate": "Pending completed protected regression report; no deployment or protected-page acceptance is claimed by this read-only evidence review."}, indent=2) + "\n")
print(json.dumps({"file": str(output.relative_to(ROOT)), "sha256": hashlib.sha256(output.read_bytes()).hexdigest(), "counts": counts}))
