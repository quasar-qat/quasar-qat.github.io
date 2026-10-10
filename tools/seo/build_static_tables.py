#!/usr/bin/env python3
"""Bake complete, screen-reader-only data tables into index.html (stdlib only, idempotent).

Crawlers and LLM corpora (FineWeb/trafilatura, Common Crawl, most AI fetchers) do not run
JavaScript, so the charts' data never reaches them. This script writes the FULL data behind each
chart (every model x bit width x method x column) as plain HTML tables between the marker comments

    <!-- static-data:KEY --> ... <!-- /static-data:KEY -->

in index.html. Each non-empty region gets exactly one wrapper <div class="sr-only" data-static-sr data-label>
(data-static-sr="partial" where the chart's own screen-reader table carries data the static table
lacks, so assets/js/site.js keeps that one readable). Re-running replaces only what is between the
markers (the page is re-read right before writing). Nothing visible changes (.sr-only clips it).

Markup, chosen so extractors (trafilatura -> Markdown) and screen readers both read it cleanly: each
table is preceded by <p id="sd-KEY-N">caption</p> and carries aria-labelledby="sd-KEY-N" (no
<caption>); ONE header row of <th scope="col"> (column groups flattened into combined labels such as
"Accuracy (%) ↑ · Hard reasoning and coding · HMMT'26"; no colspan/rowspan); row headers
<th scope="row">; a row group (e.g. GGUF) is a <th scope="rowgroup"> row padded with empty cells.

Inputs: assets/data/{results,theory,checkpoints}.json and tools/paper_plain.txt.
Captions are a short label, optionally followed by the FIRST sentence of the paper's caption, copied
verbatim (asserted against paper_plain.txt); in a multi-table set only the first table carries the
sentence. Numbers are printed at the paper's typeset precision (figure tables: as plotted).
The fig3 markers are left empty on purpose: its in-loop KL differs from the Table 1/6 basis.

Optional check against the paper: set QUASAR_ARXIV_SRC to the unpacked arXiv 2608.13966v2 source.
Every printed table row (method and its cells, in column order) must then occur in the LaTeX table
it came from; the script exits non-zero otherwise.

usage: python3 tools/seo/build_static_tables.py [--check]   (--check: verify only, do not write)
"""
import html
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "assets" / "data"
PAGE = ROOT / "index.html"
PLAIN = ROOT / "tools" / "paper_plain.txt"

R = json.loads((DATA / "results.json").read_text())
THEORY = json.loads((DATA / "theory.json").read_text())
CKPT = json.loads((DATA / "checkpoints.json").read_text())

DASH = "–"      # missing value, as the paper's "--"
MINUS = "−"     # typeset minus
OURS = "QUASAR (ours)"
SUP = str.maketrans("-0123456789", "⁻⁰¹²³⁴⁵⁶⁷⁸⁹")
BITS = ["INT2", "INT3", "INT4"]


# ------------------------------------------------------------------ verbatim captions
def _norm(s):
    s = html.unescape(s)
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = s.replace("\u00a0", " ").replace("\u2009", " ").replace("\u202f", " ")
    s = s.replace("_", "").replace("{", "").replace("}", "")
    return re.sub(r"\s+", " ", s).strip()


PAPER = _norm(PLAIN.read_text())
SENT = {}


def sentence(start):
    """First sentence of a paper caption, located by its opening words and returned verbatim."""
    if start not in SENT:
        raw = PLAIN.read_text()
        i = raw.find(start)
        assert i >= 0, f"caption not in paper_plain.txt: {start!r}"
        m = re.search(r"[.!?](?=\s|$)", raw[i:])
        s = raw[i:i + m.end()]
        assert _norm(s) in PAPER
        SENT[start] = s
    return SENT[start]


def cap(label, first=None):
    return label + (". " + sentence(first) if first else "")


def caps(labels, first):
    """Captions for a multi-table set: the paper sentence on the first table only."""
    return [cap(l, first if i == 0 else None) for i, l in enumerate(labels)]


# ------------------------------------------------------------------ number formats (paper precision)
def f1(v):
    return DASH if v is None else f"{v:.1f}"


def f3(v):
    return DASH if v is None else f"{v:.3f}"


