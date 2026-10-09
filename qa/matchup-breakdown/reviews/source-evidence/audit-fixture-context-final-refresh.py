#!/usr/bin/env python3
"""Independent response/context checks for event reports; no app imports."""
import argparse
import collections
import csv
import datetime as dt
import gzip
import hashlib
import io
import json
from pathlib import Path


def sha(body):
    return hashlib.sha256(body).hexdigest()


def club_code(value):
    return {"LAR": "LA", "WSH": "WAS", "JAC": "JAX", "OAK": "LV", "SD": "LAC", "STL": "LA"}.get(value, value)


def audit(root, output, manifest_path=None):
    root = Path(root)
    paths = [root / "assets/data" / name for name in
             ("current.json", "provenance.json", "player-history.json", "team-details.json", "matchup-breakdown.json")]
    hashes = {p.name: sha(p.read_bytes()) for p in paths}
    current, _, history, details, book = [json.loads(p.read_bytes()) for p in paths]
    manifest_path = Path(manifest_path) if manifest_path else root / "qa/matchup-breakdown/data/source-manifest.json"
    manifest = json.loads(manifest_path.read_bytes())
    archives = {s["id"]: s for s in manifest["sources"] if s.get("bodyPath")}
    sources = {s["id"]: s for s in book["sources"]}
    checks = collections.Counter()
    failures = []

    def check(condition, kind, **context):
        checks[kind] += 1
        if not condition:
            failures.append({"kind": kind, **context})

    def body(sid):
        s = archives[sid]
        saved = (root / s["bodyPath"]).read_bytes()
        check(sha(saved) == s["archiveSha256"], "actualArchiveHash", sourceId=sid)
        raw = saved if s["archiveEncoding"] == "original-gzip" else gzip.decompress(saved)
        check(sha(raw) == s["sha256"] == sources[sid]["sha256"], "actualResponseHash", sourceId=sid)
        check(s["httpStatus"] == 200 and s["status"] == "verified" and bool(s["retrievedAt"]),
              "legitimateResponseTime", sourceId=sid)
        return raw

    identities = {}
    for r in csv.DictReader(io.StringIO(body("nflverse_player_ids").decode("utf-8-sig"))):
        if r.get("espn_id") and r.get("gsis_id"):
            identities[str(r["espn_id"])] = r["gsis_id"]
    for r in csv.DictReader(io.StringIO(body("nflverse_roster").decode("utf-8-sig"))):
        if r.get("season") == str(book["season"]) and r.get("espn_id") and r.get("gsis_id"):
            identities[str(r["espn_id"])] = r["gsis_id"]

    check(manifest["snapshotSha256"] == hashes["matchup-breakdown.json"], "exactSnapshotBinding")
    observed_live = []
    future_bulletins = []
    games = {g["id"]: g for t in details["teams"].values() for g in t["games"]}
    for team, club in book["teams"].items():
        for gid, report in club.get("fixtureReports", {}).items():
            event = str(report["eventId"])
            sid = "espn_fixture_summary_" + event
            check(sid in archives and report["sourceIds"] == [sid], "eventResponseProvenance", team=team, gameId=gid)
            if sid not in archives:
                continue
            raw = json.loads(body(sid))
            header = raw["header"]
            competition = header["competitions"][0]
            status = competition["status"]["type"]
            g = games[gid]
            clubs = {club_code(x["team"]["abbreviation"]) for x in competition["competitors"]}
            check(str(header["id"]) == str(competition["id"]) == event
                  and header["season"]["year"] == g["season"] == report["season"]
                  and header["season"]["type"] == 2 and header["week"] == g["week"] == report["week"]
                  and clubs == {g["home_team"], g["away_team"]},
                  "actualEventSeasonWeekTeams", team=team, gameId=gid)
            for field in ("name", "state", "completed", "description", "detail", "shortDetail"):
                check(report["eventStatus"].get(field) == status.get(field),
                      "actualSourceGameState", team=team, gameId=gid, field=field)
            check(report["retrievedAt"] == archives[sid]["retrievedAt"]
                  and report["publishedAt"] == raw.get("meta", {}).get("lastUpdatedAt"),
                  "distinctRetrievalPublication", team=team, gameId=gid)
            availability = report["availability"]
            check(availability["completeOfficialList"] is False
                  and availability["confirmation"] == "provider-reported",
                  "noCompleteOfficialListClaim", team=team, gameId=gid)
            injury_rows = [x for group in raw.get("injuries", [])
                           if club_code(group["team"]["abbreviation"]) == team for x in group.get("injuries", [])]
            raw_people = {str(x["athlete"]["id"]): x for x in injury_rows}
            future = header["week"] > current["currentWeek"] and status["state"] == "pre"
            people = availability.get("currentTeamBulletin", []) if future else availability["players"]
            check(len(people) == len(raw_people) and {str(p["espnId"]) for p in people} == set(raw_people),
                  "allPublishedPlayerReportsPreserved", team=team, gameId=gid)
            if future:
                future_bulletins.append({"team": team, "gameId": gid, "count": len(people), "sourceId": sid})
                check(availability["players"] == [] and availability["context"] == "current-team-bulletin",
                      "futureReportNotEventAvailability", team=team, gameId=gid)
                qb = report["qbEvidence"]
                check(qb["playerId"] is None and qb["confirmed"] is False and qb["projected"] is False
                      and qb["status"] in ("unavailable", "disputed"),
                      "futureBulletinCannotProjectQB", team=team, gameId=gid)
            for person in people:
                item = raw_people[str(person["espnId"])]
                athlete = item["athlete"]
                fantasy = item.get("details", {}).get("fantasyStatus", {})
                explicit_inactive = "INACTIVE" in {str(fantasy.get(k, "")).upper() for k in ("description", "abbreviation")}
                check(person["playerId"] == identities.get(str(athlete["id"])),
                      "exactProviderIdentity", team=team, gameId=gid, espnId=person["espnId"])
                check(person["name"] == (athlete.get("displayName") or athlete.get("fullName"))
                      and person["position"] == athlete.get("position", {}).get("abbreviation")
                      and person["reportStatus"] == (item.get("status") or None)
                      and person["injury"] == item.get("details", {}).get("type")
                      and person["sourceTimestamp"] == item.get("date"),
                      "actualReportValuesPublication", team=team, gameId=gid, espnId=person["espnId"])
                check(person["officialConfirmed"] is False and person["practiceStatus"] is None
                      and person["retrievedAt"] == archives[sid]["retrievedAt"] and person["sourceIds"] == [sid],
                      "reportNotPracticeOrOfficialConfirmation", team=team, gameId=gid, espnId=person["espnId"])
                if future:
                    check(person["reportedInactive"] is None and person["gameId"] is None
                          and person["eventId"] is None and person["week"] is None
                          and person["requestedGameId"] == gid and str(person["requestedEventId"]) == event,
                          "futureBulletinContextUnknown", team=team, gameId=gid, espnId=person["espnId"])
                    associated_week = person.get("reportWeek")
                    if associated_week is not None:
                        associated_sources = person.get("contextSourceIds", [])
                        associated_event = str(person.get("contextEventId"))
                        associated_sid = "espn_fixture_summary_" + associated_event
                        check(associated_sources == [associated_sid] and associated_sid in archives,
                              "BulletinAssociationHasOriginalResponse", team=team, gameId=gid, espnId=person["espnId"])
                        if associated_sid in archives:
                            original = json.loads(body(associated_sid))
                            original_header = original["header"]
                            original_game = games.get(person.get("contextGameId"), {})
                            original_people = [x for group in original.get("injuries", [])
                                               if club_code(group["team"]["abbreviation"]) == team
                                               for x in group.get("injuries", []) if str(x["athlete"]["id"]) == str(person["espnId"])]
                            check(associated_week == original_header["week"] == original_game.get("week")
                                  and associated_week <= current["currentWeek"] and associated_week < report["week"]
                                  and str(original_header["id"]) == associated_event == str(original_game.get("espnEventId"))
                                  and len(original_people) == 1,
                                  "BulletinAssociationIsSeparateCurrentContext", team=team, gameId=gid, espnId=person["espnId"])
                            if len(original_people) == 1:
                                prior = original_people[0]
                                check(prior.get("date") == item.get("date")
                                      and prior.get("status") == item.get("status")
                                      and prior.get("details", {}).get("type") == item.get("details", {}).get("type")
                                      and prior["athlete"].get("displayName") == athlete.get("displayName"),
                                      "BulletinAssociationExactDatedReportMatch", team=team, gameId=gid, espnId=person["espnId"])
                else:
                    check(person["reportedInactive"] == (True if explicit_inactive else None)
                          and person["gameId"] == gid and str(person["eventId"]) == event
                          and person["season"] == g["season"] and person["week"] == g["week"],
                          "exactEventInactiveAttribution", team=team, gameId=gid, espnId=person["espnId"])
            qb = report["qbEvidence"]
            check(qb["confirmed"] is False, "NoAttemptsToStarterConfirmation", team=team, gameId=gid)
            if qb.get("playerId"):
                blocked = {p.get("playerId") for p in availability["players"]
                           if p.get("reportedInactive") is True or str(p.get("reportStatus") or "").lower() in ("out", "inactive", "injured reserve")}
                blocked.update(p.get("playerId") for p in club["injuries"]["players"]
                               if p.get("week") == report["week"] and str(p.get("reportStatus") or "").lower() in ("out", "inactive", "injured reserve"))
                check(qb["playerId"] not in blocked and qb["status"] == "inferred",
                      "NoKnownOutOrInactiveProjectedQB", team=team, gameId=gid)
            if status["state"] == "in" and status["completed"] is False:
                observed_live.append({"team": team, "gameId": gid, "eventId": event, "sourceId": sid})
                selected = club.get("researchGameId") or club["upcomingGameId"]
                check(selected == gid and club["defaultResearchFixtureEvidence"]["gameId"] == gid
                      and sid in club["defaultResearchFixtureEvidence"]["sourceIds"],
                      "ActualLiveGameRetainedAsResearchFixture", team=team, gameId=gid)
                check(club.get("nextScheduledGameId") == details["teams"][team]["upcomingGameId"],
                      "NextScheduledGameSeparatelyRetained", team=team, gameId=gid)
                check(g["status"] != "final" and all(h["id"] != gid for h in club["headToHeadGames"])
                      and all(e["gameId"] != gid for p in club["players"].values() for e in p["gameLog"]),
                      "NoPartialLiveBoxscoreInCompletedHistory", team=team, gameId=gid)
                scores = {x["homeAway"]: float(x["score"]) for x in competition["competitors"] if x.get("score") is not None}
                ls = report.get("liveScore")
                check(ls is not None and ls["isFinal"] is False and ls["home"] == scores.get("home")
                      and ls["away"] == scores.get("away") and ls["sourceIds"] == [sid],
                      "AttributedPartialScoreNeverFinal", team=team, gameId=gid)
    for p in paths:
        check(sha(p.read_bytes()) == hashes[p.name], "FiveSnapshotsUnchangedDuringAudit", file=p.name)
    result = {"status": "passed" if not failures else "failed", "completedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
              "snapshotSha256": hashes["matchup-breakdown.json"], "fiveSnapshotHashes": hashes,
              "sourceManifestSha256": sha(manifest_path.read_bytes()), "auditHelperSha256": sha(Path(__file__).read_bytes()),
              "method": "Independently compare original public response hashes and fields, exact ESPN/GSIS identity tables, event/season/week and publication context. Current live event stays separate from next scheduled game and all completed statistical/start windows. Future endpoint reuse is a dated bulletin, with game-day availability and QB projection unavailable. No production imports.",
              "observedLiveReports": observed_live, "futureBulletins": future_bulletins,
              "assertions": sum(checks.values()), "checks": dict(checks), "failures": failures}
    output = Path(output)
    assert not output.exists()
    output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k not in ("checks", "failures", "futureBulletins")}, indent=2))
    print("firstFailures", json.dumps(failures[:10]))
    return not failures


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--manifest", required=False)
    args = parser.parse_args()
    raise SystemExit(0 if audit(args.root, args.output, args.manifest) else 1)
