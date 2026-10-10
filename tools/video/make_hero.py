"""Project-page hero: Standard QAT vs QUASAR on the paper's Figure 1 surface (ILLUSTRATIVE).

Copied from the launch-animation generator hero_replay/make_hero_replay.py ($QUASAR_ANIM_DIR) (the author-picked hero)
and adapted for quasar-qat.github.io. Physics and pacing are unchanged: $QUASAR_ANIM_DIR/slowsteps.py
and $QUASAR_ANIM_DIR/quasar_np.py are imported UNMODIFIED from $QUASAR_ANIM_DIR.

Timeline (18.9 s = 567 frames at 30 fps, seamless): end-state snapshot -> rewind -> ONE trajectory (step 1 slow with the
numbered list highlighted, steps 2-6 brisk) -> rewind -> the same 6 steps replayed with all 31+1
trajectories -> end state (= first frame).

Changes vs make_hero_replay.py
  * no title line (the page prints the verbatim Figure 1 caption under the video);
  * panel titles + subtitles and the step-1 labels are the strings of the paper's Figure 1 artwork
    (figures/borrowed_gradient_pair.pdf in the arXiv v2 source); the numbered list and the
    "full precision" key are labels; no other text or numbers;
  * larger surfaces (the freed title band), two layouts: landscape 16:9 (1920x1080 render) and
    portrait 4:5 (1080x1350 render: Standard QAT on top, QUASAR below, list at the bottom);
  * background = the page's card colour #fdfdfd;
  * QUASAR's lattice is FIXED (author, round 5: "it just randomly moves"): slowsteps.recon_quasar re-fits the
    offset at every w, so the drawn dots slid over the surface. Here that loss-aware rule is applied ONCE, at the
    hero start S.W0, and every QUASAR reconstruction in the video (hero ball and swarm) rounds to that one
    lattice -- the same rule as the page's interactive sandbox (tools/extract_ix_sandbox.py, default start);
  * frames stream into a lossless FFV1 master, then H.264 (High, yuv420p, BT.709) encodes at the full render
    size (1920x1080 / 1080x1350, CRF 20) + poster (frame 0, JPEG q82 progressive).

    PY=$QUASAR_ANIM_DIR/.venv/bin/python
    $PY tools/video/make_hero.py landscape             # -> assets/video/hero.mp4 + hero.jpg
    $PY tools/video/make_hero.py portrait              # -> assets/video/hero-portrait.mp4 + hero-portrait.jpg
    $PY tools/video/make_hero.py landscape stills 0 3.2 12.5   # review stills only (scratch dir)
    $PY tools/video/make_hero.py landscape encode      # re-encode from an existing master
    $PY tools/video/make_hero.py og                    # -> assets/img/og.png (1200x630 social card, end state)
    $PY tools/video/make_hero.py portrait union        # layout check: every surface position + all text
"""
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE = HERE.parents[1]
if "QUASAR_ANIM_DIR" not in os.environ:
    sys.exit("set QUASAR_ANIM_DIR to the launch-animation directory (quasar_np.py, slowsteps.py, data_random_groups_qwen3_4b.npz)")
TG = Path(os.environ["QUASAR_ANIM_DIR"])
sys.path.insert(0, str(TG))
from quasar_np import ROSE, ROSE_DARK, GRAPH, DARK, GRAY, FFMPEG, contact_sheet  # noqa: E402
import slowsteps as S  # noqa: E402

LAYOUT = sys.argv[1] if len(sys.argv) > 1 else "landscape"
assert LAYOUT in ("landscape", "portrait", "og"), LAYOUT
MODE = sys.argv[2] if len(sys.argv) > 2 else "render"
SCRATCH = Path(os.environ.get("HERO_SCRATCH", str(Path(__file__).resolve().parents[1] / "_private" / "hero")))
SCRATCH.mkdir(parents=True, exist_ok=True)

# ----------------------------------------------------------------- timeline: snapshot, solo, replay with all
SNAP, REW1, SOLO_HOLD, REW2, END_HOLD = 1.0, 0.7, 0.5, 0.7, 1.6
PLAN_SLOW0 = dict(recon=0.9, grad=0.8, move=0.9, true=0.7, apply=0.95, settle=0.35)
PLAN_BRISK = dict(recon=0.22, grad=0.18, move=0.2, true=0.0, apply=0.32, settle=0.08)    # 1.0 s per step
PLAN_REPLAY = dict(recon=0.16, grad=0.12, move=0.14, true=0.0, apply=0.30, settle=0.08)  # 0.8 s per step
S.STEP_PLAN = [PLAN_SLOW0] + [PLAN_BRISK] * (S.STEPS - 1)
_segs = [("hold", S.STEPS, None, 0.0, SNAP), ("rewind", S.STEPS, None, SNAP, SNAP + REW1)]
_t = SNAP + REW1


def _add_steps(plans):
    global _t
    for _k, _plan in enumerate(plans):
        for _ph in S.PHASES:
            if _plan[_ph] > 0:
                _segs.append(("step", _k, _ph, _t, _t + _plan[_ph]))
                _t += _plan[_ph]


_add_steps(S.STEP_PLAN)                                   # pass 1: one trajectory
_segs.append(("hold", S.STEPS, None, _t, _t + SOLO_HOLD))
_t += SOLO_HOLD
T_REW2 = _t
_segs.append(("rewind", S.STEPS, None, _t, _t + REW2))
_t += REW2
T_REPLAY = _t
_add_steps([PLAN_REPLAY] * S.STEPS)                       # pass 2: replay with all trajectories
_segs.append(("hold", S.STEPS, None, _t, _t + END_HOLD))
S._SEGS, S.TOTAL = _segs, _t + END_HOLD


def stage(t):
    """snap | rew1 | solo | rew2 | replay"""
    if t < SNAP:
        return "snap"
    if t < SNAP + REW1:
        return "rew1"
    if t < T_REW2:
        return "solo"
    if t < T_REPLAY:
        return "rew2"
    return "replay"


import matplotlib  # noqa: E402
import matplotlib.lines  # noqa: E402
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib import patheffects as pe  # noqa: E402
from matplotlib.colors import LightSource, ListedColormap  # noqa: E402
from matplotlib.patches import Polygon  # noqa: E402
from mpl_toolkits.mplot3d import proj3d  # noqa: E402

