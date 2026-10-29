#!/usr/bin/env python3
"""Fill the source-derived fields of data/sutras/*.yaml from the ashtadhyayi.com dataset.

    python3 scripts/import-sutras.py [path-to-ashtadhyayi-com-data]

Hand-written fields stay as they are: id, kind, meaning (and optional note).
Fields taken from the dataset (github.com/ashtadhyayi-com/data, sutraani/):
  deva       sūtra text                         data.txt  "s"
  pada       padaccheda                         data.txt  "pc"
  anuvrtti   words carried over [word, a.p.s]   data.txt  "an"
  adhikara   headings in force   [word, a.p.s]  data.txt  "ad"
  lsk        Laghusiddhāntakaumudī number       data.txt  "lskn" (0 → null)
  sk         Siddhāntakaumudī number            data.txt  "skn"
  vrtti      LSK vṛtti                          laghukaumudi.txt
Rows are written back in a fixed field order, each file keeping its header comment.
To add a sūtra, append a row with id, kind and meaning, then run this script.
"""
import json
import os
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("ASHTADHYAYI_DATA", ROOT.parent / "ashtadhyayi-com" / "data"))
DEVA_DIGITS = str.maketrans("0123456789", "०१२३४५६७८९")


def sid(code: str) -> str:
    """'61077' → '6.1.77'"""
    return f"{code[0]}.{code[1]}.{int(code[2:])}"


def words(field: str, adhikara: bool = False) -> list[list[str]]:
    out = []
    for part in filter(None, (field or "").split("##")):
        bits = part.split("$")
        if adhikara:  # word$a$p$n
            out.append([bits[0].strip(), f"{bits[1]}.{bits[2]}.{bits[3]}"])
        else:  # word$apnnn
            out.append([bits[0].strip(), sid(bits[1])])
    return out


def clean_vrtti(v: str) -> str:
    v = v.strip()
    # vārttikas are marked <!…!> or <<…>>; keep the text and label it once
    v = re.sub(r"<!(.+?)!>\s*(\(वार्त्तिकम्\))?", lambda m: f"{m.group(1).strip()} (वार्त्तिकम्)", v)
    v = re.sub(r"<<(.+?)>>\s*(\(वार्त्तिकम्\))?", lambda m: f"{m.group(1).strip()} (वार्त्तिकम्)", v)
    v = v.replace("≍क", "ᳵक").replace("≍ख", "ᳵख").replace("≍प", "ᳶप").replace("≍फ", "ᳶफ")
    v = re.sub(r"(?<=[ऀ-ॿ])3", "३", v)  # pluta mark written as ASCII 3
    v = v.translate(DEVA_DIGITS) if re.search(r"[ऀ-ॿ]\d", v) else v
    v = re.sub(r"\s+", " ", v)
    return v


def q(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


def pairs(ps: list[list[str]]) -> str:
    return "[" + ", ".join(f"[{q(w)}, {q(f)}]" for w, f in ps) + "]"


def dump(row: dict) -> str:
    lines = [f'- id: "{row["id"]}"']
    lines.append(f"  lsk: {row['lsk'] if row['lsk'] is not None else 'null'}")
    lines.append(f"  lskVerified: {'true' if row['lskVerified'] else 'false'}")
    lines.append(f"  sk: {row['sk'] if row['sk'] is not None else 'null'}")
    lines.append(f"  deva: {q(row['deva'])}")
    lines.append("  pada: [" + ", ".join(q(p) for p in row["pada"]) + "]")
    lines.append(f"  anuvrtti: {pairs(row['anuvrtti'])}")
    lines.append(f"  adhikara: {pairs(row['adhikara'])}")
    if row.get("vrtti"):
        lines.append(f"  vrtti: {q(row['vrtti'])}")
    lines.append(f"  vrttiVerified: {'true' if row['vrttiVerified'] else 'false'}")
    lines.append(f"  kind: {row['kind']}")
    lines.append(f"  meaning: {q(row['meaning'])}")
    if row.get("note"):
        lines.append(f"  note: {q(row['note'])}")
    return "\n".join(lines)


def main() -> int:
    data = json.loads((SRC / "sutraani" / "data.txt").read_text("utf8"))["data"]
    lskv = json.loads((SRC / "sutraani" / "laghukaumudi.txt").read_text("utf8"))
    by = {f"{x['a']}.{x['p']}.{x['n']}": x for x in data}
    seen: set[str] = set()
    for f in sorted((ROOT / "data" / "sutras").glob("*.yaml")):
        text = f.read_text("utf8")
        header = "\n".join(l for l in text.split("\n- id")[0].splitlines() if l.startswith("#"))
        rows = yaml.safe_load(text) or []
        out = []
        for r in rows:
            i = str(r["id"])
            if i in seen:
                raise SystemExit(f"{f.name}: duplicate {i}")
            seen.add(i)
            ref = by[i]
            lsk = int(ref.get("lskn") or 0) or None
            sk = int(ref.get("skn") or 0) or None
            v = clean_vrtti(lskv.get(ref["i"], "")) if lsk else ""
            out.append({
                "id": i,
                "lsk": lsk,
                "lskVerified": lsk is not None,
                "sk": sk,
                "deva": ref["s"].strip(),
                "pada": [p.split("$")[0].strip() for p in ref["pc"].split("##") if p.split("$")[0].strip()],
                "anuvrtti": words(ref.get("an", "")),
                "adhikara": words(ref.get("ad", ""), adhikara=True),
                "vrtti": v,
                "vrttiVerified": bool(v),
                "kind": r["kind"],
                "meaning": r["meaning"],
                "note": r.get("note"),
            })
        # an adhikāra a sūtra heads itself in the dataset; drop the self-reference
        for o in out:
            o["adhikara"] = [p for p in o["adhikara"] if p[1] != o["id"]]
        body = "\n".join(dump(o) for o in out)
        f.write_text((header + "\n" if header else "") + body + "\n", "utf8")
        print(f"{f.name}: {len(out)} sūtras")
    return 0


if __name__ == "__main__":
    sys.exit(main())
