"""Extract the exact plotted series of the paper's curve figures into JSON.

Runs the paper's figure generators IN MEMORY (their save calls are intercepted,
nothing is written to the source checkout) and reads back the Line2D arrays they
plotted, so the page charts use the same runs, cells, binning and smoothing as
the arXiv v2 figures:

  healing   heal_curves_grid.pdf   (Figure 3)            -> healing_curves.json   [default]
  ablation  abl_curves.pdf         (Figure 4)            -> ablation_curves.json  [default]
  nvfp4     nvfp4_curves.pdf       (Figure 34)           -> nvfp4_curves.json     [opt-in, not served]
  adapt     adapt_curves_qwen.pdf  (Figure 30)           -> adapt_curves.json     [opt-in, not served]

Input (not distributed with this site; numpy + matplotlib required):
  --figure-src DIR / QUASAR_FIGURE_SRC   checkout of the paper's figure code and plot
                                         data (the directory that holds figs/paper_final/)

  QUASAR_FIGURE_SRC=... python3 tools/extract_curves.py [healing ablation nvfp4 adapt] [--out DIR]
Writes assets/data/<name>_curves.json in this site repo (or --out DIR).
"""
import argparse
import json
import os
import runpy
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # never drop __pycache__ into the source checkout
TARGETS = ("healing", "ablation", "nvfp4", "adapt")
DEFAULT_TARGETS = ("healing", "ablation")
SITE = Path(__file__).resolve().parents[1]
_ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
_ap.add_argument("targets", nargs="*", help="any of " + ", ".join(TARGETS) + " (default: healing ablation)")
_ap.add_argument("--figure-src", help="paper figure checkout (default $QUASAR_FIGURE_SRC)")
_ap.add_argument("--out", default=str(SITE / "assets" / "data"), help="output directory")
ARGS = _ap.parse_args()
_bad = [t for t in ARGS.targets if t not in TARGETS]
if _bad:
    _ap.error(f"unknown target(s) {_bad}; choose from {', '.join(TARGETS)}")
_src = ARGS.figure_src or os.environ.get("QUASAR_FIGURE_SRC")
if not _src:
    sys.exit("extract_curves.py: set --figure-src or $QUASAR_FIGURE_SRC "
             "(checkout holding the paper's figs/paper_final/ generators)")
LAQ = Path(_src).expanduser()
PF = LAQ / "figs" / "paper_final"
if not (PF / "style.py").is_file():
    sys.exit(f"extract_curves.py: {PF} has no style.py; --figure-src / $QUASAR_FIGURE_SRC must point "
             "at the checkout that holds figs/paper_final/")
OUT = Path(ARGS.out).resolve()
os.environ.setdefault("MPLCONFIGDIR", str(Path(os.environ.get("TMPDIR", "/tmp")) / "quasar-site-mpl"))
sys.path.insert(0, str(PF))

import numpy as np  # noqa: E402
import matplotlib  # noqa: E402
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

import style as S  # noqa: E402  (paper house style: labels + colors)
import gridstyle as G  # noqa: E402

CAPTURED = {}
S.save = lambda fig, name: CAPTURED.__setitem__(name, fig)
G.save = lambda fig, name, out_dirs: CAPTURED.__setitem__(name, fig)

KEY = {"ours": "quasar", "ste": "standard_qat", "lsq": "lsq", "gdm": "denoising_qat",
       "bitdistiller": "bitdistiller", "stdmax": "standard_qat", "fp16": "fp_sft",
       "fitonly": "adam_fit", "initonly": "init_only", "salnone": "uniform_fit",
       "salfisher_b999": "fisher_fit"}
SOURCE = "arXiv v2 (2608.13966)"
GENERATOR = "tools/extract_curves.py"


def inputs(fig):
    return f"plotted series of arXiv 2608.13966v2 {fig}, read back from the figure's own plotting code"


def r5(v):
    return float(f"{float(v):.5g}")


def xy(line, transform=None):
    x = np.asarray(line.get_xdata(), float)
    y = np.asarray(line.get_ydata(), float)
    if transform is not None:
        y = transform(y)
    return [[int(round(a)) if float(a).is_integer() else r5(a), r5(b)] for a, b in zip(x, y)]