def kl_dot(v):      # Tables 3 and 11 print KL without the leading zero: .053
    return DASH if v is None else f"{v:.3f}".lstrip("0")


def bpw(v):
    return "16" if v == 16 else f"{v:.2f}"


def ppl(v):         # Table 2: 1.59 / 130 / 3.5x10^5
    if v is None:
        return DASH
    if v >= 1e4:
        e = len(str(int(v))) - 1
        return f"{v / 10 ** e:.1f}×10" + str(e).translate(SUP)
    return f"{v:.0f}" if v >= 100 else f"{v:.2f}"


def signed2(v):
    s = f"{abs(v):.2f}"
    return ("+" if v >= 0 else MINUS) + s


def kl_plot(v):     # plotted KL (figures): 3 decimals below 1, 2 above (divergent cells)
    return DASH if v is None else (f"{v:.2f}" if v >= 1 else f"{v:.3f}")


def kl4(v):         # Fig. 25 plots 4-decimal values (0.2615, 0.1675 would tie-round at 3)
    return DASH if v is None else f"{v:.4f}"


def sci3(v):        # plotted reconstruction error, 3 significant digits
    m, e = f"{v:.2e}".split("e")
    return f"{m}×10" + str(int(e)).translate(SUP)


def method(m):
    return OURS if m == "QUASAR" else m


# ------------------------------------------------------------------ HTML
class Raw(str):
    """Cell content that is already HTML."""


def e(s):
    return s if isinstance(s, Raw) else html.escape(str(s), quote=False)


SID = {"key": None, "n": 0}   # caption ids: sd-KEY-N, numbered per marker region by main()


def flat_head(head):
    """Header rows (each cell a str, or (text, colspan) for a column group, "" = no group) -> one
    label per column, the group labels joined top-down with " · "."""
    grid = []
    for hr in head:
        row = []
        for c in hr:
            t, n = c if isinstance(c, tuple) else (c, 1)
            row += [t] * n
        grid.append(row)
    ncol = len(grid[-1])
    assert all(len(r) == ncol for r in grid), f"ragged header: {head}"
    out = []
    for j in range(ncol):
        parts = []
        for r in grid:
            if r[j] and r[j] not in parts:
                parts.append(r[j])
        out.append(parts[0] if len(parts) == 1 else Raw(" · ".join(e(p) for p in parts)))
    return out


def table(caption, head, rows, groups=None):
    """caption -> <p id> + aria-labelledby. head: header rows, flattened into ONE row of
    <th scope="col"> (see flat_head). rows: [row header, cell, ...]. groups: optional list of
    (label or None, rows) rendered as separate <tbody> sections (label -> a padded rowgroup row)."""
    SID["n"] += 1
    sid = f"sd-{SID['key']}-{SID['n']}"
    cols = flat_head(head)
    out = [f'<p id="{sid}">{e(caption)}</p>', f'<table aria-labelledby="{sid}">', "<thead>",
           "<tr>" + "".join(f'<th scope="col">{e(c)}</th>' for c in cols) + "</tr>", "</thead>"]
    for label, rs in (groups if groups is not None else [(None, rows)]):
        out.append("<tbody>")
        if label:
            out.append(f'<tr><th scope="rowgroup">{e(label)}</th>' + "<td></td>" * (len(cols) - 1) + "</tr>")
        for r in rs:
            assert len(r) == len(cols), f"row width {len(r)} != {len(cols)} in {caption!r}: {r}"
            out.append(f'<tr><th scope="row">{e(r[0])}</th>' + "".join(f"<td>{e(c)}</td>" for c in r[1:]) + "</tr>")
        out.append("</tbody>")
    out.append("</table>")
    return "\n".join(out)


# ------------------------------------------------------------------ LaTeX cross-check
CHECKS = []   # (tex file, row cells)


def expect(tex, cells):
    CHECKS.append((tex, [str(c) for c in cells]))


