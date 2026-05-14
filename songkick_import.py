"""Parse Songkick concert pages (JSON-LD MusicEvent) for ha_events autofill."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from dice_import import _fetch_html, build_event_payload_from_ld_node, find_music_event_node


def fetch_songkick_event(url: str) -> dict[str, Any]:
    """Return a dict suitable for POST /api/events (same shape as dice_import.fetch_dice_event)."""
    if "songkick.com" not in urlparse(url).netloc.lower():
        raise ValueError("URL must be a songkick.com link")

    html_body = _fetch_html(url)
    event_node = find_music_event_node(html_body)
    if not event_node:
        raise RuntimeError(
            "No event JSON-LD found on this Songkick page. Use a concert URL like "
            "https://www.songkick.com/concerts/… or fill the form manually."
        )
    return build_event_payload_from_ld_node(event_node, url)
