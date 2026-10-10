"""Build assets/data/results.json from the arXiv v2 LaTeX source (canonical).

Every table is parsed straight from the .tex (no hand transcription); every
prose number carries a quote that is asserted to occur verbatim in the
plain-text rendering of its source file. The LR-sweep cells come from the plot
data of Figure 25 (a TSV with columns arm, lr, eval_kl, eval_ce) and are checked
against the v2 figure/caption.

Inputs (CLI flag or environment variable; there are no built-in defaults):
  --arxiv-src DIR     / QUASAR_ARXIV_SRC       unpacked arXiv 2608.13966v2 source
  --lr-sweep-tsv FILE / QUASAR_LR_SWEEP_TSV    plot data of Figure 25

  QUASAR_ARXIV_SRC=... QUASAR_LR_SWEEP_TSV=... python3 tools/build_results.py [--out FILE]

The verbatim prose-number index (`headline`) is checked on every run and written
to tools/_private/headline.json (git-ignored); it is not served.
"""
import argparse
import csv
import json
import os
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parents[1]
V2 = None        # arXiv v2 source directory, set in main()
LR_TSV = None    # Figure 25 plot data, set in main()
ARXIV = "arXiv 2608.13966v2"


def input_path(flag, env, value, kind):
    """CLI value, else $env; exit with a clear message if unset or missing."""
    raw = value or os.environ.get(env)
    if not raw:
        sys.exit(f"build_results.py: set {flag} or ${env} ({kind})")
    p = Path(raw).expanduser()
    if not p.exists():
        sys.exit(f"build_results.py: {flag} / ${env} = {p} does not exist ({kind})")
    return p


# Numbering as printed in the arXiv v2 PDF (checked with pdftotext).
TABLE_NO = {"tab:heald-hard": 1, "tab:adapt-qwen": 2, "tab:merged": 3, "tab:heald-training-overhead": 4,
            "tab:formats": 5, "tab:heald-summary": 6, "tab:judge-w2": 7, "tab:abl-main": 8,
            "tab:nvfp4-checkpoints-full": 9, "tab:nvfp4-budget": 10, "tab:released-full": 11,
            "tab:released-artifacts": 12}
FIG_NO = {"fig:heald-curves": 3, "fig:heald-abl": 4, "fig:range-decomp": 6, "fig:heald-ss": 7,
          "fig:init-predictor": 13, "fig:curvature-proxy": 15, "fig:pl-diag": 16, "fig:bound-decomp": 17,
          "fig:lr-robustness": 25, "fig:horizon": 26, "fig:judge-w2": 27, "fig:adapt-curves": 30,
          "fig:nvfp4-curves": 34, "fig:saliency-power": 9}


def src(file, label=None, where=None):
    d = {"file": file}
    if label:
        d["label"] = label
        if label in TABLE_NO:
            d["printed"] = f"Table {TABLE_NO[label]}"
        elif label in FIG_NO:
            d["printed"] = f"Figure {FIG_NO[label]}"
    if where:
        d["where"] = where
    return d


def tex(name):
    return (V2 / name).read_text()


# ------------------------------------------------------------------ text normalization
def braced(s, i):
    """s[i] == '{' -> (content, index after closing brace)."""
    assert s[i] == "{", s[i:i + 20]
    depth, j = 0, i
    while True:
        if s[j] == "{":
            depth += 1
        elif s[j] == "}":
            depth -= 1
            if depth == 0:
                return s[i + 1:j], j + 1
        j += 1


def unwrap(s, cmds=("textbf", "underline", "emph", "textsc", "textit", "mathbf", "texttt")):
    for c in cmds:
        while True:
            k = s.find("\\" + c + "{")
            if k < 0:
                break
            inner, end = braced(s, k + len(c) + 1)
            s = s[:k] + inner + s[end:]
    return s


def plain(t):
    t = "\n".join(l for l in t.splitlines() if not l.lstrip().startswith("%"))
    t = re.sub(r"~?\\cite[pt]?\{[^}]*\}", "", t)
    t = unwrap(t)
    for a, b in [(r"$\sim$", "\x00"), (r"\%", "%"), ("{,}", ","), (r"\(", ""), (r"\)", ""), (r"\times", "×"),
                 ("$", ""), ("---", "—"), ("--", "–"), ("\\ ", " "), (r"\,", " ")]:
        t = t.replace(a, b)
    t = re.sub(r"(?<!\\)~", " ", t).replace("\x00", "~")
    return re.sub(r"\s+", " ", t)


PLAIN = {}


def quote(file, q):
    if file not in PLAIN:
        PLAIN[file] = plain(tex(file))
    assert q in PLAIN[file], f"quote not verbatim in {file}: {q!r}"
    return q


# ------------------------------------------------------------------ cell parsing
def split_cells(line):
    line = line.strip()
    line = re.sub(r"\\\\\s*(\[[^\]]*\])?\s*$", "", line)
    cells, depth, cur = [], 0, ""
    for ch in line:
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        if ch == "&" and depth == 0:
            cells.append(cur)
            cur = ""
        else:
            cur += ch
    cells.append(cur)
    return [c.strip() for c in cells]


def strip_color(c):
    c = re.sub(r"\\cellcolor\{[^}]*\}", "", c)
    c = re.sub(r"\\rowcolor\{[^}]*\}(\[[^\]]*\])*", "", c)
    return c.strip()


