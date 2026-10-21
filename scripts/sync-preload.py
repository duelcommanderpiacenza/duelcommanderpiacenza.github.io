"""Writes each public page's list of the scripts it will load, for the browser
to fetch them all at once.

With no build step, the browser only finds a page's scripts one level at a
time: js/layout.js, then what it imports, then js/router.js's dynamic import
of the page's own module (its PAGES list), then what that one imports, and
so on — each level a round trip before the next can start, and the page's
data requests only start once the chain is done. A
<link rel="modulepreload"> for every one of them, in the page's <head>, lets
the browser fetch them all at once instead (a first visit, or after the
browser's cache expired; later visits have them cached anyway).

The list is every module statically imported, directly or not, by
js/layout.js and by the page's own module — `import … from "./x.js"`,
`import "./x.js"`, `export … from "./x.js"`; not dynamic `import()`s, which
load later and only sometimes — written between markers before </head>:

    <!-- preload:modules -->
    <link rel="modulepreload" href="js/layout.js">
    …
    <!-- /preload:modules -->

(added there the first time). Run after changing a script's imports:

    python scripts/sync-preload.py          # rewrite the pages
    python scripts/sync-preload.py --check  # only report pages out of date
                                            # (exit code 1 if any)

An outdated list isn't an error — a module missing from it just loads the
old way, an extra one is fetched for nothing — but keep it in step.
"""
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

BLOCK = re.compile(r"[ \t]*<!-- preload:modules -->\n.*?<!-- /preload:modules -->\n", re.S)
IMPORT = re.compile(
    r"""(?:^|[\n;])\s*(?:import|export)\b(?:[^;"'`]*?\bfrom)?\s*["'](\.{1,2}/[^"']+\.js)["']""",
    re.S,
)
# router.js's PAGES: "league.html": { name: "league", load: () => import("./league-detail.js"), …
PAGE_MODULE = re.compile(r'"([\w-]+\.html)":\s*\{[^}]*?import\("\./([\w-]+\.js)"\)')
SHELL = "js/layout.js"


def read(path):
    return open(path, encoding="utf-8").read().replace("\r\n", "\n")


def strip_comments(source):
    # Block and line comments, so an example in a comment isn't taken for an
    # import (strings containing "//" — URLs — only matter on import lines,
    # which don't have them).
    source = re.sub(r"/\*.*?\*/", "", source, flags=re.S)
    return re.sub(r"(^|[^:\"'])//[^\n]*", r"\1", source)


def closure(start):
    """Every module `start` (a path like js/x.js) imports statically, itself
    first, then breadth-first."""
    order, queue = [], [start]
    while queue:
        path = queue.pop(0)
        if path in order or not os.path.exists(path):
            continue
        order.append(path)
        base = os.path.dirname(path)
        for spec in IMPORT.findall(strip_comments(read(path))):
            queue.append(os.path.normpath(os.path.join(base, spec)).replace("\\", "/"))
    return order


def page_modules():
    return {page: f"js/{module}" for page, module in PAGE_MODULE.findall(read("js/router.js"))}


def block_for(page, modules):
    paths = closure(SHELL)
    if page in modules:
        paths += [p for p in closure(modules[page]) if p not in paths]
    links = "".join(f'  <link rel="modulepreload" href="{p}">\n' for p in paths)
    return f"  <!-- preload:modules -->\n{links}  <!-- /preload:modules -->\n"


def sync(page, modules, check):
    raw = open(page, "rb").read().decode("utf-8")
    nl = "\r\n" if "\r\n" in raw else "\n"
    text = raw.replace("\r\n", "\n")
    block = block_for(page, modules)
    if BLOCK.search(text):
        new = BLOCK.sub(lambda _: block, text, count=1)
    else:
        new = text.replace("</head>", block + "</head>", 1)
    if new == text:
        return False
    if not check:
        open(page, "wb").write(new.replace("\n", nl).encode("utf-8"))
    return True


def main():
    check = "--check" in sys.argv
    modules = page_modules()
    # The public pages: those loading the shared shell script.
    pages = sorted(p for p in glob.glob("*.html") if f'src="{SHELL}"' in read(p))
    changed = [p for p in pages if sync(p, modules, check)]
    if check:
        print("out of date: " + ", ".join(changed) if changed else f"all {len(pages)} pages up to date")
        sys.exit(1 if changed else 0)
    print(f"updated {len(changed)} of {len(pages)} pages" + (": " + ", ".join(changed) if changed else ""))


main()