def _clean_tex(s):
    s = re.sub(r"\\rowcolor\{[^}]*\}(\[[^\]]*\])*", " ", s)
    s = re.sub(r"\\arrayrulecolor\{[^}]*\}", " ", s)
    s = re.sub(r"\\cmidrule(\[[^\]]*\])?(\([^)]*\))?\{[^}]*\}", " ", s)
    s = re.sub(r"\\(midrule|toprule|bottomrule|addlinespace)(\[[^\]]*\])?", " ", s)
    s = re.sub(r"\\cellcolor\{[^}]*\}", "", s)
    s = re.sub(r"\\multirow\{[^}]*\}\{[^}]*\}\{([^}]*)\}", r"\1", s)
    for _ in range(2):
        s = re.sub(r"\\(textbf|underline|textit)\{([^{}]*)\}", r"\2", s)
    s = re.sub(r"\$\^\{\\ddagger\}\$", "‡", s)
    s = re.sub(r"\$([0-9.]+)\{\\times\}10\^\{(\d+)\}\$", lambda m: m.group(1) + "×10" + m.group(2).translate(SUP), s)

    def math(m):
        return re.sub(r"(?<![\w.])-(?=\d)", MINUS, m.group(1))
    s = re.sub(r"\\\((.*?)\\\)", math, s)
    s = re.sub(r"\$([^$]*)\$", math, s)
    s = s.replace("\\%", "%").replace("\\_", "_").replace("\\ ", " ").replace("~", " ").replace("{,}", ",")
    s = s.replace("--", DASH)
    return s


def tex_rows(path):
    t = path.read_text()
    rows = []
    for body in re.findall(r"\\begin\{tabular\}.*?\n(.*?)\\end\{tabular\}", t, re.S):
        for chunk in body.split("\\\\"):
            cells = [re.sub(r"\s+", " ", c).strip() for c in _clean_tex(chunk).split("&")]
            rows.append([c for c in cells if c])
    return rows


def run_checks():
    src = os.environ.get("QUASAR_ARXIV_SRC")
    if not src or not Path(src).is_dir():
        print("LaTeX cross-check skipped (set QUASAR_ARXIV_SRC to the unpacked arXiv v2 source)")
        return True
    cache, bad = {}, []
    for tex, cells in CHECKS:
        rows = cache.setdefault(tex, tex_rows(Path(src) / tex))
        name, vals = cells[0], cells[1:]
        n = len(vals)
        ok = any(name in r and any(r[i:i + n] == vals for i in range(len(r) - n + 1)) for r in rows)
        if not ok:
            bad.append(f"{tex}: {cells}")
    print(f"LaTeX cross-check: {len(CHECKS) - len(bad)}/{len(CHECKS)} printed rows found verbatim in the v2 source")
    for b in bad:
        print("  MISMATCH", b)
    return not bad


# ------------------------------------------------------------------ sections
def healing(key, tex, first, label_no):
    T = R["healing"][key]
    specs = []
    for model, cols in T["columns"].items():
        blk = T["models"][model]
        head = [["Method"] + [{"KL": "KL ↓", "Top-1": "Top-1 ↑"}.get(c, c) for c in cols]]
        for bits in BITS:
            rows = []
            for r in blk["full_precision"] + blk[bits]:
                v = r["values"]
                cells = [f3(v["KL"])] + [f1(v[c]) for c in cols[1:]]
                rows.append([method(r["method"])] + cells)
                expect(tex, [method(r["method"])] + cells)
            specs.append((f"Table {label_no} · {model} · {bits}", head, rows))
    return [table(c, h, rs) for c, (_, h, rs) in zip(caps([s[0] for s in specs], first), specs)]


def table2():
    A = R["adaptation"]
    cols = A["columns"]
    head = [["Method", "PPL ↓"] + cols[1:]]
    out = []
    labels = caps([f"Table 2 · {A['model']} · {bits}" for bits in BITS], "Comparison of QAT and PTQ methods for adapting")
    for bits, label in zip(BITS, labels):
        rows = []
        for r in A["references"] + A["bits"][bits]:
            v = r["values"]
            cells = [ppl(v["PPL"])] + [f1(v[c]) for c in cols[1:]]
            rows.append([method(r["method"])] + cells)
            expect("adaptation_table.tex", [method(r["method"])] + cells)
        out.append(table(label, head, rows))
    return out


