"""Extract the exact data of paper Figures 5 and 8 (real Qwen3-4B weights) into JSON.

Runs the paper's own figure generators IN MEMORY (savefig is intercepted, nothing is
written to the source checkout; their hard-coded data root is re-pointed at --figure-src)
and reads back what they plotted, so the page uses the same groups, ordering, error
normalization and color limits as the arXiv v2 figures:

  fig5  beforeafter_heatmaps.pdf (Figure 5)  -> assets/data/ix-realw1-fig5.json
        14 Qwen3-4B INT3 weight groups (g = 128): w, saliency h (group mean 1),
        Standard QAT (min-max) and QUASAR reconstructions r exactly as stored by the probe,
        the generator's column order (argsort of -h), VMAX and the model-wide error ratios.
  fig8  curvature_heatmap.pdf    (Figure 8)  -> assets/data/ix-realw1-fig8.json
        log10 h of one layer (layer 35 o_proj), 16 x 16 max-pooled overview = the paper
        panel, plus the full-resolution window the probe extracted next to it (rows 332-459;
        cropped here to the two complete 128-weight groups, input dims 512-767). Values are
        the probe's float16 log10 h, stored losslessly as 12-bit codes:
        log10 h = (base + 64 * idx(c0) + idx(c1)) / 512 - 16, idx over the URL-safe base64 alphabet.

Input (not distributed with this site; numpy + matplotlib required):
  --figure-src DIR / QUASAR_FIGURE_SRC   checkout holding figma_exports/plot_beforeafter_heatmaps.py,
                                         figma_exports/plot_curvature_heatmap.py and their data under
                                         runs/probe_recon_dist/

Optional fidelity check (renders the paper panels again from the written JSON):
  --check DIR            write ix-realw1-fig{5,8}-check.png into DIR
  --paper-png DIR        renders of the v2 figure PDFs (beforeafter_heatmaps.png,
                         curvature_heatmap.png) placed side by side with the check plots

  QUASAR_FIGURE_SRC=... python3 tools/extract_ix_realw1.py [--check DIR --paper-png DIR]
"""
import argparse
import base64
import json
import os
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True
SITE = Path(__file__).resolve().parents[1]
ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
ap.add_argument("--figure-src", help="paper figure checkout (default $QUASAR_FIGURE_SRC)")
ap.add_argument("--out", default=str(SITE / "assets" / "data"), help="output directory")
ap.add_argument("--check", help="directory for the fidelity-check PNGs")
ap.add_argument("--paper-png", help="directory holding PNG renders of the v2 figures")
ARGS = ap.parse_args()
_src = ARGS.figure_src or os.environ.get("QUASAR_FIGURE_SRC")
if not _src:
    sys.exit("extract_ix_realw1.py: set --figure-src or $QUASAR_FIGURE_SRC "
             "(checkout holding figma_exports/plot_beforeafter_heatmaps.py and runs/probe_recon_dist/)")
SRC = Path(_src).expanduser().resolve()
GEN5 = SRC / "figma_exports" / "plot_beforeafter_heatmaps.py"
GEN8 = SRC / "figma_exports" / "plot_curvature_heatmap.py"
for g in (GEN5, GEN8):
    if not g.is_file():
        sys.exit(f"extract_ix_realw1.py: {g} not found; --figure-src must point at the paper figure checkout")
OUT = Path(ARGS.out).resolve()
os.environ.setdefault("MPLCONFIGDIR", str(Path(os.environ.get("TMPDIR", "/tmp")) / "quasar-site-mpl"))

import numpy as np  # noqa: E402
import matplotlib  # noqa: E402
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.figure import Figure  # noqa: E402

SOURCE = "arXiv 2608.13966v2"
GENERATOR = "tools/extract_ix_realw1.py"