FPS, DPI = 30, 100
BG = "#f7f5f0" if LAYOUT == "og" else "#fdfdfd"   # og: page paper; videos: the .viz card colour
KEYS = ("std", "q")
COL = {"std": GRAPH, "q": ROSE}
COL_D = {"std": DARK, "q": ROSE_DARK}
LEAD = "#9aa0a6"
_cw = matplotlib.colormaps["coolwarm"](np.linspace(0, 1, 256))
_cw[:, :3] = 1.0 - 0.85 * (1.0 - _cw[:, :3])
PJET = ListedColormap(_cw)  # = paper Figure 1 colormap
plt.rcParams.update({
    "font.family": "serif", "text.usetex": True, "text.color": DARK,
    "text.latex.preamble": r"\usepackage{amsmath}\DeclareMathSymbol{-}{\mathbin}{operators}{123}",
})

# ----------------------------------------------------------------- QUASAR: one lattice, chosen once, held fixed
# slowsteps.recon_quasar re-selects the offset at every w (the lattice would slide over the surface). Apply that
# loss-aware rule once, at the hero start, and round every QUASAR reconstruction to that lattice (slowsteps.py
# stays unmodified: only its TRAJ["q"] entry is recomputed here with the fixed-lattice rule).
OFF_Q = np.mod(S.recon_quasar(S.W0), S.D_Q)   # (z0, z0): the offset the rule picks at W0
assert np.allclose(OFF_Q, OFF_Q[0]), OFF_Q


def recon_q(w):
    """QUASAR with its lattice fixed at OFF_Q (round to nearest on the fine grid)."""
    return OFF_Q + S.D_Q * np.round((np.asarray(w, float) - OFF_Q) / S.D_Q)


assert np.allclose(recon_q(S.W0), S.recon_quasar(S.W0))   # step 1 is unchanged
S.TRAJ["q"] = S._run(recon_q)   # S.scene() reads S.TRAJ at call time: the hero ball follows the fixed lattice
TR = S.TRAJ
# the story the hero tells must still hold with the fixed lattice (slowsteps' own checks, re-run on the new TRAJ)
_Lq, _Ls = TR["q"]["L_w"], TR["std"]["L_w"]
assert all(_Lq[i + 1] < _Lq[i] for i in range(S.STEPS)), "QUASAR must descend every step"
assert _Ls[-1] > 10 * _Lq[-1], (_Ls[-1], _Lq[-1])
for _i in range(S.STEPS):
    assert S.grad(TR["q"]["r"][_i]) @ TR["q"]["u"][_i] < 0, _i
    if _Lq[_i] > 0.01:
        assert S.grad(TR["q"]["w"][_i]) @ TR["q"]["u"][_i] < 0, _i
TOTAL = S.TOTAL
N = int(round(TOTAL * FPS))
loss = S.loss
LIM = S.LIM          # physics domain (starting points); Figure 1 draws the surface on [-LIM, LIM]^2
GOLD, AMBER = "#C9A227", "#E8833A"

# ----------------------------------------------------------------- layout
# Pixel coordinates, y measured from the TOP. FIT = target box (x0, x1, y0, y1) for each surface's outline
# (union over the whole camera orbit); the surface is scaled to fit inside it and centred.
# HEADS = panel title + subtitle; LIST = numbered list items 0..3 and "fp" (the full-precision key),
# each as (x, y, ha); rows given as ("row", y, [items], x_centre) are centred as a group.
if LAYOUT == "landscape":
    W_PX, H_PX = 1920, 1080
    OUT_W, OUT_H = 1920, 1080        # shipped at the full render size (sharper hero)
    VLIM = 3.0                       # drawn domain [-VLIM, VLIM]^2 (< LIM = a camera zoom that crops the rim)
    K = 1.0                          # marker / stroke scale
    FS_TITLE, FS_SUB, FS_LIST, FS_LAB = 40, 26, 28, 27
    FIT = {"std": (18, 942, 200, 914), "q": (978, 1902, 200, 914)}
    HEADS = {"std": dict(title=(480, 82, "center"), sub=(480, 148, "center")),     # sub y = baseline
             "q": dict(title=(1440, 82, "center"), sub=(1440, 148, "center"))}
    LAB_XMIN = {"std": 14, "q": 974}  # step-1 labels never cross into the other panel
    SUB_STD = (r"Standard reconstruction",)
    SUB_Q = (r"QUASAR's reconstruction yields a more faithful gradient",)     # one line per entry
    LIST = [("row", 1006, [0, 1, 2, 3, "fp"], 960)]
    LIST_GAP = 64
    LAB_OFF = {"std": dict(w=np.array([-54.0, 68.0]), r=np.array([-48.0, -66.0])),
               "q": dict(w=np.array([-54.0, 68.0]), r=np.array([-56.0, -70.0]))}
elif LAYOUT == "portrait":
    W_PX, H_PX = 1080, 1350
    OUT_W, OUT_H = 1080, 1350
    VLIM = 3.0
    K = 1.12                         # slightly bolder marks: this layout is seen ~350 px wide on phones
    FS_TITLE, FS_SUB, FS_LIST, FS_LAB = 44, 29, 28, 29     # ~13-14 CSS px at a 356 px wide card
    LAB_XMIN = {"std": 14, "q": 14}
    SUB_STD = (r"Standard reconstruction",)
    FIT = {"std": (20, 910, 20, 636), "q": (56, 946, 664, 1290)}
    HEADS = {"std": dict(title=(1046, 60, "right"), sub=(1046, 126, "right")),
             "q": dict(title=(1046, 598, "right"), sub=(1046, 662, "right"))}
    SUB_Q = (r"QUASAR's reconstruction", r"yields a more", r"faithful gradient")
    LIST = [(0, 30, 1264, "left"), (1, 30, 1314, "left"), (2, 708, 1264, "left"), (3, 708, 1314, "left"),
            ("fp", 34, 650, "left")]
    LIST_GAP = 52
    # q's r label sits ~40 px lower than landscape: the x clamp (LAB_XMIN) pins it close to the ring here
    LAB_OFF = {"std": dict(w=np.array([-54.0, 68.0]), r=np.array([-48.0, -66.0])),
               "q": dict(w=np.array([-54.0, 68.0]), r=np.array([-56.0, -110.0]))}