def table3():
    T = R["checkpoint_comparison_table3"]
    g = T["column_groups"]
    hard, longh = g["Hard reasoning and coding"], g["Long horizon"]
    bench = hard + longh
    head = [
        [("", 3), ("Fidelity", 2), ("Accuracy (%) ↑", len(bench) + 1)],
        [("", 5), ("Hard reasoning and coding", len(hard)), ("Long horizon", len(longh)), ("", 1)],
        ["Method", "Format", "bpw", "KL ↓", "Top-1 ↑"] + bench + ["Avg."],
    ]
    out = []
    labels = caps([f"Table 3 · {b['model']}" for b in T["blocks"]], "Comparison of QUASAR with QAT and PTQ baselines")
    for b, label in zip(T["blocks"], labels):
        groups = [[], []]
        for r in b["rows"]:
            v = r["values"]
            cells = [r["format"], bpw(v["bpw"]), kl_dot(v["KL"]), f1(v["Top-1"])] + [f1(v[c]) for c in bench] + [f1(v["Avg."])]
            row = [method(r["method"])] + cells
            groups[r["format"].startswith("GGUF")].append(row)
            expect("merged_table.tex", row)
        groups = [(None, rs) for rs in groups if rs]
        out.append(table(label, head, None, groups))
    return out


def table4():
    O = R["training_overhead"]
    rows = []
    for r in O["rows"]:
        if r["component"].startswith("%"):
            cells = [DASH if r["standard_qat_s"] is None else f"+{r['standard_qat_s']:.1f}%", f"+{r['quasar_s']:.1f}%"]
        else:
            cells = [f3(r["standard_qat_s"]), f3(r["quasar_s"])]
        rows.append([r["component"]] + cells)
        expect("appendix_method.tex", [r["component"]] + cells)
    return [table(cap("Table 4", "Wall-clock time of one training step"), [["Component", "Standard QAT", "QUASAR"]], rows)]


def table7():
    J = R["llm_judge_int2"]
    models = ["Qwen3-4B-Thinking-2507", "Llama-3.1-8B-Instruct"]
    head = [[("", 1)] + [(m, 2) for m in models], ["vs. QUASAR"] + ["mean", "95% CI"] * len(models)]
    rows = []
    for r in J["rows"]:
        cells, chk = [], [r["vs"]]
        for m in models:
            c = r[m]
            mean, ci = signed2(c["mean"]), f"[{signed2(c['ci95'][0])}, {signed2(c['ci95'][1])}]"
            cells += [mean, ci]
            chk.append(f"{mean} {ci}")
        rows.append([r["vs"]] + cells)
        expect("appendix_healing.tex", chk)
    return [table(cap(f"Table 7 · INT2 · judge {J['judge']}", "QUASAR wins all 14 comparisons"), head, rows)]


def table10():
    N = R["nvfp4"]["non_termination"]
    cols = N["columns"]
    out = []
    labels = caps([f"Table 10 · {model} · NVFP4" for model in N["models"]],
                  "QUASAR has the lowest or tied-lowest non-termination rate")
    for (model, rs), label in zip(N["models"].items(), labels):
        rows = []
        for r in rs:
            cells = [f1(r["values"][c]) for c in cols]
            rows.append([method(r["method"])] + cells)
            expect("nvfp4_longctx_tables.tex", [method(r["method"])] + cells)
        out.append(table(label, [["Method"] + cols], rows))
    return out


def table11():
    T = R["released_checkpoints_table11"]
    out = []
    for i, (model, M) in enumerate(T["models"].items()):
        bench = [c for c in M["columns"] if c not in ("bpw", "KL", "Top-1", "Avg.")]
        head = [
            [("", 3), ("Fidelity", 2), ("Accuracy (%) ↑", len(bench) + 1)],
            ["Model", "Format", "bpw", "KL ↓", "Top-1 ↑"] + bench + ["Avg."],   # first column as the paper prints it
        ]
        sents = [sentence("Comparison with released 4-bit checkpoints")] if i == 0 else []
        if any("‡" in r["format"] for rs in M["blocks"].values() for r in rs):
            sents.append(sentence("‡ denotes mixed"))     # the paper's caption sentence explaining ‡
        label = f"Table 11 · {model}" + (". " + " ".join(sents) if sents else "")
        groups = []
        for gname, rs in M["blocks"].items():
            rows = []
            for r in rs:
                v = r["values"]
                cells = [r["format"], bpw(v["bpw"]), kl_dot(v["KL"]), f1(v["Top-1"])] + [f1(v[c]) for c in bench] + [f1(v["Avg."])]
                rows.append([method(r["method"])] + cells)
                expect("released_table_full.tex", [method(r["method"])] + cells)
            groups.append((None if gname == "main" else gname, rows))
        out.append(table(label, head, None, groups))
    # released QUASAR checkpoints, linked
    rows = []
    for fam in CKPT["families"]:
        for m in fam["models"]:
            url = "https://huggingface.co/" + m["repo"]
            rows.append([fam["name"], m["format"], m["runtime"], Raw(f'<a href="{e(url)}" tabindex="-1">{e(m["repo"])}</a>')])
    out.append(table("QUASAR checkpoints · Hugging Face", [["Model", "Format", "Runtime", "Repository"]], rows))
    def link(url):
        return Raw(f'<a href="{e(url)}" tabindex="-1">{e(url.split("://", 1)[1])}</a>')
    out.append(table("QUASAR collection · Hugging Face", [["Hugging Face", "Link"]],
                     [["All QUASAR Models", link(CKPT["collection"])], ["QUASAR-QAT", link(CKPT["org"])]]))
    out += hf_cards()     # appended last: the tables above keep their ids (sd-table11-1 .. 6)
    return out


