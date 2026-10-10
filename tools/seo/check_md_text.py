#!/usr/bin/env python3
"""Check the generated /index.md, /llms.txt and /quasar.bib (stdlib only, read-only).

1. Prose is verbatim: every prose sentence must occur in tools/paper_plain.txt, using the same
   normalization and sentence splitter as tools/check_page_text.py. Not prose (listed as labels):
   headings, fenced code, `- **Key:** ...` metadata items, link-only lines, sentences that are a
   figure/table label ("Table 1 · Qwen3-4B · INT2.", "Table 4."), table cells under 6 words and
   link names. Link notes and table cells of 6+ words are checked like prose.
2. Links: every Markdown link target is an absolute https:// URL; links to the project page map to
   files that exist in the repo.
3. Tables: every data row of the static tables baked into index.html (<!-- static-data:KEY -->)
   appears, cell for cell, as a row of index.md, and index.md has no extra data rows.
4. Method names: each baseline the paper names occurs in index.md (counts printed).
5. quasar.bib equals the page's #bibtex block; llms.txt follows the llmstxt.org layout.

usage: python3 tools/seo/check_md_text.py [-v] [--online]
  -v        also print every verbatim sentence
  --online  also fetch every external link and print its HTTP status
"""
import html
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
from check_page_text import norm, sentences  # noqa: E402  (same matcher as the page check)

SITE = "https://quasar-qat.github.io/"
MD, LLMS, BIB, PAGE = ROOT / "index.md", ROOT / "llms.txt", ROOT / "quasar.bib", ROOT / "index.html"
METHODS = ["QUASAR", "Standard QAT", "LSQ", "Denoising QAT", "BitDistiller", "RTN", "GPTQ", "AWQ", "imatrix",
           "Google QAT"]
LLMS_SECTIONS = ["Paper", "Code", "Models", "Project page", "Optional"]
LINK = re.compile(r"\[([^\]]*)\]\(([^)\s]+)\)")

PAPER = norm((ROOT / "tools" / "paper_plain.txt").read_text())
PAPER_LOOSE = re.sub(r"[^\w%]+", "", PAPER).lower()


def verbatim(s):
    core = norm(s).rstrip(".;:,")
    return core in PAPER or re.sub(r"[^\w%]+", "", core).lower() in PAPER_LOOSE


def is_label(s):
    return " · " in s or re.fullmatch(r"(Table|Fig\.) \d+\.?", s.strip()) is not None


def strip_md(s):
    s = LINK.sub(r"\1", s)
    return s.replace("**", "")


class Result:
    def __init__(self):
        self.ok, self.bad, self.labels, self.errors = [], [], set(), []

    def prose(self, where, s):
        s = strip_md(s).replace("Fig. ", "Fig.~")      # keep "Fig. 12 · ..." labels in one piece
        for sent in sentences(s):
            sent = sent.replace("Fig.~", "Fig. ")
            core = sent.rstrip(".;:,")
            if len(core) < 3:
                continue
            if is_label(sent):
                self.labels.add(sent)
            elif verbatim(core):
                self.ok.append(f"{where}: {sent}")
            else:
                self.bad.append(f"{where}: {sent}")

    def short(self, where, s):
        """Table cells and link notes: prose only from 6 words up."""
        s = strip_md(s).strip()
        if not s:
            return
        if len(s.split()) >= 6 and not is_label(s):
            self.prose(where, s)
        else:
            self.labels.add(s)


def scan(path, res):
    in_code = False
    for i, line in enumerate(path.read_text().split("\n"), 1):
        where = f"{path.name}:{i}"
        st = line.strip()
        if st.startswith("```"):
            in_code = not in_code
            continue
        if in_code or not st or st.startswith("#"):
            continue
        if st.startswith("|"):
            if re.fullmatch(r"\|(-+\|)+", st):
                continue
            for cell in re.split(r"(?<!\\)\|", st.strip("|")):
                res.short(where, cell.replace("\\|", "|"))
            continue
        if re.match(r"- \*\*[^*]+:\*\*", st):
            res.labels.add(strip_md(st[2:]))
            continue
        m = re.fullmatch(r"- \[([^\]]+)\]\(([^)\s]+)\)(?::\s*(.*))?", st)
        if m:
            res.labels.add(m.group(1))
            if m.group(3):
                res.short(where, m.group(3))
            continue
        if st.startswith(">"):
            st = st.lstrip("> ")
        if not re.sub(r"[\s·,;]", "", LINK.sub("", st)):
            res.labels.add(strip_md(st))      # link-only line
            continue
        res.prose(where, st)


def check_links(res):
    urls = []
    for path in (MD, LLMS):
        for i, line in enumerate(path.read_text().split("\n"), 1):
            for _, url in LINK.findall(line):
                urls.append(url)
                if not url.startswith("https://"):
                    res.errors.append(f"{path.name}:{i}: link is not absolute https: {url}")
                elif url.startswith(SITE):
                    rel = url[len(SITE):].split("#", 1)[0] or "index.html"
                    if not (ROOT / rel).is_file():
                        res.errors.append(f"{path.name}:{i}: project-page link has no file in the repo: {url}")
    return sorted(set(urls))


