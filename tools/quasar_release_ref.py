"""Cross-check reference from the quasar-qat code release itself (torch, CPU, fp32).

Runs the release's own quantizers (read-only import of quasar/quant from a checkout of
https://github.com/vincentcounathe/quasar-qat) on every group in assets/data/groups.json
and writes tools/_private/quasar_release_ref.json (git-ignored), or --out FILE:
  int     QUASAR f* (fp32 weights, and bf16 weights = errors scored on bf16-rounded r)
          and the reconstruction r, bits 2/3/4, release grid (== paper grid), EPS 1e-8
  nvfp4   the 128-weight group treated as one tensor of 8 NVFP4 blocks of 16: per-block f*
          on the release NVFP4 grid, QUASAR r, Standard QAT r, per-tensor reference.
Compared against assets/js/quasar-core.js by tools/quasar_release_jsc.js.

Needs torch. QUASAR_RELEASE_DIR = the release checkout (the directory holding quasar/),
unless the `quasar` package is already importable.

    QUASAR_RELEASE_DIR=... python3 tools/quasar_release_ref.py [--out FILE]
    jsc tools/quasar_release_jsc.js -- assets/js/quasar-core.js assets/data/groups.json tools/_private/quasar_release_ref.json
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace

sys.dont_write_bytecode = True  # the release tree is read-only
_rel = os.environ.get("QUASAR_RELEASE_DIR")
if _rel:
    if not (Path(_rel).expanduser() / "quasar" / "quant").is_dir():
        sys.exit(f"quasar_release_ref.py: $QUASAR_RELEASE_DIR = {_rel} has no quasar/quant/ (code release checkout)")
    sys.path.insert(0, str(Path(_rel).expanduser()))
try:
    import quasar.quant  # noqa: F401,E402
except ImportError as e:
    sys.exit(f"quasar_release_ref.py: cannot import the code release ({e}); set $QUASAR_RELEASE_DIR")
import torch  # noqa: E402
from quasar.quant import kernel  # noqa: E402
from quasar.quant.baselines import standard_nvfp4  # noqa: E402
from quasar.quant.config import INT_GRID, NVFP4_GRID, QuantConfig  # noqa: E402
from quasar.quant.quasar import quasar  # noqa: E402

SITE = Path(__file__).resolve().parents[1]


def stub(cfg):
    return SimpleNamespace(config=cfg, saliency_steps=10, _search_cache=None,
                           ref_process_group=None, fused_ref=None, last_tensor_ref=None)


def run(x, h, cfg):
    """Release QUASAR with reuse=True so the per-group arg-min factor lands in the cache."""
    q = stub(cfg)
    r = quasar(x, h, q, reuse=True)
    return r, q._search_cache[1], q.last_tensor_ref


def main():
    assert not (kernel.TRITON_AVAILABLE and torch.cuda.is_available())  # CPU PyTorch sweep
    groups = json.loads((SITE / "assets/data/groups.json").read_text())["groups"]
    out = dict(int_grid=list(INT_GRID), nvfp4_grid=list(NVFP4_GRID), cases=[])
    for g in groups:
        w = torch.tensor(g["w"], dtype=torch.float32)
        h = torch.tensor(g["h"], dtype=torch.float32).clamp_min(1e-30)
        h = h / h.mean()                                     # release saliency_weights
        case = dict(id=g["id"], int={}, nvfp4={})
        for b in (2, 3, 4):
            cfg = QuantConfig(method="quasar", format="int", bits=b)
            r32, f32, _ = run(w[None], h[None], cfg)
            rbf, fbf, _ = run(w[None].bfloat16(), h[None], cfg)  # w is bf16-exact
            case["int"][str(b)] = dict(f_fp32=float(f32.flatten()[0]), f_bf16=float(fbf.flatten()[0]),
                                       r_fp32=r32.flatten().double().tolist())
        cfg = QuantConfig(method="quasar", format="nvfp4", bits=4)
        wb, hb = w.view(8, 16), (h.view(8, 16) / h.view(8, 16).mean(-1, keepdim=True))
        r, f, ref = run(wb, hb, cfg)
        std = standard_nvfp4(wb, stub(cfg))
        case["nvfp4"] = dict(f=f.flatten().tolist(), r=r.flatten().double().tolist(), ref=float(ref),
                             r_std=std.flatten().double().tolist())
        out["cases"].append(case)
    path = Path(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[1] == "--out" else SITE / "tools/_private/quasar_release_ref.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out))
    print(f"{len(out['cases'])} groups -> {path}")


if __name__ == "__main__":
    main()