else:   # og: 1200x630 social card, end state only, rendered at 2x and downsampled
    W_PX, H_PX = 1200, 630
    OUT_W, OUT_H = 1200, 630
    VLIM = 3.0
    K = 0.78
    FS_TITLE, FS_SUB, FS_LIST, FS_LAB = 19, 16, 16, 16
    FIT = {"std": (16, 592, 196, 616), "q": (608, 1184, 196, 616)}
    HEADS = {"std": dict(title=(578, 222, "right"), sub=(0, 0, "right")),
             "q": dict(title=(1170, 222, "right"), sub=(0, 0, "right"))}
    SUB_STD, SUB_Q = (), ()
    LIST = []
    LIST_GAP = 0
    LAB_XMIN = {"std": 14, "q": 620}
    LAB_OFF = {"std": dict(w=np.array([-54.0, 68.0]), r=np.array([-48.0, -66.0])),
               "q": dict(w=np.array([-54.0, 68.0]), r=np.array([-56.0, -70.0]))}
    # masthead: (text, x, y, ha, va, fontsize, colour); y from the top
    MAST = [(r"\textbf{QUASAR}", 52, 112, "left", "baseline", 70, ROSE),
            (r"Lowering the Loss Floor of", 610, 66, "left", "baseline", 25, DARK),
            (r"Quantization-Aware Training with", 610, 102, "left", "baseline", 25, DARK),
            (r"Loss-Aware Reconstruction", 610, 138, "left", "baseline", 25, DARK),
            (r"\texttt{arXiv 2608.13966}", 54, 150, "left", "baseline", 13.5, GRAY)]
# full-precision key text: portrait (phones) gets a darker gold + list-size text for contrast
FP_TXT_COL, FS_FP = ("#9a7a12", FS_LIST) if LAYOUT == "portrait" else (GOLD, FS_LIST - 2)


def run_from(recon, w0):
    w = np.array(w0, float)
    W = []
    for _ in range(S.STEPS + 1):
        r = recon(w)
        W.append(w.copy())
        w = w - S.LR * S.grad(r)
    return np.array(W)


def on_contour(theta, level):
    d = np.array([np.cos(theta), np.sin(theta)])
    lo, hi = 0.0, LIM - 0.1
    for _ in range(40):
        m = (lo + hi) / 2
        lo, hi = (m, hi) if loss(*(m * d)) < level else (lo, m)
    return lo * d


_rng = np.random.default_rng(0)
_th = np.linspace(0, 2 * np.pi, 32, endpoint=False) + _rng.uniform(-0.08, 0.08, 32)
STARTS = [on_contour(th, lv) for th, lv in zip(_th, _rng.uniform(1.0, 1.8, 32))]
STARTS = [p for p in STARTS if np.linalg.norm(p - S.W0) > 0.45]   # keep the hero ball readable
SWARM = {"std": [run_from(S.recon_std, p) for p in STARTS], "q": [run_from(recon_q, p) for p in STARTS]}
FP = run_from(lambda w: w, S.W0)   # full precision: exact gradient (r = w), same start and learning rate
_dist = {k: np.array([np.linalg.norm(W[-1]) for W in v]) for k, v in SWARM.items()}
_lend = {k: np.array([loss(*W[-1]) for W in v]) for k, v in SWARM.items()}
# fixed lattice: median end distance 0.23 (QUASAR) vs 0.75 (Standard QAT); median end loss 0.024 vs 0.25
assert np.median(_dist["q"]) < 0.3 and np.median(_dist["std"]) > 3 * np.median(_dist["q"]), _dist
assert np.median(_lend["std"]) > 5 * np.median(_lend["q"]) and np.mean(_lend["std"]) > 5 * np.mean(_lend["q"]), _lend


def path_pos(W, st):
    """Position + trail (+ trail alpha) of a 6-step path at timeline state st."""
    kind, k, ph, u = st["kind"], st["step"], st["phase"], st["u"]
    if kind == "hold":
        return W[-1], W, 1.0
    if kind == "rewind":
        e = S.ease(u)
        return W[-1] + (W[0] - W[-1]) * e, W, 1 - e
    if ph == "apply":
        pos = W[k] + (W[k + 1] - W[k]) * S.ease(u)
    elif ph == "settle":
        pos = W[k + 1]
    else:
        pos = W[k]
    return pos, np.vstack([W[: k + 1], pos[None]]), 1.0


# ----------------------------------------------------------------- reconstruction lattice (from the simulation)
DSTEP = {"std": S.D_STD, "q": S.D_Q}


LAT_OFF = {"std": np.array(S.OFF_STD, float), "q": OFF_Q}   # both lattices fixed for the whole video


def lattice_offset(key, t):
    """Lattice offset drawn at time t: constant for both methods (the dots never move relative to the surface)."""
    return LAT_OFF[key]


def _on_lattice(key, r):
    o, d = LAT_OFF[key], DSTEP[key]
    return np.allclose(np.round((r - o) / d) * d + o, r)


assert all(np.array_equal(lattice_offset(k_, i / FPS), LAT_OFF[k_]) for k_ in KEYS for i in range(N + 1))
for _key, _rec in (("std", S.recon_std), ("q", recon_q)):   # every drawn / simulated r lies on the drawn lattice
    for _k in range(S.STEPS + 1):
        _r = TR[_key]["r"][_k]
        assert np.allclose(_rec(TR[_key]["w"][_k]), _r) and _on_lattice(_key, _r), (_key, _k)
    for W in SWARM[_key]:
        assert all(_on_lattice(_key, _rec(w)) for w in W), _key


def lattice_points(key, o):
    d = DSTEP[key]
    m = VLIM - 0.12
    xs = o[0] + d * np.arange(np.ceil((-m - o[0]) / d), np.floor((m - o[0]) / d) + 1)
    ys = o[1] + d * np.arange(np.ceil((-m - o[1]) / d), np.floor((m - o[1]) / d) + 1)
    gx, gy = np.meshgrid(xs, ys)
    return np.column_stack([gx.ravel(), gy.ravel()])


