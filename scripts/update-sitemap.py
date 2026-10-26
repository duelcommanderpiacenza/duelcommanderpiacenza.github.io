"""Rebuilds sitemap.xml, the list of the site's pages for search engines
(robots.txt points to it; submitted in Google Search Console).

The main pages, then every page with data behind it, read from the live
database exactly as a visitor sees it (the public key in
js/supabase-client.js, so the same row-level security): each player,
commander and league, each played (closed) event with its date, and the
archetypes. account.html (a sign-in page) and admin/ are left out.

Run daily by .github/workflows/update-latest-decks.yml (committed only when
it changes); by hand: python scripts/update-sitemap.py
"""

import json
import re
import urllib.request
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://duelcommanderpiacenza.github.io/"
MAIN_PAGES = [
    "",
    "events.html",
    "players.html",
    "commanders.html",
    "archetypes.html",
    "matchups.html",
    "badges.html",
    "social.html",
    "privacy.html",
]
# The archetypes are a fixed list (an enum in the database, js/archetype-icons.js).
ARCHETYPES = ["aggro", "control", "combo", "tempo", "midrange"]
PAGE_SIZE = 1000  # PostgREST's own cap per response


def live_supabase():
    """The live project's address and public key, from js/supabase-client.js."""
    source = (ROOT / "js" / "supabase-client.js").read_text(encoding="utf-8")
    block = re.search(r"const LIVE = \{(.*?)\};", source, re.S).group(1)
    url = re.search(r'url:\s*"([^"]+)"', block).group(1)
    key = re.search(r'key:\s*"([^"]+)"', block).group(1)
    return url.rstrip("/"), key


def fetch_all(base, key, table, query):
    """Every row of `table` (`query`: select / filters / order), page by page."""
    rows = []
    while True:
        request = urllib.request.Request(
            f"{base}/rest/v1/{table}?{query}",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Range-Unit": "items",
                "Range": f"{len(rows)}-{len(rows) + PAGE_SIZE - 1}",
            },
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            page = json.load(response)
        rows += page
        if len(page) < PAGE_SIZE:
            return rows


def url_entry(path, lastmod=None):
    lines = [f"    <loc>{escape(SITE + path)}</loc>"]
    if lastmod:
        lines.append(f"    <lastmod>{lastmod}</lastmod>")
    return "  <url>\n" + "\n".join(lines) + "\n  </url>"


def main():
    base, key = live_supabase()
    players = fetch_all(base, key, "players", "select=id&order=id")
    commanders = fetch_all(base, key, "commanders", "select=id&order=id")
    leagues = fetch_all(base, key, "leagues", "select=id&order=id")
    events = fetch_all(base, key, "events", "select=id,event_date&is_open=eq.false&is_external=eq.false&order=id")

    entries = [url_entry(page) for page in MAIN_PAGES]
    entries += [url_entry(f"player.html?id={row['id']}") for row in players]
    entries += [url_entry(f"commander.html?id={row['id']}") for row in commanders]
    entries += [url_entry(f"league.html?id={row['id']}") for row in leagues]
    entries += [url_entry(f"event.html?id={row['id']}", row.get("event_date")) for row in events]
    entries += [url_entry(f"archetype.html?id={name}") for name in ARCHETYPES]

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(entries)
        + "\n</urlset>\n"
    )
    (ROOT / "sitemap.xml").write_text(xml, encoding="utf-8", newline="\n")
    print(
        f"sitemap.xml: {len(entries)} pages ({len(players)} players, {len(commanders)} commanders, "
        f"{len(leagues)} leagues, {len(events)} events)"
    )


if __name__ == "__main__":
    main()
