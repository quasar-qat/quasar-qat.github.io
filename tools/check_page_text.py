#!/usr/bin/env python3
"""Check that every prose sentence on the page is reused verbatim from the paper.

Usage:
  python3 tools/check_page_text.py index.html            # static HTML
  python3 tools/check_page_text.py rendered_dom.html     # DOM dumped by headless Chrome (includes JS-rendered text)

Prose = text in block elements outside <script>/<style>/<svg>/<math>/<pre>/<code>/<button>/<select>/<option>/<label>/<nav>
and outside any element carrying data-label (short UI labels: names, numbers, kickers) or data-nocheck (math, code).
Each prose sentence must be a substring of tools/paper_plain.txt after light normalization
(curly quotes, whitespace, subscript underscores). Labels are listed separately for a human glance.
"""
import html
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SKIP_TAGS = {"script", "style", "svg", "math", "pre", "code", "button", "select", "option", "label", "nav", "noscript", "template", "head", "title"}
BLOCK_TAGS = {"p", "figcaption", "h1", "h2", "h3", "h4", "li", "summary", "div", "section", "figure", "td", "th", "span"}
VOID = {"br", "img", "input", "meta", "link", "source", "hr", "wbr", "area", "base", "col", "embed", "param", "track"}


def norm(s: str) -> str:
    s = html.unescape(s)
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = s.replace(" ", " ").replace(" ", " ").replace(" ", " ")
    s = s.replace("_", "").replace("{", "").replace("}", "")
    s = s.replace("−", "−")
    s = re.sub(r"\s+", " ", s)
    return s.strip()


class Collector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []          # (tag, skip, label, block_id)
        self.blocks = {}         # block_id -> [text]
        self.labels = []
        self.attrs = []          # prose-like attribute values (aria-label, alt, title, meta description)
        self.title = []
        self.in_title = False
        self.next_id = 0

    def _flags(self):
        skip = any(f[1] for f in self.stack)
        label = any(f[2] for f in self.stack)
        return skip, label

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        for k in ("aria-label", "alt", "title"):
            if tag == "math" or "data-nocheck" in a:   # spoken form of an equation, not prose
                break
            v = a.get(k)
            if v and len(v.split()) >= 6:
                self.attrs.append(v)
        if tag == "meta" and a.get("name") == "description" and a.get("content"):
            self.attrs.append(a["content"])
        if tag == "title":
            self.in_title = True
        if tag in VOID:
            return
        skip = tag in SKIP_TAGS or "data-nocheck" in a or a.get("aria-hidden") == "true" or "hidden" in a
        label = "data-label" in a or "vtip" in (a.get("class") or "")
        bid = None
        if tag in BLOCK_TAGS and tag not in ("span", "div", "section", "figure"):
            bid = self.next_id
            self.next_id += 1
        self.stack.append((tag, skip, label, bid))

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                return

    def handle_data(self, data):
        if self.in_title:
            self.title.append(data)
            return
        if not data.strip():
            # keep spacing between inline elements
            bid = next((f[3] for f in reversed(self.stack) if f[3] is not None), -1)
            self.blocks.setdefault(bid, []).append(" ")
            return
        skip, label = self._flags()
        if skip:
            return
        if label:
            self.labels.append(norm(data))
            return
        bid = next((f[3] for f in reversed(self.stack) if f[3] is not None), -1)
        self.blocks.setdefault(bid, []).append(data)


ABBREV = r"(?<!e\.g)(?<!i\.e)(?<!vs)(?<!et al)(?<!Fig)(?<!Eq)(?<!Sec)(?<!No)"


def sentences(text):
    text = norm(text)
    parts = re.split(ABBREV + r"(?<=[.!?])\s+(?=[A-Z0-9\"'(])", text)
    return [p.strip() for p in parts if p.strip()]


def main():
    page = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT.parent / "index.html")
    paper = norm((ROOT / "paper_plain.txt").read_text())
    paper_loose = re.sub(r"[^\w%]+", "", paper).lower()
    c = Collector()
    c.feed(page.read_text())
    ok, bad = [], []
    for bid, chunks in sorted(c.blocks.items()):
        text = "".join(chunks)
        for s in sentences(text):
            core = s.rstrip(".;:,")
            if len(core) < 3:
                continue
            if core in paper:
                ok.append(s)
            elif re.sub(r"[^\w%]+", "", core).lower() in paper_loose:
                ok.append(s + "   [matched ignoring punctuation/math spacing]")
            else:
                bad.append(s)
    def is_verbatim(core):
        return core in paper or re.sub(r"[^\w%]+", "", core).lower() in paper_loose
    for v in c.attrs + ["".join(c.title)]:
        v = norm(v)
        if not v:
            continue
        for s in sentences(v):
            core = s.rstrip(".;:,")
            if len(core.split()) < 6 or is_verbatim(core) or core.startswith("QUASAR: Lowering the Loss Floor"):
                continue
            bad.append("[attribute/title] " + s)
    print(f"page: {page}")
    print(f"verbatim prose sentences: {len(ok)}")
    print(f"NON-verbatim prose sentences: {len(bad)}")
    for s in bad:
        print("  ✗", s)
    labels = sorted(set(l for l in c.labels if l))
    print(f"\nlabels (exempt, {len(labels)} unique):")
    for l in labels:
        print("  ·", l)
    if "-v" in sys.argv:
        print("\nverbatim:")
        for s in ok:
            print("  ✓", s)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
