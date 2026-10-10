"""Extract the data behind the NVFP4 appendix figures into assets/data/ix-nvfp4app.json.

  fig35  nvfp4_longhorizon.pdf  (Figure 35)  (a) OpenAI-MRCR by context length, (b) terminating share
  tab10  nvfp4_longctx_tables   (Table 10)   non-termination rate, both models

Figure 35 is rebuilt by running the paper's own generator IN MEMORY (its save call is intercepted,
nothing is written to the source checkout) and reading back the arrays it plotted (Line2D data,
bar heights, axis limits), so the page uses the same runs and the same processing. Table 10 is
parsed from the arXiv source and cross-checked against the generator's trace metrics.

Inputs (not distributed with this site; numpy + matplotlib required):
  --figure-src DIR / QUASAR_FIGURE_SRC  checkout holding the paper's figs/paper_final/ generators
                                        and their figs/data/ plot data
  --arxiv-src DIR  / QUASAR_ARXIV_SRC   unpacked arXiv 2608.13966v2 source (nvfp4_longctx_tables.tex)

  python3 tools/extract_ix_nvfp4app.py [--out DIR]
  python3 tools/extract_ix_nvfp4app.py --check DIR [--v2-png DIR]
      re-plots Figure 35 from the written JSON (matplotlib) into DIR; with --v2-png (a folder
      holding a nvfp4_longhorizon.png render of the v2 PDF) it also writes a side-by-side comparison.
"""
import argparse
import contextlib
import io
import json
import os
import re
import runpy
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # never drop __pycache__ into the source checkout
SITE = Path(__file__).resolve().parents[1]
OUTNAME = "ix-nvfp4app.json"

ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
ap.add_argument("--figure-src", help="paper figure checkout (default $QUASAR_FIGURE_SRC)")
ap.add_argument("--arxiv-src", help="unpacked arXiv v2 source (default $QUASAR_ARXIV_SRC)")
ap.add_argument("--out", default=str(SITE / "assets" / "data"), help="output directory")
ap.add_argument("--check", metavar="DIR", help="re-plot from the written JSON into DIR (no extraction)")
ap.add_argument("--v2-png", metavar="DIR", help="with --check: folder of v2 figure PNG renders for side-by-sides")
ARGS = ap.parse_args()
OUT = Path(ARGS.out).resolve()
os.environ.setdefault("MPLCONFIGDIR", str(Path(os.environ.get("TMPDIR", "/tmp")) / "quasar-site-mpl"))

import numpy as np  # noqa: E402
import matplotlib  # noqa: E402
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

MODELS = {"q8b": "Qwen3-8B", "q9b": "Qwen3.5-9B"}
KEY = {"la": "quasar", "sm": "standard_qat", "fp": "bf16", "rtn": "rtn", "gptq": "gptq"}
LABEL = {"quasar": "QUASAR", "standard_qat": "Standard QAT", "bf16": "BF16", "rtn": "RTN", "gptq": "GPTQ"}


def sig(v, n=5):
    return float(f"{float(v):.{n}g}")


def r2(v):
    return round(float(v) + 0.0, 2)


# ====================================================================== extraction
def need(path_arg, env, what, probe):
    src = path_arg or os.environ.get(env)
    if not src:
        sys.exit(f"extract_ix_nvfp4app.py: set --{what} or ${env}")
    p = Path(src).expanduser()
    if not (p / probe).exists():
        sys.exit(f"extract_ix_nvfp4app.py: {p} has no {probe}; --{what} / ${env} must point at the right checkout")
    return p


