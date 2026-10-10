"""Extract the plotted data of the adaptation-appendix figures (Figures 30-33) into JSON.

Runs the paper's own figure generators IN MEMORY (their save calls are intercepted,
nothing is written to the source checkout) and reads back what they plotted, so the
page uses the same runs, cells, binning, smoothing and ordering as the arXiv v2 figures:

  Figure 30  adapt_curves_qwen.pdf  fig_adapt_permodel.py    train PPL (full + final 1k), held-out PPL
  Figure 31  adapt_failures.pdf     fig_adapt_failures.py    INT2 answer outcomes, MATH-500 / GSM8K
  Figure 32  adapt_dispersion.pdf   fig_adapt_dispersion.py  INT2 pass@8 / avg@1 on MATH-500
  Figure 33  adapt_divergence.pdf   fig_adapt_divergence.py  forward KL to FP-SFT by trace decile

Input (not distributed with this site; numpy + matplotlib + LaTeX required):
  --figure-src DIR / QUASAR_FIGURE_SRC   checkout of the paper's figure code and plot data
                                         (the directory that holds figs/paper_final/)
Optional fidelity check (matplotlib re-render of the written JSON, next to the paper figure):
  --check DIR                            write ix-adapt-check-figNN.png into DIR
  --paper-png DIR / QUASAR_PAPER_FIG_PNG directory with PNG renders of the v2 figures
                                         (<name>.png, e.g. adapt_failures.png) for side-by-side panels

  QUASAR_FIGURE_SRC=... python3 tools/extract_ix_adapt.py [--out DIR] [--check DIR]
Writes assets/data/ix-adapt.json in this site repo (or --out DIR).
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
_ap.add_argument("--check", help="write matplotlib check renders of the JSON into this directory")
_ap.add_argument("--paper-png", help="PNG renders of the v2 figures (default $QUASAR_PAPER_FIG_PNG)")
ARGS = _ap.parse_args()
_src = ARGS.figure_src or os.environ.get("QUASAR_FIGURE_SRC")
if not _src:
    sys.exit("extract_ix_adapt.py: set --figure-src or $QUASAR_FIGURE_SRC "
             "(checkout holding the paper's figs/paper_final/ generators)")
PF = Path(_src).expanduser() / "figs" / "paper_final"
for _f in ("style.py", "gridstyle.py", "fig_adapt_permodel.py", "fig_adapt_failures.py",
           "fig_adapt_dispersion.py", "fig_adapt_divergence.py"):
    if not (PF / _f).is_file():
        sys.exit(f"extract_ix_adapt.py: {PF} has no {_f}; --figure-src / $QUASAR_FIGURE_SRC must point "
                 "at the checkout that holds figs/paper_final/")
OUT = Path(ARGS.out).resolve()
os.environ.setdefault("MPLCONFIGDIR", str(Path(os.environ.get("TMPDIR", "/tmp")) / "quasar-site-mpl"))
sys.path.insert(0, str(PF))

import numpy as np  # noqa: E402
import matplotlib  # noqa: E402
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

import style as S  # noqa: E402  (paper house style)
import gridstyle as G  # noqa: E402

CAPTURED = {}
S.save = lambda fig, name: CAPTURED.__setitem__(name, fig)
G.save = lambda fig, name, out_dirs: CAPTURED.__setitem__(name, fig)

# paper arm -> page method key (colors live in the page script)
KEY = {"ours": "quasar", "laware": "quasar", "ste": "standard_qat", "lsq": "lsq", "gdm": "denoising_qat",
       "bitdistiller": "bitdistiller", "rtn": "rtn", "gptq": "gptq", "awq": "awq", "fp16": "fp_sft"}
LABEL = {"quasar": "QUASAR", "standard_qat": "Standard QAT", "lsq": "LSQ", "denoising_qat": "Denoising QAT",
         "bitdistiller": "BitDistiller", "rtn": "RTN", "gptq": "GPTQ", "awq": "AWQ", "fp_sft": "FP-SFT",
         "base": "Base (no SFT)"}


def sig(v, n=5):
    return float(f"{float(v):.{n}g}")


def rnd(v, d=4):
    return round(float(v), d)


# ------------------------------------------------------------------ Figure 30
def fig30():
    sys.argv = ["fig_adapt_permodel.py", str(OUT), "qwen"]  # G.save is intercepted: nothing is written
    ns = runpy.run_path(str(PF / "fig_adapt_permodel.py"), run_name="adapt_in_memory")
    fig = CAPTURED.pop("adapt_curves_qwen")
    arms = ns["ARMS"] + ["fp16"]
    data = ns["load"]()
    fax = fig.axes
    assert len(fax) == 6, len(fax)
    out = {
        "figure": "Figure 30", "model": "Qwen3-4B-Base", "data": "OpenMathReasoning",
        "processing": {
            "train": "train CE at a 10-step cadence; first record kept, then means of 5-record blocks; PPL = exp(mean CE)",
            "zoom": "the same train series restricted to steps 3072-4096",
            "eval": "held-out CE from step 128, centered moving average of 3, then PPL = exp(.)",
        },
        "methods": [KEY[a] for a in arms],
        "dashed": ["fp_sft"],
        "bits": ["INT4", "INT3", "INT2"],
        "xlim": {"train": [r for r in fax[0].get_xlim()], "eval": [r for r in fax[1].get_xlim()]},
        "xticks": [1024, 2048, 3072, 4096],
        "x": {}, "axes": {}, "series": {},
    }
    for i, bit in enumerate(ns["BITS"]):
        b = f"INT{bit[1]}"
        axf, axe = fax[2 * i], fax[2 * i + 1]
        inset = axf.child_axes[0]
        sr = ns["series"](data, "qwen", bit)
        assert list(sr) == arms, (list(sr), arms)
        assert len(axf.lines) == len(sr) == len(inset.lines) and len(axe.lines) == len(sr)
        out["axes"][b] = {
            "train": {"ylim": [sig(v) for v in axf.get_ylim()], "yticks": [sig(v) for v in axf.get_yticks()]},
            "zoom": {"xlim": [sig(v) for v in inset.get_xlim()], "ylim": [sig(v) for v in inset.get_ylim()]},
            "eval": {"ylim": [sig(v) for v in axe.get_ylim()], "yticks": [sig(v) for v in axe.get_yticks()]},
        }
        out["series"][b] = {}
        for a, lt, li, le in zip(arms, axf.lines, inset.lines, axe.lines):
            xt, yt = np.asarray(lt.get_xdata(), float), np.asarray(lt.get_ydata(), float)
            xe, ye = np.asarray(le.get_xdata(), float), np.asarray(le.get_ydata(), float)
            # the inset is the same plotted series masked to the zoom window
            xi, yi = np.asarray(li.get_xdata(), float), np.asarray(li.get_ydata(), float)
            m = (xt >= xi.min()) & (xt <= xi.max())
            assert np.array_equal(xt[m], xi) and np.allclose(yt[m], yi)
            for k, xs in (("train", xt), ("eval", xe)):
                xs = [int(round(v)) for v in xs]
                if k not in out["x"]:
                    out["x"][k] = xs
                assert out["x"][k] == xs, (b, a, k)
            out["series"][b][KEY[a]] = {"train": [sig(v) for v in yt], "eval": [sig(v) for v in ye]}
    plt.close(fig)
    out["final_ppl"] = table2_ppl()
    return out


def table2_ppl():
    """Table 2 held-out PPL per bit width and method: the page shows these at step 4,096 instead of the
    smoothed curve value (the curve's centered moving average can differ from Table 2 in the 2nd decimal)."""
    T = json.loads((SITE / "assets" / "data" / "results.json").read_text())["adaptation"]["bits"]
    inv = {v: k for k, v in LABEL.items()}
    return {b: {inv[r["method"]]: r["values"]["PPL"] for r in rows if r["method"] in inv} for b, rows in T.items()}


# ------------------------------------------------------------------ Figure 31
def fig31():
    import fig_adapt_failures as F  # the generator's own row builder (sorting, references)
    d = json.load(open(F.DATA))
    lab2key = {lab: KEY[arm] for arm, lab in F.ARMS}
    lab2key.update({"Base (no SFT)": "base", "FP-SFT": "fp_sft"})
    out = {"figure": "Figure 31", "model": "Qwen3-4B-Base", "bits": "INT2",
           "outcomes": [["right", "answered, correct"], ["wrong", "answered, wrong"], ["none", "no final answer"]],
           "benchmarks": [], "rows": {}}
    for bench, title in F.PANELS:
        rows, n_arms = F.build_rows(d, bench)
        out["benchmarks"].append([bench, title])
        out["rows"][bench] = []
        for i, (lab, c) in enumerate(rows):
            r, w, t = c["f_answered_right"], c["f_answered_wrong"], c["f_no_answer"]
            assert abs(r + w + t - 1) < 1e-9 and abs(r - c["avg1"]) < 1e-12
            out["rows"][bench].append({
                "key": lab2key[lab], "ref": i >= n_arms, "n": c["n"], "k": c["K"],
                "right": rnd(r, 5), "wrong": rnd(w, 5), "none": rnd(t, 5),
                # in-bar label exactly as the paper prints it (f"{100 r:.0f}", only when r >= 9 %)
                "lab": f"{100 * r:.0f}" if 100 * r >= 9 else None,
            })
    return out


# ------------------------------------------------------------------ Figure 32
def fig32():
    import fig_adapt_dispersion as D
    D.main()
    fig = CAPTURED.pop("adapt_dispersion")
    ax = fig.axes[0]
    bars = [p for p in ax.patches]
    ticks = [t.get_text().replace("\n", " ") for t in ax.get_xticklabels()]
    ref_y = [ln.get_ydata()[0] for ln in ax.lines]
    plt.close(fig)
    # same cell selection as the generator (tags + references), for avg@1 / pass@8 in tooltips
    d = json.load(open(D.DATA))
    get = lambda t: d.get(f"{t}|{D.BENCH}")  # noqa: E731
    cells = []
    for arm, lab, key in D.ARMS:
        tag = f"qwenb_{arm}_w{D.BIT}" if arm in D.PTQ else f"qwenb_w{D.BIT}_{arm}"
        c = get(tag)
        if c and c.get("dispersion"):
            cells.append((lab.replace("\n", " "), KEY[arm], c, False))
    cells.sort(key=lambda r: -r[2]["dispersion"])
    for tag, lab, key in D.REFS:
        c = get(tag)
        if c and c.get("dispersion"):
            cells.append((lab.replace("\n", " "), "base" if tag == "qwenb_base" else "fp_sft", c, True))
    assert [c[0] for c in cells] == ticks, (ticks, [c[0] for c in cells])
    assert len(bars) == len(cells)
    rows = []
    for (lab, key, c, ref), bar in zip(cells, bars):
        assert abs(bar.get_height() - c["dispersion"]) < 1e-12
        assert abs(c["passK"] / c["avg1"] - c["dispersion"]) < 1e-9
        ratio = rnd(c["dispersion"], 4)
        assert f"{ratio:.2f}" == f"{c['dispersion']:.2f}"  # the page prints the paper's 2-decimal labels
        rows.append({"key": key, "ref": ref, "ratio": ratio, "avg1": rnd(c["avg1"], 5), "pass8": rnd(c["passK"], 5)})
    fp = next(r for r in rows if r["key"] == "fp_sft")
    assert len(ref_y) == 1 and abs(ref_y[0] - fp["ratio"]) < 1e-4  # dashed line at FP-SFT's ratio
    return {"figure": "Figure 32", "model": "Qwen3-4B-Base", "bits": "INT2", "benchmark": "MATH-500",
            "n": cells[0][2]["n"], "k": cells[0][2]["K"], "temperature": 0.6, "rows": rows, "ref_line": "fp_sft"}


# ------------------------------------------------------------------ Figure 33
def fig33():
    import fig_adapt_divergence as V
    V.main()
    fig = CAPTURED.pop("adapt_divergence")
    ax = fig.axes[0]
    d = json.load(open(V.DATA))
    present = [a for a in V.ARMS if a[0] in d and V.BENCH in d[a[0]]]
    assert len(ax.lines) == len(present)
    series = []
    for (tag, lab, key, ls), ln in zip(present, ax.lines):
        assert ln.get_label() == lab
        y = np.asarray(ln.get_ydata(), float)
        assert np.allclose(y, d[tag][V.BENCH]["kl_decile_raw"])
        series.append({"key": KEY[key], "label": lab, "bits": lab.split()[-1], "dashed": not isinstance(ls, str),
                       "kl": [sig(v) for v in y]})
    ntr = {d[t][V.BENCH]["n_traces"] for t, *_ in present}
    assert len(ntr) == 1
    out = {"figure": "Figure 33", "model": "Qwen3-4B-Base", "benchmark": "MATH-500", "n_traces": ntr.pop(),
           "x": [int(v) for v in ax.lines[0].get_xdata()], "ylim0": 0, "yticks": [sig(v) for v in ax.get_yticks()],
           "ylim": [sig(v) for v in ax.get_ylim()], "series": series}
    plt.close(fig)
    return out


def dump(name, obj):
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / name
    p.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False) + "\n")
    print(f"wrote {p} ({p.stat().st_size / 1024:.1f} KB)")
    return p


