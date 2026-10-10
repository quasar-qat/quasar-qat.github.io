#!/usr/bin/env python3
"""Build assets/data/ix-theory1.json for three appendix theory-validation figures.

Each block re-creates the data of one arXiv v2 figure with the figure
generator's own loader (imported, or copied verbatim where the generator keeps
it inline), then runs that generator IN MEMORY (its save call is intercepted;
nothing is written to the source checkout) and asserts that the points, fit
lines and annotations it plotted equal the values written here.

  fig10  recon_predicts_theory.pdf  (Figure 10, label fig:theory-tie)
         generator figs/paper_final/fig_recon_theory.py
         x = end-of-training loss-aware reconstruction error S_T per (arm, bits)
         y = final held-out forward KL (Table 1 fidelity basis, paperdata.fidelity)
         fit = per-panel OLS in log10-log10 over the 9 points (R^2 0.93 / 0.96)
  fig14  eq11_dose.pdf              (Figure 14, label fig:eq11-dose)
         generator figs/paper_final/fig_eq11_simple.py (the v2 PDF is byte-identical
         to its output; fig_eq11.py is a different, unused design)
         x = S_hat(r) of each init-dose artifact, y = ||grad L(r)||^2
         f = 0.3 excluded at every bit width, exactly as the generator does
         fit = per-bit OLS in log10-log10 over the 7 kept points (6 factors + argmin)
  fig15  curvature_proxy.pdf        (Figure 15, label fig:curvature-proxy)
         generator figs/paper_final/fig_curvature_proxy.py
         x = per-matrix mean saliency h, y = per-matrix mean Hutchinson Hessian
         diagonal (K=32); the 7 matrices with a non-positive Hutchinson mean are
         left out, as in the figure; r = Pearson on log10 over the 56 shown

Input (not distributed with this site):
  --figure-src DIR / QUASAR_FIGURE_SRC   checkout of the paper's figure code and plot
                                         data (the directory that holds figs/paper_final/)
Requires numpy + matplotlib (+ torch for fig15, whose inputs are .pt files).

  QUASAR_FIGURE_SRC=... python3 tools/extract_ix_theory1.py [fig10 fig14 fig15] [--out FILE]
                                                            [--check-plot DIR]
Writes assets/data/ix-theory1.json in this site repo (or --out FILE). Targets not
listed are carried over from the existing output file. --check-plot DIR renders a
matplotlib check figure per block from the written JSON (for side-by-side review
against the paper PDFs).
"""
import argparse
import json
import math
import os
import re
import runpy
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # never drop __pycache__ into the source checkout
TARGETS = ("fig10", "fig14", "fig15")
SITE = Path(__file__).resolve().parents[1]
DEFAULT_OUT = SITE / "assets" / "data" / "ix-theory1.json"

_ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
_ap.add_argument("targets", nargs="*", help="any of " + ", ".join(TARGETS) + " (default: all)")
_ap.add_argument("--figure-src", help="paper figure checkout (default $QUASAR_FIGURE_SRC)")
_ap.add_argument("--out", default=str(DEFAULT_OUT), help="output JSON file")
_ap.add_argument("--check-plot", metavar="DIR", help="also render check plots from the JSON into DIR")
ARGS = _ap.parse_args()
_bad = [t for t in ARGS.targets if t not in TARGETS]
if _bad:
    _ap.error(f"unknown target(s) {_bad}; choose from {', '.join(TARGETS)}")
_src = ARGS.figure_src or os.environ.get("QUASAR_FIGURE_SRC")
if not _src:
    sys.exit("extract_ix_theory1.py: set --figure-src or $QUASAR_FIGURE_SRC "
             "(checkout holding the paper's figs/paper_final/ generators and their plot data)")
LAQ = Path(_src).expanduser()
PF = LAQ / "figs" / "paper_final"
if not (PF / "style.py").is_file():
    sys.exit(f"extract_ix_theory1.py: {PF} has no style.py; --figure-src / $QUASAR_FIGURE_SRC must "
             "point at the checkout that holds figs/paper_final/")
