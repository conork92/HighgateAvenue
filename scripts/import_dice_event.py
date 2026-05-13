#!/usr/bin/env python3
"""
CLI wrapper for dice_import.fetch_dice_event (repo root on sys.path).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from dice_import import fetch_dice_event  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="Import dice.fm event metadata as ha_events JSON.")
    ap.add_argument("url", help="dice.fm event URL")
    ap.add_argument("--city", help="Override inferred city slug (e.g. london)")
    ap.add_argument("--type", choices=["concert", "comedy", "theatre", "festival", "other"], help="Override type")
    ap.add_argument("--pretty", action="store_true", help="Pretty-print JSON")
    ap.add_argument(
        "--curl",
        metavar="BASE",
        help="Print a curl command to POST to BASE (e.g. http://127.0.0.1:5000)",
    )
    args = ap.parse_args()

    try:
        payload = fetch_dice_event(args.url.strip())
    except Exception as e:
        print(str(e), file=sys.stderr)
        return 1

    if args.city:
        payload["city"] = args.city.strip().lower()
    if args.type:
        payload["type"] = args.type

    indent = 2 if args.pretty else None
    body = json.dumps(payload, indent=indent, ensure_ascii=False)
    print(body)

    if args.curl:
        base = args.curl.rstrip("/")
        escaped = body.replace("'", "'\\''")
        print(
            f"\ncurl -sS -X POST '{base}/api/events' "
            f"-H 'Content-Type: application/json' "
            f"-d '{escaped}'",
            file=sys.stderr,
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