def raw_pairs(pts, transform=None):
    return [[int(s), r5(transform(v) if transform else v)] for s, v in pts]


def lims(ax):
    return {"xlim": [r5(v) for v in ax.get_xlim()], "ylim": [r5(v) for v in ax.get_ylim()],
            "yticks": [r5(v) for v in ax.get_yticks()],
            "xticks": [r5(v) for v in ax.get_xticks()]}


def method_meta(arm, label, color, ls="-", marker=None, lw=None):
    d = {"key": KEY.get(arm, arm), "label": label, "color": color, "source_arm": arm,
         "linestyle": ls if isinstance(ls, str) else "dotted"}
    if marker:
        d["eval_marker"] = marker
    if lw is not None:
        d["paper_linewidth"] = lw
    return d


def dump(name, obj):
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / name
    p.write_text(json.dumps(obj, separators=(",", ":")) + "\n")
    print(f"wrote {p} ({p.stat().st_size / 1024:.1f} KB)")


# ------------------------------------------------------------------ healing (Figure 3)
def healing():
    sys.argv = ["fig_curves_healing_page.py"]
    from fig_curves_healing_page import load_original  # noqa: E402
    ns, originals = load_original()
    P, arms = ns["P"], ns["ARMS"]
    models = {"qwen": "Qwen3-4B-Thinking-2507", "llama": "Llama-3.1-8B-Instruct"}
    out = {
        "figure": "heal_curves_grid.pdf (Figure 3, label fig:heald-curves)",
        "caption": ("QAD of Qwen3-4B-Thinking-2507 (left) and Llama-3.1-8B-Instruct (right) at INT4, INT3, "
                    "and INT2 on Open-PerfectBlend. We show training loss over the full run, the final 1{,}000 "
                    "steps, and held-out evaluation loss. All losses are forward KL to the full-precision model."),
        "source": SOURCE,
        "generator": GENERATOR,
        "inputs": inputs("Figure 3"),
        "processing": {
            "train": ("raw logged train loss (forward KL), steps >= 10; Qwen logged every step is subsampled "
                      "every 10th; then mean of consecutive pairs -> 20-step cadence (identical to the paper "
                      "panel; no EMA). zoom panel = same series restricted to steps 3072-4096."),
            "eval": "in-loop held-out forward KL every 128 steps from step 128, centered moving average of 3 (paper)",
            "eval_raw": "same in-loop evals without smoothing",
        },
        "basis_note": ("In-loop held-out KL (curve basis). Table 1 / Table 4 KL uses a separate fidelity "
                       "evaluation, so final values differ slightly (e.g. Qwen INT2 QUASAR 0.112 in-loop vs 0.126 in the tables)."),
        "models": list(models.values()),
        "bits": ["INT4", "INT3", "INT2"],
        "methods": [method_meta(a, S.LABEL[a], S.COLOR[a], marker=ns["MARKER"][a],
                                lw=0.9 if a == "ours" else 0.4) for a in arms],
        "axes": {}, "series": {},
    }
    for mk, mname in models.items():
        axes9 = originals[f"heal_curves_{mk}"].axes
        assert len(axes9) == 9
        out["series"][mname], out["axes"][mname] = {}, {}
        curves = P.curves(mk)
        for bi, bit in enumerate((4, 3, 2)):
            tr, zm, ev = axes9[bi * 3: bi * 3 + 3]
            assert len(tr.lines) == len(zm.lines) == len(ev.lines) == len(arms)
            b = f"INT{bit}"
            out["axes"][mname][b] = {"train": lims(tr), "zoom": lims(zm), "eval": lims(ev)}
            out["series"][mname][b] = {}
            for arm, lt, le in zip(arms, tr.lines, ev.lines):
                rawev = [(s, v) for s, v in curves[(arm, bit)]["eval_kl"] if s >= 128]
                assert len(rawev) == len(le.get_xdata())
                out["series"][mname][b][KEY[arm]] = {
                    "train": xy(lt), "eval": xy(le), "eval_raw": raw_pairs(rawev),
                    "eval_step0": r5(dict(curves[(arm, bit)]["eval_kl"]).get(0, float("nan")))
                    if 0 in dict(curves[(arm, bit)]["eval_kl"]) else None,
                }
    for f in originals.values():
        plt.close(f)
    dump("healing_curves.json", out)
    return out