# ----------------------------------------------------------------- camera
AZ0, AZ_AMP, EL0, EL_AMP = -52.0, 12.0, 47.0, 1.5   # seam = the paper's Figure 1 view


def cam(t):
    ph = 2 * np.pi * t / TOTAL               # one smooth, periodic wobble per loop (seamless)
    return EL0 + EL_AMP * np.cos(ph), AZ0 + AZ_AMP * np.sin(ph)


# ----------------------------------------------------------------- figure
fig = plt.figure(figsize=(W_PX / DPI, H_PX / DPI), dpi=DPI, facecolor=BG)
_gf = np.linspace(-LIM, LIM, 121)
_Zf = loss(*np.meshgrid(_gf, _gf))          # Figure 1's full domain fixes the vertical scale ...
FLOOR, ZTOP = _Zf.min() - 1.15, _Zf.max() + 0.4
g = np.linspace(-VLIM, VLIM, 121)            # ... the drawn domain may crop the rim (exact zoom, same shape)
X, Y = np.meshgrid(g, g)
Z = loss(X, Y)
_dg = g[1] - g[0]
RGB_LIT = LightSource(azdeg=300, altdeg=42).shade(Z, cmap=PJET, blend_mode="soft", vert_exag=1.0, dx=_dg, dy=_dg,
                                                  vmin=_Zf.min(), vmax=_Zf.max())
AX = {}
for key in KEYS:
    ax = fig.add_axes([0.25, 0.25, 0.5, 0.5], projection="3d")   # placed by fit_panels()
    ax.patch.set_alpha(0)
    ax.computed_zorder = False
    ax.set_box_aspect((1, 1, 0.60 * LIM / VLIM), zoom=1.0)
    # no polygon antialiasing: AA leaves faint seams between facets that shimmer as the camera moves
    surf = ax.plot_surface(X, Y, Z, facecolors=RGB_LIT, rstride=1, cstride=1, edgecolor="none", linewidth=0,
                           antialiased=False, shade=False)
    surf.set_clip_on(False)   # the 3-D axes' square active box would cut the side corners
    ax.set_xlim(-VLIM, VLIM)
    ax.set_ylim(-VLIM, VLIM)
    ax.set_zlim(FLOOR, ZTOP)
    ax.set_axis_off()
    AX[key] = ax

ov = fig.add_axes([0, 0, 1, 1], zorder=5)
ov.set_xlim(0, W_PX)
ov.set_ylim(0, H_PX)
ov.axis("off")
ov.patch.set_alpha(0)


def set_view(t):
    el, az = cam(t)
    for ax in AX.values():
        ax.view_init(elev=el, azim=az)
        ax.apply_aspect()


def proj(key, pts, lift=0.0):
    """(n,2) parameter points on the surface (+lift) -> (n,2) pixels."""
    pts = np.atleast_2d(pts)
    ax = AX[key]
    z = loss(pts[:, 0], pts[:, 1]) + lift
    x2, y2, _ = proj3d.proj_transform(pts[:, 0], pts[:, 1], z, ax.get_proj())
    return ax.transData.transform(np.column_stack([x2, y2]))


def drape(a, b, n=24):
    t = np.linspace(0, 1, n)[:, None]
    return a + (b - a) * t


# ----------------------------------------------------------------- surface placement
ZOOM = {k: 1.0 for k in KEYS}
_TS_FIT = [0.0] if LAYOUT == "og" else np.linspace(0, TOTAL, 49)   # og shows only the end state


def outline_bbox(ts):
    """Pixel bbox (x0, x1, y0, y1; y from the top) of each surface's projected outline, union over times ts."""
    e = np.linspace(-VLIM, VLIM, 60)
    edge = np.vstack([np.column_stack([e, np.full_like(e, -VLIM)]), np.column_stack([e, np.full_like(e, VLIM)]),
                      np.column_stack([np.full_like(e, -VLIM), e]), np.column_stack([np.full_like(e, VLIM), e])])
    out = {}
    for t in ts:
        set_view(t)
        for key in KEYS:
            xy = proj(key, edge)
            b = out.setdefault(key, [1e9, -1e9, 1e9, -1e9])
            b[:] = [min(b[0], xy[:, 0].min()), max(b[1], xy[:, 0].max()),
                    min(b[2], H_PX - xy[:, 1].max()), max(b[3], H_PX - xy[:, 1].min())]
    return out


def fit_panels(iters=3):
    """Scale (box zoom) and translate each 3-D axes so its outline's orbit-union bbox fits FIT[key], centred."""
    for _ in range(iters):
        bb = outline_bbox(_TS_FIT)
        for key in KEYS:
            ax, (x0, x1, y0, y1), b = AX[key], FIT[key], bb[key]
            s = min((x1 - x0) / (b[1] - b[0]), (y1 - y0) / (b[3] - b[2]))
            p = ax.get_position(original=True)
            ac = np.array([(p.x0 + p.width / 2) * W_PX, H_PX - (p.y0 + p.height / 2) * H_PX])   # axes centre (y from top)
            bc = np.array([(b[0] + b[1]) / 2, (b[2] + b[3]) / 2])
            tc = np.array([(x0 + x1) / 2, (y0 + y1) / 2])
            new_c = tc - (bc - ac) * s                     # zoom scales about the axes centre
            ZOOM[key] *= s
            ax.set_box_aspect((1, 1, 0.60 * LIM / VLIM), zoom=ZOOM[key])
            side = min(p.width * W_PX, p.height * H_PX)
            ax.set_position([new_c[0] / W_PX - p.width / 2, 1 - new_c[1] / H_PX - p.height / 2, p.width, p.height])
            ax.apply_aspect()
    return outline_bbox(_TS_FIT)


FITTED = fit_panels()


# ----------------------------------------------------------------- static text (labels only)
HALO = [pe.withStroke(linewidth=5, foreground="white")]
# panel titles and subtitles: verbatim strings of the paper's Figure 1 artwork
TITLE = {"std": r"\textbf{Standard QAT}", "q": r"\textbf{QUASAR}"}
SUB = {"std": SUB_STD, "q": SUB_Q}   # the q subtitle may wrap (same words)
for (_tx, _x, _y, _ha, _va, _fs, _c) in (MAST if LAYOUT == "og" else []):
    fig.text(_x / W_PX, 1 - _y / H_PX, _tx, fontsize=_fs, color=_c, ha=_ha, va=_va, zorder=20)