# ------------------------------------------------------------------ check renders (from the JSON only)
SITE_COLOR = {"quasar": "#D1495B", "standard_qat": "#3F4245", "lsq": "#80B1A8", "denoising_qat": "#8E6C9A",
              "bitdistiller": "#C98A2B", "rtn": "#B4B8BD", "gptq": "#7F868E", "awq": "#A7ADB3",
              "fp_sft": "#C9A227", "base": "#CAC4B8"}


def check(path, png_dir):
    J = json.loads(Path(path).read_text())
    cdir = Path(ARGS.check).expanduser().resolve()
    cdir.mkdir(parents=True, exist_ok=True)
    plt.rcdefaults()
    plt.rcParams.update({"font.size": 8, "axes.spines.top": False, "axes.spines.right": False})

    def side(name, mine, paper):
        p = Path(png_dir) / f"{paper}.png" if png_dir else None
        if not p or not p.is_file():
            mine.savefig(cdir / f"ix-adapt-check-{name}.png", dpi=150)
            plt.close(mine)
            return
        import matplotlib.image as mpimg
        mine.savefig(cdir / f"_mine-{name}.png", dpi=150)
        plt.close(mine)
        a, b = mpimg.imread(p), mpimg.imread(cdir / f"_mine-{name}.png")
        f, axs = plt.subplots(2, 1, figsize=(10, 10 * (a.shape[0] / a.shape[1] + b.shape[0] / b.shape[1]) + .5))
        for x, im, t in zip(axs, (a, b), ("paper v2 figure", "re-rendered from ix-adapt.json")):
            x.imshow(im)
            x.set_title(t, fontsize=9)
            x.axis("off")
        f.tight_layout()
        f.savefig(cdir / f"ix-adapt-check-{name}.png", dpi=110)
        plt.close(f)
        (cdir / f"_mine-{name}.png").unlink()
        print("check:", cdir / f"ix-adapt-check-{name}.png")

    # Figure 30
    A = J["fig30"]
    f, axs = plt.subplots(3, 3, figsize=(9, 6.2))
    for r, b in enumerate(A["bits"]):
        ax3 = axs[r]
        ax = A["axes"][b]
        for k in A["methods"]:
            s = A["series"][b][k]
            ls = "--" if k in A["dashed"] else "-"
            lw = 1.4 if k == "quasar" else 0.8
            xt = np.array(A["x"]["train"])
            ax3[0].plot(xt, s["train"], color=SITE_COLOR[k], ls=ls, lw=lw)
            m = (xt >= ax["zoom"]["xlim"][0]) & (xt <= ax["zoom"]["xlim"][1])
            ax3[1].plot(xt[m], np.array(s["train"])[m], color=SITE_COLOR[k], ls=ls, lw=lw)
            ax3[2].plot(A["x"]["eval"], s["eval"], color=SITE_COLOR[k], ls=ls, lw=lw, label=LABEL[k])
        ax3[0].set_ylim(*ax["train"]["ylim"]); ax3[0].set_yticks(ax["train"]["yticks"]); ax3[0].set_xlim(*A["xlim"]["train"])
        ax3[1].set_ylim(*ax["zoom"]["ylim"]); ax3[1].set_xlim(*ax["zoom"]["xlim"])
        ax3[2].set_ylim(*ax["eval"]["ylim"]); ax3[2].set_yticks(ax["eval"]["yticks"]); ax3[2].set_xlim(*A["xlim"]["eval"])
        ax3[0].set_ylabel(b)
        for x in ax3:
            x.grid(alpha=.3)
    axs[0][0].set_title("train PPL"); axs[0][1].set_title("final 1,000 steps"); axs[0][2].set_title("held-out PPL")
    axs[0][2].legend(fontsize=6, ncol=2)
    f.tight_layout()
    side("fig30", f, "adapt_curves_qwen")

    # Figure 31
    B = J["fig31"]
    f, axs = plt.subplots(1, 2, figsize=(9, 2.9))
    for x, (bench, title) in zip(axs, B["benchmarks"]):
        rows = B["rows"][bench]
        n_arms = sum(not r["ref"] for r in rows)
        ys = [(len(rows) - 1 - i) - (0 if i < n_arms else .75) for i in range(len(rows))]
        for y, r in zip(ys, rows):
            x.barh(y, 100 * r["right"], color="#2E6F55", height=.66)
            x.barh(y, 100 * r["wrong"], left=100 * r["right"], color="#DDB967", height=.66)
            x.barh(y, 100 * r["none"], left=100 * (r["right"] + r["wrong"]), color="#BDC1C6", height=.66)
            if r["lab"]:
                x.text(100 * r["right"] - 1.5, y, r["lab"], ha="right", va="center", color="w", fontsize=8)
        x.set_yticks(ys); x.set_yticklabels([LABEL[r["key"]] for r in rows]); x.set_xlim(0, 100); x.set_title(title)
    f.tight_layout()
    side("fig31", f, "adapt_failures")

    # Figure 32
    C = J["fig32"]
    f, x = plt.subplots(figsize=(7.2, 1.9))
    xs = [i if not r["ref"] else i + .7 for i, r in enumerate(C["rows"])]
    for xx, r in zip(xs, C["rows"]):
        x.bar(xx, r["ratio"], color=SITE_COLOR[r["key"]], width=.72)
        x.text(xx, r["ratio"] + .09, f"{r['ratio']:.2f}", ha="center", va="bottom", fontsize=8)
    x.axhline(next(r["ratio"] for r in C["rows"] if r["key"] == C["ref_line"]), color="k", ls="--", lw=1)
    x.axhline(1, color="#888", lw=.6)
    x.set_xticks(xs); x.set_xticklabels([LABEL[r["key"]] for r in C["rows"]], fontsize=6)
    x.set_ylim(0, max(r["ratio"] for r in C["rows"]) * 1.16); x.set_ylabel("pass@8 / avg@1")
    f.tight_layout()
    side("fig32", f, "adapt_dispersion")

    # Figure 33
    E = J["fig33"]
    f, x = plt.subplots(figsize=(5.6, 1.75))
    for s in E["series"]:
        x.plot(E["x"], s["kl"], color=SITE_COLOR[s["key"]], ls="--" if s["dashed"] else "-", marker="o", ms=3,
               lw=2 if s["key"] == "quasar" else 1.4, label=s["label"])
    x.set_ylim(*E["ylim"]); x.set_xticks(E["x"]); x.legend(fontsize=6, ncol=2); x.set_ylabel("KL to FP-SFT")
    f.tight_layout()
    side("fig33", f, "adapt_divergence")


if __name__ == "__main__":
    obj = {"source": "arXiv 2608.13966v2, Figures 30-33 (adaptation appendix)",
           "generator": "tools/extract_ix_adapt.py",
           "fig30": fig30(), "fig31": fig31(), "fig32": fig32(), "fig33": fig33()}
    p = dump("ix-adapt.json", obj)
    if ARGS.check:
        check(p, ARGS.paper_png or os.environ.get("QUASAR_PAPER_FIG_PNG"))