# ------------------------------------------------------------------ Hugging Face model cards (not in the paper)
def card_rows(path):
    """Markdown tables of a saved model card -> {first cell: [cells]}, bold and link markup stripped."""
    rows = {}
    for ln in path.read_text().splitlines():
        if not ln.startswith("|") or re.match(r"^\|[\s|:-]+\|$", ln):
            continue
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        cells = [re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", c).replace("**", "").strip() for c in cells]
        rows.setdefault(cells[0], []).append(cells[1:])    # the header rows land under "Model"
    return rows


def hf_cards():
    """Checkpoint-card numbers that come from a Hugging Face model card, not the paper: exempt from the
    LaTeX cross-check, asserted cell by cell against the saved card (tools/sources/)."""
    out = []
    for fam in CKPT["families"]:
        H = fam.get("hf_card")
        if not H:
            continue
        card = card_rows(ROOT / H["source_file"])
        for i, T in enumerate(H["tables"]):
            assert T["columns"] in card["Model"], f"{H['source_file']}: columns {T['columns']} not in the card"
            rows = []
            for r in T["rows"]:
                key = r.get("card_model", r["model"])   # the card's own row label when the page shortens it
                assert r["values"] in card.get(key, []), f"{H['source_file']}: {key} {r['values']} not in the card"
                rows.append([r["model"]] + r["values"])
            label = f"{fam['name']} · {H['format']} · {H['source_label']} · {T['label']}"
            if i == 0:
                label += f" · {H['source']}"
            out.append(table(label, [["Model"] + T["columns"]], rows))
    return out


def fig25():
    L = R["lr_sweep"]
    lrs = L["learning_rates"]
    cells = {(c["method"], c["lr"]): c["eval_kl"] for c in L["cells"] if c.get("in_v2_figure")}
    head = [[("", 1), ("learning rate", len(lrs))], ["Method"] + [sci_lr(x) for x in lrs]]
    rows = [[method(m)] + [kl4(cells.get((m, x))) for x in lrs] for m in L["methods_in_v2_figure"]]
    return [table(cap("Fig. 25 · Qwen3-4B-Thinking-2507 · INT2 · final held-out KL after 1,000 steps",
                      "QUASAR is robust to learning rate"), head, rows)]


def sci_lr(x):
    m, ex = f"{x:.0e}".split("e")
    return f"{m}×10" + str(int(ex)).translate(SUP)


def fig3():
    # Left empty on purpose: Fig. 3 plots in-loop KL, which differs from the held-out KL of
    # Tables 1 and 6 for the same cells; one basis per comparison keeps assistants from mixing them.
    return []


def fig12():
    D = THEORY["dose_trained"]
    rows = [[p["label"] + (" (unrestricted, ★)" if p["unrestricted"] else ""), sci3(p["ST"]), kl_plot(p["kl"])] for p in D["points"]]
    fit = D["fit"]["display"]
    return [
        table(cap("Fig. 12 · QUASAR · INT2 · 1,000 steps", "Reconstruction error drives final loss"),
              [["scale-search factor f", Raw("end-of-training reconstruction error Ŝ<sub>T</sub>"), "final held-out KL"]], rows),
        table("Fig. 12 · log-log power-law fit", [["fit", "slope", "R²"]], [[Raw("Ŝ<sub>T</sub> vs final held-out KL"), fit["slope"], fit["r2"]]]),
    ]


def fig13():
    D = THEORY["init_predictor"]
    T1 = R["healing"]["hard_tasks"]["models"][D["model"]]
    rows = []
    for p in D["points"]:
        t1 = next(r for r in T1[p["bits"]] if r["method"] == p["method"])["values"]["KL"]
        assert kl_plot(p["kl"]) == f3(t1), (p, t1)   # Figure 13's y = Table 1 KL
        rows.append([method(p["method"]), p["bits"], sci3(p["S0"]), f3(t1)])
    fit = D["fit"]["display"]
    return [
        table(cap(f"Fig. 13 · {D['model']} · 4,096 steps", "Reconstruction error predicts final loss before training"),
              [["Method", "bits", "init-time reconstruction error Ŝ₀", "KL to BF16 (Table 1)"]], rows),
        table("Fig. 13 · log-log power-law fit", [["fit", "R²"]], [["Ŝ₀ vs KL to BF16", fit["r2"]]]),
    ]


SECTIONS = {
    "table1": lambda: healing("hard_tasks", "healing_hard_table.tex", "Reasoning, coding, and long-context results", 1),
    "table6": lambda: healing("standard_tasks", "healing_tables.tex", "QUASAR gives the highest fidelity in all six", 6),
    "table2": table2,
    "table3": table3,
    "table4": table4,
    "table7": table7,
    "table10": table10,
    "table11": table11,
    "fig25": fig25,
    "fig3": fig3,
    "fig12": fig12,
    "fig13": fig13,
}


# ------------------------------------------------------------------ write
PARTIAL = {"table7"}   # Fig. 27's own screen-reader table (win/tie/loss rates) must stay readable


def render(page, built):
    """Replace only the marker regions of page with the built blocks."""
    new = page
    for key, parts in built.items():
        pat = re.compile(r"([ \t]*)<!-- static-data:%s -->.*?<!-- /static-data:%s -->" % (key, key), re.S)
        ms = list(pat.finditer(new))
        assert len(ms) == 1, f"marker pair for {key}: found {len(ms)}"
        ind = ms[0].group(1)
        block = [f"{ind}<!-- static-data:{key} -->"]
        if parts:
            attr = 'data-static-sr="partial"' if key in PARTIAL else "data-static-sr"
            block.append(f'{ind}<div class="sr-only" {attr} data-label>')
            block += [ind + "  " + ln for ln in "\n".join(parts).split("\n")]
            block.append(f"{ind}</div>")
        block.append(f"{ind}<!-- /static-data:{key} -->")
        new = new[:ms[0].start()] + "\n".join(block) + new[ms[0].end():]
    return new


def main():
    built, stats = {}, {}
    for key, build in SECTIONS.items():
        SID["key"], SID["n"] = key, 0
        parts = build()
        built[key] = parts
        body = "\n".join(parts)
        stats[key] = (body.count("<table"), body.count("<tr>"), len(body.encode()))
    ok = run_checks()
    for k, (nt, nr, nb) in stats.items():
        print(f"{k:8s} tables={nt:2d} rows={nr:3d} bytes={nb}")
    page = PAGE.read_text()            # re-read right before writing: <head> may be edited by others
    new = render(page, built)
    assert re.sub(r"<!-- static-data:(\w+) -->.*?<!-- /static-data:\1 -->", "", new, flags=re.S) == \
        re.sub(r"<!-- static-data:(\w+) -->.*?<!-- /static-data:\1 -->", "", page, flags=re.S), "edit outside markers"
    print(f"index.html: {len(page.encode())} -> {len(new.encode())} bytes")
    if "--check" in sys.argv:
        print("unchanged (--check)" if new == page else "index.html is STALE: re-run without --check")
        return 0 if ok and new == page else 1
    if not ok:
        print("not written: fix the mismatches first")
        return 1
    if new != page:
        if PAGE.read_text() != page:
            print("index.html changed while building: not written, re-run")
            return 1
        PAGE.write_text(new)
        print("written")
    else:
        print("already up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())
