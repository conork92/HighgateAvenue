"""
Parse dice.fm event pages (JSON-LD) for ha_events / ha_things_to_do autofill.
Used by Flask /api/import/dice and scripts/import_dice_event.py.
"""

from __future__ import annotations

import html
import json
import re
from typing import Any, Iterator
from urllib.error import HTTPError, URLError
from urllib.parse import quote_plus, urlparse
from urllib.request import Request, urlopen

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

_LD_JSON_SCRIPT_RE = re.compile(
    r'<script[^>]+type\s*=\s*["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)


def _fetch_html(url: str) -> str:
    req = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept-Language": "en-GB,en;q=0.9",
        },
    )
    try:
        with urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.reason}") from e
    except URLError as e:
        raise RuntimeError(f"Could not fetch URL: {e.reason}") from e


CITY_HINTS: list[tuple[str, str]] = [
    ("london", "london"),
    (" nw1 ", "london"),
    (" nw", "london"),
    (" sw", "london"),
    (" se", "london"),
    (" e1 ", "london"),
    (" ec", "london"),
    (" w1 ", "london"),
    ("new york", "new-york"),
    ("manhattan", "new-york"),
    ("brooklyn", "new-york"),
    ("paris", "paris"),
    ("berlin", "berlin"),
    ("tokyo", "tokyo"),
]

SCHEMA_TYPE_TO_EVENT_TYPE: dict[str, str] = {
    "musicevent": "concert",
    "theaterevent": "theatre",
    "theatreevent": "theatre",
    "comedyevent": "comedy",
    "festivalevent": "festival",
    "event": "other",
}


def _iter_json_ld_nodes(obj: Any) -> Iterator[dict[str, Any]]:
    if isinstance(obj, dict):
        if "@graph" in obj and isinstance(obj["@graph"], list):
            for item in obj["@graph"]:
                yield from _iter_json_ld_nodes(item)
        else:
            yield obj
    elif isinstance(obj, list):
        for item in obj:
            yield from _iter_json_ld_nodes(item)


def _is_event_node(node: dict[str, Any]) -> bool:
    t = node.get("@type")
    if t is None:
        return False
    if isinstance(t, str):
        types = {t.lower()}
    elif isinstance(t, list):
        types = {str(x).lower() for x in t}
    else:
        return False
    event_like = {"event", "musicevent", "theaterevent", "theatreevent", "comedyevent", "festivalevent"}
    return bool(types & event_like)


def _as_str(x: Any) -> str | None:
    if x is None:
        return None
    if isinstance(x, str) and x.strip():
        return x.strip()
    return None


def _place_fields(location: Any) -> tuple[str | None, str | None, float | None, float | None]:
    if not location:
        return None, None, None, None
    if isinstance(location, str):
        return location, None, None, None
    if not isinstance(location, dict):
        return None, None, None, None
    name = _as_str(location.get("name"))
    addr = location.get("address")
    if isinstance(addr, str):
        address = addr.strip() or None
    elif isinstance(addr, dict):
        parts = [
            addr.get("streetAddress"),
            addr.get("addressLocality"),
            addr.get("postalCode"),
            addr.get("addressRegion"),
            addr.get("addressCountry"),
        ]
        address = ", ".join(p for p in parts if p) or None
    else:
        address = None
    lat = lng = None
    geo = location.get("geo")
    if isinstance(geo, dict):
        try:
            lat = float(geo.get("latitude"))
            lng = float(geo.get("longitude"))
        except (TypeError, ValueError):
            lat = lng = None
    return name, address, lat, lng


def _map_link(lat: float | None, lng: float | None, address: str | None, venue: str | None) -> str | None:
    if lat is not None and lng is not None:
        return f"https://www.google.com/maps/search/?api=1&query={lat},{lng}"
    q = address or venue
    if q:
        return f"https://www.google.com/maps/search/?api=1&query={quote_plus(q)}"
    return None


def _guess_city_slug(address: str | None, venue: str | None) -> str:
    blob = f" {((address or '') + ' ' + (venue or '')).lower()} "
    for needle, slug in CITY_HINTS:
        if needle in blob:
            return slug
    return "other"


def _event_type_from_schema(node: dict[str, Any]) -> str:
    t = node.get("@type")
    if isinstance(t, list):
        for x in t:
            key = str(x).lower()
            if key in SCHEMA_TYPE_TO_EVENT_TYPE:
                return SCHEMA_TYPE_TO_EVENT_TYPE[key]
    elif isinstance(t, str):
        key = t.lower()
        if key in SCHEMA_TYPE_TO_EVENT_TYPE:
            return SCHEMA_TYPE_TO_EVENT_TYPE[key]
    return "concert"


