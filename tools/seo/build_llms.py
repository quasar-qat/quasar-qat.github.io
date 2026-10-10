#!/usr/bin/env python3
"""Generate /index.md, /llms.txt and /quasar.bib from index.html (stdlib only, idempotent).

LLM tools and most AI fetchers do not run JavaScript, and GitHub Pages does no content negotiation,
so the site ships a plain Markdown copy of the page plus an llms.txt (https://llmstxt.org) that
points to it. Everything is extracted from index.html itself, so re-running keeps the files in sync:

  index.md    title, authors + affiliations, links, the abstract, then every visible block of the
              page in order (section headings, paragraphs, figure/table labels and captions, the
              headline-results strip; a figure's H4 label is its data-md-label, else its kicker,
              else the caption's bold lead when the only tag is "illustrative", else its first
              static table's label), each baked static data table (<!-- static-data:KEY -->,
              written by build_static_tables.py; label from its <p id> via aria-labelledby) as a
              Markdown table at its position, the code blocks verbatim and the BibTeX. Parenthetical
              cross-references to the paper's numbering ("(Table 1)") are dropped from prose.
              Skipped: <head>, scripts/styles/svg, nav/header/footer, buttons, the hero video,
              JS mount points, <noscript>, and hidden content ([hidden], aria-hidden="true", inert,
              display:none, and .sr-only blocks other than the static data tables).
  llms.txt    H1 title, a blockquote and paragraphs made of verbatim paper sentences (each asserted
              against tools/paper_plain.txt, cross-references dropped), then H2 link lists (Paper,
              Code, Models, Project page, Optional). Link notes are labels.
  quasar.bib  the exact text of the page's #bibtex block.

Run build_static_tables.py first whenever assets/data/ changes. Verify with tools/seo/check_md_text.py.

usage: python3 tools/seo/build_llms.py [--check]   (--check: exit 1 if any output is stale, write nothing)
"""
import html
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAGE = ROOT / "index.html"
PLAIN = ROOT / "tools" / "paper_plain.txt"
CKPT = json.loads((ROOT / "assets" / "data" / "checkpoints.json").read_text())
OUT_MD = ROOT / "index.md"
OUT_LLMS = ROOT / "llms.txt"
OUT_BIB = ROOT / "quasar.bib"

CODE_LICENSE = "Apache-2.0"          # LICENSE of github.com/vincentcounathe/quasar-qat
COLLECTION_NAME = "All QUASAR Models"
ARXIV_VERSION = "v2"                 # the paper version the page reproduces

VOID = {"br", "img", "input", "meta", "link", "source", "hr", "wbr", "area", "base", "col", "embed",
        "param", "track"}
SKIP_TAGS = {"head", "script", "style", "svg", "math", "button", "video", "audio", "noscript", "template",
             "nav", "header", "footer", "select", "option", "label", "canvas", "iframe", "object", "img",
             "picture", "input", "textarea"}


# ------------------------------------------------------------------ DOM
class Node:
    __slots__ = ("tag", "attrs", "children", "parent")

    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.children, self.parent = tag, attrs, [], parent

    def cls(self):
        return (self.attrs.get("class") or "").split()

    def has(self, c):
        return c in self.cls()

    def elements(self):
        return [c for c in self.children if isinstance(c, Node)]

    def iter(self):
        for c in self.elements():
            yield c
            yield from c.iter()

    def find(self, pred):
        return next((n for n in self.iter() if pred(n)), None)

    def find_all(self, pred):
        return [n for n in self.iter() if pred(n)]

    def raw_text(self):
        return "".join(c if isinstance(c, str) else c.raw_text() for c in self.children)


