"""Extract the plotted data of a healing-appendix figure for the interactive page version.

Runs the paper's own figure generator IN MEMORY (its save calls are intercepted, nothing
is written to the source checkout) and reads back what it plotted, so the page uses the
same cells and normalization as the arXiv v2 figure:

  fig22  radar_w2.pdf  (Figure 22)  fig_pertask_w2.py  INT2 per-task accuracy / full precision

Input (not distributed with this site; numpy + matplotlib required):
  --figure-src DIR / QUASAR_FIGURE_SRC   checkout of the paper's figure code and plot data
                                         (the directory that holds figs/paper_final/)

  QUASAR_FIGURE_SRC=... python3 tools/extract_ix_heal2.py [--out DIR] [--check-png DIR]

Writes assets/data/ix-heal2.json in this site repo (or --out DIR). With --check-png DIR it also
renders a matplotlib check plot of the written JSON (for side-by-side comparison with the paper).
"""
import argparse
import json
import os
import runpy
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # never drop __pycache__ into the source checkout
SITE = Path(__file__).resolve().parents[1]
_ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
_ap.add_argument("--figure-src", help="paper figure checkout (default $QUASAR_FIGURE_SRC)")
_ap.add_argument("--out", default=str(SITE / "assets" / "data"), help="output directory")
_ap.add_argument("--check-png", help="also render check plots of the written JSON into this directory")
ARGS = _ap.parse_args()
_src = ARGS.figure_src or os.environ.get("QUASAR_FIGURE_SRC")
if not _src:
    sys.exit("extract_ix_heal2.py: set --figure-src or $QUASAR_FIGURE_SRC "
             "(checkout holding the paper's figs/paper_final/ generators)")
LAQ = Path(_src).expanduser()
PF = LAQ / "figs" / "paper_final"
for f in ("style.py", "paperdata.py", "fig_pertask_w2.py"):
    if not (PF / f).is_file():
        sys.exit(f"extract_ix_heal2.py: {PF / f} not found; --figure-src / $QUASAR_FIGURE_SRC must point "
                 "at the checkout that holds figs/paper_final/")
OUT = Path(ARGS.out).resolve()
os.environ.setdefault("MPLCONFIGDIR", str(Path(os.environ.get("TMPDIR", "/tmp")) / "quasar-site-mpl"))
sys.path.insert(0, str(PF))

import numpy as np  # noqa: E402
import matplotlib  # noqa: E402
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

import style as S  # noqa: E402  (paper house style: labels + colors; applies the paper mplstyle)

matplotlib.rcParams["text.usetex"] = False  # nothing is rendered; only the plotted arrays are read back
CAPTURED = {}
S.save = lambda fig, name: CAPTURED.__setitem__(name, fig)

KEY = {"ours": "quasar", "ste": "standard_qat", "gdm": "denoising_qat", "bitdistiller": "bitdistiller"}
MODELS = {"qwen": "Qwen3-4B-Thinking-2507", "llama": "Llama-3.1-8B-Instruct"}
SOURCE = "arXiv 2608.13966v2"


def r4d(v):
    return round(float(v), 4)


def run(script):
    """Execute one paper generator in memory; returns its namespace (save calls captured)."""
    sys.argv = [script]
    return runpy.run_path(str(PF / script), run_name=script.replace(".py", "") + "_in_memory")


# ------------------------------------------------------------------ Figure 22 (radar)
# Table 6 column names for the generator's task keys (same eight cells; Qwen IFEval = think-stripped, as in Table 6)
BENCH = {"gsm8k": "GSM8K", "mmlu": "MMLU", "arc_c": "ARC-C", "arc_e": "ARC-E", "hellaswag": "HellaSwag",
         "winogrande": "WinoGrande", "tqa_mc2": "TruthfulQA", "ifeval_p_stripped": "IFEval", "ifeval_p": "IFEval"}