for key in KEYS:
    (tx, ty, tha), (sx, sy, sha) = HEADS[key]["title"], HEADS[key]["sub"]
    fig.text(tx / W_PX, 1 - ty / H_PX, TITLE[key], fontsize=FS_TITLE, color=COL_D[key], ha=tha, va="center", zorder=20)
    for i, line in enumerate(SUB[key]):
        fig.text(sx / W_PX, 1 - (sy + i * 1.45 * FS_SUB) / H_PX, line, fontsize=FS_SUB,
                 color=COL_D[key] if key == "q" else GRAPH, ha=sha, va="baseline", zorder=20)

# fixed numbered list of the four moves of one QAT step; the current move is highlighted
STEPS_TXT = [r"\textbf{1}\enspace reconstruct $r$ from $w$", r"\textbf{2}\enspace gradient at $r$",
             r"\textbf{3}\enspace apply it to $w$", r"\textbf{4}\enspace update $w$"]
LIST_T = [fig.text(0, 0.5, t_, fontsize=FS_LIST, color=GRAY, ha="left", va="center", zorder=20) for t_ in STEPS_TXT]
FP_KEY = fig.text(0, 0.5, r"full precision", fontsize=FS_FP, color=FP_TXT_COL, ha="left", va="center", zorder=20)
_rr = fig.canvas.get_renderer()
FP_SW, FP_SW_GAP = 40 * K, 10 * K     # dashed swatch length, swatch-to-text gap (px)


def _wpx(it):
    t_ = FP_KEY if it == "fp" else LIST_T[it]
    vis = t_.get_visible()
    t_.set_visible(True)          # a hidden Text reports a 1-px unit bbox (that mis-centred the landscape row)
    w = t_.get_window_extent(_rr).width
    t_.set_visible(vis)
    return w + (FP_SW + FP_SW_GAP if it == "fp" else 0.0)


def _place(it, x, y):
    """Item `it` with its left edge at x (px), vertically centred at y (px from top)."""
    yf = 1 - y / H_PX
    (FP_KEY if it == "fp" else LIST_T[it]).set_visible(True)
    if it == "fp":
        fig.add_artist(matplotlib.lines.Line2D([x / W_PX, (x + FP_SW) / W_PX], [yf, yf], color=GOLD, lw=3.0 * K,
                                               ls=(0, (2.2, 1.6)), transform=fig.transFigure, zorder=20))
        FP_KEY.set_position(((x + FP_SW + FP_SW_GAP) / W_PX, yf))
    else:
        LIST_T[it].set_position((x / W_PX, yf))


for t_ in LIST_T + [FP_KEY]:   # items not in this layout's LIST stay hidden
    t_.set_visible(False)
for spec in LIST:
    if spec[0] == "row":
        _, y, items, xc = spec
        gaps = [LIST_GAP * (1.7 if it == "fp" else 1.0) for it in items[1:]]
        x = xc - (sum(_wpx(it) for it in items) + sum(gaps)) / 2
        for i, it in enumerate(items):
            _place(it, x, y)
            x += _wpx(it) + (gaps[i] if i < len(gaps) else 0)
    else:
        it, x, y, ha = spec
        _place(it, x - (_wpx(it) if ha == "right" else 0), y)
PHASE_ITEM = {"recon": 0, "grad": 1, "move": 2, "true": 2, "apply": 3, "settle": 3}
LIST_ON, LIST_OFF = np.array(matplotlib.colors.to_rgb(DARK)), np.array(matplotlib.colors.to_rgb("#b9bdc3"))
LIST_IDLE = np.array(matplotlib.colors.to_rgb("#8a8f96"))

# ----------------------------------------------------------------- dynamic artists
DOT = (0, (1.0, 1.15))
HL, HW = 28.0 * K, 14.5 * K  # arrow head length / half width (px)


def make_arrow(color, dotted, lw, z, halo=4.5, head_scale=1.0):
    return dict(
        hs=head_scale, use_halo=halo > 0,
        halo=ov.plot([], [], color="white", lw=(lw + halo) * K, solid_capstyle="round", zorder=z)[0],
        line=ov.plot([], [], color=color, lw=lw * K, ls=DOT if dotted else "-", solid_capstyle="butt",
                     dash_capstyle="butt", zorder=z + 0.1)[0],
        head=ov.add_patch(Polygon(np.zeros((3, 2)), closed=True, fc=color, ec="white", lw=1.8 * K,
                                  joinstyle="miter", zorder=19 + z / 100)),
    )