def run_generator(path):
    """Execute a paper generator in memory: data root re-pointed at SRC, savefig disabled,
    no LaTeX needed (nothing is drawn). Returns its globals."""
    src = path.read_text()
    # the generators hard-code '<checkout>/runs/...' and '<checkout>/figma_exports/...'
    src, n = re.subn(r'(["\'])[^"\']*?/(runs|figma_exports)/', lambda m: m.group(1) + str(SRC) + "/" + m.group(2) + "/", src)
    if n == 0:
        sys.exit(f"extract_ix_realw1.py: no data path found in {path.name}")
    saved = Figure.savefig
    Figure.savefig = lambda self, *a, **k: None
    ns = {"__name__": "__paper_figure__", "__file__": str(path)}
    try:
        exec(compile(src, str(path), "exec"), ns)
    finally:
        Figure.savefig = saved
        plt.rcParams.update({"text.usetex": False})
    return ns


def dump(name, obj):
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / name
    p.write_text(json.dumps(obj, separators=(",", ":")) + "\n")
    print(f"wrote {p} ({p.stat().st_size / 1024:.1f} KB)")
    return p


def short_layer(name):
    m = re.match(r"model\.layers\.(\d+)\.(?:self_attn|mlp)\.(\w+)\.weight$", name)
    return f"L{m.group(1)} {m.group(2)}" if m else name


# ------------------------------------------------------------------ Figure 5
def fig5():
    ns = run_generator(GEN5)
    groups, mats, VMAX, D = ns["groups"], ns["mats"], float(ns["VMAX"]), ns["D"]
    imgs = [ax.images[0].get_array() for ax in ns["axs"]]          # what the paper panels show
    out_groups = []
    for c in groups:
        w = np.array(c["w"]); h = np.array(c["h"])
        order = np.argsort(-h)                                    # verbatim generator ordering
        rs = np.array(c["arms"]["rtn"]["r"]); ro = np.array(c["arms"]["ours"]["r"])
        S_std = float((h * (rs - w) ** 2).sum()); S_q = float((h * (ro - w) ** 2).sum())
        out_groups.append({
            "layer": short_layer(c["layer"]), "index": int(c["group_index"]),
            "f": round(float(c["alpha_star"]), 2),
            "order": order.tolist(),
            "w": [float(v) for v in c["w"]], "h": [float(v) for v in c["h"]],
            "r_std": [float(v) for v in c["arms"]["rtn"]["r"]],
            "r_q": [float(v) for v in c["arms"]["ours"]["r"]],
            "q_std": [int(v) for v in c["arms"]["rtn"]["q"]],
            "q_q": [int(v) for v in c["arms"]["ours"]["q"]],
            "S_ratio": round(S_q / S_std, 4),
        })
    werr = ns["werr_rel"]
    obj = {
        "figure": "Figure 5 (beforeafter_heatmaps.pdf, label fig:beforeafter)",
        "source": SOURCE, "generator": GENERATOR,
        "model": "Qwen3-4B", "bits": int(D["bits"]), "group": int(D["group"]),
        "qmin": int(D["qmin"]), "qmax": int(D["qmax"]),
        "probe_grid": [round(float(f), 2) for f in D["factors"]], "probe_ridge": float(D["lmd"]),
        "processing": ("rows = groups sorted by decreasing outlier ratio; columns = weights sorted by "
                       "decreasing h (order); cell = |sqrt(h / mean h) (r - w)| / RMS of the row's "
                       "Standard QAT values; color = PowerNorm(gamma, 0, vmax) of that value, shared by both panels"),
        "gamma": 0.62, "vmax": round(VMAX, 6),
        "error_rel": {"standard_qat": round(float(werr["rtn"]), 2), "quasar": round(float(werr["ours"]), 2)},
        "groups": out_groups,
    }
    p = dump("ix-realw1-fig5.json", obj)
    # self-check: rebuild the plotted matrices from the JSON exactly as the page does
    J = json.loads(p.read_text())
    A, B = rebuild5(J)
    assert np.allclose(A, np.abs(mats["rtn"]), atol=1e-12) and np.allclose(B, np.abs(mats["ours"]), atol=1e-12)
    assert np.allclose(np.abs(np.asarray(imgs[0])), A) and np.allclose(np.asarray(imgs[1]), B)
    print("fig5: JSON reproduces the paper's plotted matrices (max |diff| %.1e)" %
          max(np.abs(A - np.abs(mats["rtn"])).max(), np.abs(B - np.abs(mats["ours"])).max()))
    return J