def cell(c):
    """-> (value, mark) with mark in {'best','second',None}."""
    c = strip_color(c)
    mark = "best" if ("\\textbf{" in c or "\\mathbf{" in c) else ("second" if "\\underline{" in c else None)
    c = unwrap(c).replace("$", "").replace("\\%", "").strip()
    m = re.fullmatch(r"([\d.]+)\{\\times\}10\^\{(\d+)\}", c)
    if m:
        return float(m.group(1)) * 10 ** int(m.group(2)), mark
    if c in ("--", "", "-"):
        return None, mark
    c2 = c.replace("−", "-")
    try:
        return float(c2), mark
    except ValueError:
        return clean_name(c), mark


def clean_name(c):
    c = strip_color(c)
    m = re.search(r"\\multirow\{[^}]*\}\{[^}]*\}\{([^}]*)\}", c)
    if m:
        c = re.sub(r"\\multirow\{[^}]*\}\{[^}]*\}\{[^}]*\}", "", c).strip() or m.group(1)
    c = unwrap(c)
    for a, b in [("~(ours)", ""), ("\\_", "_"), ("$\\ge$", "≥"), ("$\\downarrow$", ""), ("$\\uparrow$", ""),
                 ("$^{\\ddagger}$", "‡"), ("\\ ", " "), ("\\%", "%"), ("$", "")]:
        c = c.replace(a, b)
    return re.sub(r"\s+", " ", c).strip()


def rot_names(line):
    out, k = [], 0
    while True:
        k = line.find("\\rotatebox{90}{", k)
        if k < 0:
            return [clean_name(n) for n in out]
        inner, k = braced(line, k + len("\\rotatebox{90}"))
        out.append(inner)


def is_rule(line):
    s = line.strip()
    return (not s or s.startswith(("\\toprule", "\\bottomrule", "\\cmidrule", "\\arrayrulecolor", "\\addlinespace",
                                   "\\end{", "\\begin{", "\\caption", "\\label", "\\centering", "\\renewcommand",
                                   "\\setlength", "\\newlength", "\\ifdefined", "%"))
            or (s.startswith("\\rowcolor") and "&" not in s))


def body_lines(t):
    a = t.index("\\begin{tabular}")
    b = t.index("\\end{tabular}")
    return t[a:b].splitlines()[1:]


def caption(t):
    k = t.index("\\caption{")
    inner, _ = braced(t, k + len("\\caption"))
    return plain(inner).strip()


def row_obj(name, cols, cells):
    vals, best, second = {}, [], []
    for col, c in zip(cols, cells):
        if col is None:
            continue
        v, m = cell(c)
        vals[col] = v
        if m == "best":
            best.append(col)
        elif m == "second":
            second.append(col)
    d = {"method": name, "values": vals}
    if best:
        d["bold"] = best
    if second:
        d["underline"] = second
    return d


# ------------------------------------------------------------------ healing tables
def parse_two_model_table(file, label, split):
    t = tex(file)
    lines = body_lines(t)
    hdr = next(l for l in lines if l.strip().startswith("Method &"))
    names = rot_names(hdr)
    models = ["Qwen3-4B-Thinking-2507", "Llama-3.1-8B-Instruct"]
    cols = [names[:split], names[split:]]
    out = {"source": src(file, label), "caption": caption(t), "models": {m: {} for m in models},
           "columns": {models[0]: cols[0], models[1]: cols[1]},
           "notes": "bold = best, underline = second best within each bit-width block (as typeset)"}
    section = None
    for l in lines:
        s = l.strip()
        m = re.match(r"\\multicolumn\{\d+\}\{l\}\{\\textit\{(\d)-bit \((INT\d)\)\}\}", s)
        if m:
            section = m.group(2)
            continue
        if is_rule(s) or s.startswith("\\midrule") or s.startswith("&") or s.startswith("Method &"):
            continue
        cells = split_cells(s)
        name = clean_name(cells[0])
        rest = cells[1:]
        assert len(rest) == len(names), (file, name, len(rest), len(names))
        for mi, m_ in enumerate(models):
            part = rest[:split] if mi == 0 else rest[split:]
            row = row_obj(name, cols[mi], part)
            key = section or "full_precision"
            out["models"][m_].setdefault(key, []).append(row)
    return out


# ------------------------------------------------------------------ adaptation table
def parse_adapt():
    file, label = "adaptation_table.tex", "tab:adapt-qwen"
    t = tex(file)
    lines = body_lines(t)
    hdr = next(l for l in lines if l.strip().startswith("Method &"))
    names = rot_names(hdr)
    assert len(names) == 21
    groups = ["INT2", "INT3", "INT4"]
    cols = names[:7]
    out = {"source": src(file, label), "caption": caption(t), "model": "Qwen3-4B-Base",
           "data": "OpenMathReasoning", "columns": cols, "bits": {g: [] for g in groups}, "references": [],
           "notes": "PPL = held-out perplexity; Base (no SFT) and FP-SFT rows repeat across bit blocks"}
    for l in lines:
        s = l.strip()
        if is_rule(s) or s.startswith("\\midrule") or s.startswith("&") or s.startswith("Method &"):
            continue
        cells = split_cells(s)
        name = clean_name(cells[0])
        rest = cells[1:]
        assert len(rest) == 21, (name, len(rest))
        if name in ("Base (no SFT)", "FP-SFT"):
            out["references"].append(row_obj(name, cols, rest[:7]))
            continue
        for gi, g in enumerate(groups):
            out["bits"][g].append(row_obj(name, cols, rest[7 * gi: 7 * gi + 7]))
    return out


