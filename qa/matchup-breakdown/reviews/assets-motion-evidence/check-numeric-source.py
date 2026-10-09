"""Independent basic-stat spot audit against separately fetched source CSVs.
This verifies known cells, not advanced tracking or absent appearances."""
import csv
import argparse
import hashlib
import json
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
EVIDENCE = ROOT / "qa/matchup-breakdown/reviews/assets-motion-evidence"
SOURCES = ROOT / "qa/matchup-breakdown/reviews/source-evidence"
body = (ROOT / "assets/data/matchup-breakdown.json").read_bytes()
data = json.loads(body)
mapping = {
    "completions": "completions", "attempts": "attempts",
    "passingYards": "passing_yards", "passingTD": "passing_tds",
    "interceptions": "passing_interceptions", "sacks": "sacks_suffered",
    "sackYardsLost": "sack_yards_lost", "carries": "carries",
    "rushingYards": "rushing_yards", "rushingTD": "rushing_tds",
    "receptions": "receptions", "targets": "targets",
    "receivingYards": "receiving_yards", "receivingTD": "receiving_tds",
}
source_rows = {}
source_proof = []
for season in (2025, 2026):
    source = SOURCES / f"nflverse-stats-{season}.csv"
    receipt = json.loads(source.with_suffix(".receipt.json").read_text())
    actual_sha = hashlib.sha256(source.read_bytes()).hexdigest()
    assert receipt["sha256"] == actual_sha
    assert receipt["httpStatus"] == 200 and receipt["tlsVerified"] is True
    source_proof.append({"file": str(source.relative_to(ROOT)), "sha256": actual_sha, "retrievedAt": receipt["retrievedAt"], "verifiedHTTP": 200})
    with source.open(newline="") as stream:
        for row in csv.DictReader(stream):
            if row["season_type"] == "REG":
                source_rows[(row["player_id"], row["team"], row["game_id"])] = row

checks = 0
games = {}
players = set()
for team in ("DAL", "TB"):
    all_games = data["teams"][team]["games"]
    chosen = sorted((g for g in all_games if g["status"] == "final" and g.get("seasonType", "REG") in ("REG", "2")), key=lambda g: (g.get("kickoffUtc") or g.get("gameday") or "", g["season"], g["week"]), reverse=True)[:5]
    game_ids = {g["id"] for g in chosen}
    games[team] = [g["id"] for g in chosen]
    for player in data["teams"][team]["players"].values():
        for row in player["gameLog"]:
            if row["gameId"] not in game_ids or row["team"] != team:
                continue
            original = source_rows.get((player["id"], team, row["gameId"]))
            assert original, f"No independently fetched source row: {team}/{player['id']}/{row['gameId']}"
            for key, source_key in mapping.items():
                value = row["stats"].get(key)
                if value is None:
                    continue
                assert original[source_key] != "", f"Absent source cell became populated: {key}"
                # Provider uses a negative net-yard delta for sacks; the
                # explicit sackYardsLost property is a positive loss magnitude.
                # Other fields, including real negative rushing gains, retain
                # the exact provider sign rather than a generic absolute value.
                expected = Decimal(original[source_key])
                if key == "sackYardsLost":
                    expected = abs(expected)
                assert Decimal(str(value)) == expected, f"Different stat: {team}/{player['name']}/{row['gameId']}/{key}"
                checks += 1
            players.add((team, player["id"]))

report = {
    "status": "passed", "datasetSha256": hashlib.sha256(body).hexdigest(),
    "sourceBodies": source_proof, "clubs": ["DAL", "TB"],
    "window": "Last five final regular-season team games, cross-season",
    "actualGameIds": games, "checkedBasicNumericCells": checks,
    "playersWithKnownCheckedStatistics": len(players),
    "semanticNormalization": "Only sackYardsLost: absolute magnitude of provider negative sack_yards_lost delta. Every other count/yard field retains exact source sign.",
    "qualification": "Known basic passing/rushing/receiving cells independently matched separately fetched unmodified CSV bodies and strict-TLS HTTP receipts. This spot check does not establish advanced tracking, starts, inactives, absent appearances, all filters or external source freshness beyond the recorded retrieval times.",
}
parser = argparse.ArgumentParser()
parser.add_argument("--output", required=True)
destination = Path(parser.parse_args().output).resolve()
assert not destination.exists(), "Preserve prior independent numeric source receipts"
destination.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"status": "passed", "numericCells": checks, "players": len(players), "output": str(destination.relative_to(ROOT))}))