def rebuild5(J):
    A, B = [], []
    for g in J["groups"]:
        w, h = np.array(g["w"]), np.array(g["h"]); o = np.array(g["order"])
        sh = np.sqrt(h / max(h.mean(), 1e-30))
        ea = (sh * (np.array(g["r_std"]) - w))[o]; eb = (sh * (np.array(g["r_q"]) - w))[o]
        n = np.sqrt((ea ** 2).mean()) or 1.0
        A.append(np.abs(ea / n)); B.append(np.abs(eb / n))
    return np.array(A), np.array(B)


# ------------------------------------------------------------------ Figure 8
ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"


def enc12(a):
    """float16 log10 h -> exact 12-bit codes (two URL-safe base64 chars per value)."""
    v = np.asarray(a, np.float64)
    k = np.round((v + 16.0) * 512.0)
    assert np.array_equal(k / 512.0 - 16.0, v), "value not representable at 1/512"
    k = k.astype(np.int64)
    base = int(k.min()); d = k - base
    assert d.max() < 4096
    s = "".join(ALPHA[x >> 6] + ALPHA[x & 63] for x in d.ravel().tolist())
    return {"rows": int(v.shape[0]), "cols": int(v.shape[1]), "base": base, "data": s}


def dec12(e):
    idx = {c: i for i, c in enumerate(ALPHA)}
    s = e["data"]
    k = np.array([idx[s[i]] * 64 + idx[s[i + 1]] for i in range(0, len(s), 2)], np.float64) + e["base"]
    return (k / 512.0 - 16.0).reshape(e["rows"], e["cols"])


