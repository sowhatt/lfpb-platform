
from pathlib import Path
from collections import Counter
from datetime import datetime
import json
import re

ROOT = Path("docs/calendriers/ocr")
OUT = Path("docs/calendriers/structured")
OUT.mkdir(parents=True, exist_ok=True)

LINE_RE = re.compile(
    r"conf=(?P<conf>[\d.]+)\s+"
    r"x=(?P<x>[\d.]+)\s+"
    r"y=(?P<y>[\d.]+)\s+"
    r"w=(?P<w>[\d.]+)\s+"
    r"h=(?P<h>[\d.]+)\s+\|\s+(?P<text>.*)$"
)

CLUBS = {
    "ligue1": [
        "AS COTONOU FC",
        "ASPAC FC",
        "ASVO FC",
        "AYEMA FC",
        "BANI GANSE FC",
        "BUFFLES FC",
        "CAVALIERS FC",
        "COTON FC",
        "DAMISSA FC",
        "DJEFFA FC",
        "DRAGONS FC",
        "DYNAMO FC AB",
        "ESPOIR FC",
        "HODIO FC",
        "LOTO POPO FC",
        "PANTHERES FC",
        "SOBEMAP FC",
        "USS KRAKE FC",
    ],
    "ligue2": [
        "ABEILLES FC",
        "ADJIDJA FC",
        "AS ELITE FC",
        "AS ETALONS FC",
        "AS POLICE FC",
        "AVRANKOU OMN FC",
        "AZIZA FC",
        "BEKE FC",
        "BOA FC",
        "DADJE FC",
        "ENERGIE FC",
        "JAK FC",
        "JSP FC",
        "OKUTA FC",
        "REAL SPORT FC",
        "REQUINS FC",
        "SITATUNGA FC",
        "TAKUNNIN FC",
    ],
}

CLUB_ALIASES = {
    "AS COTONOU": "AS COTONOU FC",
    "BANI GANSE": "BANI GANSE FC",
    "BUFFLES FC #": "BUFFLES FC",
    "DYNAMO FC": "DYNAMO FC AB",
    "AVRANKOU OMN": "AVRANKOU OMN FC",
}

VENUE_ALIASES = {
    "QUIDAH": "OUIDAH",
    "QUESSE": "OUESSE",
}

def clean(s):
    return re.sub(r"\s+", " ", s.strip())

def read_items(folder):
    pages = []

    for path in sorted(folder.glob("page-*.txt")):
        page_no = int(re.search(r"(\d+)", path.stem).group(1))
        items = []

        for raw in path.read_text(encoding="utf-8").splitlines():
            m = LINE_RE.match(raw.strip())

            if not m:
                continue

            d = m.groupdict()

            items.append({
                "page": page_no,
                "conf": float(d["conf"]),
                "x": float(d["x"]),
                "y": float(d["y"]),
                "w": float(d["w"]),
                "h": float(d["h"]),
                "text": clean(d["text"]),
            })

        pages.append((page_no, items))

    return pages

def normalize_match_number(text):
    t = clean(text).upper()
    t = t.strip(" .,:;|-_")
    t = t.replace(" ", "")

    m = re.match(r"^CL([0-9O]{3})$", t)

    if not m:
        return None

    digits = m.group(1).replace("O", "0")

    if not digits.isdigit():
        return None

    n = int(digits)

    if n < 1 or n > 306:
        return None

    return f"CL{n:03d}"

def normalize_date(text):
    t = clean(text).upper()
    t = t.replace(" ", "")
    t = t.replace("O", "0")

    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", t)

    if not m:
        return None

    day = int(m.group(1))
    month = int(m.group(2))
    year = int(m.group(3))

    try:
        datetime(year, month, day)
    except ValueError:
        return None

    return f"{day:02d}/{month:02d}/{year:04d}"

def normalize_time(text):
    t = clean(text).upper()
    t = t.replace(" ", "")
    t = t.replace("O", "0")

    m = re.search(r"(\d{1,2})H(?:(\d{2}))?", t)

    if not m:
        return None

    hour = int(m.group(1))
    minute = int(m.group(2) or "00")

    if hour > 23 or minute > 59:
        return None

    if minute == 0:
        return f"{hour:02d}H"

    return f"{hour:02d}H{minute:02d}"

