"""Reference outputs of quasar_np.py (numpy reference of Algorithm 1) for the JS parity test.

Default: every group in assets/data/groups.json (exactly the doubles the widget
parses), bits 2/3/4, paper grid, lambda = 0  ->  tools/_private/quasar_parity_ref.json
(git-ignored; regenerated on every run of tools/run_quasar_parity.sh), or --out FILE.
--all OUT_DIR: all 2,352 npz groups (raw float32 w and h) -> OUT_DIR/{all_groups,all_ref}.json
(large; keep it out of the site repo). Needs $QUASAR_GROUPS_NPZ.

Inputs (not distributed with this site; numpy required):
  QUASAR_NP_DIR      directory holding quasar_np.py
  QUASAR_GROUPS_NPZ  npz sample of the 2,352 random groups (--all only)

    QUASAR_NP_DIR=... python3 tools/quasar_parity_ref.py [--out FILE | --all DIR]
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def _input(env, what, is_dir=False):
    raw = os.environ.get(env)
    if not raw:
        sys.exit(f"quasar_parity_ref.py: set ${env} ({what})")
    p = Path(raw).expanduser()
    if not (p.is_dir() if is_dir else p.is_file()):
        sys.exit(f"quasar_parity_ref.py: ${env} = {p} is not a {'directory' if is_dir else 'file'} ({what})")
    return p


sys.dont_write_bytecode = True
sys.path.insert(0, str(_input("QUASAR_NP_DIR", "directory holding quasar_np.py", is_dir=True)))
import numpy as np  # noqa: E402
from quasar_np import PAPER_GRID, S_hat, quasar, standard_qat  # noqa: E402

SITE = Path(__file__).resolve().parents[1]
BITS = (2, 3, 4)


def ref_one(w, h, b):
    st = standard_qat(w, b)
    best, sweep = quasar(w, h, b, PAPER_GRID, lmd=0.0, return_sweep=True)
    L = 2 ** b
    cq = np.bincount(best["q"].astype(int), minlength=L)
    p = cq[cq > 0] / cq.sum()
    return dict(
        std=dict(s=float(st["s"]), z=float(st["z"]), q=st["q"].astype(int).tolist(),
                 r=st["r"].tolist(), S=S_hat(w, st["r"], h)),
        best=dict(f=best["f"], s=float(best["s"]), z=float(best["z"]), q=best["q"].astype(int).tolist(),
                  r=best["r"].tolist(), S=best["S"], obj=float(best["obj"])),
        sweep=[dict(f=d["f"], s=float(d["s"]), z=float(d["z"]), S=d["S"],
                    n_clipped=int(round(d["clip"] * w.size))) for d in sweep],
        hist=cq.tolist(), eff_bits=float(-(p * np.log2(p)).sum()))


def main():
    if len(sys.argv) > 2 and sys.argv[1] == "--all":
        out_dir = Path(sys.argv[2])
        Z = np.load(_input("QUASAR_GROUPS_NPZ", "npz sample of the random weight groups"))
        groups = [dict(id=f"row{i}", w=[float(x) for x in w], h=[float(x) for x in h])
                  for i, (w, h) in enumerate(zip(Z["w"], Z["h"]))]
        gpath, rpath = out_dir / "all_groups.json", out_dir / "all_ref.json"
        gpath.write_text(json.dumps(dict(groups=groups)))
    else:
        gpath = SITE / "assets/data/groups.json"
        if len(sys.argv) > 2 and sys.argv[1] == "--out":
            rpath = Path(sys.argv[2])
        else:
            rpath = SITE / "tools/_private/quasar_parity_ref.json"
        rpath.parent.mkdir(parents=True, exist_ok=True)
        groups = json.loads(gpath.read_text())["groups"]
    gname = gpath.relative_to(SITE).as_posix() if gpath.resolve().is_relative_to(SITE) else gpath.name
    ref = dict(grid=PAPER_GRID, bits=list(BITS), groups_file=gname, cases=[])
    for g in groups:
        w, h = np.array(g["w"], dtype=float), np.array(g["h"], dtype=float)
        for b in BITS:
            ref["cases"].append(dict(id=g["id"], bits=b, **ref_one(w, h, b)))
    rpath.write_text(json.dumps(ref))
    print(f"{len(ref['cases'])} cases -> {rpath} ({rpath.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
