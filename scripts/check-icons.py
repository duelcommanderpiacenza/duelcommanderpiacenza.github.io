"""Checks the site's icons: one icon per title, one meaning per icon.

The site writes its icons inline: an <svg> right before its title (the tab
switchers, the touch screens' segmented controls, the Bacheca's headings,
the buttons...), or the drawing alone in a JS string (the achievements', the
rival cards', the tab bar's maps). Two checks:

1. A title always has the same icon (user, 2026-11-19): "Storico partite" on
   player.html and commander.html, "Giocatori" in the Meta tabs and an
   event's tabs. The detail pages' back pill ("‹ Giocatori") isn't counted:
   the arrow is the pill's, not the title's.

2. An icon always means the same thing (user, 2026-11-25): every drawing is
   listed in docs/icons.md — the register of the site's icons, each with its
   meaning and where it's used — under exactly one row (one concept). A new
   drawing missing from it, a drawing listed twice, a listed one no longer
   used: each stops the commit. The register names a drawing by its key (the
   first 8 hex digits of the MD5 of its shapes, whatever the <svg>'s own
   attributes or the shapes' tag style); `--icons` prints every drawing with
   its key and uses. Drawings built from data (`${...}`: the charts' lines)
   aren't icons and aren't counted. Covers the public pages, partials/, js/
   and the admin (admin/index.html, admin/js/).

    python scripts/check-icons.py          # exit 1 if either check fails
    python scripts/check-icons.py --list   # every title with its icon(s)
    python scripts/check-icons.py --icons  # every drawing: key, uses

Run by .githooks/pre-commit.
"""
import collections
import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
REGISTER = ROOT / "docs" / "icons.md"
PUBLIC = sorted(
    [p for p in ROOT.glob("*.html") if not p.name.startswith(("_mockup", "google"))]
    + list((ROOT / "partials").glob("*.html"))
    + list((ROOT / "js").glob("*.js"))
)
ADMIN = sorted([ROOT / "admin" / "index.html"] + list((ROOT / "admin" / "js").glob("*.js")))

SHAPES = r"(?:path|circle|line|rect|polyline|polygon|ellipse)"
# An <svg>, then (inside a <span> or not) the text right after it.
ICON_THEN_TEXT = re.compile(
    r"(<svg\b[^>]*>(?:(?!</svg>).)*</svg>)\s*(?:<span\b[^>]*>)?\s*"
    r"([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ &;'’]{2,40}?)\s*(?=</span>|<button|<span|</)",
    re.S,
)
# Not a title's icon: the back pill's arrow.
SKIP_BEFORE = re.compile(r'class="[^"]*\bdetail-hero-back\b[^"]*"[^<]*$')
# A drawing: an <svg>'s content, or a JS string of shapes only ('<path …/>…').
SVG = re.compile(r"<svg\b[^>]*>((?:(?!</svg>).)*)</svg>", re.S)
SHAPE_STRINGS = [
    re.compile(q + r"((?:<%s\b[^%s<]*?/?>\s*(?:</%s>\s*)?)+)" % (SHAPES, q, SHAPES) + q, re.S)
    for q in ("'", '"', "`")
]


def icon_key(svg):
    """The icon's drawing, whatever its <svg> attributes or tag style."""
    body = re.sub(r"<svg\b[^>]*>", "", svg).replace("</svg>", "")
    body = re.sub(r"></(path|circle|line|rect|polyline|polygon|ellipse)>", "/>", body)
    body = re.sub(r"\s+", " ", body).replace(" />", "/>").strip()
    return hashlib.md5(body.encode()).hexdigest()[:8]


def where(path, text, pos):
    return f"{path.relative_to(ROOT).as_posix()}:{text.count(chr(10), 0, pos) + 1}"


def scan_titles():
    titles = collections.defaultdict(list)  # title -> [(icon key, "file:line")]
    for path in PUBLIC:
        text = path.read_text(encoding="utf-8")
        for m in ICON_THEN_TEXT.finditer(text):
            if SKIP_BEFORE.search(text[max(0, m.start() - 300) : m.start()]):
                continue
            titles[m.group(2).strip()].append((icon_key(m.group(1)), where(path, text, m.start())))
    return titles


def scan_drawings():
    drawings = collections.defaultdict(list)  # key -> ["file:line"]
    for path in PUBLIC + ADMIN:
        text = path.read_text(encoding="utf-8")
        found = [(m.start(), m.group(1)) for m in SVG.finditer(text)]
        found += [(m.start(), m.group(1)) for r in SHAPE_STRINGS for m in r.finditer(text)]
        for pos, body in found:
            if "${" in body or not re.search(r"<%s\b" % SHAPES, body):
                continue
            drawings[icon_key(body)].append(where(path, text, pos))
    return drawings


def check_titles(titles):
    bad = {t: uses for t, uses in titles.items() if len({k for k, _ in uses}) > 1}
    for title, uses in sorted(bad.items()):
        print(f'"{title}" has {len({k for k, _ in uses})} different icons:')
        for key, at in uses:
            print(f"    {key}  {at}")
    if bad:
        print("A title should have one icon everywhere: copy the <svg> from where it's right.")
    return not bad


def check_register(drawings):
    listed = collections.Counter(re.findall(r"`([0-9a-f]{8})`", REGISTER.read_text(encoding="utf-8")))
    ok = True
    for key, uses in sorted(drawings.items()):
        if key not in listed:
            ok = False
            print(f"icon {key} is not in docs/icons.md: {', '.join(uses[:3])}")
    for key, n in sorted(listed.items()):
        if n > 1:
            ok = False
            print(f"icon {key} is listed {n} times in docs/icons.md: an icon is one concept, one row")
        if key not in drawings:
            ok = False
            print(f"icon {key} is in docs/icons.md but no longer used: remove it from there")
    if not ok:
        print(
            "docs/icons.md lists every icon with what it means. A new icon: check there that its"
            " drawing doesn't already mean something else, then add it (its key above) to its row."
        )
    return ok


def main():
    if "--list" in sys.argv:
        for title, uses in sorted(scan_titles().items()):
            keys = collections.Counter(k for k, _ in uses)
            print(f"{title}: {', '.join(f'{k} ×{n}' for k, n in keys.items())}")
        return 0
    drawings = scan_drawings()
    if "--icons" in sys.argv:
        for key, uses in sorted(drawings.items(), key=lambda kv: kv[1][0]):
            print(f"{key}  {', '.join(uses)}")
        return 0
    titles = scan_titles()
    ok = check_titles(titles) & check_register(drawings)
    if ok:
        print(f"icons consistent ({len(titles)} titles, {len(drawings)} drawings, all in docs/icons.md)")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
