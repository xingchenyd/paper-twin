#!/usr/bin/env python3
"""Build compact browser shards from a pinned ECDICT CSV checkout."""
import argparse
import csv
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path

SOURCE_COMMIT = "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b"
SOURCE_SHA256 = "1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf"
WORD = re.compile(r"^[A-Za-z][A-Za-z'’-]{0,59}$")


def shard_key(word: str) -> str:
    letters = "".join(c for c in word.lower() if "a" <= c <= "z")
    return (letters[:2] + "__")[:2]


def clean(value: str, limit: int) -> str:
    value = value.replace("\r", "").strip()
    return value[:limit].rstrip()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    digest = hashlib.sha256(args.csv.read_bytes()).hexdigest()
    if digest != SOURCE_SHA256:
        raise SystemExit(f"unexpected ECDICT SHA-256: {digest}")

    shards = defaultdict(dict)
    with args.csv.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            original = row["word"].strip()
            translation = clean(row["translation"], 800)
            if not WORD.fullmatch(original) or not translation:
                continue
            word = original.lower().replace("’", "'")
            value = [clean(row["phonetic"], 100), translation, clean(row["pos"], 120)]
            old = shards[shard_key(word)].get(word)
            if old is None or len(value[1]) > len(old[1]):
                shards[shard_key(word)][word] = value

    args.output.mkdir(parents=True, exist_ok=True)
    total_bytes = 0
    for key, entries in sorted(shards.items()):
        data = json.dumps(entries, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
        (args.output / f"{key}.json").write_bytes(data)
        total_bytes += len(data)
    manifest = {"source": "ECDICT", "commit": SOURCE_COMMIT, "sha256": SOURCE_SHA256, "entries": sum(map(len, shards.values())), "shards": len(shards), "bytes": total_bytes}
    (args.output.parent / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False))


if __name__ == "__main__":
    main()