def _json_ld_decode_stream(raw: str) -> Iterator[Any]:
    dec = json.JSONDecoder()
    i = 0
    n = len(raw)
    while i < n:
        while i < n and raw[i].isspace():
            i += 1
        if i >= n:
            break
        try:
            val, j = dec.raw_decode(raw, i)
        except json.JSONDecodeError:
            break
        yield val
        i = j


def find_music_event_node(html_body: str) -> dict[str, Any] | None:
    """First schema.org MusicEvent (or compatible) with startDate in JSON-LD script tags."""
    event_node: dict[str, Any] | None = None
    for m in _LD_JSON_SCRIPT_RE.finditer(html_body):
        raw = html.unescape(m.group(1).strip())
        if not raw:
            continue
        try:
            parsed = list(_json_ld_decode_stream(raw))
        except Exception:
            parsed = []

        if not parsed:
            try:
                parsed = [json.loads(raw)]
            except json.JSONDecodeError:
                parsed = []

        for data in parsed:
            for node in _iter_json_ld_nodes(data):
                if _is_event_node(node) and node.get("startDate"):
                    event_node = node
                    break
            if event_node:
                break
        if event_node:
            break
    return event_node


def build_event_payload_from_ld_node(event_node: dict[str, Any], page_url: str) -> dict[str, Any]:
    """Map schema.org event node to ha_events-style dict."""
    title = _as_str(event_node.get("name")) or "(untitled)"
    starts_at = _as_str(event_node.get("startDate"))
    if not starts_at:
        raise RuntimeError("Event data had no start time.")

    ends_raw = _as_str(event_node.get("endDate"))
    # Date-only endDate (e.g. Songkick) is not a useful timestamptz; omit unless it has a time.
    ends_at = ends_raw if (ends_raw and "T" in ends_raw) else None

    link = _as_str(event_node.get("url")) or page_url

    venue, address, lat, lng = _place_fields(event_node.get("location"))
    city = _guess_city_slug(address, venue)
    ev_type = _event_type_from_schema(event_node)
    map_link = _map_link(lat, lng, address, venue)

    description = _as_str(event_node.get("description"))
    notes = description[:8000] if description else None

    payload: dict[str, Any] = {
        "city": city,
        "type": ev_type,
        "title": title,
        "venue": venue,
        "starts_at": starts_at,
        "ends_at": ends_at,
        "link": link,
        "map_link": map_link,
        "address": address,
        "status": "idea",
        "notes": notes,
    }
    if lat is not None and lng is not None:
        payload["latitude"] = lat
        payload["longitude"] = lng

    return {k: v for k, v in payload.items() if v not in (None, "", [])}


def fetch_dice_event(url: str) -> dict[str, Any]:
    """Return a dict suitable for POST /api/events (fields may be omitted if empty)."""
    if "dice.fm" not in urlparse(url).netloc.lower():
        raise ValueError("URL must be a dice.fm link")

    html_body = _fetch_html(url)
    event_node = find_music_event_node(html_body)
    if not event_node:
        raise RuntimeError(
            "No event JSON-LD found on this page. Use a dice.fm event URL, or fill the form manually."
        )
    return build_event_payload_from_ld_node(event_node, url)


def place_payload_from_dice_event(ev: dict[str, Any]) -> dict[str, Any]:
    """Suggest ha_things_to_do fields from the same DICE parse (venue-first)."""
    venue = (ev.get("venue") or "").strip()
    title = (ev.get("title") or "").strip()
    name = venue or title or "Place"
    notes_parts = []
    if title and venue and title.lower() != venue.lower():
        notes_parts.append("Listing: " + title)
    if ev.get("notes"):
        notes_parts.append(str(ev["notes"]))
    notes = "\n\n".join(notes_parts) if notes_parts else None
    out: dict[str, Any] = {
        "city": ev.get("city") or "london",
        "name": name[:500],
        "category": "Venue",
        "link": ev.get("link"),
        "map_link": ev.get("map_link"),
        "address": ev.get("address"),
        "notes": (notes[:8000] if notes else None),
    }
    if ev.get("latitude") is not None:
        out["latitude"] = ev["latitude"]
    if ev.get("longitude") is not None:
        out["longitude"] = ev["longitude"]
    return {k: v for k, v in out.items() if v not in (None, "", [])}