# ------------------------------------------------------------------ merged table (Table 3)
def parse_merged():
    file, label = "merged_table.tex", "tab:merged"
    t = tex(file)
    lines = body_lines(t)
    hdr = next(l for l in lines if l.strip().startswith("Model & Method"))
    names = rot_names(hdr)
    cols = ["bpw"] + names
    out = {"source": src(file, label), "caption": caption(t), "columns": cols,
           "column_groups": {"Fidelity": ["KL", "Top-1"],
                             "Hard reasoning and coding": names[2:6], "Long horizon": names[6:12]},
           "blocks": []}
    block = []

    def flush():
        if not block:
            return
        model = next(re.search(r"\\multirow\{[^}]*\}\{[^}]*\}\{([^}]*)\}", c).group(1)
                     for r in block for c in r[:1] if "\\multirow" in c)
        rows = []
        for r in block:
            ro = row_obj(clean_name(r[1]), cols, [r[3]] + r[4:])
            ro["format"] = clean_name(r[2])
            rows.append(ro)
        out["blocks"].append({"model": model, "rows": rows})
        block.clear()

    for l in lines:
        s = l.strip()
        if s.startswith("\\midrule"):
            flush()
            continue
        if is_rule(s) or s.startswith("&") and "Fidelity" in s or s.startswith("Model & Method") or "&" not in s:
            continue
        if s.startswith("& & & &"):
            continue
        cells = split_cells(s)
        if len(cells) != 17:
            continue
        block.append(cells)
    flush()
    return out


# ------------------------------------------------------------------ released table (Table 11)
def parse_released():
    file, label = "released_table_full.tex", "tab:released-full"
    t = tex(file)
    lines = body_lines(t)
    out = {"source": src(file, label), "caption": caption(t), "models": {},
           "notes": ("bpw includes the quantized transformer-block weights, scales, and zero-points. "
                     "GGUF KL values are comparable only within each block. ‡ = mixed NVFP4, FP8, and BF16 precision.")}
    model, cols, sub = None, None, None
    for l in lines:
        s = l.strip()
        m = re.match(r"\\multicolumn\{3\}\{l\}\{\\textit\{([^}]*)\}\}", s)
        if m:
            model, sub = m.group(1), "main"
            hc = split_cells(s)
            cols = [None, None, "bpw"] + [(rot_names(c)[0] if "rotatebox" in c else None) for c in hc[1:]]
            out["models"][model] = {"columns": [c for c in cols if c], "blocks": {"main": []}}
            continue
        if "GGUF (llama.cpp)" in s:
            sub = "GGUF (llama.cpp)"
            out["models"][model]["blocks"][sub] = []
            continue
        if is_rule(s) or s.startswith("\\midrule") or "&" not in s or s.startswith("Model & Format"):
            continue
        cells = split_cells(s)
        if len(cells) != 14 or model is None:
            continue
        ro = row_obj(clean_name(cells[0]), cols, cells)
        ro["format"] = clean_name(cells[1])
        out["models"][model]["blocks"][sub].append(ro)
    return out


def parse_released_artifacts():
    t = tex("appendix_released.tex")
    k = t.index("\\label{tab:released-artifacts}")
    seg = t[k:t.index("\\end{tabular}", k)]
    rows, model = [], None
    for l in seg.splitlines():
        if "\\texttt{" not in l:
            continue
        c = split_cells(l)
        if c[0].strip():
            model = clean_name(c[0])
        rows.append({"model": model, "row": clean_name(c[1]),
                     "artifact": re.search(r"\\texttt\{([^}]*)\}", c[2]).group(1).replace("\\_", "_")})
    return {"source": src("appendix_released.tex", "tab:released-artifacts"), "rows": rows}


# ------------------------------------------------------------------ NVFP4 appendix tables
def parse_sectioned(file, label, cols, ncells, table_index=0):
    t = tex(file)
    starts = [m.start() for m in re.finditer(r"\\begin\{table\}", t)]
    t1 = t[starts[table_index]:]
    t1 = t1[:t1.index("\\end{table}")]
    lines = body_lines(t1)
    out = {"source": src(file, label), "caption": caption(t1), "columns": cols, "models": {}}
    model = None
    for l in lines:
        s = l.strip()
        m = re.match(r"\\multicolumn\{\d+\}\{.*\}\{\\textit\{([^}]*)\}\}", s)
        if m and "&" not in s:
            model = m.group(1)
            out["models"][model] = []
            continue
        if is_rule(s) or s.startswith("\\midrule") or "&" not in s or s.startswith("Method &") or s.startswith("&"):
            continue
        cells = split_cells(s)
        assert len(cells) == ncells, (file, s, len(cells))
        out["models"][model].append(row_obj(clean_name(cells[0]), cols, cells[1:]))
    return out


# ------------------------------------------------------------------ ablation / overhead / judge
def parse_ablation():
    file, label = "ablation_table_main.tex", "tab:abl-main"
    t = tex(file)
    lines = [split_cells(l) for l in body_lines(t) if "&" in l and not is_rule(l)]
    hdr = [clean_name(c) for c in lines[0]][1:]
    rows = {clean_name(r[0]): r[1:] for r in lines[1:]}
    variants = []
    for i, v in enumerate(hdr):
        kl, mk = cell(rows["KL"][i])
        dv, _ = cell(rows["Δ vs. Standard QAT" if "Δ vs. Standard QAT" in rows else
                         [k for k in rows if "vs." in k][0]][i])
        variants.append({"variant": v, "scale_search": clean_name(rows["Scale search"][i]),
                         "saliency": clean_name(rows["Saliency"][i]), "KL": kl,
                         "delta_vs_standard_qat_pct": dv, "mark": mk})
    return {"source": src(file, label), "caption": caption(t), "model": "Qwen3-4B-Thinking-2507", "bits": "INT2",
            "basis": "final held-out KL from the in-loop evaluation (curve basis; matches ablation_curves.json eval_raw)",
            "variants": variants}