def canonical_club(text, league):
    if not text:
        return None

    original = clean(text)
    normalized = original.upper().strip(" |-_")

    if normalized in CLUB_ALIASES:
        return CLUB_ALIASES[normalized]

    for club in CLUBS[league]:
        if normalized == club:
            return club

    candidates = sorted(
        CLUBS[league],
        key=len,
        reverse=True,
    )

    for club in candidates:
        if club in normalized:
            return club

    if normalized.endswith(" #"):
        normalized = normalized[:-2].strip()

    if normalized in CLUB_ALIASES:
        return CLUB_ALIASES[normalized]

    return normalized or None

def canonical_venue(text):
    if not text:
        return None

    v = clean(text).upper().strip(" |-_")

    return VENUE_ALIASES.get(v, v)

def nearest(items, y, predicate, max_delta=0.032):
    candidates = [
        item
        for item in items
        if predicate(item)
        and abs(item["y"] - y) <= max_delta
    ]

    if not candidates:
        return None

    return min(
        candidates,
        key=lambda item: (
            abs(item["y"] - y),
            -item["conf"],
        ),
    )

def identify_fixture(text, league):
    if not text:
        return None, None

    source = clean(text)
    normalized = source.upper()

    if "#" in normalized:
        left, right = normalized.split("#", 1)

        home = canonical_club(left, league)
        away = canonical_club(right, league)

        if home in CLUBS[league] and away in CLUBS[league]:
            return home, away

    found = []

    aliases = {
        club: club
        for club in CLUBS[league]
    }

    aliases.update(CLUB_ALIASES)

    for alias, canonical in sorted(
        aliases.items(),
        key=lambda x: len(x[0]),
        reverse=True,
    ):
        pos = normalized.find(alias)

        if pos >= 0 and canonical in CLUBS[league]:
            found.append((pos, canonical))

    unique = []

    for pos, club in sorted(found):
        if club not in [x[1] for x in unique]:
            unique.append((pos, club))

    if len(unique) >= 2:
        return unique[0][1], unique[1][1]

    return None, None

