#!/usr/bin/env python3
"""Build assets/data/theory.json for the two section-03 theory charts.

Re-creates the data behind two arXiv v2 appendix figures exactly as their
generators compute it:

  init_predictor.pdf  (Figure 13, \\label{fig:init-predictor})
      x = init-time loss-aware reconstruction error S_0 per (arm, bits)
      y = final healed held-out forward KL, Table 1 fidelity basis
      fit = OLS in log10-log10 over the 9 trio points (QUASAR, Denoising QAT,
            Standard QAT); R^2 cross-checked against a stored reference fit

  dose_trained.pdf    (Figure 12, \\label{fig:dose-trained})
      x = end-of-training S_T per rung (*_final rows; *_step768 fallback when
          the final row is missing, exactly as the generator does -- only the
          f=1 rung needs it)
      y = final held-out KL per rung, the FINAL_KL dict hardcoded in the
          figure generator (parsed here with ast), cross-checked against the
          per-rung eval series
      fit = OLS in log10-log10 over the 5 rungs (slope 0.77, R^2 0.976)

Inputs are the figures' plot data (not distributed with this site). Pass each
one as a flag or environment variable; there are no built-in defaults:

  --init-sref         QUASAR_THEORY_INIT_SREF        JSON [{arm, bits, St_ref}] at step 0
  --fidelity          QUASAR_THEORY_FIDELITY         whitespace table: model run fwd_kl ...
  --init-r2-ref       QUASAR_THEORY_INIT_R2          JSON with the reference trio fit
  --dose-generator    QUASAR_THEORY_DOSE_GENERATOR   Figure 12 generator (.py, FINAL_KL/EXPECT)
  --dose-sref         QUASAR_THEORY_DOSE_SREF        JSON [{arm, St_ref}] per dose rung
  --dose-series       QUASAR_THEORY_DOSE_SERIES      JSON {rung: [{eval_kl, final}, ...]}

  python3 tools/extract_theory.py [--out FILE]
Reads its inputs only; writes assets/data/theory.json in this site repo.
"""
import argparse
import ast
import json
import math
import os
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parents[1]
OUT = SITE / "assets" / "data" / "theory.json"
INPUTS = [  # (flag, env var, what)
    ("init-sref", "QUASAR_THEORY_INIT_SREF", "Figure 13 x: St_ref at step 0"),
    ("fidelity", "QUASAR_THEORY_FIDELITY", "Figure 13 y: Table 1 fidelity KL"),
    ("init-r2-ref", "QUASAR_THEORY_INIT_R2", "Figure 13 reference fit"),
    ("dose-generator", "QUASAR_THEORY_DOSE_GENERATOR", "Figure 12 generator"),
    ("dose-sref", "QUASAR_THEORY_DOSE_SREF", "Figure 12 x: St_ref per rung"),
    ("dose-series", "QUASAR_THEORY_DOSE_SERIES", "Figure 12 y cross-check: eval series"),
]

ARMS = {"ours": ("quasar", "QUASAR"), "gdm": ("denoising_qat", "Denoising QAT"),
        "ste": ("standard_qat", "Standard QAT")}
BITS = [4, 3, 2]
RUNGS = ["full", "floor50", "floor70", "floor85", "minmax"]


def ols_loglog(xs, ys):
    lx = [math.log10(v) for v in xs]
    ly = [math.log10(v) for v in ys]
    n = len(lx)
    mx, my = sum(lx) / n, sum(ly) / n
    sxx = sum((a - mx) ** 2 for a in lx)
    sxy = sum((a - mx) * (b - my) for a, b in zip(lx, ly))
    slope = sxy / sxx
    icept = my - slope * mx
    ss_res = sum((b - (icept + slope * a)) ** 2 for a, b in zip(lx, ly))
    ss_tot = sum((b - my) ** 2 for b in ly)
    return slope, icept, 1 - ss_res / ss_tot, (min(lx), max(lx))


