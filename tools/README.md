# tools/

Generators and checks for the project page; none of this is needed to serve it.
Inputs that are not part of this repository (the arXiv source, the paper's plot
data, the numpy reference of Algorithm 1) are passed as environment variables or
flags; every script exits with a message naming what is missing.

| Script | Writes | Inputs |
|---|---|---|
| `paper_text.py` | `paper_plain.txt`, `paper_sentences.json` | `QUASAR_ARXIV_SRC` (unpacked arXiv 2608.13966v2 source) |
| `build_results.py` | `assets/data/results.json` | `QUASAR_ARXIV_SRC`, `QUASAR_LR_SWEEP_TSV` (Figure 25 plot data) |
| `extract_curves.py` | `assets/data/{healing,ablation}_curves.json` | `QUASAR_FIGURE_SRC` (paper figure code + plot data); numpy, matplotlib |
| `extract_theory.py` | `assets/data/theory.json` | `QUASAR_THEORY_*` (Figures 12 and 13 plot data; see `--help`) |
| `export_groups.py` | `assets/data/groups.json` | `QUASAR_GROUPS_NPZ`, `QUASAR_NP_DIR`; numpy |
| `run_quasar_parity.sh` | `_private/quasar_parity_ref.json` | `QUASAR_NP_DIR` (`QUASAR_PY`, `QUASAR_GROUPS_NPZ` for `--all`); macOS `jsc` |
| `quasar_release_ref.py` + `quasar_release_jsc.js` | `_private/quasar_release_ref.json` | `QUASAR_RELEASE_DIR` (code release checkout); torch |
| `check_bank.py` | — | `sentence_bank.md`, `paper_plain.txt` |
| `check_page_text.py` | — | a page (`index.html` or a dumped rendered DOM); every prose sentence must occur in `paper_plain.txt` |
| `extract_ix_realw1.py` | `assets/data/ix-realw1-fig5.json`, `ix-realw1-fig8.json` | Figures 5 and 8 (per-weight error, saliency map): the probe data the paper figures use; see `--help` |
| `extract_ix_realw2.py` | `assets/data/ix-realw2.json` | `QUASAR_FIGURE_SRC` (Figures 6, 7, 11 generators + data) |
| `extract_ix_theory1.py` | `assets/data/ix-theory1.json` | Figures 10, 14, 15 plot data; see `--help` |
| `extract_ix_theory2.py` | `assets/data/ix-theory2.json` | Figures 16, 17, 18 plot data; see `--help` |
| `extract_ix_heal1.py` | `assets/data/ix-heal1.json` | `QUASAR_FIGURE_SRC` (Figures 19, 20) |
| `extract_ix_heal2.py` | `assets/data/ix-heal2.json` | `QUASAR_FIGURE_SRC` (Figure 22) |
| `extract_ix_judge.py` | `assets/data/ix-judge.json` | `QUASAR_FIGURE_SRC`, `QUASAR_ARXIV_SRC` (Figures 27–29) |
| `extract_ix_adapt.py` | `assets/data/ix-adapt.json` | Figures 30–33 plot data; see `--help` |
| `extract_ix_nvfp4app.py` | `assets/data/ix-nvfp4app.json` | `QUASAR_FIGURE_SRC`, `QUASAR_ARXIV_SRC` (Figure 35, Table 10) |
| `extract_ix_sandbox.py` | `assets/data/ix-sandbox.json`, `tools/dev/ix-sandbox-check.json` | `QUASAR_ANIM_DIR` (the 2-D toy of the hero animation) |
| `video/make_hero.py` | `assets/video/hero*.{mp4,jpg}`, `assets/img/og.png` | `QUASAR_ANIM_DIR` (launch-animation helpers `slowsteps.py`, `quasar_np.py`), optional `HERO_SCRATCH`; matplotlib with usetex, ffmpeg |
| `video/make_icons.py` | `assets/img/favicon*`, `apple-touch-icon.png` | the inline logo in `index.html` |
| (by hand) | `assets/img/range_decomp.png` | paper Figure 6, exported at 1600 px (no-JS fallback for the interactive figure) |

`tools/_private/` is git-ignored (local wiring, QA notes, parity fixtures).