def fig35(PF):
    cap = {}
    ns = runpy.run_path(str(PF / "fig_nvfp4_longhorizon.py"), run_name="longhorizon_in_memory")
    real = matplotlib.figure.Figure.savefig
    matplotlib.figure.Figure.savefig = lambda self, *a, **k: cap.__setitem__("fig", self)
    try:
        with contextlib.redirect_stdout(io.StringIO()):  # its "wrote ..." line: nothing is written
            ns["main"]()
    finally:
        matplotlib.figure.Figure.savefig = real
    fig = cap["fig"]
    ax1, ax2 = fig.axes[:2]
    arms, bins, tasks = ns["ARMS"], ns["BINS"], ns["TASKS"]
    assert len(ax1.lines) == len(arms)
    # cross-check data source (generator loaders)
    mrcr = {r["arm"]: r for r in ns["tsv"]("nvfp4_mrcr.tsv")}
    trace = {(r["task"], r["arm"]): r for r in ns["tsv"]("nvfp4_trace_metrics.tsv")}
    a = {"title": "(a) Long-context retrieval", "ytitle": "MRCR score (×100)",
         "bins": [lab.replace("--", "–") for _, lab in bins],
         "ylim": [sig(v) for v in ax1.get_ylim()], "yticks": [sig(v) for v in ax1.get_yticks()], "series": []}
    for (arm, label, col, st), ln in zip(arms, ax1.lines):
        y = np.asarray(ln.get_ydata(), float)
        ref = [100 * float(mrcr[ns["key"](arm)][b]) for b, _ in bins]
        assert np.allclose(y, ref)
        a["series"].append({"key": KEY[arm], "label": LABEL[KEY[arm]], "values": [r2(v) for v in y]})
    bars = [p for p in ax2.patches if isinstance(p, matplotlib.patches.Rectangle)]
    assert len(bars) == len(arms) * len(tasks)
    b = {"title": "(b) Long generation", "ytitle": "Terminating (%)",
         "tasks": [lab for _, lab in tasks], "budget_tokens": None,
         "ylim": [sig(v) for v in ax2.get_ylim()], "yticks": [sig(v) for v in ax2.get_yticks()], "series": []}
    budget = set()
    for i, (arm, label, col, st) in enumerate(arms):
        hs = [bars[i * len(tasks) + j].get_height() for j in range(len(tasks))]
        ref = [100 * (1 - float(trace[(t, ns["key"](arm))]["frac_hit_limit"])) for t, _ in tasks]
        assert np.allclose(hs, ref)
        for t, _ in tasks:
            budget.add(int(trace[(t, ns["key"](arm))]["max_new_tokens"]))
        b["series"].append({"key": KEY[arm], "label": LABEL[KEY[arm]], "values": [r2(v) for v in hs]})
    assert budget == {32768}
    b["budget_tokens"] = 32768
    plt.close(fig)
    return {"source": "Figure 35", "model": MODELS[ns["MODEL"]], "a": a, "b": b,
            "methods": [{"key": KEY[x[0]], "label": LABEL[KEY[x[0]]]} for x in arms]}, trace, ns


def tab10(AX, trace, ns35):
    tex = (AX / "nvfp4_longctx_tables.tex").read_text()
    m = re.search(r"\\caption\{(.*?)\}\s*\\label\{tab:nvfp4-budget\}", tex, re.S)
    assert m, "tab:nvfp4-budget not found"
    body = tex[m.end():]
    head = re.search(r"Method\s*&(.*?)\\\\", body).group(1)
    cols = [re.sub(r"\\multicolumn\{1\}\{c\}\{(.*?)\}", r"\1", c).strip() for c in head.split("&")]
    models, cur = [], None
    for line in body.splitlines():
        mm = re.search(r"\\textit\{([^}]*)\}", line)
        if mm:
            cur = {"name": mm.group(1), "rows": []}
            models.append(cur)
            continue
        if cur is None or "&" not in line or line.lstrip().startswith("\\multicolumn"):
            continue
        if "\\bottomrule" in line:
            break
        cells = [c.strip() for c in line.split("\\\\")[0].split("&")]
        name = re.sub(r"\\textbf\{(.*?)\}", r"\1", cells[0]).replace("~(ours)", "").strip()
        vals, best = [], []
        for c, col in zip(cells[1:], cols):
            bold = "\\textbf" in c
            vals.append(float(re.sub(r"\\textbf\{(.*?)\}", r"\1", c)))
            if bold:
                best.append(col)
        cur["rows"].append({"key": {v: k for k, v in LABEL.items()}[name], "label": name, "values": vals, "best": best})
    assert [x["name"] for x in models] == list(MODELS.values())
    # cross-check every cell against the trace metrics behind Figure 35 (table = 1-decimal rounding)
    task_of = {"MATH-500": "math500", "LiveCodeBench v6": "lcb", "OJBench (C++)": "ojb_cpp", "OJBench (Python)": "ojb_py"}
    arm_of = {"bf16": "fp", "rtn": "rtn", "gptq": "gptq", "standard_qat": "sm", "quasar": "la"}
    mk_of = {v: k for k, v in MODELS.items()}
    for mdl in models:
        for row in mdl["rows"]:
            arm = arm_of[row["key"]]
            k = ("fp_" + mk_of[mdl["name"]]) if arm == "fp" else (mk_of[mdl["name"]] + "_" + arm)
            for col, v in zip(cols, row["values"]):
                exact = 100 * float(trace[(task_of[col], k)]["frac_hit_limit"])
                assert abs(exact - v) <= 0.05 + 1e-9, (mdl["name"], row["label"], col, v, exact)
    # optional cross-check against this site's results.json (Table 10 as parsed by build_results.py)
    rj = SITE / "assets" / "data" / "results.json"
    if rj.is_file():
        nt = json.loads(rj.read_text())["nvfp4"]["non_termination"]
        assert nt["columns"] == cols
        for mdl in models:
            for row, ref in zip(mdl["rows"], nt["models"][mdl["name"]]):
                assert row["label"] == ref["method"] and row["values"] == [ref["values"][c] for c in cols]
    return {"source": "Table 10", "columns": cols, "budget_tokens": 32768, "unit": "%", "models": models}