def html_rows():
    """Data rows of the baked static tables, rendered the way index.md renders cells."""
    page = PAGE.read_text()
    rows = []
    for block in re.findall(r"<!-- static-data:(\w+) -->(.*?)<!-- /static-data:\1 -->", page, re.S):
        for tbody in re.findall(r"<tbody>(.*?)</tbody>", block[1], re.S):
            for tr in re.findall(r"<tr>(.*?)</tr>", tbody, re.S):
                if 'scope="rowgroup"' in tr:
                    continue
                cells = []
                for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", tr, re.S):
                    c = re.sub(r"<sub>(.*?)</sub>", r"_\1", c)
                    c = re.sub(r'<a href="([^"]+)"[^>]*>(.*?)</a>', lambda m: f"[{m.group(2)}]({html.unescape(m.group(1))})", c)
                    c = html.unescape(re.sub(r"<[^>]+>", "", c))
                    cells.append(re.sub(r"\s+", " ", c).strip().replace("|", "\\|"))
                rows.append("| " + " | ".join(cells) + " |")
    return rows


def md_rows():
    rows, in_code = [], False
    lines = MD.read_text().split("\n")
    for i, line in enumerate(lines):
        if line.startswith("```"):
            in_code = not in_code
        if in_code or not line.startswith("|") or re.fullmatch(r"\|(-+\|)+", line):
            continue
        is_header = i + 1 < len(lines) and re.fullmatch(r"\|(-+\|)+", lines[i + 1])
        if not is_header and not line.startswith("| **"):
            rows.append(line)
    return rows


def check_tables(res):
    want, have = html_rows(), md_rows()
    stats_rows = [r for r in have if r not in want]
    missing = [r for r in want if r not in have]
    for r in missing:
        res.errors.append(f"index.md: table row missing or different: {r}")
    # extra rows: only the headline-results strip is allowed outside the static tables
    page_stats = len(re.findall(r'class="stat"', PAGE.read_text()))
    if len(stats_rows) != page_stats:
        res.errors.append(f"index.md: {len(stats_rows)} data rows not from static tables (expected {page_stats}, the stats strip)")
    return len(want), len(have)


def bib_from_page():
    m = re.search(r'<pre id="bibtex"[^>]*><code>(.*?)</code></pre>', PAGE.read_text(), re.S)
    return html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip("\n") + "\n"


def check_llms(res):
    lines = LLMS.read_text().split("\n")
    title = html.unescape(re.search(r"<title>(.*?)</title>", PAGE.read_text(), re.S).group(1)).strip()
    if lines[0] != f"# {title}":
        res.errors.append(f"llms.txt: first line must be '# {title}'")
    body = [l for l in lines[1:] if l.strip()]
    if not body or not body[0].startswith("> "):
        res.errors.append("llms.txt: the H1 must be followed by a '> ' blockquote")
    heads = [l[3:] for l in lines if l.startswith("## ")]
    if heads != LLMS_SECTIONS:
        res.errors.append(f"llms.txt: H2 sections {heads} != {LLMS_SECTIONS}")
    if any(re.match(r"#{3,} ", l) for l in lines):
        res.errors.append("llms.txt: headings below H2 are not allowed")
    in_lists = False
    for i, l in enumerate(lines, 1):
        if l.startswith("## "):
            in_lists = True
            continue
        if in_lists and l.strip() and not re.fullmatch(r"- \[[^\]]+\]\(https://[^)\s]+\)(: .+)?", l):
            res.errors.append(f"llms.txt:{i}: not a file-list item: {l}")


def online(urls):
    print("\nonline link check:")
    for url in urls:
        if url.startswith(SITE):
            print(f"  (local file ok) {url}")
            continue
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (link check)"})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                code = r.status
        except urllib.error.HTTPError as e:
            code = e.code
        except Exception as e:  # noqa: BLE001
            code = type(e).__name__
        print(f"  {code} {url}")


def main():
    res = Result()
    for p in (MD, LLMS, BIB):
        if not p.is_file():
            print(f"missing {p.name}: run tools/seo/build_llms.py")
            return 1
    scan(MD, res)
    scan(LLMS, res)
    urls = check_links(res)
    n_want, n_have = check_tables(res)
    check_llms(res)
    if BIB.read_text() != bib_from_page():
        res.errors.append("quasar.bib differs from the page's #bibtex block")
    md = MD.read_text()
    counts = {m: len(re.findall(r"(?<![\w-])" + re.escape(m) + r"(?![\w-])", md)) for m in METHODS}
    for m, n in counts.items():
        if n == 0:
            res.errors.append(f"index.md: method name missing: {m}")

    for p in (MD, LLMS, BIB):
        print(f"{p.name:10s} {len(p.read_bytes()):7d} bytes")
    print(f"verbatim prose sentences: {len(res.ok)}")
    print(f"NON-verbatim prose sentences: {len(res.bad)}")
    for s in res.bad:
        print("  ✗", s)
    print(f"static-table data rows: {n_want} in index.html, all present in index.md: {not any('row missing' in e for e in res.errors)}"
          f" ({n_have} data rows in index.md incl. the stats strip)")
    print(f"links: {len(urls)} unique, all absolute https: {not any('not absolute' in e for e in res.errors)}")
    print("method names in index.md: " + ", ".join(f"{m} {n}" for m, n in counts.items()))
    print(f"errors: {len(res.errors)}")
    for e in res.errors:
        print("  ✗", e)
    words = sorted(l for l in res.labels if re.search(r"[A-Za-z]", l))
    print(f"\nlabels (exempt, {len(res.labels)} unique; {len(res.labels) - len(words)} numeric cells not shown):")
    for l in words:
        print("  ·", l)
    if "-v" in sys.argv:
        print("\nverbatim:")
        for s in res.ok:
            print("  ✓", s)
    if "--online" in sys.argv:
        online(urls)
    return 1 if (res.bad or res.errors) else 0


if __name__ == "__main__":
    sys.exit(main())
