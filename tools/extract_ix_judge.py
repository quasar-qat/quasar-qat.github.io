#!/usr/bin/env python3
"""Extract the data of the paper's INT2 LLM-judge figures (Figures 27-29) into assets/data/ix-judge.json.

  Figure 27  judge_w2.pdf          pairwise win / tie / loss rates (+ Table 7: mean preference, 95% CI)
  Figure 28  judge_w2_health.pdf   mean word-repetition ratio + terminated-response counts
  Figure 29  transcript figure     beginning of each method's response to one held-out prompt

Figures 27 and 28 are taken from the paper's own generators (fig_judge_w2.py, fig_judge_health.py): they are run
IN MEMORY (their save calls are intercepted, nothing is written to the source checkout), the plotted bars and
count annotations are read back, and every value is cross-checked against the generator's data file, loaded
with the generator's own loader. Figure 29 is parsed from the LaTeX table of the arXiv v2 source
(label fig:heal-transcript) and converted to the characters the paper typesets.

Inputs (CLI flag or environment variable; no built-in defaults):
  --figure-src DIR / QUASAR_FIGURE_SRC   checkout of the paper's figure code + plot data (holds figs/paper_final/)
  --arxiv-src DIR  / QUASAR_ARXIV_SRC    unpacked arXiv 2608.13966v2 source (appendix_healing.tex)

  QUASAR_FIGURE_SRC=... QUASAR_ARXIV_SRC=... python3 tools/extract_ix_judge.py [--out FILE] [--check DIR]

--check DIR also writes matplotlib re-plots of the JSON (paper layout) for a side-by-side with the v2 figures.
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # never drop __pycache__ into the source checkout
SITE = Path(__file__).resolve().parents[1]

ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
ap.add_argument("--figure-src", help="paper figure checkout (default $QUASAR_FIGURE_SRC)")
ap.add_argument("--arxiv-src", help="unpacked arXiv v2 source (default $QUASAR_ARXIV_SRC)")
ap.add_argument("--out", default=str(SITE / "assets" / "data" / "ix-judge.json"), help="output JSON")
ap.add_argument("--check", help="directory for matplotlib re-plots of the written JSON")
ARGS = ap.parse_args()


def need(flag, env, value, what, probe):
    raw = value or os.environ.get(env)
    if not raw:
        sys.exit(f"extract_ix_judge.py: set {flag} or ${env} ({what})")
    p = Path(raw).expanduser()
    if not (p / probe).exists():
        sys.exit(f"extract_ix_judge.py: {p} has no {probe}; {flag} / ${env} must point at the {what}")
    return p


LAQ = need("--figure-src", "QUASAR_FIGURE_SRC", ARGS.figure_src,
           "checkout holding the paper's figs/paper_final/ generators", "figs/paper_final/fig_judge_w2.py")
V2 = need("--arxiv-src", "QUASAR_ARXIV_SRC", ARGS.arxiv_src, "arXiv v2 LaTeX source directory", "appendix_healing.tex")
PF = LAQ / "figs" / "paper_final"
os.environ.setdefault("MPLCONFIGDIR", str(Path(os.environ.get("TMPDIR", "/tmp")) / "quasar-site-mpl"))
sys.path.insert(0, str(PF))

import matplotlib  # noqa: E402
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

import style as S  # noqa: E402  (paper house style)

CAPTURED = {}
S.save = lambda fig, name: CAPTURED.__setitem__(name, fig)
import fig_judge_w2 as J  # noqa: E402
import fig_judge_health as HL  # noqa: E402

plt.rcParams["text.usetex"] = False  # figures are captured, never rendered: no TeX run needed
J.main()
HL.main()

# site labels (the paper's own names; FP16 = the full-precision model)
NAME = {"QUASAR": "QUASAR", "StandardQAT": "Standard QAT", "DenoisingQAT": "Denoising QAT", "LSQ": "LSQ",
        "BitDistiller": "BitDistiller", "RTN": "RTN", "GPTQ": "GPTQ", "AWQ": "AWQ", "FP16": "FP16"}
MID = {"qwen": "Qwen3-4B-Thinking-2507", "llama": "Llama-3.1-8B-Instruct"}
PTQ = {"RTN", "GPTQ", "AWQ"}


def close(a, b, tol=1e-6):
    return abs(float(a) - float(b)) <= tol


# ------------------------------------------------------------------ Table 7 (printed values, for the cross-check)
def table7():
    tex = (V2 / "appendix_healing.tex").read_text()
    blk = tex[tex.index(r"\label{tab:judge-w2}"):]
    blk = blk[:blk.index(r"\end{tabular}")]
    num = r"\$([+-]\d\.\d\d)\$ \\\(\[([+-]\d\.\d\d), ([+-]\d\.\d\d)\]\\\)"
    out = {}
    for m in re.finditer(r"^(RTN|GPTQ|AWQ|Standard QAT|LSQ|Denoising QAT|BitDistiller|FP16) & " + num + " & " + num,
                         blk, re.M):
        g = m.groups()
        out[g[0]] = {"qwen": [float(x) for x in g[1:4]], "llama": [float(x) for x in g[4:7]]}
    if len(out) != 8:
        sys.exit(f"extract_ix_judge.py: parsed {len(out)} of 8 Table 7 rows")
    return out


# ------------------------------------------------------------------ Figure 27
def fig27():
    fig = CAPTURED["judge_w2"]
    d = json.load(open(J.DATA))
    studies = d["studies"]
    t7 = table7()
    models = []
    axes = [a for a in fig.axes if a.patches]
    if len(axes) != len(J.PANELS):
        sys.exit("extract_ix_judge.py: Figure 27 panel count changed")
    for ax, (key, title, ref) in zip(axes, J.PANELS):
        mid = "qwen" if "qwen" in key else "llama"
        assert ax.get_title() == title == MID[mid], (ax.get_title(), title)
        cells = J.cells_for(studies[key])                       # the generator's own loader
        labels = [t.get_text() for t in ax.get_yticklabels()]   # bottom -> top, as plotted
        bars = ax.patches                                       # (win, tie, loss) per row, plotting order
        assert len(bars) == 3 * len(labels)
        inv = {J.PRETTY.get(k, k): k for k in cells}
        rows = []
        for i, lab in enumerate(labels):
            w, t, l = (bars[3 * i + j].get_width() for j in range(3))
            arm = inv[lab]
            c = cells[arm]
            assert close(w, c["win_pct"]) and close(t, c["tie_pct"]) and close(l, c["loss_pct"]), (lab, w, t, l)
            assert c["n"] == 128
            vw, vt, vl = (int(round(2 * c[k])) for k in ("win", "tie", "loss"))  # each order contributes 0.5
            assert vw + vt + vl == 256 and all(close(2 * c[k], v) for k, v in zip(("win", "tie", "loss"), (vw, vt, vl)))
            net = round(c["net"], 2) + 0.0
            ci = [round(x, 2) + 0.0 for x in c["net_ci95"]]
            printed = t7[NAME[arm]][mid]
            assert close(net, printed[0], 1e-9) and close(ci[0], printed[1], 1e-9) and close(ci[1], printed[2], 1e-9), \
                (lab, net, ci, printed)
            rows.append({"m": NAME[arm], "type": "ref" if arm == ref else "ptq" if arm in PTQ else "qat",
                         "win": w, "tie": t, "loss": l, "n": [vw, vt, vl], "net": net, "ci": ci})
        rows.reverse()  # top -> bottom (paper reading order)
        models.append({"id": mid, "label": title, "rows": rows})
    return {
        "figure": "Figure 27", "table": "Table 7",
        "judge": "Llama-3.3-70B-Instruct", "prompts": 128, "orders": 2, "verdicts": 256,
        "rates": "share of judged pairs (%), QUASAR vs the row's method",
        "net": "mean per-prompt preference in [-1, 1] with 95% bootstrap CI over 128 prompts (Table 7)",
        "models": models,
    }


# ------------------------------------------------------------------ Figure 28
def fig28():
    fig = CAPTURED["judge_w2_health"]
    d = json.load(open(HL.DATA))
    st = d["studies"]
    models = []
    for ax, (key, title, fin_label) in zip(fig.axes, HL.PANELS):
        mid = "qwen" if "qwen" in key else "llama"
        assert ax.get_title() == title == MID[mid]
        diags = st[key]["arm_diagnostics"]                      # the generator's own data
        thinking = key == "heal_qwen"
        arms = [a for a in HL.ORDER if a in diags]               # top -> bottom
        widths = [p.get_width() for p in ax.patches]            # plotted bars, same order
        texts = [t.get_text() for t in ax.texts]
        counts = [t for t in texts if re.fullmatch(r"\d+/128", t)]
        assert len(widths) == len(arms) == len(counts)
        rows = []
        for arm, w, cnt in zip(arms, widths, counts):
            assert close(w, diags[arm]["mean_rep_ratio"])
            f = HL.finished(diags[arm], thinking)
            assert cnt == f"{f}/{HL.N}", (arm, cnt, f)
            rows.append({"m": NAME[arm], "ratio": w, "done": f})
        refx = [ln.get_xdata()[0] for ln in ax.lines if ln.get_linestyle() not in ("None", "")]
        fp = diags["FP16"]["mean_rep_ratio"]
        assert any(close(x, fp) for x in refx)
        models.append({"id": mid, "label": title,
                       "done_label": "closes </think>" if thinking else "stops before cap",
                       "ref": {"m": "FP16", "ratio": fp}, "rows": rows})
    return {"figure": "Figure 28", "n": HL.N, "decoding": "greedy",
            "ratio": "mean word-repetition ratio: 1 - unique/total whitespace tokens of each response",
            "models": models}


# ------------------------------------------------------------------ Figure 29
def detex(s):
    s = s.strip()
    s = re.sub(r"\\textbf\{([^}]*)\}", r"\1", s)
    s = s.replace(r"\,\ldots", "\u2009\u2026").replace(r"\ldots", "\u2026")
    s = s.replace(r"$\circ$", "\u2218")
    s = s.replace(r"\textless{}", "<").replace(r"\textgreater{}", ">")
    s = re.sub(r"\\textbackslash ?", lambda m: "\\", s)
    s = s.replace(r"\{", "{").replace(r"\}", "}").replace(r"\#", "#").replace(r"\&", "&").replace(r"\%", "%")
    s = s.replace("---", "\u2014").replace("--", "\u2013")
    s = re.sub(r" {2,}", " ", s)  # TeX collapses runs of spaces
    if "\\" in s.replace("\\ql", "") or "$" in s:
        sys.exit(f"extract_ix_judge.py: unconverted TeX in Figure 29 cell: {s!r}")
    return s


def fig29():
    tex = (V2 / "appendix_healing.tex").read_text()
    end = tex.index(r"\label{fig:heal-transcript}")
    beg = tex.rindex(r"\begin{figure}", 0, end)
    blk = tex[beg:end]
    cap = re.search(r"\\caption\{(.*?)\}\s*$", blk, re.S).group(1)
    assert "Qwen3-4B-Thinking-2507" in cap and "greedy" in cap
    prompt = re.search(r"\\textbf\{Prompt:\} \\emph\{([^}]*)\}", blk).group(1)
    bits, cur, ref = {}, None, None
    for line in blk.splitlines():
        m = re.search(r"\\textit\{(\d)-bit \(INT\d\)\}", line)
        if m:
            cur = "INT" + m.group(1)
            bits[cur] = []
            continue
        if line.startswith(r"\rowcolor") or " & " not in line or r"\multicolumn" in line:
            continue
        name, text = line.split(" & ", 1)
        text = re.sub(r"\\\\(\[[^\]]*\])?\s*$", "", text.rstrip())
        name = detex(name).replace(" (ours)", "")
        row = {"m": name, "text": detex(text)}
        if cur is None:
            ref = row
        else:
            bits[cur].append(row)
    order = ["RTN", "GPTQ", "AWQ", "Standard QAT", "Denoising QAT", "LSQ", "BitDistiller", "QUASAR"]
    assert ref and ref["m"] == "FP16"
    assert list(bits) == ["INT2", "INT3", "INT4"] and all([r["m"] for r in v] == order for v in bits.values())
    return {"figure": "Figure 29", "model": "Qwen3-4B-Thinking-2507", "decoding": "greedy",
            "prompt": prompt, "reference": ref, "bits": {k: bits[k] for k in ("INT4", "INT3", "INT2")}}


def r(v, nd):
    return round(float(v), nd) + 0.0


def compact(o27, o28):
    for m in o27["models"]:
        for row in m["rows"]:
            for k in ("win", "tie", "loss"):
                row[k] = r(row[k], 1)
    for m in o28["models"]:
        m["ref"]["ratio"] = r(m["ref"]["ratio"], 3)
        for row in m["rows"]:
            row["ratio"] = r(row["ratio"], 3)


def check_plots(D, out):
    """Re-plot the JSON in the paper's layout (no paper code involved) for a visual side-by-side."""
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    plt.rcParams.update(plt.rcParamsDefault)
    a = D["fig27"]
    fig, axes = plt.subplots(1, 2, figsize=(7.8, 2.75), sharex=True)
    for ax, m in zip(axes, a["models"]):
        rows = list(reversed(m["rows"]))  # bottom -> top
        ys = [i + (0.55 if i >= 1 else 0) for i in range(len(rows))]
        for y, row in zip(ys, rows):
            ax.barh(y, row["win"], color="#D1495B", height=.66)
            ax.barh(y, row["tie"], left=row["win"], color="#D9D9D9", height=.66)
            ax.barh(y, row["loss"], left=row["win"] + row["tie"], color="#5F6366", height=.66)
            ax.text(row["win"] - 2, y, f"{row['win']:.0f}", ha="right", va="center", color="w", fontsize=8, weight="bold")
        ax.axvline(50, ls="--", color="k", lw=.8)
        ax.set_yticks(ys)
        ax.set_yticklabels([x["m"] for x in rows], fontsize=8)
        ax.set_xlim(0, 100)
        ax.set_title(m["label"], fontsize=9)
        ax.set_xlabel("Share of judged pairs (%)", fontsize=8)
    fig.tight_layout()
    fig.savefig(out / "check_fig27.png", dpi=150)
    plt.close(fig)
    b = D["fig28"]
    fig, axes = plt.subplots(1, 2, figsize=(7.9, 2.9))
    for ax, m in zip(axes, b["models"]):
        rows = m["rows"]
        ys = list(range(len(rows)))[::-1]
        for y, row in zip(ys, rows):
            ax.barh(y, row["ratio"], color="#888" if row["m"] != "QUASAR" else "#D1495B", height=.66)
            ax.text(row["ratio"] + .015, y, f"{row['ratio']:.2f}", va="center", fontsize=8)
            ax.text(1.05, y, f"{row['done']}/{b['n']}", va="center", fontsize=8, transform=ax.get_yaxis_transform())
        ax.axvline(m["ref"]["ratio"], ls="--", color="k", lw=1)
        ax.set_yticks(ys)
        ax.set_yticklabels([x["m"] for x in rows], fontsize=8)
        ax.set_xlim(0, 1.3)
        ax.set_xticks([0, .5, 1])
        ax.set_title(m["label"], fontsize=9)
        ax.set_xlabel("Word-repetition ratio", fontsize=8)
        ax.text(1.05, len(rows) - .28, m["done_label"], fontsize=7, transform=ax.get_yaxis_transform())
    fig.tight_layout(rect=(0, 0, .94, 1))
    fig.savefig(out / "check_fig28.png", dpi=150)
    plt.close(fig)
    print(f"check plots in {out}")


def main():
    o27, o28, o29 = fig27(), fig28(), fig29()
    compact(o27, o28)
    D = {"source": "arXiv 2608.13966v2, Appendix E.3", "generator": "tools/extract_ix_judge.py",
         "fig27": o27, "fig28": o28, "fig29": o29}
    out = Path(ARGS.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(D, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"wrote {out} ({out.stat().st_size / 1024:.1f} KB)")
    if ARGS.check:
        check_plots(json.loads(out.read_text()), ARGS.check)


if __name__ == "__main__":
    main()