A = {}
for key in KEYS:
    a = {}
    a["lat"] = ov.plot([], [], "o", ms=(6.5 if key == "std" else 5.0) * K, color=COL[key], mec="white", mew=0.8,
                       alpha=0.75 if key == "std" else 0.6, zorder=6)[0]
    a["star"] = ov.plot([], [], "*", ms=26 * K, color=GOLD, mec="white", mew=1.4 * K, zorder=9)[0]  # the minimum
    a["fp"] = ov.plot([], [], color=GOLD, lw=3.0 * K, ls=(0, (2.2, 1.6)), alpha=0.95, zorder=9.5)[0]
    a["fp_ball"] = ov.plot([], [], "o", ms=13 * K, mfc="none", mec=GOLD, mew=2.6 * K, zorder=9.6)[0]
    a["sw_trails"] = [ov.plot([], [], color=COL_D[key], lw=1.5 * K, alpha=0.32, solid_capstyle="round",
                              zorder=7.5)[0] for _ in STARTS]
    a["sw_shadow"] = ov.plot([], [], "o", ms=11 * K, color="black", alpha=0.12, mew=0, zorder=7.8)[0]
    a["sw_balls"] = ov.plot([], [], "o", ms=9.5 * K, color=COL_D[key], mec="white", mew=1.1 * K, alpha=0.9,
                            zorder=8)[0]
    a["shadow"] = ov.plot([], [], "o", ms=21 * K, color="black", alpha=0.22, mew=0, zorder=15)[0]
    a["glow"] = ov.plot([], [], "o", ms=40 * K, mfc="none", mec=AMBER, mew=4.0 * K, alpha=0.0, zorder=19.9)[0]
    a["trail_halo"] = ov.plot([], [], color="white", lw=8.0 * K, alpha=0.8, solid_capstyle="round",
                              solid_joinstyle="round", zorder=10)[0]
    a["trail"] = ov.plot([], [], color=COL_D[key], lw=3.8 * K, solid_capstyle="round", solid_joinstyle="round",
                         zorder=10.1)[0]
    a["trail_pts"] = ov.plot([], [], "o", ms=8 * K, color=COL_D[key], mec="white", mew=1.2 * K, zorder=10.2)[0]
    a["teth_halo"] = ov.plot([], [], color="white", lw=6.0 * K, solid_capstyle="round", zorder=12)[0]
    a["teth"] = ov.plot([], [], color=LEAD, lw=2.2 * K, solid_capstyle="round", zorder=12.1)[0]
    # z-order: r ring (17) < arrow shafts (18.x) < arrow heads (19.x) < w ball (20) < r outline (21).
    a["arr_r"] = make_arrow(COL[key], True, 5.6, 18.0)
    a["arr_w"] = make_arrow(COL[key], False, 6.4, 18.3)
    a["arr_true"] = make_arrow(DARK, True, 4.8, 18.6)   # on top: visible even when parallel to the update
    a["arr_true_ov"] = make_arrow(DARK, True, 4.2, 18.6, halo=0, head_scale=0.62)
    a["ring"] = ov.plot([], [], "o", ms=25 * K, mfc="white", mec=COL[key], mew=3.8 * K, zorder=17)[0]
    a["ball"] = ov.plot([], [], "o", ms=18.5 * K, color=COL_D[key], mec="white", mew=2.0 * K, zorder=20)[0]
    a["ring_top"] = ov.plot([], [], "o", ms=25 * K, mfc="none", mec=COL[key], mew=2.4 * K, zorder=21)[0]
    a["spec"] = ov.plot([], [], "o", ms=5 * K, color="white", alpha=0.6, mew=0, zorder=20.5)[0]
    # step-1 labels (Figure 1 wording)
    a["lab_w"] = ov.text(0, 0, r"latent weights $w$", fontsize=FS_LAB, color=DARK, zorder=30,
                         path_effects=HALO)
    a["lab_r"] = ov.text(0, 0, r"\shortstack[r]{reconstructed\\weights $r$}", fontsize=FS_LAB, color=COL_D[key],
                         zorder=30, path_effects=HALO, linespacing=1.0)
    a["lead_w"] = ov.plot([], [], color=LEAD, lw=1.4 * K, zorder=29)[0]
    a["lead_r"] = ov.plot([], [], color=LEAD, lw=1.4 * K, zorder=29)[0]
    A[key] = a


def hide_arrow(ar):
    ar["halo"].set_data([], [])
    ar["line"].set_data([], [])
    ar["head"].set_visible(False)


def draw_arrow(ar, key, spec, lift=0.05):
    if spec is None:
        hide_arrow(ar)
        return
    base, vec, alpha = spec
    if alpha <= 0.01 or np.linalg.norm(vec) < 1e-4:
        hide_arrow(ar)
        return
    xy = proj(key, drape(base, base + vec, 40), lift)
    seg = np.linalg.norm(np.diff(xy, axis=0), axis=1)
    s = np.r_[0, np.cumsum(seg)]
    L = s[-1]
    if L < 3:
        hide_arrow(ar)
        return
    hl = min(HL * ar["hs"], 0.62 * L)
    hw = HW * hl / HL
    tip = xy[-1]
    bpt = np.array([np.interp(L - hl, s, xy[:, 0]), np.interp(L - hl, s, xy[:, 1])])
    e = tip - bpt
    e /= np.linalg.norm(e) + 1e-12
    nrm = np.array([-e[1], e[0]])
    keep = s < L - hl
    line = np.vstack([xy[keep], bpt])
    for part in ("halo", "line"):
        ar[part].set_data(line[:, 0], line[:, 1])
        ar[part].set_alpha(alpha if (part == "line" or ar["use_halo"]) else 0.0)
    ar["head"].set_xy([tip + e * 1.5, bpt + nrm * hw, bpt - nrm * hw])
    ar["head"].set_visible(True)
    ar["head"].set_alpha(alpha)