os.environ.setdefault("MPLCONFIGDIR", str(Path(os.environ.get("TMPDIR", "/tmp")) / "quasar-site-mpl"))
sys.path.insert(0, str(PF))

import numpy as np  # noqa: E402
import matplotlib  # noqa: E402
matplotlib.use("Agg")

import style as S  # noqa: E402  (paper house style: labels + colors)

CAPTURED = {}
S.save = lambda fig, name: CAPTURED.__setitem__(name, fig)
SOURCE = "arXiv v2 (2608.13966), appendix_theory_validation.tex"
GENERATOR = "tools/extract_ix_theory1.py"
EMPIRICAL = LAQ / "local_notes" / "empirical_link" / "secure_results"


def sig(v, n=5):
    return float(f"{float(v):.{n}g}")


def run_generator(script, name):
    """Run a paper generator in memory; return the matplotlib figure it would have saved."""
    CAPTURED.pop(name, None)
    runpy.run_path(str(PF / script), run_name="__main__")
    if name not in CAPTURED:
        raise SystemExit(f"{script} did not produce figure {name!r}")
    return CAPTURED[name]


def close(a, b, rel=1e-9):
    return abs(float(a) - float(b)) <= rel * max(abs(float(a)), abs(float(b)), 1e-300)


def ols_loglog(xs, ys):
    """Same estimator as the generators: np.polyfit(log10 x, log10 y, 1) + R^2 in log space."""
    lx, ly = np.log10(np.asarray(xs, float)), np.log10(np.asarray(ys, float))
    b, a = np.polyfit(lx, ly, 1)
    r2 = 1 - ((ly - (a + b * lx)) ** 2).sum() / ((ly - ly.mean()) ** 2).sum()
    return float(b), float(a), float(r2), float(lx.min()), float(lx.max())


def fit_line_matches(line, slope, icept, l0, l1):
    x, y = line.get_data()
    return (close(x[0], 10 ** l0, 1e-9) and close(x[-1], 10 ** l1, 1e-9)
            and close(y[0], 10 ** (icept + slope * l0), 1e-9) and close(y[-1], 10 ** (icept + slope * l1), 1e-9))