def fidelity_qwen(path):
    rows = {}
    for line in path.read_text().splitlines()[1:]:
        f = line.split()
        if len(f) >= 7 and f[0] == "qwen3_thinking" and f[1].endswith("_ts"):
            rows[f[1][:-3]] = float(f[2])
    return rows


def generator_dict(path, name):
    tree = ast.parse(path.read_text())
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == name for t in node.targets):
            return ast.literal_eval(node.value)
    raise KeyError(f"{name} not found in {path}")


def build_init(inp):
    sref = {(r["arm"], r["bits"]): r["St_ref"]
            for r in json.loads(inp["init-sref"].read_text())}
    fid = fidelity_qwen(inp["fidelity"])
    pts = []
    for arm, (key, label) in ARMS.items():
        for b in BITS:
            pts.append({"method": label, "key": key, "bits": f"INT{b}",
                        "S0": sref[(arm, b)], "kl": fid[f"{arm}_w{b}"]})
    slope, icept, r2, (l0, l1) = ols_loglog([p["S0"] for p in pts], [p["kl"] for p in pts])
    t01 = json.loads(inp["init-r2-ref"].read_text())
    r2_ref = t01["per_model"]["qwen"]["trio_ours_gdm_ste"]["init"]["r2_loglog"]
    assert abs(r2 - r2_ref) < 0.01, (r2, r2_ref)
    assert f"{r2:.2f}" == "0.98", r2  # printed in the v2 caption: R^2=0.98
    return {
        "figure": "init_predictor.pdf (Figure 13, label fig:init-predictor)",
        "caption_title": "Reconstruction error predicts final loss before training.",
        "model": "Qwen3-4B-Thinking-2507",
        "basis": "y = forward KL from the separate fidelity evaluation (Table 1 basis; e.g. QUASAR INT2 0.126, "
                 "Standard QAT INT2 0.186, Denoising QAT INT2 0.179); x = loss-aware reconstruction error of the "
                 "deployed reconstruction at step 0. Not the in-loop curve basis.",
        "sources": {
            "figure": "Figure 13",
            "x": "plot data of Figure 13 (S_0 of each run at step 0)",
            "y": "Table 1 KL (fidelity evaluation, unrounded)",
            "r2_crosscheck": f"Figure 13 caption (R^2=0.98); reference trio fit r2_loglog {r2_ref}",
        },
        "x_label": "Init-time loss-aware reconstruction error",
        "y_label": "Final healed held-out KL to full-precision model",
        "points": pts,
        "fit": {"kind": "OLS power law (log10-log10)", "slope": round(slope, 6), "intercept": round(icept, 6),
                "r2": round(r2, 6), "display": {"r2": f"{r2:.2f}"},
                "x_range": [10 ** (l0 - 0.15), 10 ** (l1 + 0.15)]},
        "axes": {"ylim": [0.013, 0.30], "yticks": [0.02, 0.05, 0.1, 0.2],
                 "xticks": [1e-4, 3e-4, 1e-3, 3e-3]},
    }