def fig8():
    ns = run_generator(GEN8)
    F, NAME, POOL = ns["F"], ns["NAME"], int(ns["POOL"])
    ov = ns["ov"]; shape = [int(x) for x in ns["shape"]]
    img = np.asarray(ns["im"].get_array())                        # what the paper panel shows
    assert np.array_equal(img, ov)
    crop = F[NAME + ".crop_row"]; r0, c0 = (int(x) for x in F[NAME + ".crop_row_origin"])
    G = 128
    g0 = -(-c0 // G) * G                                          # first complete group in the window
    g1 = ((c0 + crop.shape[1]) // G) * G
    lens = crop[:, g0 - c0:g1 - c0]
    # the window is consistent with the overview: max over every aligned 16x16 block == pooled value
    full = crop.astype(np.float64); n = 0
    for br in range(-(-r0 // POOL), (r0 + crop.shape[0]) // POOL):
        for bc in range(-(-c0 // POOL), (c0 + crop.shape[1]) // POOL):
            blk = full[br * POOL - r0:(br + 1) * POOL - r0, bc * POOL - c0:(bc + 1) * POOL - c0]
            assert blk.max() == float(ov[br, bc]); n += 1
    print(f"fig8: full-resolution window matches the max-pooled overview on {n} blocks")
    m = re.match(r"model\.layers\.(\d+)\.\w+\.(\w+)$", NAME)
    obj = {
        "figure": "Figure 8 (curvature_heatmap.pdf, label fig:curvature-heatmap)",
        "source": SOURCE, "generator": GENERATOR,
        "model": "Qwen3-4B", "layer": int(m.group(1)), "proj": m.group(2),
        "shape": shape, "pool": POOL, "group": G,
        "processing": ("overview = log10 h max-pooled over 16 x 16 blocks (the paper panel); color limits = "
                       "2nd / 99.7th percentile of the overview; lens = full-resolution log10 h of the probe's "
                       "window, cropped to its complete 128-weight groups"),
        "vmin": round(float(ns["vmin"]), 6), "vmax": round(float(ns["vmax"]), 6),
        "encoding": "log10 h = (base + 64*idx(c0) + idx(c1)) / 512 - 16, idx in " + ALPHA,
        "overview": enc12(ov),
        "lens": dict(enc12(lens), r0=r0, c0=g0),
    }
    p = dump("ix-realw1-fig8.json", obj)
    J = json.loads(p.read_text())
    assert np.array_equal(dec12(J["overview"]), ov.astype(np.float64))
    assert np.array_equal(dec12(J["lens"]), lens.astype(np.float64))
    print("fig8: JSON decodes bit-exactly to the paper's plotted array")
    return J


# ------------------------------------------------------------------ check plots (from the JSON only)
def check(J5, J8):
    from matplotlib.colors import LinearSegmentedColormap, PowerNorm
    d = Path(ARGS.check); d.mkdir(parents=True, exist_ok=True)
    g = matplotlib.colormaps["RdYlGn_r"](np.linspace(0, 1, 256))
    g[:, :3] = 1.0 - 0.58 * (1.0 - g[:, :3])
    SEQ = LinearSegmentedColormap.from_list("seq", g)
    pp = Path(ARGS.paper_png) if ARGS.paper_png else None

    A, B = rebuild5(J5)
    fig = plt.figure(figsize=(16, 3.4))
    gs = fig.add_gridspec(1, 3, width_ratios=[1.05, 1, 1])
    if pp and (pp / "beforeafter_heatmaps.png").is_file():
        ax = fig.add_subplot(gs[0, 0]); ax.imshow(plt.imread(pp / "beforeafter_heatmaps.png")); ax.axis("off")
        ax.set_title("paper v2 (Figure 5)", fontsize=10)
    for i, (M, t) in enumerate([(A, "JSON (a) Standard QAT %.2fx" % J5["error_rel"]["standard_qat"]),
                                (B, "JSON (b) QUASAR %.2fx" % J5["error_rel"]["quasar"])]):
        ax = fig.add_subplot(gs[0, i + 1])
        ax.imshow(M, cmap=SEQ, norm=PowerNorm(gamma=J5["gamma"], vmin=0, vmax=J5["vmax"]), aspect="auto", interpolation="nearest")
        for y in np.arange(0.5, len(M) - 0.5):
            ax.axhline(y, color="white", lw=0.7)
        ax.set_title(t, fontsize=10); ax.set_xticks([0, 127]); ax.set_yticks([0, len(M) - 1])
    fig.tight_layout(); fig.savefig(d / "ix-realw1-fig5-check.png", dpi=110); plt.close(fig)

    ov = dec12(J8["overview"]); lens = dec12(J8["lens"])
    fig = plt.figure(figsize=(16, 3.8))
    gs = fig.add_gridspec(1, 3, width_ratios=[1.1, 1, 0.55])
    if pp and (pp / "curvature_heatmap.png").is_file():
        ax = fig.add_subplot(gs[0, 0]); ax.imshow(plt.imread(pp / "curvature_heatmap.png")); ax.axis("off")
        ax.set_title("paper v2 (Figure 8)", fontsize=10)
    ax = fig.add_subplot(gs[0, 1])
    H, W = J8["shape"]
    ax.imshow(ov, cmap=SEQ, vmin=J8["vmin"], vmax=J8["vmax"], aspect="auto", interpolation="nearest", extent=[0, W, H, 0])
    r0, c0 = J8["lens"]["r0"], J8["lens"]["c0"]
    ax.add_patch(plt.Rectangle((c0, r0), J8["lens"]["cols"], J8["lens"]["rows"], fill=False, ec="k", lw=0.8))
    ax.set_title("JSON overview (layer %d %s)" % (J8["layer"], J8["proj"]), fontsize=10)
    ax = fig.add_subplot(gs[0, 2])
    ax.imshow(lens, cmap=SEQ, vmin=J8["vmin"], vmax=J8["vmax"], aspect="auto", interpolation="nearest",
              extent=[c0, c0 + lens.shape[1], r0 + lens.shape[0], r0])
    ax.set_title("JSON lens (full resolution)", fontsize=10)
    fig.tight_layout(); fig.savefig(d / "ix-realw1-fig8-check.png", dpi=110); plt.close(fig)
    print(f"check plots in {d}")


if __name__ == "__main__":
    J5 = fig5()
    J8 = fig8()
    if ARGS.check:
        check(J5, J8)