# ------------------------------------------------------------------ NVFP4 (appendix fig:nvfp4-curves)
def nvfp4():
    ns = runpy.run_path(str(PF / "fig_nvfp4_curves.py"), run_name="nvfp4_in_memory")
    fig = CAPTURED.pop("nvfp4_curves")
    names = {"q8b": "Qwen3-8B", "q9b": "Qwen3.5-9B"}
    arms = ns["ARMS"]
    out = {
        "figure": "nvfp4_curves.pdf (appendix, label fig:nvfp4-curves)",
        "caption": ("Training forward KL over the full run (left) and final 1{,}000 steps (center), and held-out "
                    "forward KL (right), for NVFP4 QAD of Qwen3-8B (top) and Qwen3.5-9B (bottom)."),
        "source": SOURCE,
        "generator": GENERATOR,
        "inputs": inputs("Figure 34"),
        "processing": {
            "train": ("logged HF Trainer loss; Qwen3-8B 4-step logs subsampled to 8-step and divided by 4 "
                      "(GA8 -> GA2 normalization, as in the paper); mean of consecutive pairs -> ~16-step cadence"),
            "eval": "logged held-out forward KL, centered moving average of 3",
            "eval_raw": "same without smoothing",
        },
        "basis_note": ("In-loop held-out KL during training. Table 3 KL (0.036 vs 0.041; 0.028 vs 0.033) is measured on "
                       "materialized checkpoints through vLLM, so ratios differ: do not derive the paper's -12%/-15% from these curves."),
        "models": list(names.values()), "bits": ["NVFP4"],
        "methods": [method_meta(a, l, ns["CLR"][a], lw=0.9 if a == "ours" else 0.4) for a, l in arms],
        "axes": {}, "series": {},
    }
    rows = ns["axes"]
    for i, mk in enumerate(["q8b", "q9b"]):
        (axf, axe), = rows[i]
        inset = axf.child_axes[0]
        pts = ns["load_csv"](mk)
        assert len(axf.lines) == len(axe.lines) == len(inset.lines) == len(arms)
        m = names[mk]
        out["axes"][m] = {"NVFP4": {"train": lims(axf), "zoom": lims(inset), "eval": lims(axe)}}
        out["series"][m] = {"NVFP4": {}}
        for (arm, _), lt, le in zip(arms, axf.lines, axe.lines):
            out["series"][m]["NVFP4"][KEY[arm]] = {"train": xy(lt), "eval": xy(le),
                                                   "eval_raw": raw_pairs(pts[arm]["eval"])}
    plt.close(fig)
    dump("nvfp4_curves.json", out)
    return out


# ------------------------------------------------------------------ ablation (Figure 4)
def ablation():
    ns = runpy.run_path(str(PF / "fig_ablation_curves_w2.py"), run_name="abl_in_memory")
    fig = CAPTURED.pop("abl_curves")
    order = ns["ORDER"]
    lab = dict(ns["LABEL"], ours="QUASAR")
    out = {
        "figure": "abl_curves.pdf (Figure 4, label fig:heald-abl)",
        "caption": ("Ablation Study: INT2 QAD for Qwen3-4B-Thinking-2507 with different choices for QUASAR's "
                    "components. Training and evaluation (held-out) loss both use forward KL."),
        "source": SOURCE,
        "generator": GENERATOR,
        "inputs": inputs("Figure 4"),
        "processing": {"train": "raw train loss, 10-step cadence (1-step logs subsampled), mean of consecutive pairs -> 20 steps",
                       "eval": "held-out forward KL from step 128, centered moving average of 3",
                       "eval_raw": "same without smoothing"},
        "basis_note": "In-loop held-out KL; Table 8 values are the final points of these curves (Standard QAT 0.175, QUASAR 0.112).",
        "models": ["Qwen3-4B-Thinking-2507"], "bits": ["INT2"],
        "methods": [dict(method_meta(v, lab[v], ns["COLOR"][v], ls=ns["LINESTYLE"][v],
                                     lw=1.6 if v == "ours" else 1.0),
                         scale_search=ns["SEARCH"][v], saliency=ns["SALIENCY"][v]) for v in order],
        "axes": {"Qwen3-4B-Thinking-2507": {"INT2": {"train": lims(ns["ax_full"]), "zoom": lims(ns["inset"]),
                                                      "eval": lims(ns["ax_eval"])}}},
        "series": {"Qwen3-4B-Thinking-2507": {"INT2": {}}},
    }
    assert len(ns["ax_full"].lines) == len(ns["ax_eval"].lines) == len(order)
    for v, lt, le in zip(order, ns["ax_full"].lines, ns["ax_eval"].lines):
        out["series"]["Qwen3-4B-Thinking-2507"]["INT2"][KEY[v]] = {
            "train": xy(lt), "eval": xy(le), "eval_raw": raw_pairs(ns["eval_series"](v))}
    plt.close(fig)
    dump("ablation_curves.json", out)
    return out