# --------------------------------------------------------------------------- Figure 10
def build_fig10():
    import paperdata as P  # the generator's own loader (validates against the locked manifest on import)
    RUNS = LAQ / "runs"
    ARMS = ["ours", "gdm", "ste"]
    MODEL = {"qwen": "Qwen3-4B-Thinking-2507", "llama": "Llama-3.1-8B-Instruct"}
    SHORT = {"qwen": "Qwen3-4B-Thinking", "llama": "Llama-3.1-8B"}
    KEY = {"ours": "quasar", "gdm": "denoising_qat", "ste": "standard_qat"}
    fig = run_generator("fig_recon_theory.py", "recon_predicts_theory")
    panels = []
    for ax, model in zip(fig.axes, ("qwen", "llama")):
        assert ax.get_title() == MODEL[model], ax.get_title()
        # loader, verbatim from fig_recon_theory.py
        sref = {(r["arm"], r["bits"]): r["St_ref"]
                for r in json.loads((RUNS / f"st_ref_mat_{model}.json").read_text())}
        fid = P.fidelity(model)
        pts, xs, ys = [], [], []
        for arm in ARMS:
            for bits in (4, 3, 2):
                x = sref[(arm, bits)]
                y = fid[f"{arm}_w{bits}"]["fwd_kl"]
                xs.append(x); ys.append(y)
                pts.append({"method": S.LABEL[arm], "key": KEY[arm], "bits": f"INT{bits}",
                            "ST": sig(x), "kl": sig(y)})
        # the generator scatters one point per call, in the same arm x bits order
        offs = [c.get_offsets()[0] for c in ax.collections]
        assert len(offs) == 9 and all(close(o[0], x) and close(o[1], y) for o, x, y in zip(offs, xs, ys)), \
            f"{model}: plotted points differ from the loader"
        slope, icept, r2, l0, l1 = ols_loglog(xs, ys)
        assert fit_line_matches(ax.lines[0], slope, icept, l0 - 0.1, l1 + 0.1), f"{model}: fit line differs"
        disp = f"{r2:.2f}"
        assert any(t.get_text() == rf"$R^2 = {disp}$" for t in ax.texts), f"{model}: R^2 label differs"
        panels.append({
            "model": MODEL[model], "short": SHORT[model], "points": pts,
            "fit": {"kind": "OLS power law (log10-log10)", "slope": sig(slope, 6), "intercept": sig(icept, 6),
                    "r2": sig(r2, 6), "display": {"r2": disp},
                    "x_range": [sig(10 ** (l0 - 0.1)), sig(10 ** (l1 + 0.1))]},
            "paper_axes": {"xlim": [sig(v) for v in ax.get_xlim()], "ylim": [sig(v) for v in ax.get_ylim()]},
        })
    print("fig10: " + " | ".join(f"{p['short']} slope {p['fit']['slope']:.3f} R2 {p['fit']['r2']:.4f}" for p in panels))
    xl = [min(p["paper_axes"]["xlim"][0] for p in panels), max(p["paper_axes"]["xlim"][1] for p in panels)]
    yl = [min(p["paper_axes"]["ylim"][0] for p in panels), max(p["paper_axes"]["ylim"][1] for p in panels)]
    return {
        "figure": "Figure 10 (recon_predicts_theory.pdf, label fig:theory-tie)",
        "caption_title": "Reconstruction error tracks final KL.",
        "basis": "x = end-of-training loss-aware reconstruction error of the deployed reconstruction; "
                 "y = final held-out forward KL to the full-precision teacher (Table 1 fidelity basis).",
        "sources": {"x": "plot data of Figure 10", "y": "Table 1 KL (fidelity evaluation, unrounded)"},
        "x_label": "Final loss-aware reconstruction error",
        "y_label": "Final held-out KL to full-precision model",
        "panels": panels,
        # one shared domain (union of the two paper panels) so both models read on the same axes
        "axes": {"xlim": xl, "ylim": yl, "xticks": [1e-4, 3e-4, 1e-3, 3e-3], "yticks": [0.01, 0.02, 0.05, 0.1, 0.2]},
    }