def draw(t):
    set_view(t)
    st = S.timeline_state(t)
    kind = st["kind"]
    for key in KEYS:
        a = A[key]
        sc = S.scene(key, t)
        # lattice
        P = lattice_points(key, lattice_offset(key, t))
        xy = proj(key, P, 0.02)
        a["lat"].set_data(xy[:, 0], xy[:, 1])
        sxy = proj(key, np.zeros(2), 0.03)[0]
        a["star"].set_data([sxy[0]], [sxy[1]])
        # swarm (same rules, other starting points) and the full-precision ghost path
        SH = np.array([0.07, -0.07])   # shadow offset (light from the upper left)
        stg = stage(t)
        sw_a = {"snap": 0.0, "rew1": 0.0, "solo": 0.0, "rew2": float(S.ease(st["u"])), "replay": 1.0}[stg]
        if stg == "replay" and kind == "hold":   # swarm fades out at the end -> loops into the solo snapshot
            sw_a = 1 - float(S.ease((st["u"] - 0.55) / 0.45))
        pos_all = []
        for W, ln in zip(SWARM[key], a["sw_trails"]):
            if stg == "rew2":
                pos, trl, ta_ = W[0], W[:1], 0.0      # swarm appears at its starting points
            else:
                pos, trl, ta_ = path_pos(W, st)
            pos_all.append(pos)
            if len(trl) > 1 and ta_ * sw_a > 0.01:
                pxy = proj(key, np.vstack([drape(trl[i], trl[i + 1], 10) for i in range(len(trl) - 1)]), 0.03)
                ln.set_data(pxy[:, 0], pxy[:, 1])
                ln.set_alpha(0.32 * ta_ * sw_a)
            else:
                ln.set_data([], [])
        pos_all = np.array(pos_all)
        bxy = proj(key, pos_all, 0.10)
        a["sw_balls"].set_data(bxy[:, 0], bxy[:, 1])
        a["sw_balls"].set_alpha(0.9 * sw_a)
        shx = proj(key, pos_all + SH, 0.0)
        a["sw_shadow"].set_data(shx[:, 0], shx[:, 1])
        a["sw_shadow"].set_alpha(0.12 * sw_a)
        fpos, ftr, fta = path_pos(FP, st)
        if len(ftr) > 1 and fta > 0.01:
            fxy = proj(key, np.vstack([drape(ftr[i], ftr[i + 1]) for i in range(len(ftr) - 1)]), 0.05)
            a["fp"].set_data(fxy[:, 0], fxy[:, 1])
            a["fp"].set_alpha(0.95 * fta)
        else:
            a["fp"].set_data([], [])
        gxy = proj(key, fpos, 0.06)[0]
        a["fp_ball"].set_data([gxy[0]], [gxy[1]])
        # trail
        tr = sc["trail"]
        ta = sc.get("trail_alpha", 1.0)
        if len(tr) > 1 and ta > 0.01:
            pts = np.vstack([drape(tr[i], tr[i + 1]) for i in range(len(tr) - 1)])
            txy = proj(key, pts, 0.04)
            for nm in ("trail_halo", "trail"):
                a[nm].set_data(txy[:, 0], txy[:, 1])
            a["trail_halo"].set_alpha(0.8 * ta)
            a["trail"].set_alpha(ta)
            vxy = proj(key, tr[:-1], 0.04)
            a["trail_pts"].set_data(vxy[:, 0], vxy[:, 1])
            a["trail_pts"].set_alpha(ta)
        else:
            for nm in ("trail_halo", "trail", "trail_pts"):
                a[nm].set_data([], [])
        # tether w - r
        if sc["conn"] is not None and sc["r_alpha"] > 0.01:
            cxy = proj(key, drape(*sc["conn"]), 0.04)
            for nm in ("teth_halo", "teth"):
                a[nm].set_data(cxy[:, 0], cxy[:, 1])
                a[nm].set_alpha(sc["r_alpha"])
        else:
            a["teth_halo"].set_data([], [])
            a["teth"].set_data([], [])
        # arrows
        if stage(t) == "replay":
            sc["arr_true"] = None
        par = kind == "step" and S.angle_deg(TR[key]["u"][st["step"]], TR[key]["u_true"][st["step"]]) < 20
        draw_arrow(a["arr_true"], key, None if par else sc["arr_true"])
        draw_arrow(a["arr_true_ov"], key, sc["arr_true"] if par else None)
        ar_ = sc["arr_r"]
        if ar_ is not None and kind == "step" and st["phase"] in ("true", "apply") and S.STEP_PLAN[st["step"]]["true"] > 0:
            ar_ = (ar_[0], ar_[1], ar_[2] * 0.6)   # one dotted arrow in focus: the true gradient at w
        draw_arrow(a["arr_r"], key, ar_)
        draw_arrow(a["arr_w"], key, sc["arr_w"])
        # ring and ball
        if sc["r"] is not None and sc["r_alpha"] > 0.01:
            rxy = proj(key, sc["r"], 0.04)[0]
            for nm in ("ring", "ring_top"):
                a[nm].set_data([rxy[0]], [rxy[1]])
                a[nm].set_alpha(sc["r_alpha"])
        else:
            a["ring"].set_data([], [])
            a["ring_top"].set_data([], [])
            rxy = None
        wxy = proj(key, sc["w"], 0.10)[0]
        a["ball"].set_data([wxy[0]], [wxy[1]])
        a["spec"].set_data([wxy[0] - 3 * K], [wxy[1] + 3 * K])
        hsx = proj(key, sc["w"] + SH, 0.0)[0]
        a["shadow"].set_data([hsx[0]], [hsx[1]])
        glow = 0.0
        if key == "std" and kind == "step" and st["phase"] in ("apply", "settle"):
            k_ = st["step"]
            if TR["std"]["L_w"][k_ + 1] > TR["std"]["L_w"][k_]:   # this borrowed step goes uphill
                glow = float(S.ease(st["u"] / 0.4)) if st["phase"] == "apply" else 1 - float(S.ease(st["u"]))
        a["glow"].set_data([wxy[0]], [wxy[1]])
        a["glow"].set_alpha(0.9 * glow)
        # step-1 labels
        if kind == "intro":
            la_w, la_r = 1.0, 0.0
        elif kind == "rewind" and stage(t) == "rew1":   # anchored at the start, fades in as w arrives
            la_w, la_r = float(S.ease((st["u"] - 0.6) / 0.4)), 0.0
        elif kind == "step" and st["step"] == 0 and stage(t) == "solo":
            ph = st["phase"]
            la_w = 1 - S.ease(st["u"] / 0.5) if ph == "settle" else 1.0
            if ph == "recon":
                la_r = float(S.ease((st["u"] - 0.55) / 0.45))
            elif ph == "settle":
                la_r = 1 - S.ease(st["u"] / 0.5)
            else:
                la_r = 1.0
            la_r *= sc["r_alpha"]
        else:
            la_w, la_r = 0.0, 0.0
        place_labels(key, proj(key, TR[key]["w"][0], 0.04)[0] if kind == "rewind" else wxy, rxy,
                     la_w if kind != "rewind" or stage(t) == "rew1" else 0.0, la_r)
    # numbered list: highlight the current move (crossfade), nothing moves
    if kind == "step" and st["step"] == 0 and stage(t) == "solo":
        cur, u_ = PHASE_ITEM[st["phase"]], st["u"]
        prev = PHASE_ITEM.get({"grad": "recon", "move": "grad", "true": "move", "apply": "true",
                               "settle": "apply", "recon": "settle"}[st["phase"]], cur)
        fade = float(S.ease(u_ / 0.25)) if prev != cur else 1.0
        for i, t_ in enumerate(LIST_T):
            on = (fade if i == cur else 0.0) + ((1 - fade) if i == prev and prev != cur else 0.0)
            t_.set_color(tuple(LIST_OFF + (LIST_ON - LIST_OFF) * on))
    else:
        for t_ in LIST_T:
            t_.set_color(tuple(LIST_IDLE))


_LABW = {}


