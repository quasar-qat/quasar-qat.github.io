"""Export real Qwen3-4B weight groups + population stats for the quantize-one-group widget.

Writes assets/data/groups.json:
  groups      the widget default group (layer 34 k_proj, median-size 2-bit gain) and 8
              more groups spanning light-tailed -> outlier-heavy / saliency-spiked. w = the
              exact bf16 weights; h = KD-Fisher saliency normalized to mean 1 within the
              group and rounded to 6 significant digits (QUASAR's f*, s, z, r are invariant
              to scaling h; S scales with it, ratios do not).
  population  per-bit (2/3/4) stats over all 2,352 random groups, computed at full
              precision with quasar_np.py on the paper grid 0.30..1.00 (lambda = 0).

Inputs (not distributed with this site; numpy required):
  QUASAR_GROUPS_NPZ  npz sample of the 2,352 random groups (w, h, layer, group_index), read-only
  QUASAR_NP_DIR      directory holding quasar_np.py, the numpy reference of Algorithm 1

    QUASAR_GROUPS_NPZ=... QUASAR_NP_DIR=... python3 tools/export_groups.py
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def _input(env, what, is_dir=False):
    raw = os.environ.get(env)
    if not raw:
        sys.exit(f"export_groups.py: set ${env} ({what})")
    p = Path(raw).expanduser()
    if not (p.is_dir() if is_dir else p.is_file()):
        sys.exit(f"export_groups.py: ${env} = {p} is not a {'directory' if is_dir else 'file'} ({what})")
    return p


sys.dont_write_bytecode = True  # never write __pycache__ into the read-only source tree
NPZ = _input("QUASAR_GROUPS_NPZ", "npz sample of the random weight groups")
sys.path.insert(0, str(_input("QUASAR_NP_DIR", "directory holding quasar_np.py", is_dir=True)))
import numpy as np  # noqa: E402
from quasar_np import PAPER_GRID, S_hat, quasar, standard_qat  # noqa: E402

SITE = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get("QUASAR_GROUPS_OUT", SITE / "assets/data/groups.json"))
BITS = (2, 3, 4)

# (npz row, tensor name, group_index, kind). Chosen from the 2,352 random groups by
# weight-tail heaviness EX = max|w - median| / (1.4826 MAD), saliency
# concentration HC = max h / mean h, saliency of the most extreme weight HX).
SELECTED = [
    (2078, "model.layers.34.self_attn.k_proj.weight", 15757, "median-gain"),        # widget default group
    (1724, "model.layers.30.self_attn.q_proj.weight", None, "light-tailed"),
    (1165, "model.layers.18.self_attn.o_proj.weight", None, "moderate-outlier"),
    (2263, "model.layers.34.mlp.up_proj.weight", None, "saliency-concentrated"),
    (290, "model.layers.2.mlp.down_proj.weight", None, "heaviest-outlier"),
    (456, "model.layers.8.self_attn.v_proj.weight", None, "saliency-spike"),
    (1786, "model.layers.30.self_attn.v_proj.weight", None, "max-gain-w3-w4"),
]


def sig6(x: float) -> float:
    return float(f"{x:.6g}")


def entropy_bits(counts: np.ndarray) -> float:
    p = counts[counts > 0] / counts.sum()
    return float(-(p * np.log2(p)).sum())


def tail_metrics(w, h):
    med = np.median(w)
    mad = 1.4826 * np.median(np.abs(w - med))
    i_ext = int(np.abs(w - med).argmax())
    k = ((w - w.mean()) ** 4).mean() / w.var() ** 2 - 3.0
    return dict(tail_ratio=round(float(np.abs(w - med).max() / mad), 3),
                excess_kurtosis=round(float(k), 3),
                h_peak_over_mean=round(float(h.max() / h.mean()), 3),
                h_of_extreme_weight_over_mean=round(float(h[i_ext] / h.mean()), 4))


def per_group(w, h, bits):
    st = standard_qat(w, bits)
    best = quasar(w, h, bits, PAPER_GRID, lmd=0.0)
    L = 2 ** bits
    cs = np.bincount(st["q"].astype(int), minlength=L)
    cq = np.bincount(best["q"].astype(int), minlength=L)
    S_std = S_hat(w, st["r"], h)
    return dict(gain=S_std / best["S"], f=best["f"], S_std=S_std, S_quasar=best["S"],
                s=best["s"], z=best["z"], n_clipped=int(round(best["clip"] * w.size)),
                counts_std=cs.tolist(), counts_quasar=cq.tolist(),
                eff_bits_std=entropy_bits(cs), eff_bits_quasar=entropy_bits(cq))


def main():
    Z = np.load(NPZ)
    W, H = Z["w"].astype(float), Z["h"].astype(float)
    names, gidx = Z["layer"], Z["group_index"]
    N = len(W)
    assert N == 2352 and W.shape[1] == 128

    # ------------------------------------------------ population (full precision)
    pop, gains_all = {}, {}
    for b in BITS:
        L = 2 ** b
        ratio = np.empty(N)
        fstar = np.empty(N)
        rel_f1 = np.empty(N)
        cs_tot = np.zeros(L, int)
        cq_tot = np.zeros(L, int)
        ent_s, ent_q = np.empty(N), np.empty(N)
        for i, (w, h) in enumerate(zip(W, H)):
            st = standard_qat(w, b)
            best, sweep = quasar(w, h, b, PAPER_GRID, lmd=0.0, return_sweep=True)
            ratio[i] = S_hat(w, st["r"], h) / best["S"]
            fstar[i] = best["f"]
            rel_f1[i] = best["S"] / sweep[-1]["S"]  # vs the fitted full-range (f = 1) candidate
            cs = np.bincount(st["q"].astype(int), minlength=L)
            cq = np.bincount(best["q"].astype(int), minlength=L)
            cs_tot += cs
            cq_tot += cq
            ent_s[i], ent_q[i] = entropy_bits(cs), entropy_bits(cq)
        gains_all[b] = ratio
        f_counts = [int((np.isclose(fstar, f)).sum()) for f in PAPER_GRID]
        assert sum(f_counts) == N
        pop[str(b)] = dict(
            n_groups=N,
            gain_median=float(np.median(ratio)),
            gain_geomean=float(np.exp(np.log(ratio).mean())),
            gain_mean=float(ratio.mean()),
            gain_min=float(ratio.min()),
            gain_max=float(ratio.max()),
            n_worse=int((ratio < 1).sum()),
            frac_worse=float((ratio < 1).mean()),
            frac_gain_ge_2=float((ratio >= 2).mean()),
            gain_percentiles=[float(np.percentile(ratio, p)) for p in range(101)],
            fstar_grid=PAPER_GRID,
            fstar_counts=f_counts,
            fstar_median=float(np.median(fstar)),
            frac_fstar_below_1=float((fstar < 1).mean()),
            S_over_fullrange_fit_median=float(np.median(rel_f1)),
            code_share_std=(cs_tot / cs_tot.sum()).tolist(),
            code_share_quasar=(cq_tot / cq_tot.sum()).tolist(),
            eff_bits_pooled_std=entropy_bits(cs_tot),
            eff_bits_pooled_quasar=entropy_bits(cq_tot),
            eff_bits_group_mean_std=float(ent_s.mean()),
            eff_bits_group_mean_quasar=float(ent_q.mean()),
        )
        print(f"W{b}: median {pop[str(b)]['gain_median']:.4f}x  min {ratio.min():.6f}x  "
              f"max {ratio.max():.2f}x  worse {(ratio < 1).sum()}/{N}  f*<1 {100 * (fstar < 1).mean():.1f}%  "
              f"median f* {np.median(fstar):.2f}  eff bits pooled std/quasar "
              f"{pop[str(b)]['eff_bits_pooled_std']:.3f}/{pop[str(b)]['eff_bits_pooled_quasar']:.3f}")

    # sanity checks on the population
    assert round(pop["2"]["gain_median"], 2) == 2.25 and pop["2"]["n_worse"] == 0
    assert np.round(np.array(pop["2"]["code_share_std"]) * 100, 1).tolist() == [5.0, 45.0, 45.1, 4.9]

    # ------------------------------------------------ selected groups
    groups = []
    for row, name, gi, kind in SELECTED:
        assert str(names[row]) == name, (row, names[row])
        if gi is not None:
            assert int(gidx[row]) == gi
        w32 = Z["w"][row]
        w_exact = [float(x) for x in w32]                      # bf16 values, exact in float64
        h_raw = H[row]
        h_norm = [sig6(x) for x in (h_raw / h_raw.mean())]
        w_e, h_e = np.array(w_exact), np.array(h_norm)
        parts = name.split(".")
        g = dict(id=f"L{parts[2]}.{parts[4]}.g{int(gidx[row])}", kind=kind,
                 layer=int(parts[2]), module=parts[3], proj=parts[4], tensor=name[:-len('.weight')],
                 group_index=int(gidx[row]), npz_row=row, **tail_metrics(w_e, h_e), per_bit={})
        for b in BITS:
            ex = per_group(w_e, h_e, b)                       # what the widget will compute
            full = per_group(W[row], h_raw, b)                # full-precision h
            assert ex["f"] == full["f"], (row, b, ex["f"], full["f"])
            assert abs(ex["gain"] / full["gain"] - 1) < 1e-4, (row, b)
            assert ex["counts_quasar"] == full["counts_quasar"]
            pct = float((gains_all[b] <= full["gain"]).mean())
            g["per_bit"][str(b)] = dict(
                gain=round(ex["gain"], 6), fstar=ex["f"], n_clipped=ex["n_clipped"],
                S_std=float(f"{ex['S_std']:.8g}"), S_quasar=float(f"{ex['S_quasar']:.8g}"),
                counts_std=ex["counts_std"], counts_quasar=ex["counts_quasar"],
                eff_bits_std=round(ex["eff_bits_std"], 4), eff_bits_quasar=round(ex["eff_bits_quasar"], 4),
                population_percentile=round(pct, 4))
        g["w"] = w_exact
        g["h"] = h_norm
        groups.append(g)

    hero = groups[0]["per_bit"]["2"]
    assert hero["fstar"] == 0.55 and hero["counts_std"] == [3, 68, 55, 2]
    assert hero["counts_quasar"] == [20, 51, 45, 12] and round(1 / hero["gain"], 2) == 0.43

    doc = dict(
        meta=dict(
            source="Qwen3-4B-Instruct-2507: 2,352 uniformly random g=128 weight groups "
                   "(48 from each of 7 projections in layers 2, 8, 14, 18, 24, 30, 34) with "
                   "KD-Fisher diagonal saliency h at initialization",
            group_size=128,
            w_note="exact bf16 weights",
            h_note="saliency normalized to mean 1 within the group, 6 significant digits; "
                   "QUASAR f*, s, z, r are scale-invariant in h",
            grid=PAPER_GRID, bits=list(BITS), ridge_lambda=0.0,
            gain_definition="S_hat(Standard QAT) / S_hat(QUASAR), S_hat = sum_i h_i (r_i - w_i)^2",
            eff_bits_definition="Shannon entropy (bits) of the code histogram",
            kind_note="kind/tail metrics are selection tags for UI logic, not paper prose",
            generated_by="tools/export_groups.py (numpy reference of Algorithm 1, arXiv 2608.13966v2)",
        ),
        population=pop,
        groups=groups,
    )
    # one group per line keeps diffs readable
    lines = ['{"meta":' + json.dumps(doc["meta"], separators=(",", ":")) + ',',
             '"population":' + json.dumps(doc["population"], separators=(",", ":")) + ',',
             '"groups":[']
    lines += [json.dumps(g, separators=(",", ":")) + ("," if k < len(groups) - 1 else "")
              for k, g in enumerate(groups)]
    lines += [']}']
    OUT.write_text("\n".join(lines) + "\n")
    json.loads(OUT.read_text())
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.1f} KiB)")
    for g in groups:
        pb = g["per_bit"]
        print(f"{g['id']:24s} {g['kind']:22s} " + "  ".join(
            f"W{b}: {pb[str(b)]['gain']:8.3f}x f*={pb[str(b)]['fstar']:.2f} p{100 * pb[str(b)]['population_percentile']:5.1f}"
            for b in BITS))


if __name__ == "__main__":
    main()