def parse_overhead():
    file, label = "appendix_method.tex", "tab:heald-training-overhead"
    t = tex(file)
    k = t.index("\\label{" + label + "}")
    seg = t[t.rindex("\\begin{table}", 0, k):t.index("\\end{table}", k)]
    comps = []
    for l in body_lines(seg):
        if "&" not in l or is_rule(l) or l.strip().startswith("Component"):
            continue
        c = split_cells(l)
        name = clean_name(c[0])
        a, _ = cell(c[1])
        b, _ = cell(c[2])
        comps.append({"component": name, "standard_qat_s": a, "quasar_s": b})
    return {"source": src(file, label), "caption": caption(seg), "setting":
            "QAD of Qwen3-4B-Thinking-2507 at INT3 on 8x H100 GPUs", "rows": comps}


def parse_judge():
    file, label = "appendix_healing.tex", "tab:judge-w2"
    t = tex(file)
    k = t.index("\\label{" + label + "}")
    seg = t[t.rindex("\\begin{table}", 0, k):t.index("\\end{table}", k)]
    rows = []
    pat = r"\$([+-][\d.]+)\$ \\\(\[([+-][\d.]+), ([+-][\d.]+)\]\\\)"
    for l in body_lines(seg):
        ms = re.findall(pat, l)
        if len(ms) == 2:
            name = clean_name(l.split("&")[0])
            rows.append({"vs": name,
                         "Qwen3-4B-Thinking-2507": {"mean": float(ms[0][0]), "ci95": [float(ms[0][1]), float(ms[0][2])]},
                         "Llama-3.1-8B-Instruct": {"mean": float(ms[1][0]), "ci95": [float(ms[1][1]), float(ms[1][2])]}})
    return {"source": src(file, label), "caption": caption(seg), "judge": "Llama-3.3-70B-Instruct",
            "prompts": 128, "scale": "mean per-prompt preference in [-1, 1]; positive favors QUASAR", "rows": rows}


# ------------------------------------------------------------------ LR sweep
def lr_sweep():
    rows = [r for r in LR_TSV.read_text().splitlines() if not r.startswith("#")]
    cells = [{"arm": r["arm"], "lr": float(r["lr"]), "eval_kl": float(r["eval_kl"]), "eval_ce": float(r["eval_ce"])}
             for r in csv.DictReader(rows, delimiter="\t")]
    label = {"laware": "QUASAR", "ste": "Standard QAT", "lsq": "LSQ", "gdm": "Denoising QAT",
             "bitdistiller": "BitDistiller", "dsq": "DSQ"}
    v2_arms = ["laware", "ste", "lsq", "gdm", "bitdistiller"]  # fig_lr_robustness.py ARMS (v2 Figure 25)
    for c in cells:
        c["method"] = label[c["arm"]]
        c["in_v2_figure"] = c["arm"] in v2_arms
    lrs = sorted({c["lr"] for c in cells})
    kl = {(c["arm"], c["lr"]): c["eval_kl"] for c in cells}
    per_lr = []
    for lr in lrs:
        q = kl[("laware", lr)]
        best_v2 = min((kl[(a, lr)], a) for a in v2_arms if a != "laware")
        best_all = min((kl[(a, lr)], a) for a in label if a != "laware")
        per_lr.append({"lr": lr, "quasar_kl": q, "best_baseline_v2": label[best_v2[1]], "best_baseline_v2_kl": best_v2[0],
                       "quasar_lowest_v2": q < best_v2[0], "best_baseline_incl_dsq": label[best_all[1]],
                       "quasar_lowest_incl_dsq": q < best_all[0]})
    wins_v2 = sum(kl[("laware", lr)] < kl[(a, lr)] for lr in lrs for a in v2_arms if a != "laware")
    wins_all = sum(kl[("laware", lr)] < kl[(a, lr)] for lr in lrs for a in label if a != "laware")
    assert all(r["quasar_lowest_v2"] for r in per_lr) and wins_v2 == 24 and wins_all == 30
    f = "appendix_healing.tex"
    return {
        "source": {"data": f"{ARXIV}, plot data of Figure 25 (also holds DSQ cells)",
                   "v2_figure": src(f, "fig:lr-robustness")},
        "setting": "INT2 QAD, Qwen3-4B-Thinking-2507, 1,000 steps, global batch 32, AdamW, final held-out KL",
        "v2_statements": [quote(f, "Final held-out KL after 1,000 steps of INT2 QAD of Qwen3-4B-Thinking-2507 across a 50× learning-rate range."),
                          quote(f, "QUASAR attains the lowest KL at every tested rate; Standard QAT diverges at high rates, while BitDistiller degrades at low rates.")],
        "learning_rates": lrs,
        "methods_in_v2_figure": [label[a] for a in v2_arms],
        "summary": {
            "v2_figure_cells": len(lrs) * len(v2_arms), "v2_pairwise_wins": f"{wins_v2}/{len(lrs) * (len(v2_arms) - 1)}",
            "quasar_lowest_at_every_lr_v2": True,
            "tsv_cells_incl_dsq": len(cells), "pairwise_wins_incl_dsq": f"{wins_all}/{len(lrs) * (len(label) - 1)}",
            "note": ("v2 plots 5 methods (30 cells) and says QUASAR is lowest at every rate. The 36-cell / 30-of-30 "
                     "counts include DSQ, which is not a baseline anywhere in v2."),
        },
        "per_lr": per_lr,
        "cells": cells,
    }