def extract():
    LAQ = need(ARGS.figure_src, "QUASAR_FIGURE_SRC", "figure-src", "figs/paper_final/style.py")
    AX = need(ARGS.arxiv_src, "QUASAR_ARXIV_SRC", "arxiv-src", "nvfp4_longctx_tables.tex")
    PF = LAQ / "figs" / "paper_final"
    sys.path.insert(0, str(PF))
    out = {"paper": "arXiv 2608.13966v2", "generator": "tools/extract_ix_nvfp4app.py"}
    f35, trace, ns35 = fig35(PF)
    out["fig35"] = f35
    out["tab10"] = tab10(AX, trace, ns35)
    # Figure 35(b) is the complement of the Qwen3.5-9B rows of Table 10 (same generations): the page
    # prints 100 - (Table 10 value) so the two cards agree to the decimal; check that this is a valid
    # 1-decimal rounding of the plotted bar heights.
    t9 = next(m for m in out["tab10"]["models"] if m["name"] == f35["model"])
    for s in f35["b"]["series"]:
        row = next(r for r in t9["rows"] if r["key"] == s["key"])
        s["display"] = [round(100 - v, 1) for v in row["values"]]
        for exact, d in zip(s["values"], s["display"]):
            assert abs(exact - d) <= 0.05 + 0.006, (s["key"], exact, d)
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / OUTNAME
    txt = json.dumps(out, separators=(",", ":"), ensure_ascii=False) + "\n"
    for bad in ("/Users", "/private", "slinky", "research-", "overleaf"):
        assert bad not in txt, bad
    p.write_text(txt)
    print(f"wrote {p} ({p.stat().st_size / 1024:.1f} KB)")


# ====================================================================== check plots
def check():
    D = json.loads((OUT / OUTNAME).read_text())
    od = Path(ARGS.check).resolve()
    od.mkdir(parents=True, exist_ok=True)
    plt.rcParams.update({"text.usetex": False, "font.size": 7, "axes.spines.top": False, "axes.spines.right": False})
    CL = {"quasar": "#D1495B", "standard_qat": "#3F4245", "bf16": "#111111", "rtn": "#C5C8CB", "gptq": "#6B6E70"}
    # --- Figure 35
    F = D["fig35"]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(4.0, 1.55), gridspec_kw=dict(width_ratios=[1.15, 1.0], wspace=0.42))
    x = np.arange(len(F["a"]["bins"]))
    for s in F["a"]["series"]:
        a1.plot(x, s["values"], color=CL[s["key"]], ls="--" if s["key"] == "bf16" else "-", marker="o", ms=2.5,
                lw=2 if s["key"] == "quasar" else 1.3, label=s["label"])
    a1.set_xticks(x); a1.set_xticklabels(F["a"]["bins"], rotation=35, ha="right")
    a1.set_ylim(F["a"]["ylim"]); a1.set_yticks(F["a"]["yticks"]); a1.set_title(F["a"]["title"], loc="left")
    n, w = len(F["b"]["series"]), 0.8 / len(F["b"]["series"])
    xt = np.arange(len(F["b"]["tasks"]))
    for i, s in enumerate(F["b"]["series"]):
        a2.bar(xt + (i - (n - 1) / 2) * w, s["values"], width=w * 0.95, color=CL[s["key"]])
    a2.set_xticks(xt); a2.set_xticklabels(F["b"]["tasks"], rotation=35, ha="right")
    a2.set_ylim(F["b"]["ylim"]); a2.set_yticks(F["b"]["yticks"]); a2.set_title(F["b"]["title"], loc="left")
    fig.legend(*a1.get_legend_handles_labels(), loc="upper center", ncol=5, frameon=False, bbox_to_anchor=(0.5, 1.12))
    fig.savefig(od / "check_fig35.png", dpi=300, bbox_inches="tight")
    plt.close(fig)
    # --- Table 10 as text
    T = D["tab10"]
    lines = ["Method".ljust(14) + "".join(c.rjust(18) for c in T["columns"])]
    for m in T["models"]:
        lines.append(m["name"])
        for r in m["rows"]:
            lines.append(r["label"].ljust(14) + "".join(f"{v:18.1f}" for v in r["values"]))
    (od / "check_tab10.txt").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))
    if ARGS.v2_png:
        from PIL import Image
        for name, mine in (("nvfp4_longhorizon", "check_fig35.png"),):
            a = Image.open(Path(ARGS.v2_png) / f"{name}.png").convert("RGB")
            b = Image.open(od / mine).convert("RGB")
            h = max(a.height, b.height)
            a = a.resize((int(a.width * h / a.height), h)); b = b.resize((int(b.width * h / b.height), h))
            c = Image.new("RGB", (a.width + b.width + 20, h), "white")
            c.paste(a, (0, 0)); c.paste(b, (a.width + 20, 0))
            c.save(od / f"sidebyside_{name}.png")
            print("wrote", od / f"sidebyside_{name}.png")


if __name__ == "__main__":
    if ARGS.check:
        check()
    else:
        extract()