def build_dose(inp):
    gen = inp["dose-generator"]
    final_kl = generator_dict(gen, "FINAL_KL")
    expect = generator_dict(gen, "EXPECT")
    sref = {r["arm"]: r["St_ref"] for r in json.loads(inp["dose-sref"].read_text())}
    series = json.loads(inp["dose-series"].read_text())
    labels = {"full": "f ≥ 0.3", "floor50": "f ≥ 0.5", "floor70": "f ≥ 0.7",
              "floor85": "f ≥ 0.85", "minmax": "f = 1"}
    floors = {"full": 0.3, "floor50": 0.5, "floor70": 0.7, "floor85": 0.85, "minmax": 1.0}
    pts = []
    for rung in RUNGS:
        arm, src = f"dosew2_{rung}_final", "final"
        if arm not in sref:
            arm, src = f"dosew2_{rung}_step768", "step768 (final snapshot missing; generator fallback)"
        fin = [r for r in series.get(f"dosew2_{rung}", []) if r.get("final")]
        if fin:
            assert abs(fin[0]["eval_kl"] - final_kl[rung]) < 6e-5, (rung, fin[0], final_kl[rung])
        pts.append({"rung": rung, "label": labels[rung], "f_min": floors[rung],
                    "unrestricted": rung == "full", "ST": sref[arm], "ST_source": src,
                    "kl": final_kl[rung]})
    slope, icept, r2, (l0, l1) = ols_loglog([p["ST"] for p in pts], [p["kl"] for p in pts])
    assert abs(slope - expect[0]) < 0.01 and abs(r2 - expect[1]) < 0.005, (slope, r2)
    # v2 figure prints "slope 0.77, R^2=0.976" (hardcoded in the generator). From the generator's own
    # 4-decimal FINAL_KL the fit gives R^2 = 0.97546; with the unrounded series KLs of the two rungs that
    # have them it is 0.97559 (-> 0.976). Display the printed values; keep the recomputed ones beside them.
    assert f"{slope:.2f}" == "0.77" and abs(r2 - 0.976) < 0.001, (slope, r2)
    return {
        "figure": "dose_trained.pdf (Figure 12, label fig:dose-trained)",
        "caption_title": "Reconstruction error drives final loss.",
        "model": "Qwen3-4B-Thinking-2507",
        "setting": "QUASAR INT2, 1,000 steps, LR 5e-5; runs differ only in the scale-search candidate grid",
        "basis": "y = final held-out KL to the FP16 teacher after 1,000 steps (screen eval of each dose run); "
                 "x = end-of-training loss-aware reconstruction error.",
        "sources": {
            "figure": "Figure 12",
            "x": "plot data of Figure 12 (S_T of each rung at the end of training)",
            "y": "plot data of Figure 12 (final held-out KL per rung), cross-checked against each rung's eval series",
        },
        "x_label": "End-of-training reconstruction error",
        "y_label": "Final held-out KL to FP16 teacher",
        "points": pts,
        "fit": {"kind": "OLS power law (log10-log10)", "slope": round(slope, 6), "intercept": round(icept, 6),
                "r2": round(r2, 6), "display": {"slope": "0.77", "r2": "0.976"},
                "display_note": "display = the annotation printed in the v2 figure; recomputed from the "
                                "4-decimal KLs R^2 = 0.9755 (0.9756 with unrounded series KLs)",
                "x_range": [10 ** (l0 - 0.04), 10 ** (l1 + 0.04)]},
        "axes": {"xlim": [3.55e-4, 7.7e-4], "ylim": [0.142, 0.25],
                 "xticks": [4e-4, 5e-4, 6e-4, 7e-4], "yticks": [0.15, 0.18, 0.21, 0.24]},
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    for flag, env, what in INPUTS:
        ap.add_argument("--" + flag, help=f"{what} (default ${env})")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()
    inp, missing = {}, []
    for flag, env, what in INPUTS:
        raw = getattr(args, flag.replace("-", "_")) or os.environ.get(env)
        if not raw:
            missing.append(f"  --{flag} / ${env}: {what}")
        elif not Path(raw).expanduser().is_file():
            missing.append(f"  --{flag} / ${env}: {raw} is not a file")
        else:
            inp[flag] = Path(raw).expanduser()
    if missing:
        sys.exit("extract_theory.py: missing inputs\n" + "\n".join(missing))
    init, dose = build_init(inp), build_dose(inp)
    out = {
        "source": "arXiv v2 (2608.13966), appendix_theory_validation.tex",
        "generator": "tools/extract_theory.py",
        "note": "Two separate KL bases: init_predictor uses the Table-1 fidelity KL after 4,096 steps; "
                "dose_trained uses held-out KL after 1,000 steps. Never plot them on one axis.",
        "init_predictor": init,
        "dose_trained": dose,
    }
    dst = Path(args.out)
    dst.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print(f"init: slope {init['fit']['slope']:.3f} R2 {init['fit']['r2']:.4f} | "
          f"dose: slope {dose['fit']['slope']:.3f} R2 {dose['fit']['r2']:.4f} -> {dst}")


if __name__ == "__main__":
    main()
