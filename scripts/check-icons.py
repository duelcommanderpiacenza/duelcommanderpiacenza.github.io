"""Checks that a title always comes with the same icon.

The site writes its icons inline (an <svg> right before its title): the
tab switchers, the touch screens' segmented controls, the Bacheca's
headings, the buttons... The same title in two places ("Storico partite" on
player.html and commander.html, "Giocatori" in the Meta tabs and an
event's tabs) must show the same icon (user, 2026-11-19). This scans the
public pages, partials/ and js/ for an <svg> followed by its text, groups
them by that text and reports a title with more than one icon.

Not counted: the detail pages' back pill ("‹ Giocatori" — the arrow is the
pill's, not the title's). The same icon for different titles is fine
(Partite / Storico partite / Matchups: all about matches).

    python scripts/check-icons.py          # exit 1 if a title has two icons
    python scripts/check-icons.py --list   # every title with its icon(s)

Run by .githooks/pre-commit.
"""
import collections
import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = sorted(
    [p for p in ROOT.glob("*.html") if not p.name.startswith(("_mockup", "google"))]
    + list((ROOT / "partials").glob("*.html"))
    + list((ROOT / "js").glob("*.js"))
)

# An <svg>, then (inside a <span> or not) the text right after it.
ICON_THEN_TEXT = re.compile(
    r"(<svg\b[^>]*>(?:(?!</svg>).)*</svg>)\s*(?:<span\b[^>]*>)?\s*"
    r"([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ &;'’]{2,40}?)\s*(?=</span>|<button|<span|</)",
    re.S,
)
# Not a title's icon: the back pill's arrow.
SKIP_BEFORE = re.compile(r'class="[^"]*\bdetail-hero-back\b[^"]*"[^<]*$')


def icon_key(svg):
    """The icon's drawing, whatever its <svg> attributes or tag style."""
    body = re.sub(r"<svg\b[^>]*>", "", svg)
    body = re.sub(r"></(path|circle|line|rect|polyline|polygon|ellipse)>", "/>", body)
    body = re.sub(r"\s+", " ", body).replace(" />", "/>").strip()
    return hashlib.md5(body.encode()).hexdigest()[:8]


def scan():
    titles = collections.defaultdict(list)  # title -> [(icon key, "file:line")]
    for path in FILES:
        text = path.read_text(encoding="utf-8")
        for m in ICON_THEN_TEXT.finditer(text):
            if SKIP_BEFORE.search(text[max(0, m.start() - 300) : m.start()]):
                continue
            title = m.group(2).strip()
            line = text.count("\n", 0, m.start()) + 1
            titles[title].append((icon_key(m.group(1)), f"{path.relative_to(ROOT).as_posix()}:{line}"))
    return titles


def main():
    titles = scan()
    if "--list" in sys.argv:
        for title in sorted(titles):
            keys = collections.Counter(k for k, _ in titles[title])
            print(f"{title}: {', '.join(f'{k} ×{n}' for k, n in keys.items())}")
        return 0
    bad = {t: uses for t, uses in titles.items() if len({k for k, _ in uses}) > 1}
    if not bad:
        print(f"icons consistent ({len(titles)} titles)")
        return 0
    for title, uses in sorted(bad.items()):
        print(f'"{title}" has {len({k for k, _ in uses})} different icons:')
        for key, where in uses:
            print(f"    {key}  {where}")
    print("A title should have one icon everywhere: copy the <svg> from where it's right.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
