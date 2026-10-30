#!/usr/bin/env python3
"""Check data/sutras/*.yaml against the ashtadhyayi.com dataset (github.com/ashtadhyayi-com/data).

Usage: python3 scripts/check-sutras.py [path-to-ashtadhyayi-com-data]
       (default: $ASHTADHYAYI_DATA or ../ashtadhyayi-com/data)

Checks, per sūtra:
  * deva text equals the dataset's sūtra text (ignoring spaces, avagraha and ZWJ/ZWNJ)
  * lsk equals the dataset's LSK number (lskn); lsk: null ⇔ lskn 0
  * when vrttiVerified, vrtti equals the dataset's Laghusiddhāntakaumudī vṛtti (ignoring punctuation)
Prints a report and exits 1 on any mismatch.
"""
import json, os, re, sys, unicodedata
from pathlib import Path

import importlib.util

import yaml

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("ASHTADHYAYI_DATA", ROOT.parent / "ashtadhyayi-com" / "data"))

_spec = importlib.util.spec_from_file_location("imp", Path(__file__).with_name("import-sutras.py"))
_imp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_imp)
clean_vrtti = _imp.clean_vrtti
clean_marks = _imp.clean_marks


def norm(s: str) -> str:
    s = unicodedata.normalize("NFC", s or "")
    s = re.sub(r"[\s‌‍ऽ।॥;,.\-–—:!?()<>'\"‘’“”०-९0-9३]", "", s)
    return s

def load():
    data = json.loads((SRC / "sutraani" / "data.txt").read_text("utf8"))["data"]
    lsk = json.loads((SRC / "sutraani" / "laghukaumudi.txt").read_text("utf8"))
    by = {f"{x['a']}.{x['p']}.{x['n']}": x for x in data}
    return by, lsk

def main() -> int:
    by, lskv = load()
    bad = 0
    for f in sorted((ROOT / "data" / "sutras").glob("*.yaml")):
        for row in yaml.safe_load(f.read_text("utf8")):
            sid = str(row["id"])
            ref = by.get(sid)
            if not ref:
                print(f"✗ {f.name} {sid}: not in dataset"); bad += 1; continue
            if norm(row["deva"]) != norm(clean_marks(ref["s"])):
                print(f"✗ {f.name} {sid}: deva {row['deva']!r} ≠ {ref['s']!r}"); bad += 1
            pc = [p.split("$")[0].strip() for p in ref["pc"].split("##") if p.split("$")[0].strip()]
            if [norm(p) for p in row.get("pada", [])] != [norm(clean_marks(p)) for p in pc]:
                print(f"✗ {f.name} {sid}: pada {row.get('pada')} ≠ {pc}"); bad += 1
            sk = int(ref.get("skn") or 0) or None
            if row.get("sk") != sk:
                print(f"✗ {f.name} {sid}: sk {row.get('sk')} ≠ dataset {sk}"); bad += 1
            n = int(ref["lskn"] or 0)
            want = n if n > 0 else None
            if row["lsk"] != want:
                print(f"✗ {f.name} {sid}: lsk {row['lsk']} ≠ dataset {want}"); bad += 1
            elif want is not None and not row.get("lskVerified"):
                print(f"• {f.name} {sid}: lsk {want} matches; set lskVerified: true")
            if row.get("vrttiVerified"):
                v = clean_vrtti(lskv.get(ref["i"], ""))
                if norm(row.get("vrtti", "")) not in norm(v) and norm(v) not in norm(row.get("vrtti", "")):
                    print(f"✗ {f.name} {sid}: vṛtti differs\n    ours: {row.get('vrtti')}\n    data: {v[:300]}"); bad += 1
    print("OK" if not bad else f"{bad} problem(s)")
    return 1 if bad else 0

if __name__ == "__main__":
    sys.exit(main())