def parse_league(folder, league):
    pages = read_items(folder)
    rows = []

    for page_no, items in pages:
        for item in items:
            match_number = normalize_match_number(item["text"])

            if not match_number:
                continue

            y = item["y"]

            date_item = nearest(
                items,
                y,
                lambda i:
                    0.13 <= i["x"] <= 0.33
                    and normalize_date(i["text"]) is not None,
            )

            fixture_item = nearest(
                items,
                y,
                lambda i:
                    0.27 <= i["x"] <= 0.67
                    and (
                        "#" in i["text"]
                        or " FC" in i["text"].upper()
                    ),
                0.035,
            )

            time_item = nearest(
                items,
                y,
                lambda i:
                    0.62 <= i["x"] <= 0.75
                    and normalize_time(i["text"]) is not None,
            )

            venue_item = nearest(
                items,
                y,
                lambda i:
                    0.72 <= i["x"] <= 0.91
                    and len(clean(i["text"])) >= 3
                    and normalize_time(i["text"]) is None
                    and normalize_date(i["text"]) is None
                    and "#" not in i["text"]
                    and not re.match(
                        r"^PAGE\s+\d+\s+SUR\s+\d+$",
                        clean(i["text"]).upper(),
                    ),
                0.035,
            )

            source_fixture = fixture_item["text"] if fixture_item else ""

            home, away = identify_fixture(
                source_fixture,
                league,
            )

            numeric = int(match_number[2:])

            rows.append({
                "roundNumber": ((numeric - 1) // 9) + 1,
                "matchNumber": match_number,
                "date": (
                    normalize_date(date_item["text"])
                    if date_item
                    else ""
                ),
                "time": (
                    normalize_time(time_item["text"])
                    if time_item
                    else ""
                ),
                "homeClub": home or "",
                "awayClub": away or "",
                "venue": (
                    canonical_venue(venue_item["text"])
                    if venue_item
                    else ""
                ),
                "source": {
                    "page": page_no,
                    "matchNumber": item["text"],
                    "date": date_item["text"] if date_item else "",
                    "fixture": source_fixture,
                    "time": time_item["text"] if time_item else "",
                    "venue": venue_item["text"] if venue_item else "",
                },
            })

    unique = {}

    for row in rows:
        unique[row["matchNumber"]] = row

    rows = sorted(
        unique.values(),
        key=lambda r: int(r["matchNumber"][2:]),
    )

    issues = []

    expected = {
        f"CL{i:03d}"
        for i in range(1, 307)
    }

    actual = {
        row["matchNumber"]
        for row in rows
    }

    missing_numbers = sorted(expected - actual)

    if missing_numbers:
        issues.append(
            "Numéros manquants : "
            + ", ".join(missing_numbers)
        )

    round_counts = Counter(
        row["roundNumber"]
        for row in rows
    )

    bad_rounds = {
        rnd: count
        for rnd, count in sorted(round_counts.items())
        if count != 9
    }

    if bad_rounds:
        issues.append(
            f"Journées différentes de 9 matchs : {bad_rounds}"
        )

    missing_fields = []

    for row in rows:
        for field in (
            "date",
            "time",
            "homeClub",
            "awayClub",
            "venue",
        ):
            if not row[field]:
                missing_fields.append(
                    f"{row['matchNumber']}:{field}"
                )

    if missing_fields:
        issues.append(
            "Champs manquants : "
            + ", ".join(missing_fields)
        )

    clubs = sorted({
        club
        for row in rows
        for club in (
            row["homeClub"],
            row["awayClub"],
        )
        if club
    })

    venues = sorted({
        row["venue"]
        for row in rows
        if row["venue"]
    })

    if len(clubs) != 18:
        issues.append(
            f"Nombre de clubs distincts = {len(clubs)} au lieu de 18"
        )

    club_matches = Counter()
    home_counts = Counter()
    away_counts = Counter()

    for row in rows:
        if row["homeClub"]:
            club_matches[row["homeClub"]] += 1
            home_counts[row["homeClub"]] += 1

        if row["awayClub"]:
            club_matches[row["awayClub"]] += 1
            away_counts[row["awayClub"]] += 1

    for club in CLUBS[league]:
        if club_matches[club] != 34:
            issues.append(
                f"{club}: {club_matches[club]} matchs"
            )

        if home_counts[club] != 17:
            issues.append(
                f"{club}: {home_counts[club]} domicile"
            )

        if away_counts[club] != 17:
            issues.append(
                f"{club}: {away_counts[club]} extérieur"
            )

    out_of_season = []

    for row in rows:
        if not row["date"]:
            continue

        dt = datetime.strptime(
            row["date"],
            "%d/%m/%Y",
        )

        if not (
            datetime(2026, 9, 1)
            <= dt
            <= datetime(2027, 7, 31)
        ):
            out_of_season.append({
                "matchNumber": row["matchNumber"],
                "date": row["date"],
                "homeClub": row["homeClub"],
                "awayClub": row["awayClub"],
                "venue": row["venue"],
                "source": row["source"],
            })

    if out_of_season:
        issues.append(
            f"{len(out_of_season)} date(s) hors saison"
        )

    return {
        "competition": (
            "Ligue 1"
            if league == "ligue1"
            else "Ligue 2"
        ),
        "season": "2026-2027",
        "clubs": clubs,
        "venues": venues,
        "rows": rows,
        "validation": {
            "matchCount": len(rows),
            "clubCount": len(clubs),
            "venueCount": len(venues),
            "missingNumbers": missing_numbers,
            "missingFields": missing_fields,
            "outOfSeason": out_of_season,
            "issues": issues,
        },
    }

for league in ("ligue1", "ligue2"):
    result = parse_league(
        ROOT / league,
        league,
    )

    output = OUT / f"{league}-2026-2027.json"

    output.write_text(
        json.dumps(
            result,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print()
    print("=" * 70)
    print(result["competition"])
    print("=" * 70)

    v = result["validation"]

    print("Matchs :", v["matchCount"])
    print("Clubs  :", v["clubCount"])
    print("Stades :", v["venueCount"])

    print()
    print("Numéros manquants :")
    print(v["missingNumbers"] or "aucun")

    print()
    print("Champs manquants :")
    print(v["missingFields"] or "aucun")

    print()
    print("Dates hors saison :")

    if v["outOfSeason"]:
        for row in v["outOfSeason"]:
            print(
                row["matchNumber"],
                "|",
                row["date"],
                "|",
                row["homeClub"],
                "-",
                row["awayClub"],
                "|",
                row["venue"],
            )
    else:
        print("aucune")

    print()
    print("Clubs :")

    for club in result["clubs"]:
        print(" -", club)

    print()
    print("Anomalies restantes :")

    if v["issues"]:
        for issue in v["issues"]:
            print(" -", issue)
    else:
        print("aucune")
