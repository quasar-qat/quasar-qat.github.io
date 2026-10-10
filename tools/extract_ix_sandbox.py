#!/usr/bin/env python3
"""Build assets/data/ix-sandbox.json for the 'borrowed gradient' sandbox (#ix-sandbox, Section 1).

ILLUSTRATIVE, like Figure 1 and the page's hero animation: the same 2-D loss surface, the same two
reconstruction grids, the same loss-aware offset rule and the same STE update with the same fixed learning
rate, ported to the browser so the reader can choose the starting point. Like the hero (tools/video/make_hero.py),
the sandbox keeps ONE QUASAR lattice per run (offset chosen at the start point); slowsteps.py re-fits it every step.

Source of truth: the launch-animation physics module `slowsteps.py` (imported unmodified):

    loss(x, y)      the Figure 1 surface (rotated anisotropic bowl, 3.4 * (1 - exp(-q / 3)))
    grad(p)         central finite differences, eps = 1e-4
    recon_std(w)    Standard QAT: coarse fixed grid, OFF_STD + D_STD * round((w - OFF_STD) / D_STD)
    recon_quasar(w) QUASAR: finer grid (D_Q) whose offset z in linspace(0, D_Q, 41) minimises the
                    saliency-weighted error sum(H_SAL * (r - w)^2) at w. slowsteps.py re-fits z every step;
                    the sandbox applies this rule ONCE, at the run's start point w0, and keeps that lattice
                    for every step: r = z0 + D_Q * round((w - z0) / D_Q)
    STE step        r = Q(w); w <- w - LR * grad(r)        (LR = 1.1, same for both methods)
    full precision  r = w (exact gradient), same start and learning rate (hero's gold ghost path)

The constants that slowsteps.py keeps inline (2.2, 1.25, 3.4, 3.0, the 41-point offset grid) are
written out here and VERIFIED bit-for-bit against slowsteps.loss / grad / recon_* on random points.
Standard QAT trajectories are verified against slowsteps' own rule (and the hero's TRAJ["std"]); QUASAR's
first reconstruction is verified against slowsteps.recon_quasar(w0), and every later one against the one
lattice z0 + D_Q * Z. (slowsteps' TRAJ["q"] is not reproduced: it re-fits the offset every step.)
The colour field is the hero's: matplotlib coolwarm lightened by 15 % toward white, normalised to
the loss range on the surface's [-LIM, LIM]^2 domain (121 x 121 grid), as in tools/video/make_hero.py.

Inputs (not distributed with this site):
  --anim-dir   QUASAR_ANIM_DIR   directory holding slowsteps.py (and quasar_np.py)

Outputs:
  assets/data/ix-sandbox.json         physics constants + colormap (shipped, ~3 kB)
  tools/dev/ix-sandbox-check.json     reference trajectories for the JS parity check (dev page only)
  --check-plot PNG                    optional matplotlib render from the JSON, side by side with
                                      --compare PNG (e.g. the hero poster or the Figure 1 render)

  python3 tools/extract_ix_sandbox.py [--anim-dir DIR] [--check-plot out.png --compare hero.jpg]
"""
import argparse
import json
import os
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parents[1]
OUT = SITE / "assets" / "data" / "ix-sandbox.json"
OUT_CHECK = SITE / "tools" / "dev" / "ix-sandbox-check.json"
MAX_STEPS = 12           # sandbox horizon (the hero shows slowsteps.STEPS = 6; the rule is the same)
N_CHECK = 64             # random starting points in the parity file
LEVELS = [0.1, 0.25, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]   # isolines drawn on the field (display only)