class Tree(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.root = self.cur = Node("#root", {}, None)
        self.feed(text)
        self.close()

    def handle_starttag(self, tag, attrs):
        n = Node(tag, dict(attrs), self.cur)
        self.cur.children.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        self.cur.children.append(Node(tag, dict(attrs), self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not self.root and n.tag != tag:
            n = n.parent
        if n is not self.root:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.children.append(data)


def hidden(n):
    a = n.attrs
    style = (a.get("style") or "").replace(" ", "").lower()
    return ("hidden" in a or a.get("aria-hidden") == "true" or "inert" in a or "display:none" in style
            or "visibility:hidden" in style or n.has("skip")
            or (n.has("sr-only") and "data-static-sr" not in a))


def skipped(n):
    return n.tag in SKIP_TAGS or hidden(n)


# ------------------------------------------------------------------ inline Markdown
SITE = None   # canonical URL, set in main()


def absurl(href):
    if re.match(r"https?://", href):
        return href
    if href.startswith("#"):
        return SITE + href
    return SITE + href.lstrip("./")


def ws(s):
    return re.sub(r"\s+", " ", s).strip()


def wrap(s, mark):
    core = s.strip()
    if not core:
        return s
    lead = s[:len(s) - len(s.lstrip())]
    trail = s[len(s.rstrip()):]
    return f"{lead}{mark}{core}{mark}{trail}"


def inline(n, bold=True, exclude=()):
    out = []
    for c in n.children:
        if isinstance(c, str):
            out.append(c)
            continue
        if c in exclude or skipped(c):
            continue
        if c.tag == "br":
            out.append(" ")
            continue
        inner = inline(c, bold, exclude)
        if c.tag in ("b", "strong"):
            out.append(wrap(inner, "**") if bold else inner)
        elif c.tag == "sub":
            out.append("_" + inner.strip())
        elif c.tag == "a" and c.attrs.get("href"):
            out.append(f"[{ws(inner)}]({absurl(c.attrs['href'])})" if ws(inner) else "")
        else:
            out.append(inner)
    return "".join(out)


def text(n, bold=True, exclude=()):
    return ws(inline(n, bold, exclude)) if n is not None else ""


def esc_cell(s):
    return s.replace("|", "\\|")


# ------------------------------------------------------------------ verbatim paper sentences
def _norm(s):
    s = html.unescape(s)
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = s.replace(" ", " ").replace(" ", " ").replace(" ", " ")
    s = s.replace("_", "").replace("{", "").replace("}", "")
    return re.sub(r"\s+", " ", s).strip()


PAPER = _norm(PLAIN.read_text())


def in_paper(s):
    return _norm(s).rstrip(".;:,") in PAPER


# parenthetical cross-references to the paper's own numbering: "(Section 3.1)", "(Table 1)",
# "(Appendix A, Figure 5)". They point nowhere on the project page, so copied sentences drop them.
XREF = re.compile(r"\s*\((?:see\s+)?(?:Sections?|Sec\.|Tables?|Figures?|Figs?\.|Appendix|Appendices|Eqs?\.|"
                  r"Equations?|Theorems?|Lemmas?|Corollary|Corollaries|Propositions?|Definitions?|Algorithms?)"
                  r"\s[^()]*\)")


def drop_xrefs(s):
    return XREF.sub("", s)


def verbatim(*sents):
    """Join paper sentences into one paragraph, asserting each is copied verbatim. Cross-references
    are dropped; the result must still be verbatim (a contiguous span of the paper), so only a
    trailing reference may go. A sentence with a reference inside it must be replaced by another."""
    out = []
    for s in sents:
        assert in_paper(s), f"not verbatim in paper_plain.txt: {s!r}"
        t = drop_xrefs(s)
        assert in_paper(t), f"cross-reference inside the sentence, pick another one: {s!r}"
        out.append(t)
    return " ".join(out)


# ------------------------------------------------------------------ blocks
def split_label(caption):
    """'Table 1 · Qwen3-4B · INT2. <paper sentence>' -> ('Table 1 · Qwen3-4B · INT2.', '<paper sentence>')."""
    for m in re.finditer(r"\. ", caption):
        rest = caption[m.end():]
        if in_paper(rest):
            return caption[:m.end() - 1], rest
    return caption, ""


def table_md(t, cap=None):
    """cap: the element labelling the table (<p id> named by aria-labelledby), else its <caption>."""
    cap = cap or t.find(lambda x: x.tag == "caption")
    label, sent = split_label(text(cap, bold=False)) if cap else ("", "")
    thead = t.find(lambda x: x.tag == "thead")
    hrows = [r for r in thead.iter() if r.tag == "tr"] if thead else []
    grid = []
    for r in hrows:
        row = []
        for c in r.elements():
            if c.tag not in ("th", "td"):
                continue
            assert "rowspan" not in c.attrs, "rowspan not supported"
            row += [text(c, bold=False)] * int(c.attrs.get("colspan") or 1)
        grid.append(row)
    ncol = len(grid[-1]) if grid else 0
    assert all(len(r) == ncol for r in grid), f"ragged header in {label!r}"
    head = []
    for j in range(ncol):
        parts = []
        for r in grid:
            if r[j] and r[j] not in parts:
                parts.append(r[j])
        head.append(" · ".join(parts))
    body = []
    for tb in t.elements():
        if tb.tag not in ("tbody", "tfoot"):
            continue
        for r in tb.elements():
            if r.tag != "tr":
                continue
            cells = [c for c in r.elements() if c.tag in ("th", "td")]
            if cells and cells[0].attrs.get("scope") == "rowgroup":
                assert not any(text(c) for c in cells[1:]), f"rowgroup row with data in {label!r}"
                row = ["**" + text(cells[0], bold=False) + "**"] + [""] * (ncol - 1)
            else:
                row = []
                for c in cells:
                    row += [text(c, bold=False)] + [""] * (int(c.attrs.get("colspan") or 1) - 1)
            assert len(row) == ncol, f"row width {len(row)} != {ncol} in {label!r}: {row}"
            body.append(row)
    lines = []
    if label:
        lines.append(f"**{label}**" + (f" {sent}" if sent else ""))
        lines.append("")
    lines.append("| " + " | ".join(esc_cell(h) for h in head) + " |")
    lines.append("|" + "---|" * ncol)
    for row in body:
        lines.append("| " + " | ".join(esc_cell(c) for c in row) + " |")
    return "\n".join(lines), len(body)


def tables_md(div, stats):
    out = []
    for t in div.find_all(lambda x: x.tag == "table"):
        ref = t.attrs.get("aria-labelledby")
        cap = div.find(lambda x: x.attrs.get("id") == ref) if ref else None
        assert cap is not None or not ref, f"aria-labelledby={ref!r} has no element"
        md, nrows = table_md(t, cap)
        out.append(md)
        stats["tables"] += 1
        stats["rows"] += nrows
    return out


def stats_md(div):
    rows = []
    for st in div.find_all(lambda x: x.has("stat")):
        v = st.find(lambda x: x.has("v"))
        value = " ".join(ws(s) for s in _strings(v) if ws(s))
        desc = text(st.find(lambda x: x.has("l")))
        ctx = st.find(lambda x: x.has("ctx"))
        setting = " · ".join(text(s) for s in ctx.elements()) if ctx else ""
        rows.append((value, desc, setting))
    lines = ["| Result | Measure | Setting |", "|---|---|---|"]
    lines += ["| " + " | ".join(esc_cell(c) for c in r) + " |" for r in rows]
    return "\n".join(lines)


def _strings(n):
    for c in n.children:
        if isinstance(c, str):
            yield c
        elif not skipped(c):
            yield from _strings(c)


def formula_md(div):
    def ftext(n):
        out = []
        for c in n.children:
            if isinstance(c, str):
                out.append(c)
            elif c.has("frac"):
                out.append("(" + "/".join(ws(x.raw_text()) for x in c.elements()) + ")")
            elif c.tag == "sup":
                out.append("^" + ftext(c).strip())
            elif c.tag == "sub":
                out.append("_" + ftext(c).strip())
            elif not skipped(c):
                out.append(ftext(c))
        return "".join(out)
    lines = [ws(ftext(c)) for c in div.elements()]
    return "```text\n" + "\n".join(l for l in lines if l) + "\n```"


def code_md(div):
    bar = div.find(lambda x: x.has("bar"))
    lang = ""
    if bar:
        sp = bar.find(lambda x: x.tag == "span")
        lang = ws(sp.raw_text()) if sp else ""
    pre = div.find(lambda x: x.tag == "pre")
    body = pre.raw_text().strip("\n")
    assert "```" not in body
    return f"```{lang}\n{body}\n```"


def links_md(n):
    links = [text(a) for a in n.find_all(lambda x: x.tag == "a" and x.attrs.get("href"))]
    links = [f"[{l}]({absurl(a.attrs['href'])})" for l, a in
             zip(links, n.find_all(lambda x: x.tag == "a" and x.attrs.get("href"))) if l]
    return " · ".join(links)


def heading_md(h):
    level = int(h.tag[1])
    parts = []
    for c in h.children:
        if isinstance(c, str):
            parts.append(c)
        elif not skipped(c):
            t = inline(c, bold=False)
            parts.append(t.strip() + " " if c.has("n") else t)
    return "#" * level + " " + ws("".join(parts))


def figure_md(fig, stats, consumed):
    out = []
    kick = fig.find(lambda x: x.has("viz-kicker"))
    cap = fig.find(lambda x: x.tag == "figcaption")
    tag = cap.find(lambda x: x.has("tag")) if cap else None
    label = [text(kick, bold=False)] if kick else []
    if tag:
        label.append(text(tag, bold=False))
    md_label = ws(fig.attrs.get("data-md-label") or "")
    lead = None
    if md_label:               # explicit label on the <figure> (e.g. the training-overhead chart)
        label = [md_label]
    elif not kick and tag:     # a bare "illustrative" tag is no label: use the caption's bold lead
        lead = cap.find(lambda x: x.tag in ("b", "strong"))
        label = [text(lead, bold=False).rstrip(".")] if lead else []
    data = [d for d in fig.find_all(lambda x: "data-static-sr" in x.attrs) if not skipped(d)]
    tables = []
    for d in data:
        tables += tables_md(d, stats)
    if not label and tables:   # no kicker or data-md-label: label the figure by its first table
        first = tables[0].split("\n", 1)[0].strip("*")
        label = [split_label(first.split("**")[0])[0].rstrip(".")]
    if label:
        out.append("#### " + " · ".join(label))
    if cap:
        # the bold lead already serves as the H4, so the caption paragraph starts after it
        c = drop_xrefs(text(cap, exclude=tuple(x for x in (tag, lead) if x is not None)))
        if c:
            out.append(c)
    out += tables
    rest = []
    consumed |= {cap, *data} - {None}
    walk_children(fig, rest, stats, consumed, skip_viz=True)
    return out + rest


def walk_children(n, out, stats, consumed, skip_viz=False):
    for c in n.children:
        if isinstance(c, str):
            if c.strip():
                out.append(ws(c))
            continue
        if c in consumed or skipped(c) or (skip_viz and c.has("viz")):
            continue
        walk(c, out, stats, consumed)


def walk(c, out, stats, consumed):
    if c.tag == "h1":
        return
    if c.tag in ("h2", "h3", "h4", "h5", "h6"):
        out.append(heading_md(c))
    elif c.tag == "figure":
        out += figure_md(c, stats, consumed)
    elif c.tag == "p":
        t = drop_xrefs(text(c))
        if t:
            out.append(t)
    elif "data-static-sr" in c.attrs:
        out += tables_md(c, stats)
    elif c.has("stats"):
        out.append(stats_md(c))
    elif c.has("formulas"):
        out.append(formula_md(c))
    elif c.has("code") and c.find(lambda x: x.tag == "pre"):
        out.append(code_md(c))
    elif c.has("links"):
        t = links_md(c)
        if t:
            out.append(t)
    elif c.tag == "section":
        if not c.find(lambda x: x.tag == "h2"):
            name = c.attrs.get("aria-label") or ("Overview" if c.has("hero") else "")
            if name:
                out.append("## " + name)
        walk_children(c, out, stats, consumed)
    else:
        walk_children(c, out, stats, consumed)


# ------------------------------------------------------------------ page metadata
def meta(root, name):
    return [n.attrs.get("content", "") for n in root.find_all(lambda x: x.tag == "meta" and x.attrs.get("name") == name)]


def page_info(root):
    title = ws(root.find(lambda x: x.tag == "title").raw_text())
    canon = root.find(lambda x: x.tag == "link" and x.attrs.get("rel") == "canonical").attrs["href"]
    affils = {}
    for sp in root.find(lambda x: x.has("affils")).elements():
        sup = sp.find(lambda x: x.tag == "sup")
        affils[ws(sup.raw_text())] = ws(inline(sp, exclude=(sup,)))
    authors = []
    for a in root.find(lambda x: x.has("authors")).find_all(lambda x: x.has("a")):
        sup = a.find(lambda x: x.tag == "sup")
        nums = [s.strip() for s in ws(sup.raw_text()).split(",")] if sup else []
        authors.append((ws(inline(a, exclude=(sup,))), [affils[k] for k in nums]))
    hero_links = {}
    for a in root.find(lambda x: x.tag == "nav" and x.has("links")).find_all(lambda x: x.tag == "a"):
        hero_links[text(a)] = a.attrs["href"]
    abstract = root.find(lambda x: x.tag == "details" and x.has("abstract"))
    bib = root.find(lambda x: x.tag == "pre" and x.attrs.get("id") == "bibtex")
    return dict(
        title=title, canon=canon, authors=authors, affils=list(affils.values()), links=hero_links,
        arxiv=meta(root, "citation_arxiv_id")[0], doi=meta(root, "citation_doi")[0],
        pdf=meta(root, "citation_pdf_url")[0], abstract=abstract,
        abstract_text=text(abstract.find(lambda x: x.has("body"))), bib=bib.raw_text().strip("\n") + "\n",
    )


def authors_line(info):
    return ", ".join(f"{n} ({', '.join(a)})" if a else n for n, a in info["authors"])


def bare(url):
    return url.split("://", 1)[1].rstrip("/")


# ------------------------------------------------------------------ outputs
def build_md(root, info):
    L = info["links"]
    site = info["canon"]
    head = [
        f"# {info['title']}",
        "\n".join([
            f"- **Authors:** {authors_line(info)}",
            f"- **Paper:** [arXiv:{info['arxiv']}]({L['Paper']})",
            f"- **PDF:** [{bare(info['pdf'])}]({info['pdf']}) · [{bare(L['PDF'])}]({L['PDF']})",
            f"- **DOI:** [{info['doi']}](https://doi.org/{info['doi']})",
            f"- **Code:** [{bare(L['Code'])}]({L['Code']}) ({CODE_LICENSE})",
            f"- **Models:** [{COLLECTION_NAME}]({L['Models']}) · [{bare(CKPT['org'])}]({CKPT['org']})",
            f"- **Project page:** [{bare(site)}]({site})",
            f"- **BibTeX:** [quasar.bib]({site}quasar.bib)",
        ]),
        "## Abstract",
        info["abstract_text"],
    ]
    out, stats = [], {"tables": 0, "rows": 0}
    consumed = {info["abstract"]}
    consumed |= set(root.find_all(lambda x: x.has("authors") or x.has("affils")))
    main = root.find(lambda x: x.tag == "main")
    walk_children(main, out, stats, consumed)
    md = "\n\n".join(head + out) + "\n"
    md = re.sub(r"\n{3,}", "\n\n", md)
    return md, stats


def build_llms(info):
    L = info["links"]
    site = info["canon"]
    abstract = info["abstract_text"]
    sents = re.split(r"(?<=[.!?])\s+(?=[A-Z])", abstract)
    assert all(in_paper(s) for s in sents)

    used = []

    def pick(*starts):
        got = []
        for st in starts:
            m = [s for s in sents if s.startswith(st)]
            assert len(m) == 1, st
            got.append(m[0])
        used.extend(got)
        return verbatim(*got)

    summary = pick("We introduce QUASAR", "At each training step")
    problem = pick("As large language model inference", "However, QAT has", "This mismatch can lead",
                   "Second-order PTQ methods")
    method = pick("We use an exponential moving average", "Our theoretical analysis")
    results = pick("We evaluate QUASAR across", "QUASAR consistently achieves", "At INT2, QUASAR improves",
                   "Notably, after distillation")
    assert sorted(used) == sorted(sents), "llms.txt must carry the whole abstract exactly once"
    setup = verbatim(
        "For healing, we apply QAD to Qwen3-4B-Thinking-2507 and Llama-3.1-8B-Instruct at INT2, INT3, and INT4 "
        "using Open-PerfectBlend data and logits from the full-precision teachers.",
        "For adaptation, we train all weights of Qwen3-4B-Base on OpenMathReasoning using cross-entropy.",
        "We also apply QAD in NVFP4 to Qwen3-8B, Qwen3.5-9B, and Muse-Glimmer-30B, and evaluate QUASAR against "
        "Google's QAT checkpoint, Gemma 4, and other independent checkpoints.",
    )
    # "We compare against Standard QAT (Section 3.1), LSQ, ..." carries a cross-reference mid-sentence,
    # so this paragraph opens with the paper's preceding sentence instead.
    baselines = verbatim(
        "Baselines in each experiment use the same data, objective, training budget, and tuned learning rate, "
        "with matched inference formats.",
        "Standard QAT uses fixed min–max ranges; LSQ learns the scales; Denoising QAT refits the dequantization "
        "parameters; BitDistiller combines clipping with self-distillation; RTN rounds to the nearest grid point; "
        "GPTQ minimizes a second-order reconstruction error; and AWQ protects activation-salient weights.",
    )
    evaluation = verbatim(
        "Our benchmark suites cover standard language understanding (MMLU, ARC, HellaSwag, WinoGrande, TruthfulQA, "
        "and IFEval); mathematical and scientific reasoning (MATH-500, GSM8K, AIME, HMMT, MMLU-Pro, SuperGPQA, and "
        "GPQA-Diamond); coding (LiveCodeBench and OJBench); and long-context performance (LongBench-v2, RULER, MRCR, "
        "and LongProc).",
    )
    deploy = verbatim(
        "QUASAR checkpoints use standard layouts supported by vLLM's quantization backends.",
        "In vLLM, Marlin and Machete serve INT4 weights, NVFP4 runs natively on Blackwell GPUs, and MXFP4 "
        "weight-only checkpoints are supported.",
        "QUASAR only adds 1.4% wall-clock step time compared with Standard QAT (2.97 and 2.93 seconds per step, "
        "respectively), with the overhead only coming from the weight reconstruction.",
    )
    models = [f"- [{COLLECTION_NAME}]({CKPT['collection']}): Hugging Face collection",
              f"- [{bare(CKPT['org'])}]({CKPT['org']}): Hugging Face organization"]
    for fam in CKPT["families"]:
        for m in fam["models"]:
            models.append(f"- [{m['repo']}](https://huggingface.co/{m['repo']}): {fam['name']} · {m['format']} · {m['runtime']}")
    parts = [
        f"# {info['title']}",
        f"> {summary}",
        "\n".join([
            f"- **Authors:** {authors_line(info)}",
            f"- **arXiv:** {info['arxiv']} · **DOI:** {info['doi']}",
        ]),
        problem, method, results, setup, baselines, evaluation, deploy,
        "## Paper\n\n" + "\n".join([
            f"- [arXiv:{info['arxiv']}]({L['Paper']}): arXiv abstract page",
            f"- [PDF]({info['pdf']}): arXiv v2 PDF, project-page copy",
            f"- [arXiv PDF]({L['PDF']})",
            f"- [arXiv HTML (full text)](https://arxiv.org/html/{info['arxiv']}{ARXIV_VERSION})",
            f"- [DOI {info['doi']}](https://doi.org/{info['doi']})",
            f"- [Hugging Face paper page](https://huggingface.co/papers/{info['arxiv']})",
        ]),
        "## Code\n\n" + f"- [{bare(L['Code'])}]({L['Code']}): {CODE_LICENSE}",
        "## Models\n\n" + "\n".join(models),
        "## Project page\n\n" + "\n".join([
            f"- [{bare(site)}]({site}): QUASAR project page",
            f"- [index.md]({site}index.md): full text and result tables",
        ]),
        "## Optional\n\n" + f"- [quasar.bib]({site}quasar.bib): BibTeX",
    ]
    return "\n\n".join(parts) + "\n"


def main():
    global SITE
    root = Tree(PAGE.read_text()).root
    info = page_info(root)
    SITE = info["canon"]
    assert SITE.startswith("https://") and SITE.endswith("/")
    md, stats = build_md(root, info)
    files = {OUT_MD: md, OUT_LLMS: build_llms(info), OUT_BIB: info["bib"]}
    page_tables = len(re.findall(r"<table\b", re.sub(r"<!--.*?-->", "", PAGE.read_text(), flags=re.S)))
    assert stats["tables"] == page_tables, f"index.md has {stats['tables']} tables, index.html {page_tables}"
    stale = []
    for path, body in files.items():
        old = path.read_text() if path.exists() else None
        state = "unchanged" if old == body else ("STALE" if "--check" in sys.argv else "written")
        if old != body:
            stale.append(path.name)
            if "--check" not in sys.argv:
                path.write_text(body)
        print(f"{path.name:10s} {len(body.encode()):7d} bytes  {state}")
    print(f"index.md: {stats['tables']} tables, {stats['rows']} data rows")
    return 1 if (stale and "--check" in sys.argv) else 0


if __name__ == "__main__":
    sys.exit(main())
