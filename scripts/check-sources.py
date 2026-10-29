#!/usr/bin/env python3
"""Re-check every verified quote in data/quotes.yaml whose checkedAt points into the ashtadhyayi.com
dataset: the Devanagari (each part between "…") must occur in that file, ignoring spacing and punctuation.

    python3 scripts/check-sources.py [path-to-ashtadhyayi-com-data]
"""
import os, re, sys, unicodedata
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("ASHTADHYAYI_DATA", ROOT.parent / "ashtadhyayi-com" / "data"))
PREFIX = "https://github.com/ashtadhyayi-com/data/blob/master/"


def norm(s: str) -> str:
    """Devanagari letters and signs only: drops spacing, punctuation, digits, avagraha and markup."""
    s = unicodedata.normalize("NFC", s)
    return "".join(c for c in s if ("\u0900" <= c <= "\u0963" or "\u0971" <= c <= "\u097F") and c != "\u093D")


def main() -> int:
    bad = checked = 0
    cache: dict[str, str] = {}
    for q in yaml.safe_load((ROOT / "data" / "quotes.yaml").read_text("utf8")):
        url = q.get("checkedAt", "")
        if not url.startswith(PREFIX) or not q.get("verified"):
            continue
        rel = url[len(PREFIX):]
        if rel not in cache:
            cache[rel] = norm((SRC / rel).read_text("utf8"))
        for part in q["deva"].split("…"):
            if norm(part) and norm(part) not in cache[rel]:
                print(f"✗ {q['id']}: not found in {rel}: {part.strip()[:80]}")
                bad += 1
        checked += 1
    print(f"{checked} quotes checked, {bad} problem(s)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