# inline constants of slowsteps.loss / recon_quasar (verified below)
A, B, AMP, TEMP = 2.2, 1.25, 3.4, 3.0
NZ = 41
# slowsteps' physics check compares gradient directions only "while w is not yet at the minimum",
# i.e. while L(w) > 0.01; the sandbox reports the angle under the same condition
AT_MIN = 0.01


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--anim-dir", default=os.environ.get("QUASAR_ANIM_DIR"))
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--check-out", default=str(OUT_CHECK))
    ap.add_argument("--check-plot", default=None, help="write a matplotlib render of the JSON here (PNG)")
    ap.add_argument("--compare", default=None, help="image shown next to the check plot (hero poster / Figure 1)")
    args = ap.parse_args()
    if not args.anim_dir:
        sys.exit("extract_ix_sandbox.py: set QUASAR_ANIM_DIR (or --anim-dir) to the directory holding slowsteps.py")
    anim = Path(args.anim_dir)
    if not (anim / "slowsteps.py").is_file():
        sys.exit(f"extract_ix_sandbox.py: slowsteps.py not found in {anim}")
    sys.path.insert(0, str(anim))
    import numpy as np
    import slowsteps as S

    # ------------------------------------------------------------ port (reads only the JSON constants)
    zs = np.linspace(0, S.D_Q, NZ)
    P = dict(rot=float(S.R2), a=A, b=B, amp=AMP, temp=TEMP, eps=1e-4)

    def loss(x, y):
        u = x * np.cos(P["rot"]) + y * np.sin(P["rot"])
        v = -x * np.sin(P["rot"]) + y * np.cos(P["rot"])
        q = (u / P["a"]) ** 2 + (v / P["b"]) ** 2
        return P["amp"] * (1.0 - np.exp(-q / P["temp"]))

    def grad(p):
        e = P["eps"]
        return np.array([(loss(p[0] + e, p[1]) - loss(p[0] - e, p[1])) / (2 * e),
                         (loss(p[0], p[1] + e) - loss(p[0], p[1] - e)) / (2 * e)])

    off, dstd, dq, hs = np.array(S.OFF_STD, float), float(S.D_STD), float(S.D_Q), np.array(S.H_SAL, float)

    def recon_std(w):
        return off + dstd * np.round((w - off) / dstd)

    def select_z(w):
        """QUASAR's loss-aware offset at w: argmin_z sum(H_SAL * (r_z - w)^2), first minimum (as slowsteps)."""
        best = None
        for z in zs:
            r = z + dq * np.round((w - z) / dq)
            s = float((hs * (r - w) ** 2).sum())
            if best is None or s < best[0]:
                best = (s, z)
        return float(best[1])

    def recon_q(w):                            # slowsteps.recon_quasar (offset re-selected at w)
        z = select_z(w)
        return z + dq * np.round((w - z) / dq)

    def recon_fixed(z):                        # the sandbox's QUASAR rule: one lattice for the whole run
        return lambda w: z + dq * np.round((w - z) / dq)

    # ------------------------------------------------------------ verify the port against slowsteps
    rng = np.random.default_rng(20261006)
    pts = rng.uniform(-S.LIM, S.LIM, size=(4000, 2))
    d_loss = max(abs(float(loss(*p)) - float(S.loss(*p))) for p in pts)
    d_grad = max(float(np.abs(grad(p) - S.grad(p)).max()) for p in pts[:1500])
    d_std = max(float(np.abs(recon_std(p) - S.recon_std(p)).max()) for p in pts)
    d_q = max(float(np.abs(recon_q(p) - S.recon_quasar(p)).max()) for p in pts[:1500])
    assert d_loss == 0 and d_grad == 0 and d_std == 0 and d_q == 0, (d_loss, d_grad, d_std, d_q)

    def run(recon, w0, n):
        w = np.array(w0, float)
        W, R = [], []
        for _ in range(n + 1):
            r = recon(w)
            W.append(w.copy())
            R.append(np.array(r, float))
            w = w + (-S.LR * grad(r))          # slowsteps._run: u = -LR * grad(r); w = w + u
        return np.array(W), np.array(R)

    # the sandbox's default start reproduces the hero's Standard QAT path (slowsteps.TRAJ["std"]) exactly
    W, R = run(recon_std, S.W0, S.STEPS)
    assert np.array_equal(W, S.TRAJ["std"]["w"]) and np.array_equal(R, S.TRAJ["std"]["r"])

    # ------------------------------------------------------------ colour field (make_hero.py PJET)
    import matplotlib
    cw = matplotlib.colormaps["coolwarm"](np.linspace(0, 1, 256))
    cw[:, :3] = 1.0 - 0.85 * (1.0 - cw[:, :3])
    stops = cw[np.linspace(0, 255, 65).round().astype(int), :3]
    g = np.linspace(-S.LIM, S.LIM, 121)
    Zf = S.loss(*np.meshgrid(g, g))

    data = {
        "source": "Figure 1 (illustrative): loss surface, reconstruction grids, STE rule and learning rate of the hero animation",
        "surface": P,
        "view": {"lim": float(S.LIM), "start_lim": 3.0, "vmin": float(Zf.min()), "vmax": float(Zf.max()),
                 "levels": LEVELS},
        "lr": float(S.LR), "steps": MAX_STEPS, "max_steps": MAX_STEPS,  # autoplay runs to the end of the axis
        "at_min": AT_MIN,
        "w0": [float(v) for v in S.W0],
        "standard_qat": {"step": dstd, "offset": [float(v) for v in off]},
        "quasar": {"step": dq, "z": [float(z) for z in zs], "h": [float(v) for v in hs]},
        "cmap": [[int(round(255 * c)) for c in s] for s in stops],
    }
    Path(args.out).write_text(json.dumps(data, separators=(",", ":")) + "\n")
    print("wrote", args.out, Path(args.out).stat().st_size, "bytes")

    # ------------------------------------------------------------ parity file (dev page only)
    starts = [np.array(S.W0, float)] + list(rng.uniform(-3.0, 3.0, size=(N_CHECK - 1, 2)))
    cases = []
    for w0 in starts:
        z0 = select_z(w0)
        Ws, Rs = run(recon_std, w0, MAX_STEPS)
        Wq, Rq = run(recon_fixed(z0), w0, MAX_STEPS)
        Wf, _ = run(lambda w: w, w0, MAX_STEPS)
        # Standard QAT: the slowsteps rule itself (not the port) must give the same path
        Ws2, _ = run(S.recon_std, w0, MAX_STEPS)
        assert np.array_equal(Ws, Ws2)
        # QUASAR: the lattice is slowsteps' loss-aware choice at w0, and every r lies on that one lattice
        assert np.array_equal(Rq[0], S.recon_quasar(w0))
        kq = (Rq - z0) / dq
        assert np.abs(kq - np.round(kq)).max() < 1e-9
        cases.append({"w0": w0.tolist(), "z": z0,
                      "std": {"w": Ws.tolist(), "r": Rs.tolist()},
                      "q": {"w": Wq.tolist(), "r": Rq.tolist()},
                      "fp": {"w": Wf.tolist()},
                      "angle": {k: [float(S.angle_deg(-S.LR * grad(r), -S.LR * grad(w))) for w, r in zip(Wk, Rk)]
                                for k, Wk, Rk in (("std", Ws, Rs), ("q", Wq, Rq))}})
    Path(args.check_out).write_text(json.dumps({"max_steps": MAX_STEPS, "cases": cases}, separators=(",", ":")) + "\n")
    print("wrote", args.check_out, Path(args.check_out).stat().st_size, "bytes")
    # the story at the default start: QUASAR (fixed lattice) descends over the hero's horizon, Standard QAT bounces
    Ld = {k: [float(loss(*w)) for w in cases[0][k]["w"]] for k in ("std", "q")}
    assert all(Ld["q"][i + 1] < Ld["q"][i] for i in range(S.STEPS)), Ld["q"]
    assert sum(Ld["std"][i + 1] > Ld["std"][i] for i in range(MAX_STEPS)) >= 3, Ld["std"]
    print("port == slowsteps (bitwise): loss, grad, recon_std, recon_quasar, TRAJ['std']; QUASAR z0 at the default start:",
          cases[0]["z"], "; default start L(w):")
    for key in ("std", "q"):
        print(" ", key, " ".join(f"{v:.3f}" for v in Ld[key]))

    if args.check_plot:
        check_plot(data, cases[0], args.check_plot, args.compare)