def fig22():
    ns = run("fig_pertask_w2.py")
    fig = CAPTURED.pop("radar_w2")
    CAPTURED.pop("heal_pertask_delta_w2", None)
    P = ns["P"]
    axes = [a for a in fig.axes if a.name == "polar"]
    assert len(axes) == 2
    arms = ["ours", "ste", "gdm", "bitdistiller"]
    out = {
        "figure": "Figure 22 (radar_w2.pdf)",
        "processing": ("per-task INT2 accuracy divided by the full-precision model's accuracy on the same task, "
                       "clipped to [0, 1.05] (as plotted in the paper); Qwen IFEval = think-stripped prompt-level "
                       "accuracy (the Table 6 column)"),
        "rmax": 1.05, "rings": [0.25, 0.5, 0.75, 1.0], "ring_labels": ["", "0.5", "0.75", "1.0"],
        "methods": [{"key": KEY[a], "label": S.LABEL[a], "color": S.COLOR[a]} for a in arms],
        "fp_label": S.LABEL["fp16"],
        "models": [],
    }
    for ax, mk in zip(axes, ("qwen", "llama")):
        cap = P.capability(mk)
        ife_key = ns["IFEVAL"][mk][0]
        cols = ns["TASKS"] + [ife_key]
        lines = {ln.get_label(): ln for ln in ax.lines}
        theta = np.asarray(lines[S.LABEL["ours"]].get_xdata(), float)[:-1]
        assert np.allclose(theta, np.linspace(0, 2 * np.pi, len(cols), endpoint=False))
        assert ax.get_theta_offset() == np.pi / 2 and ax.get_theta_direction() == -1
        fp = np.asarray(lines[S.LABEL["fp16"]].get_ydata(), float)[:-1]
        assert np.allclose(fp, 1.0)
        m = {"name": MODELS[mk], "benchmarks": [BENCH[c] for c in cols],
             "fp_acc": [round(cap["fp16"][c] * 100, 1) for c in cols], "ratio": {}, "acc": {}}
        for a in arms:
            ln = lines[S.LABEL[a]]
            r = np.asarray(ln.get_ydata(), float)
            assert np.isclose(r[0], r[-1]) and len(r) == len(cols) + 1          # closed polygon
            want = [np.clip(cap[f"{a}_w2"][c] / cap["fp16"][c], 0.0, 1.05) for c in cols]
            assert np.allclose(r[:-1], want)
            m["ratio"][KEY[a]] = [r4d(v) for v in r[:-1]]
            m["acc"][KEY[a]] = [round(cap[f"{a}_w2"][c] * 100, 1) for c in cols]
        out["models"].append(m)
    plt.close(fig)
    return out


def check_plots(doc, outdir):
    """Re-plot the written JSON with matplotlib (same layout as the paper) for a side-by-side check."""
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    plt.rcParams.update({"text.usetex": False, "font.family": "sans-serif"})
    col = {m["key"]: m["color"] for m in doc["fig22"]["methods"]}
    # Figure 22
    d = doc["fig22"]
    fig, axes = plt.subplots(1, 2, figsize=(6.6, 3.3), subplot_kw={"projection": "polar"})
    for ax, m in zip(axes, d["models"]):
        n = len(m["benchmarks"])
        th = np.linspace(0, 2 * np.pi, n, endpoint=False)
        thc = np.concatenate([th, th[:1]])
        ax.set_theta_offset(np.pi / 2)
        ax.set_theta_direction(-1)
        ax.plot(thc, np.ones(n + 1), color="#111111", ls="--", lw=1.0)
        for k in ("standard_qat", "denoising_qat", "bitdistiller", "quasar"):
            r = m["ratio"][k] + m["ratio"][k][:1]
            ax.plot(thc, r, color=col[k], lw=1.9 if k == "quasar" else 1.1)
            if k == "quasar":
                ax.fill(thc, r, color=col[k], alpha=0.15)
        ax.set_ylim(0, d["rmax"])
        ax.set_rgrids(d["rings"], labels=d["ring_labels"], angle=22.5, fontsize=7)
        ax.set_xticks(th)
        ax.set_xticklabels(m["benchmarks"], fontsize=8)
        ax.set_title(m["name"] + " (from JSON)", fontsize=9, pad=14)
    fig.tight_layout()
    fig.savefig(outdir / "fig22_from_json.png", dpi=150)
    plt.close(fig)
    print(f"check plots -> {outdir}")


def main():
    doc = {
        "source": SOURCE,
        "generator": "tools/extract_ix_heal2.py",
        "inputs": "plotted data of arXiv 2608.13966v2 Figure 22, read back from the figure's own plotting code",
        "fig22": fig22(),
    }
    # cross-check Figure 22 accuracies against Table 6 as served on the page (same cells, one decimal)
    res = SITE / "assets" / "data" / "results.json"
    if res.is_file():
        t6 = json.loads(res.read_text())["healing"]["standard_tasks"]["models"]
        lab = {"quasar": "QUASAR", "standard_qat": "Standard QAT", "denoising_qat": "Denoising QAT",
               "bitdistiller": "BitDistiller"}
        for m in doc["fig22"]["models"]:
            rows = {r["method"]: r["values"] for r in t6[m["name"]]["INT2"]}
            fp = t6[m["name"]]["full_precision"][0]["values"]
            for i, b in enumerate(m["benchmarks"]):
                assert abs(fp[b] - m["fp_acc"][i]) < 0.051, (m["name"], b, fp[b], m["fp_acc"][i])
                for k, name in lab.items():
                    assert abs(rows[name][b] - m["acc"][k][i]) < 0.051, (m["name"], name, b)
        print("fig22 accuracies match Table 6 (results.json)")
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / "ix-heal2.json"
    p.write_text(json.dumps(doc, separators=(",", ":")) + "\n")
    print(f"wrote {p} ({p.stat().st_size / 1024:.1f} KB)")
    if ARGS.check_png:
        check_plots(json.loads(p.read_text()), ARGS.check_png)


if __name__ == "__main__":
    main()