# ------------------------------------------------------------------ adaptation (appendix fig:adapt-curves)
def adapt():
    sys.argv = ["fig_adapt_permodel.py", str(OUT), "qwen"]  # G.save is intercepted: nothing written
    ns = runpy.run_path(str(PF / "fig_adapt_permodel.py"), run_name="adapt_in_memory")
    fig = CAPTURED.pop("adapt_curves_qwen")
    labels = dict(S.LABEL, fp16="FP-SFT")
    arms = ns["ARMS"] + ["fp16"]
    out = {
        "figure": "adapt_curves_qwen.pdf (appendix, label fig:adapt-curves)",
        "caption": ("Training perplexity over the full run (left) and final 1{,}000 steps (center), and held-out "
                    "perplexity (right), for QAT of Qwen3-4B-Base on OpenMathReasoning. FP-SFT is included as a "
                    "full-precision reference."),
        "source": SOURCE,
        "generator": GENERATOR,
        "inputs": inputs("Figure 30"),
        "processing": {"train": ("cross-entropy at 10-step cadence (1-step logs subsampled); first record kept, then "
                                 "means of 5-record blocks (~50-step cadence); plotted as PPL = exp(mean CE)"),
                       "eval": "held-out CE from step 128, centered moving average of 3, then PPL = exp(.)",
                       "eval_raw": "held-out PPL = exp(CE) without smoothing"},
        "basis_note": ("In-loop held-out PPL. Table 2 PPL comes from separate CE artifacts; finals agree to 2 decimals "
                       "except QUASAR INT3 (curve 1.627, Table 2 1.62)."),
        "metric": "perplexity", "models": ["Qwen3-4B-Base"], "bits": ["INT4", "INT3", "INT2"],
        "methods": [method_meta(a, labels[a], S.COLOR[a], ls="--" if a == "fp16" else "-",
                                marker=ns["MARKER"].get(a), lw=0.9 if a == "ours" else 0.4) for a in arms],
        "axes": {"Qwen3-4B-Base": {}}, "series": {"Qwen3-4B-Base": {}},
    }
    data = ns["load"]()
    fax = fig.axes
    assert len(fax) == 6
    for i, bit in enumerate(ns["BITS"]):
        b = f"INT{bit[1]}"
        axf, axe = fax[2 * i], fax[2 * i + 1]
        sr = ns["series"](data, "qwen", bit)
        evk = [a for a, v in sr.items() if v["eval"]]
        assert len(axf.lines) == len(sr) and len(axe.lines) == len(evk)
        out["axes"]["Qwen3-4B-Base"][b] = {"train": lims(axf), "zoom": lims(axf.child_axes[0]), "eval": lims(axe)}
        d = {}
        for a, lt in zip(sr, axf.lines):
            d[KEY.get(a, a)] = {"train": xy(lt)}
        for a, le in zip(evk, axe.lines):
            d[KEY.get(a, a)]["eval"] = xy(le)
            d[KEY.get(a, a)]["eval_raw"] = raw_pairs(sr[a]["eval"], transform=np.exp)
        out["series"]["Qwen3-4B-Base"][b] = d
    plt.close(fig)
    dump("adapt_curves.json", out)
    return out


if __name__ == "__main__":
    for t in dict.fromkeys(ARGS.targets or DEFAULT_TARGETS):
        {"healing": healing, "ablation": ablation, "nvfp4": nvfp4, "adapt": adapt}[t]()