# --------------------------------------------------------------------------- Figure 14
def build_fig14():
    SEC = EMPIRICAL
    LAB_RE = re.compile(r"init_dose_qwen_b(\d)_f(argmin|[\d.]+)")
    # loader, verbatim from fig_eq11_simple.py
    sref = {r["arm"]: r["St_ref"]
            for r in json.loads((SEC / "st_ref_init_dose_qwen.json").read_text())}
    pts = {2: [], 3: [], 4: []}   # bit -> [(factor|"argmin", x, y)]
    for r in json.loads((SEC / "grad_dose_init.json").read_text())["rows"]:
        m = LAB_RE.fullmatch(r["label"])
        bit, fac = int(m.group(1)), m.group(2)
        if fac == "0.3":
            continue             # high-leverage outlier, excluded (see docstring)
        pts[bit].append((fac, sref[r["label"]], r["gnorm_sq"]))
    assert all(len(v) == 7 for v in pts.values()), "roster drifted"

    fig = run_generator("fig_eq11_simple.py", "fig_eq11_simple")
    ax = fig.axes[0]
    colls, lines = ax.collections, ax.lines
    texts = {t.get_text() for t in ax.texts}
    out, factors = [], None
    for i, bit in enumerate((4, 3, 2)):
        fx = [(f, x, y) for f, x, y in pts[bit] if f != "argmin"]
        (amx, amy), = [(x, y) for f, x, y in pts[bit] if f == "argmin"]
        # plotted: one collection of the 6 forced factors, then the star; then the fit line
        off, star = colls[2 * i].get_offsets(), colls[2 * i + 1].get_offsets()
        assert len(off) == 6 and all(close(o[0], x) and close(o[1], y) for o, (_, x, y) in zip(off, fx)), f"INT{bit} points differ"
        assert close(star[0][0], amx) and close(star[0][1], amy), f"INT{bit} star differs"
        assert S.BITCOLOR[bit].lower() == matplotlib.colors.to_hex(colls[2 * i].get_facecolor()[0]).lower()
        slope, icept, r2, l0, l1 = ols_loglog([x for _, x, _ in fx] + [amx], [y for _, _, y in fx] + [amy])
        assert fit_line_matches(lines[i], slope, icept, l0 - 0.06, l1 + 0.06), f"INT{bit} fit differs"
        ds, dr = f"{slope:.2f}", f"{r2:.2f}"
        assert rf"slope {ds}, $R^2{{=}}{dr}$" in texts, f"INT{bit} annotation differs"
        fs = [float(f) for f, _, _ in fx]
        factors = factors or fs
        assert fs == factors, "factor roster differs between bit widths"
        out.append({
            "bits": f"INT{bit}", "color": S.BITCOLOR[bit],
            "points": [{"f": float(f), "S": sig(x), "g": sig(y)} for f, x, y in fx],
            "star": {"S": sig(amx), "g": sig(amy)},
            "fit": {"kind": "OLS power law (log10-log10)", "slope": sig(slope, 6), "intercept": sig(icept, 6),
                    "r2": sig(r2, 6), "display": {"slope": ds, "r2": dr},
                    "x_range": [sig(10 ** (l0 - 0.06)), sig(10 ** (l1 + 0.06))]},
        })
    print("fig14: " + " | ".join(f"{b['bits']} slope {b['fit']['slope']:.3f} R2 {b['fit']['r2']:.4f}" for b in out))
    return {
        "figure": "Figure 14 (eq11_dose.pdf, label fig:eq11-dose)",
        "caption_title": "Reconstruction error controls gradient mismatch.",
        "model": "Qwen3-4B-Thinking-2507",
        "basis": "init-dose artifacts: x = loss-aware reconstruction error S_hat(r); y = squared gradient norm of "
                 "the KL to the full-precision teacher at r (equal to the squared gradient mismatch, since the "
                 "gradient at the full-precision weights is zero). The f = 0.3 dose is excluded at every bit "
                 "width, as in the figure.",
        "sources": {"x": "plot data of Figure 14", "y": "plot data of Figure 14"},
        "x_label": "Loss-aware reconstruction error",
        "y_label": "Gradient mismatch",
        "factors": factors,
        "bits": out,
        "axes": {"xlim": [sig(v) for v in ax.get_xlim()], "ylim": [sig(v) for v in ax.get_ylim()],
                 "xticks": [1e-4, 3e-4, 1e-3], "yticks": [1e1, 1e3, 1e5]},
    }