# ------------------------------------------------------------------ headline prose
def headline():
    H = []

    def add(id_, value, file, q, where, **kw):
        d = {"id": id_, "value": value, "quote": quote(file, q), "source": src(file, where=where)}
        d.update(kw)
        H.append(d)

    a = "main.tex"
    add("int2_qad_gain_pts", 13.3, a, "At INT2, QUASAR improves average accuracy over the best QAT baseline by 13.3 points "
        "with quantization-aware distillation and by 10.9 points with QAT on mathematical reasoning data.", "abstract",
        unit="accuracy points", check="Table 1, Qwen INT2 Avg.: QUASAR 34.8 - BitDistiller 21.5")
    add("int2_adapt_gain_pts", 10.9, a, "by 10.9 points with QAT on mathematical reasoning data", "abstract",
        unit="accuracy points", check="Table 2, INT2 Avg.: QUASAR 29.6 - Standard QAT/Denoising QAT 18.7")
    add("gemma_kl_reduction_pct", 66, a, "Notably, after distillation on only ~600M tokens, QUASAR's INT4 Gemma-4 E4B checkpoint "
        "outperforms the corresponding QAT checkpoint released by Google, with 66% lower KL divergence and 1.8 points "
        "higher average accuracy.", "abstract", unit="%", check="Table 3: 1 - 0.022/0.064 = 65.6%")
    add("gemma_acc_gain_pts", 1.8, a, "1.8 points higher average accuracy", "abstract", unit="accuracy points",
        check="Table 3: 35.8 - 34.0")
    add("gemma_tokens", "~600M", a, "after distillation on only ~600M tokens", "abstract", unit="tokens")
    add("families_formats", "4 families; INT4, INT3, INT2, NVFP4", a,
        "We evaluate QUASAR across four model families and across INT4, INT3, INT2, and NVFP4 quantization formats.",
        "abstract")
    add("loss_claim", None, a, "QUASAR consistently achieves lower training and evaluation loss than competitive QAT "
        "methods and outperforms QAT and PTQ baselines on downstream benchmarks.", "abstract")
    i = "introduction.tex"
    add("intro_contrib_iii", None, i, "At INT2, it improves average accuracy by up to 13.3 points over the strongest QAT "
        "baseline; at INT4, its Gemma-4 E4B checkpoint achieves 66% lower held-out KL and 1.8 points higher average "
        "accuracy than Google's public QAT checkpoint.", "contribution (iii)")
    e = "experiments.tex"
    add("int2_kl_reduction_pct", "about 30%", e, "At INT2, it reduces KL by about 30% over the strongest QAT baseline.",
        "Sec. 5.1 Healing with QAD", check="Table 1/6 KL: Qwen 1-0.126/0.179 = 29.6%; Llama 1-0.105/0.151 = 30.5%")
    add("heal_lowest_loss", None, e, "Across both models and all bit widths, QUASAR reaches the lowest training and "
        "evaluation loss (KL).", "Sec. 5.1 Healing with QAD")
    add("heal_hard_gain_qwen_llama", {"Qwen": 13.3, "Llama": 2.2}, e, "On reasoning, coding, and long-context tasks, "
        "QUASAR improves average accuracy by 13.3 points for Qwen and 2.2 points for Llama", "Sec. 5.1 Healing with QAD",
        check="Table 1 INT2: Qwen 34.8-21.5; Llama 25.9-23.7")
    add("adapt_int2", {"QUASAR_avg": 29.6, "vs_best_QAT": 10.9, "vs_FP_SFT_then_PTQ": 29.0}, e,
        "At INT2, QUASAR reaches 29.6 average accuracy, 10.9 points above the strongest QAT baseline and 29.0 points "
        "above full-precision fine-tuning followed by PTQ", "Sec. 5.1 Adaptation with QAT",
        check="Table 2 INT2: 29.6-18.7; 29.6-0.6 (GPTQ)")
    add("adapt_beats_base", None, e, "It is also the only INT2 quantized model to outperform the original base model "
        "and score above zero on HMMT'25.", "Sec. 5.1 Adaptation with QAT", check="Table 2: 29.6 > base 24.2; HMMT'25 1.5")
    add("adapt_ppl", None, e, "QUASAR has the lowest held-out perplexity and the best or tied-best average accuracy at "
        "every bit width.", "Sec. 5.1 Adaptation with QAT")
    add("nvfp4_kl_reduction_pct", {"Qwen3-8B": 12, "Qwen3.5-9B": 15}, e, "For Qwen3-8B and Qwen3.5-9B, QUASAR reduces "
        "held-out KL divergence by 12% and 15% relative to Standard QAT, respectively.", "Sec. 5.2 NVFP4 QAD",
        check="Table 3: 1-0.036/0.041 = 12.2%; 1-0.028/0.033 = 15.2%")
    add("nvfp4_q35_avg", {"QUASAR": 55.7, "Standard QAT": 52.6, "GPTQ": 39.4}, e, "On the more challenging reasoning, "
        "coding, and long-horizon benchmarks, Qwen3.5-9B achieves an average score of 55.7, compared with 52.6 for "
        "Standard QAT and 39.4 for GPTQ", "Sec. 5.2 NVFP4 QAD")
    add("nvfp4_stability", None, e, "both QAD checkpoints remain stable over long generations, whereas the PTQ "
        "checkpoints often fail to complete them, despite GPTQ achieving lower held-out KL divergence than Standard QAT.",
        "Sec. 5.2 NVFP4 QAD")
    add("gemma_e4b_numbers", {"QUASAR_KL": 0.022, "QUASAR_avg": 35.8, "Google_KL": 0.064, "Google_avg": 34.0}, e,
        "For the INT4 Gemma model, QUASAR achieves a held-out KL divergence of 0.022 and an average accuracy of 35.8 on "
        "the ten downstream benchmarks, compared with 0.064 and 34.0 for Google's QAT checkpoint.",
        "Sec. 5.2 Comparison with Google's QAT checkpoints")
    add("gemma_pct", None, e, "This corresponds to 66% lower KL divergence and 1.8 points higher average accuracy.",
        "Sec. 5.2 Comparison with Google's QAT checkpoints")
    add("gemma_budget", {"tokens": "600M", "hours": 5}, e, "Notably, QUASAR achieves these results with only 600M tokens "
        "of distillation and 5 hours of training, while Google does not disclose the training data or compute used for "
        "its QAT checkpoint.", "Sec. 5.2 Comparison with Google's QAT checkpoints")
    add("gemma_group", {"QUASAR": 64, "Google": 32}, e, "QUASAR also uses a larger quantization group size of 64, "
        "compared with 32 for Google's checkpoint.", "Sec. 5.2 Comparison with Google's QAT checkpoints")
    add("ablation_claim", None, e, "Scale search provides most of the gain, while Adam and Fisher saliency perform "
        "similarly, despite Adam being computationally cheaper.", "Sec. 5.3")
    add("ablation_lowest", None, e, "QUASAR achieves the lowest training and evaluation loss across ablations.", "Sec. 5.3")
    add("overhead_pct", 1.4, e, "QUASAR only adds 1.4% wall-clock step time compared with Standard QAT (2.97 and 2.93 "
        "seconds per step, respectively), with the overhead only coming from the weight reconstruction.", "Sec. 5.3",
        unit="% step time", check="Table 4: 2.972/2.930 = +1.43%")
    add("memory_overhead", "none", e, "Compared with Standard QAT, QUASAR introduces no memory overhead.", "Sec. 5.3")
    b = "body.tex"
    add("conclusion_overhead", None, b, "It adds only 1.4% latency overhead per training step and incurs no inference "
        "overhead.", "Conclusion")
    add("conclusion_scope", None, b, "We evaluate QUASAR across four model families and four quantization formats.",
        "Conclusion")
    add("conclusion_gemma", None, b, "Notably, QUASAR's INT4 Gemma-4 checkpoint outperforms Google's QAT checkpoint in "
        "KL divergence and benchmark accuracy.", "Conclusion")
    m = "appendix_method.tex"
    add("ss_narrower_pct", 99.6, m, "At INT3, 99.6% of Qwen3-4B weight groups select a range narrower than min–max",
        "App. A", unit="% of weight groups")
    add("ss_shat_pct", 69, m, "to 69% of the full-range baseline", "App. A", unit="% of min–max Ŝ_t",
        tex_sentence="reducing $\\widehat S_t$ to 69\\% of the full-range baseline")
    add("ss_groups", "28.4M", m, "across 28.4M groups; 99.6% use a range narrower than min–max.", "fig:range-decomp caption")
    add("ss_median_factor", {"INT4": 0.95, "INT2": 0.60}, m, "Across both models, the median selected range factor "
        "decreases from 0.95 at INT4 to 0.60 at INT2", "App. A")
    t = "appendix_theory_validation.tex"
    add("init_predictor_r2", 0.98, t, "reconstruction error at initialization predicts held-out KL to the full-precision "
        "model after 4,096 steps (R^2=0.98).", "fig:init-predictor caption")
    add("saliency_curvature_r", 0.81, t, "The log-scale correlation is r=0.81", "fig:curvature-proxy caption")
    add("pl_mu", {"mu_hat": 1.72, "ratio_vs_baselines": 2.5}, t, "is about 2.5× the baseline values.",
        "fig:pl-diag caption", tex_sentence="QUASAR's estimated $\\hat\\mu=1.72$ is about $2.5\\times$ the baseline values.")
    add("bound_tightness", 3.1, t, "The resulting bound is within 3.1× of the observed average squared gradient norm, "
        "and reconstruction error is its largest term.", "fig:bound-decomp caption")
    add("theory_tracks", None, t, "Across both model families and all tested bit widths, end-of-training reconstruction "
        "error closely tracks held-out KL for Standard QAT, Denoising QAT, and QUASAR.", "App. C")
    add("sgd_validation", None, t, "At every stable learning rate, QUASAR reaches lower training and held-out loss floors "
        "than Standard QAT, preserving the ordering observed with AdamW", "App. C SGD")
    h = "appendix_healing.tex"
    add("horizon", {"INT3": 128, "INT2": 128, "INT4": 1408}, h, "QUASAR leads from step 128 at INT3 and INT2, and from "
        "step 1,408 at INT4, through the end of training.", "fig:horizon caption")
    add("judge", {"prompts": 128, "baselines": 7, "comparisons_won": 14}, h, "Across 128 WildChat prompts per model, "
        "Llama-3.3-70B-Instruct prefers QUASAR to all seven quantized baselines for both models", "App. E.3")
    add("judge_table", 14, h, "QUASAR wins all 14 comparisons with quantized baselines.", "tab:judge-w2 caption")
    add("lr_range", "50×", h, "across a 50× learning-rate range", "fig:lr-robustness caption")
    add("kl_acc", None, h, "Lower held-out KL correlates with higher downstream accuracy.", "fig:kl-vs-acc caption")
    d = "appendix_adaptation.tex"
    add("adapt_long", {"AIME'24_median_tokens": "27k", "HMMT'25_median_tokens": "20k"}, d,
        "FP-SFT generates median responses of 27k tokens on AIME'24 and 20k on HMMT'25.", "App. F")
    add("adapt_long_claim", None, d, "QUASAR's advantage is largest on benchmarks requiring long reasoning.", "App. F")
    s = "appendix_setup.tex"
    add("setup_steps", {"steps": 4096, "seq_len": 4096}, s, "We apply QAD for 4,096 steps at sequence length 4,096.", "App. D")
    add("setup_tokens_per_step", "~60k", s, "This corresponds to roughly 60k supervised tokens per step.", "App. D")
    add("setup_grid", "0.30-1.00 step 0.05", s, "searches clipping factors from 0.30 to 1.00 in increments of 0.05.", "App. D")
    add("setup_group", 128, s, "with group size 128", "App. D",
        tex_sentence="asymmetric weight-only INT4, INT3, or INT2 quantization with group size 128")
    return H