def label_width(t_):
    if id(t_) not in _LABW:
        t_.set_position((500, 500))
        t_.set_ha("right")
        _LABW[id(t_)] = t_.get_window_extent(fig.canvas.get_renderer()).width
    return _LABW[id(t_)]


def place_labels(key, wxy, rxy, la_w, la_r):
    a = A[key]
    x_min = LAB_XMIN[key]
    for nm, p, la in (("w", wxy, la_w), ("r", rxy, la_r)):
        t_, ld = a["lab_" + nm], a["lead_" + nm]
        if p is None or la <= 0.01:
            t_.set_alpha(0)
            ld.set_data([], [])
            continue
        off = LAB_OFF[key][nm]
        pos = p + off
        pos[0] = max(pos[0], x_min + label_width(t_) + 6)   # never clipped by the panel edge
        t_.set_position(pos + np.array([-6.0, 0.0]))
        t_.set_ha("right")
        t_.set_va("center")
        t_.set_alpha(la)
        d = p - pos
        stop = p - d / np.linalg.norm(d) * (19 if nm == "r" else 15) * K
        ld.set_data([pos[0], stop[0]], [pos[1], stop[1]])
        ld.set_alpha(la)


def frame(t):
    draw(t)
    fig.canvas.draw()
    return np.asarray(fig.canvas.buffer_rgba())[..., :3].copy()


# ----------------------------------------------------------------- output
NAME = {"landscape": "hero", "portrait": "hero-portrait", "og": "og"}[LAYOUT]
MASTER = SCRATCH / f"{NAME}_master.mkv"
VIDEO = SITE / "assets/video" / f"{NAME}.mp4"
SHOTS = SCRATCH.parent / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)


def write_master(path):
    """Lossless RGB master (FFV1), streamed: no frame list in memory."""
    cmd = [FFMPEG, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W_PX}x{H_PX}",
           "-r", str(FPS), "-i", "-", "-c:v", "ffv1", "-level", "3", "-pix_fmt", "bgr0", str(path)]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    keep = {int(i) for i in np.linspace(0, N - 1, 12).astype(int)}
    kept = {}
    for i in range(N):
        fr = frame(i / FPS)
        p.stdin.write(np.ascontiguousarray(fr).tobytes())
        if i in keep:
            kept[i] = fr
        if i % 60 == 0:
            print(f"  frame {i}/{N}", flush=True)
    p.stdin.close()
    assert p.wait() == 0, "ffmpeg master failed"
    # seamless loop: the frame one tick after the last must equal the first
    f0, fT = frame(0.0), frame(TOTAL)
    print(f"  seam: max|frame(TOTAL) - frame(0)| = {np.abs(f0.astype(int) - fT.astype(int)).max()}")
    from PIL import Image
    Image.fromarray(f0).save(SCRATCH / f"{NAME}_frame0.png")
    contact_sheet([kept[i] for i in sorted(kept)], SHOTS / f"{NAME}_contact_render.png", n=12, cols=3 if LAYOUT == "landscape" else 4)


def encode(master, out, crf=20, tune="animation"):
    vf = (f"scale={OUT_W}:{OUT_H}:flags=lanczos+accurate_rnd+full_chroma_int:"
          f"out_color_matrix=bt709:out_range=tv,format=yuv420p,"
          f"setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv")
    cmd = [FFMPEG, "-y", "-loglevel", "error", "-i", str(master), "-vf", vf,
           "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", str(crf)]
    if tune:
        cmd += ["-tune", tune]
    # one GOP per loop (keyframe only at the seam, no mid-loop I-frame pops; also ~9% smaller)
    cmd += ["-x264-params", f"keyint={N}:min-keyint={N}:scenecut=0"]
    cmd += ["-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
            "-color_range", "tv", "-an", "-movflags", "+faststart", str(out)]
    subprocess.run(cmd, check=True)
    return out.stat().st_size / 1e6


def poster(path, quality=82):
    from PIL import Image
    im = Image.open(SCRATCH / f"{NAME}_frame0.png").resize((OUT_W, OUT_H), Image.LANCZOS)
    im.save(path, "JPEG", quality=quality, optimize=True, progressive=True)
    return path.stat().st_size / 1e3


if __name__ == "__main__":
    if MODE == "calib":
        for key, b in FITTED.items():
            print(key, "zoom %.3f  x %.0f..%.0f  y %.0f..%.0f  w %.0f h %.0f" % (ZOOM[key], b[0], b[1], b[2], b[3], b[1] - b[0], b[3] - b[2]))
        sys.exit()
    if MODE == "union":   # all text + every surface position over the orbit (layout check)
        acc = None
        for tt in np.linspace(0, TOTAL, 25):
            fr = frame(tt)
            acc = fr if acc is None else np.minimum(acc, fr)
        from PIL import Image
        Image.fromarray(acc).save(SHOTS / f"{NAME}_union.png")
        sys.exit()
    if LAYOUT == "og":
        from PIL import Image
        draw(0.0)                                   # end state (= the videos' first frame)
        big = SCRATCH / "og_2x.png"
        fig.savefig(big, dpi=2 * DPI, facecolor=BG)
        im = Image.open(big).convert("RGB").resize((W_PX, H_PX), Image.LANCZOS)
        out = SITE / "assets/img/og.png"
        im.save(out, optimize=True)
        print(f"og.png: {im.size}, {out.stat().st_size / 1e3:.0f} KB")
        sys.exit()
    if MODE == "stills":
        for name in sys.argv[3:]:
            tt = float(name)
            draw(tt)
            fig.savefig(SHOTS / f"{NAME}_still_t{tt:05.2f}.png", dpi=DPI, facecolor=BG)
        sys.exit()
    if MODE == "render":
        write_master(MASTER)
    crf = int(os.environ.get("HERO_CRF", "20"))
    tune = os.environ.get("HERO_TUNE", "animation")
    mb = encode(MASTER, VIDEO, crf=crf, tune=tune or None)
    print(f"{VIDEO.name}: {mb:.2f} MB  ({N} frames, {TOTAL:.2f} s, {OUT_W}x{OUT_H}, crf {crf}, tune {tune})")
    kb = poster(SITE / "assets/video" / f"{NAME}.jpg")   # first frame (= end state), q 82
    print(f"{NAME}.jpg: {kb:.0f} KB")