def check_plot(D, case, out, compare):
    """Top-down render of the sandbox at the hero's end state (6 steps), drawn only from the JSON."""
    import numpy as np
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.colors import ListedColormap
    P, Vw = D["surface"], D["view"]
    L = Vw["lim"]
    g = np.linspace(-L, L, 400)
    X, Y = np.meshgrid(g, g)
    u = X * np.cos(P["rot"]) + Y * np.sin(P["rot"])
    v = -X * np.sin(P["rot"]) + Y * np.cos(P["rot"])
    Z = P["amp"] * (1 - np.exp(-((u / P["a"]) ** 2 + (v / P["b"]) ** 2) / P["temp"]))
    cmap = ListedColormap(np.array(D["cmap"]) / 255.0)
    n = D["steps"]
    ncol = 3 if compare else 2
    fig, axs = plt.subplots(1, ncol, figsize=(5.2 * ncol + (2.5 if compare else 0), 5.4),
                            gridspec_kw={"width_ratios": [1, 1, 1.75][:ncol]})
    for ax, key, title, col, cold in ((axs[0], "std", "Standard QAT", "#3F4245", "#3F4245"),
                                      (axs[1], "q", "QUASAR", "#D1495B", "#A13040")):
        ax.imshow(Z, extent=(-L, L, -L, L), origin="lower", cmap=cmap, vmin=Vw["vmin"], vmax=Vw["vmax"])
        ax.contour(X, Y, Z, levels=Vw["levels"], colors="white", linewidths=0.6, alpha=0.6)
        W = np.array(case[key]["w"])[: n + 1]
        R = np.array(case[key]["r"])[: n + 1]
        d = D["standard_qat"]["step"] if key == "std" else D["quasar"]["step"]
        o = np.array(D["standard_qat"]["offset"]) if key == "std" else np.array([case["z"], case["z"]])
        xs = o[0] + d * np.arange(np.ceil((-L - o[0]) / d), np.floor((L - o[0]) / d) + 1)
        ys = o[1] + d * np.arange(np.ceil((-L - o[1]) / d), np.floor((L - o[1]) / d) + 1)
        gx, gy = np.meshgrid(xs, ys)
        ax.plot(gx.ravel(), gy.ravel(), "o", ms=3.5 if key == "std" else 2.6, color=col, mec="white", mew=0.5, alpha=0.75)
        F = np.array(case["fp"]["w"])[: n + 1]
        ax.plot(F[:, 0], F[:, 1], color="#C9A227", lw=2, ls=(0, (3, 2)))
        ax.plot(W[:, 0], W[:, 1], "-o", color=cold, lw=2.2, ms=4, mec="white")
        ax.plot([R[n][0]], [R[n][1]], "o", ms=9, mfc="white", mec=col, mew=2)
        ax.plot([0], [0], "*", ms=14, color="#C9A227", mec="white")
        ax.set_xlim(-L, L)
        ax.set_ylim(-L, L)
        ax.set_aspect("equal")
        ax.set_xticks([])
        ax.set_yticks([])
        ax.set_title(f"{title}  (from ix-sandbox.json, {n} steps)", fontsize=10, color=cold)
    if compare:
        axs[2].imshow(plt.imread(compare))
        axs[2].set_axis_off()
        axs[2].set_title(Path(compare).name, fontsize=10)
    fig.tight_layout()
    fig.savefig(out, dpi=110)
    print("wrote", out)


if __name__ == "__main__":
    main()