def main():
    global V2, LR_TSV
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--arxiv-src", help="unpacked arXiv 2608.13966v2 source (default $QUASAR_ARXIV_SRC)")
    ap.add_argument("--lr-sweep-tsv", help="plot data of Figure 25 (default $QUASAR_LR_SWEEP_TSV)")
    ap.add_argument("--out", default=str(SITE / "assets" / "data" / "results.json"))
    args = ap.parse_args()
    V2 = input_path("--arxiv-src", "QUASAR_ARXIV_SRC", args.arxiv_src, "arXiv v2 LaTeX source directory")
    LR_TSV = input_path("--lr-sweep-tsv", "QUASAR_LR_SWEEP_TSV", args.lr_sweep_tsv, "Figure 25 plot data TSV")

    heal_std = parse_two_model_table("healing_tables.tex", "tab:heald-summary", 11)
    heal_hard = parse_two_model_table("healing_hard_table.tex", "tab:heald-hard", 11)
    merged = parse_merged()
    released = parse_released()
    nv_full = parse_sectioned("appendix_nvfp4.tex", "tab:nvfp4-checkpoints-full",
                              ["Avg.", "GSM8K", "MMLU", "ARC-C", "ARC-E", "Hella.", "WinoG.", "TQA", "IFEval", "GPQA-D"], 11)
    nv_budget = parse_sectioned("nvfp4_longctx_tables.tex", "tab:nvfp4-budget",
                                ["MATH-500", "LiveCodeBench v6", "OJBench (C++)", "OJBench (Python)"], 5)
    nv_budget["unit"] = "% of generations reaching the 32,768-token output budget without stopping (lower is better)"

    def mrow(model, method, fmt=None):
        blk = next(b for b in merged["blocks"] if b["model"] == model)
        return next(r for r in blk["rows"] if r["method"] == method and (fmt is None or r["format"] == fmt))

    g_q, g_g = mrow("Gemma-4 E4B", "QUASAR", "INT4 g64"), mrow("Gemma-4 E4B", "Google QAT", "INT4 g32")
    gemma = {
        "source": src("merged_table.tex", "tab:merged"),
        "model": "Gemma-4 E4B", "format": "INT4 (W4A16)",
        "quasar": {"KL": g_q["values"]["KL"], "Top-1": g_q["values"]["Top-1"], "avg_acc_10": g_q["values"]["Avg."],
                   "bpw": g_q["values"]["bpw"], "group_size": 64, "distillation_tokens": "~600M", "training_hours": 5},
        "google_qat": {"KL": g_g["values"]["KL"], "Top-1": g_g["values"]["Top-1"], "avg_acc_10": g_g["values"]["Avg."],
                       "bpw": g_g["values"]["bpw"], "group_size": 32, "training_data_compute": "undisclosed",
                       "artifact": "google/gemma-4-E4B-it-qat-w4a16-ct"},
        "derived": {"kl_reduction_pct": round(100 * (1 - g_q["values"]["KL"] / g_g["values"]["KL"]), 1),
                    "acc_gain_pts": round(g_q["values"]["Avg."] - g_g["values"]["Avg."], 1)},
        "stated": {"kl_reduction": "66%", "acc_gain": "1.8 points"},
        "gguf_q4_0": {r["method"]: r["values"] for r in next(b for b in merged["blocks"] if b["model"] == "Gemma-4 E4B")["rows"]
                      if r["format"] == "GGUF Q4_0"},
        "other_suite_table11": {r["method"] + " (" + r["format"] + ")": r["values"]
                                for blk in released["models"]["Gemma-4 E4B"]["blocks"].values() for r in blk},
        "gemma4_12b_table11": {r["method"] + " (" + r["format"] + ")": r["values"]
                               for blk in released["models"]["Gemma-4 12B"]["blocks"].values() for r in blk},
    }
    assert gemma["quasar"]["KL"] == 0.022 and gemma["google_qat"]["KL"] == 0.064
    assert round(gemma["derived"]["kl_reduction_pct"]) == 66 and gemma["derived"]["acc_gain_pts"] == 1.8

    nvfp4 = {
        "setup": {"lr": "1e-6", "global_batch": 32, "evaluated_through": "vLLM native NVFP4 path",
                  "source": src("appendix_setup.tex", where="NVFP4 paragraph")},
        "table3_rows": [b for b in merged["blocks"] if b["model"] in ("Qwen3-8B", "Qwen3.5-9B", "Muse-Glimmer-30B")],
        "table3_source": src("merged_table.tex", "tab:merged"),
        "standard_tasks": nv_full,
        "non_termination": nv_budget,
        "kl_reduction_vs_standard_qat": {},
        "curve_basis_note": ("The NVFP4 training curves (Figure 34) use in-loop held-out KL (e.g. Qwen3-8B final 0.0114 vs 0.0155); the "
                             "12%/15% figures are on the Table 3 basis (materialized checkpoints via vLLM). Do not "
                             "compute percentages from the curves."),
    }
    for mname in ("Qwen3-8B", "Qwen3.5-9B"):
        q, s_ = mrow(mname, "QUASAR"), mrow(mname, "Standard QAT")
        nvfp4["kl_reduction_vs_standard_qat"][mname] = {
            "QUASAR_KL": q["values"]["KL"], "Standard_QAT_KL": s_["values"]["KL"],
            "computed_pct": round(100 * (1 - q["values"]["KL"] / s_["values"]["KL"]), 1)}
    assert round(nvfp4["kl_reduction_vs_standard_qat"]["Qwen3-8B"]["computed_pct"]) == 12
    assert round(nvfp4["kl_reduction_vs_standard_qat"]["Qwen3.5-9B"]["computed_pct"]) == 15

    overhead = parse_overhead()
    tot = next(r for r in overhead["rows"] if r["component"] == "Total step")
    overhead["derived_pct"] = round(100 * (tot["quasar_s"] / tot["standard_qat_s"] - 1), 2)
    overhead["memory"] = {"value": "no memory overhead",
                          "quote": quote("experiments.tex", "Compared with Standard QAT, QUASAR introduces no memory overhead."),
                          "why": quote("methodology.tex", "Adam and AdamW already maintain this quantity as the second-moment "
                                       "estimate v_t, allowing QUASAR to reuse it without additional memory overhead.")}
    overhead["inference"] = quote("body.tex", "incurs no inference overhead")

    adapt = parse_adapt()
    # internal consistency checks against the prose
    hq = {r["method"]: r["values"] for r in heal_hard["models"]["Qwen3-4B-Thinking-2507"]["INT2"]}
    hl = {r["method"]: r["values"] for r in heal_hard["models"]["Llama-3.1-8B-Instruct"]["INT2"]}
    qat = ["Standard QAT", "LSQ", "Denoising QAT", "BitDistiller"]
    assert round(hq["QUASAR"]["Avg."] - max(hq[m]["Avg."] for m in qat), 1) == 13.3
    assert round(hl["QUASAR"]["Avg."] - max(hl[m]["Avg."] for m in qat), 1) == 2.2
    a2 = {r["method"]: r["values"] for r in adapt["bits"]["INT2"]}
    assert round(a2["QUASAR"]["Avg."] - max(a2[m]["Avg."] for m in qat), 1) == 10.9
    assert round(a2["QUASAR"]["Avg."] - max(a2[m]["Avg."] for m in ("RTN", "GPTQ", "AWQ")), 1) == 29.0

    res = {
        "meta": {
            "title": "QUASAR: Lowering the Loss Floor of Quantization-Aware Training with Loss-Aware Reconstruction",
            "authors": ["Vincent Counathe", "Ben Athiwaratkun", "Christopher De Sa", "Tianyi Zhang"],
            "affiliations": {"Vincent Counathe": ["Cornell University", "Together AI"], "Ben Athiwaratkun": ["Together AI"],
                             "Christopher De Sa": ["Cornell University", "Together AI"], "Tianyi Zhang": ["Together AI"]},
            "arxiv": "2608.13966", "arxiv_version": "v2",
            "code": "https://github.com/vincentcounathe/quasar-qat",
            "checkpoints": "https://huggingface.co/QUASAR-QAT",
            "canonical_source": "arXiv v2 LaTeX source; every table below is parsed from it by tools/build_results.py",
            "source_convention": ("Each block carries `source` {file, label, printed}; every row/value inside a block "
                                  "inherits it. `printed` is the number in the v2 PDF. `bold`/`underline` list the "
                                  "columns typeset best/second-best."),
            "basis_warning": ("Table KL (Tables 1, 3, 6) comes from a separate fidelity evaluation; curve JSONs and "
                              "Table 8 (ablation) use the in-loop held-out KL. They differ (Qwen INT2 Standard QAT: 0.186 "
                              "in Table 1 vs 0.175 in Table 8). Never mix bases in one comparison."),
        },
        "healing": {"setting": "QAD (quantization-aware distillation) on Open-PerfectBlend, 4,096 steps, asymmetric "
                               "weight-only INT g128, forward-KL to the full-precision teacher",
                    "hard_tasks": heal_hard, "standard_tasks": heal_std},
        "adaptation": adapt,
        "checkpoint_comparison_table3": merged,
        "nvfp4": nvfp4,
        "gemma4_e4b_vs_google": gemma,
        "released_checkpoints_table11": released,
        "released_artifacts_table12": parse_released_artifacts(),
        "lr_sweep": lr_sweep(),
        "ablation": parse_ablation(),
        "training_overhead": overhead,
        "llm_judge_int2": parse_judge(),
    }
    head = headline()  # asserts every quoted prose number is verbatim in the v2 source
    priv = SITE / "tools" / "_private"
    priv.mkdir(exist_ok=True)
    (priv / "headline.json").write_text(json.dumps(head, indent=1, ensure_ascii=False) + "\n")
    out = Path(args.out)
    out.write_text(json.dumps(res, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {out} ({out.stat().st_size / 1024:.1f} KB); {len(head)} headline quotes verified")


if __name__ == "__main__":
    main()
