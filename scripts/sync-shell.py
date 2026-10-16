"""Copies the shared page shell into every public page.

The parts every public page has in common — the start of <head> (the theme /
touch script before first paint), the header, the nav and the footer — are
written once, in partials/<name>.html, and copied into each page between
its markers:

    <!-- shell:<name> ... -->
    …the partial's content…
    <!-- /shell:<name> -->

The pages stay plain static files (GitHub Pages serves them as they are; no
build step, nothing fetched at run time — a runtime include popped in late
and broke the page transitions). Edit the partial, then run:

    python scripts/sync-shell.py          # rewrite the pages
    python scripts/sync-shell.py --check  # only report pages out of sync
                                          # (exit code 1 if any)

Per-page differences stay outside the markers (<title>, body's
data-active-nav, <main>).
"""
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

MARKER = re.compile(r"(<!-- shell:([\w-]+)[^>]*-->\n)(.*?)(<!-- /shell:\2 -->)", re.S)


def partial(name):
    return open(os.path.join("partials", f"{name}.html"), encoding="utf-8").read().replace("\r\n", "\n")


def sync(page, check):
    raw = open(page, "rb").read().decode("utf-8")
    nl = "\r\n" if "\r\n" in raw else "\n"
    text = raw.replace("\r\n", "\n")
    new = MARKER.sub(lambda m: m.group(1) + partial(m.group(2)) + m.group(4), text)
    if new == text:
        return False
    if not check:
        open(page, "wb").write(new.replace("\n", nl).encode("utf-8"))
    return True


def main():
    check = "--check" in sys.argv
    pages = sorted(p for p in glob.glob("*.html") if MARKER.search(open(p, encoding="utf-8").read().replace("\r\n", "\n")))
    changed = [p for p in pages if sync(p, check)]
    if check:
        print("out of sync: " + ", ".join(changed) if changed else f"all {len(pages)} pages in sync")
        sys.exit(1 if changed else 0)
    print(f"updated {len(changed)} of {len(pages)} pages" + (": " + ", ".join(changed) if changed else ""))


main()