# --------------------------------------------------------------------------- Figure 15
def build_fig15():
    try:
        import torch
    except ImportError:
        raise SystemExit("extract_ix_theory1.py fig15: needs torch (its inputs are .pt tensors); "
                         "run with a Python that has torch, or pass only fig10 fig14")
    HES = EMPIRICAL / "hessian"
    EXPECT = (0.81, 0.67)
    # loader, verbatim from fig_curvature_proxy.py (mmap: same tensors, read lazily)
    fisher = torch.load(HES / "fisher_sampled.pt", map_location="cpu", weights_only=True, mmap=True)
    hutch = torch.load(HES / "hutch_diag_sampled.pt", map_location="cpu", weights_only=True, mmap=True)
    assert set(fisher) == set(hutch) and len(fisher) == 63, "layer roster drifted"
    names = list(fisher)
    fmean = np.array([fisher[k].float().mean().item() for k in names])
    hmean = np.array([hutch[k].float().mean().item() for k in names])
    keep = hmean > 0                      # noise-dominated trace estimates out
    n_drop = int((~keep).sum())
    assert n_drop == 7, f"expected 7 non-positive Hutchinson means, got {n_drop}"
    r = np.corrcoef(np.log10(fmean[keep]), np.log10(hmean[keep]))[0, 1]
    assert abs(r - EXPECT[0]) < 0.03, r
    del fisher, hutch

    fig = run_generator("fig_curvature_proxy.py", "fig_curvature_proxy")
    ax = fig.axes[0]
    off = ax.collections[0].get_offsets()
    assert len(off) == int(keep.sum()) and np.allclose(off[:, 0], fmean[keep], rtol=1e-12) \
        and np.allclose(off[:, 1], hmean[keep], rtol=1e-12), "plotted points differ from the loader"
    disp = f"{r:.2f}"
    assert any(t.get_text() == rf"correlation $r$ = {disp}" for t in ax.texts), "r label differs"

    NAME_RE = re.compile(r"model\.layers\.(\d+)\.(self_attn|mlp)\.(\w+)_proj\.weight")
    pts = []
    for k, x, y, ok in zip(names, fmean, hmean, keep):
        if not ok:
            continue
        m = NAME_RE.fullmatch(k)
        assert m, k
        pts.append({"layer": int(m.group(1)), "block": m.group(2), "proj": m.group(3), "h": sig(x), "hess": sig(y)})
    assert min(p["hess"] for p in pts) > 3e-7, "a shown point falls below the page's y-range"
    layers = sorted({int(NAME_RE.fullmatch(k).group(1)) for k in names})
    projs = ["q", "k", "v", "o", "gate", "up", "down"]
    assert {p["proj"] for p in pts} <= set(projs)
    print(f"fig15: {len(pts)} of {len(names)} matrices shown, r = {r:.4f} over layers {layers}")
    return {
        "figure": "Figure 15 (curvature_proxy.pdf, label fig:curvature-proxy)",
        "caption_title": "QUASAR's saliency tracks curvature.",
        "model": "Qwen3-4B-Thinking-2507", "bits": "INT2",
        "basis": "trained INT2 QUASAR checkpoint; 63 sampled weight matrices (7 projections in every 4th "
                 "block); x = mean saliency h (Adam second moment), y = mean Hutchinson Hessian diagonal "
                 "(32 Rademacher draws). The matrices with a non-positive Hutchinson mean are left out, as in "
                 "the figure.",
        "sources": {"x": "plot data of Figure 15", "y": "plot data of Figure 15"},
        "x_label": "Saliency h (Adam second moment), averaged per weight matrix",
        "y_label": "Hessian diagonal (Hutchinson est.), per-matrix average",
        "r": sig(r, 6), "display": {"r": disp},
        "n_sampled": len(names), "n_shown": len(pts),
        "layers": layers, "projections": projs,
        "points": pts,
        # the paper keeps a bottom band (y < 3e-7) free for a note it no longer prints; the page starts at 3e-7
        "paper_axes": {"xlim": [sig(v) for v in ax.get_xlim()], "ylim": [sig(v) for v in ax.get_ylim()]},
        "axes": {"xlim": [sig(v) for v in ax.get_xlim()], "ylim": [3e-7, sig(ax.get_ylim()[1])],
                 "xticks": [1e-9, 1e-8, 1e-7], "yticks": [1e-6, 1e-5, 1e-4]},
    }


# --------------------------------------------------------------------------- check plots
def check_plots(data, outdir):
    import matplotlib.pyplot as plt
    plt.rcParams.update({"text.usetex": False, "font.size": 8})
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    mark = {"INT4": "o", "INT3": "^", "INT2": "s"}
    col = {"quasar": "#D1495B", "denoising_qat": "#8E6C9A", "standard_qat": "#3F4245"}
    if "fig10" in data:
        D = data["fig10"]
        fig, axs = plt.subplots(1, 2, figsize=(7.0, 2.2), constrained_layout=True)
        for ax, p in zip(axs, D["panels"]):
            for q in p["points"]:
                ax.scatter(q["ST"], q["kl"], marker=mark[q["bits"]], color=col[q["key"]], s=30, zorder=5)
            f = p["fit"]
            gx = np.geomspace(*f["x_range"], 40)
            ax.plot(gx, 10 ** (f["intercept"] + f["slope"] * np.log10(gx)), "--", color="0.55", lw=0.9)
            ax.text(0.05, 0.86, f"R² = {f['display']['r2']}", transform=ax.transAxes)
            ax.set(xscale="log", yscale="log", xlim=p["paper_axes"]["xlim"], ylim=p["paper_axes"]["ylim"], title=p["model"])
        fig.savefig(outdir / "check_fig10.png", dpi=150)
    if "fig14" in data:
        D = data["fig14"]
        fig, ax = plt.subplots(figsize=(4.0, 2.8), constrained_layout=True)
        for b, m in zip(D["bits"], ("o", "^", "s")):
            ax.scatter([p["S"] for p in b["points"]], [p["g"] for p in b["points"]], marker=m, color=b["color"], s=26)
            ax.scatter(b["star"]["S"], b["star"]["g"], marker="*", s=115, color=b["color"], edgecolor="white", lw=0.5)
            f = b["fit"]
            gx = np.geomspace(*f["x_range"], 40)
            ax.plot(gx, 10 ** (f["intercept"] + f["slope"] * np.log10(gx)), "--", color=b["color"], lw=0.9)
            ax.text(f["x_range"][0], 10 ** (f["intercept"] + f["slope"] * math.log10(f["x_range"][0])) * 3,
                    f"{b['bits']} slope {f['display']['slope']}, R²={f['display']['r2']}", fontsize=6)
        ax.set(xscale="log", yscale="log", xlim=D["axes"]["xlim"], ylim=D["axes"]["ylim"])
        fig.savefig(outdir / "check_fig14.png", dpi=150)
    if "fig15" in data:
        D = data["fig15"]
        fig, ax = plt.subplots(figsize=(4.0, 2.6), constrained_layout=True)
        ax.scatter([p["h"] for p in D["points"]], [p["hess"] for p in D["points"]], s=14, color="#5A5D60", alpha=0.75, lw=0)
        ax.text(0.04, 0.97, f"correlation r = {D['display']['r']}", transform=ax.transAxes, va="top", fontsize=6.4)
        ax.set(xscale="log", yscale="log", xlim=D["paper_axes"]["xlim"], ylim=D["paper_axes"]["ylim"])
        fig.savefig(outdir / "check_fig15.png", dpi=150)
    print(f"check plots -> {outdir}")


def dumps(v, ind=0):
    """JSON with one line per flat object or flat list (compact but diffable)."""
    flat = lambda x: not isinstance(x, (dict, list)) or (
        all(not isinstance(y, (dict, list)) for y in (x.values() if isinstance(x, dict) else x)))
    if flat(v):
        return json.dumps(v, ensure_ascii=False, separators=(", ", ": "))
    pad, pad1 = " " * ind, " " * (ind + 1)
    if isinstance(v, list):
        return "[\n" + ",\n".join(pad1 + dumps(x, ind + 1) for x in v) + "\n" + pad + "]"
    return "{\n" + ",\n".join(pad1 + json.dumps(k) + ": " + dumps(x, ind + 1) for k, x in v.items()) + "\n" + pad + "}"


def main():
    targets = ARGS.targets or list(TARGETS)
    dst = Path(ARGS.out)
    old = {}
    if dst.is_file():
        try:
            old = json.loads(dst.read_text())
        except ValueError:
            old = {}
    build = {"fig10": build_fig10, "fig14": build_fig14, "fig15": build_fig15}
    out = {"source": SOURCE, "generator": GENERATOR}
    for t in TARGETS:
        if t in targets:
            out[t] = build[t]()
        elif t in old:
            out[t] = old[t]
    dst.write_text(dumps(out) + "\n")
    print(f"-> {dst} ({dst.stat().st_size:,} bytes)")
    if ARGS.check_plot:
        check_plots(out, ARGS.check_plot)


if __name__ == "__main__":
    main()
