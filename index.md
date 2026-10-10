# QUASAR: Lowering the Loss Floor of Quantization-Aware Training with Loss-Aware Reconstruction

- **Authors:** [Vincent Counathe](https://vincentcounathe.github.io/) (Cornell University, Together AI), [Ben Athiwaratkun](https://benathi.github.io/) (Together AI), [Christopher De Sa](https://www.cs.cornell.edu/~cdesa/) (Cornell University, Together AI), [Tianyi Zhang](https://tonyzhang617.github.io/) (Together AI)
- **Paper:** [arXiv:2608.13966](https://arxiv.org/abs/2608.13966)
- **PDF:** [quasar-qat.github.io/quasar.pdf](https://quasar-qat.github.io/quasar.pdf) · [arxiv.org/pdf/2608.13966](https://arxiv.org/pdf/2608.13966)
- **DOI:** [10.48550/arXiv.2608.13966](https://doi.org/10.48550/arXiv.2608.13966)
- **Code:** [github.com/vincentcounathe/quasar-qat](https://github.com/vincentcounathe/quasar-qat) (Apache-2.0)
- **Models:** [All QUASAR Models](https://huggingface.co/collections/QUASAR-QAT/all-quasar-models-6aab09fd2913ec22df0d5f15) · [huggingface.co/QUASAR-QAT](https://huggingface.co/QUASAR-QAT)
- **Project page:** [quasar-qat.github.io](https://quasar-qat.github.io/)
- **BibTeX:** [quasar.bib](https://quasar-qat.github.io/quasar.bib)

## Abstract

As large language model inference shifts toward lower precision, post-training quantization (PTQ) becomes increasingly brittle, making quantization-aware training (QAT) essential for preserving model quality. However, QAT has a structural mismatch: gradient updates are applied to latent full-precision weights, while the loss and gradients are computed on lossy reconstructions of those weights. This mismatch can lead to suboptimal training trajectories and a higher loss floor. Second-order PTQ methods address a similar problem by minimizing loss-aware reconstruction error, but applying such expensive reconstruction repeatedly during QAT as the weights evolve is impractical. We introduce QUASAR, a QAT method that brings lightweight, loss-aware reconstruction into the training loop. At each training step, QUASAR reconstructs the latent weights by searching over a small set of clipping ranges and fitting dequantization parameters through saliency-weighted least squares. We use an exponential moving average of squared gradients as the per-parameter saliency signal. Our theoretical analysis shows that optimizing QUASAR's reconstruction objective tightens both the convergence and final-loss bounds of QAT. We evaluate QUASAR across four model families and across INT4, INT3, INT2, and NVFP4 quantization formats. QUASAR consistently achieves lower training and evaluation loss than competitive QAT methods and outperforms QAT and PTQ baselines on downstream benchmarks. At INT2, QUASAR improves average accuracy over the best QAT baseline by 13.3 points with quantization-aware distillation and by 10.9 points with QAT on mathematical reasoning data. Notably, after distillation on only ~600M tokens, QUASAR's INT4 Gemma-4 E4B checkpoint outperforms the corresponding QAT checkpoint released by Google, with 66% lower KL divergence and 1.8 points higher average accuracy.

## Overview

#### The structural mismatch of gradients in standard QAT versus QUASAR

Under the STE, both methods evaluate the gradient at the reconstructed weights r and apply it to the latent weights w. QUASAR minimizes the loss-aware reconstruction error, making the gradient at r a more faithful proxy for the gradient at w.

We introduce QUASAR, a QAT method that brings lightweight, loss-aware reconstruction into the training loop.

## Headline results

| Result | Measure | Setting |
|---|---|---|
| +13.3 pts | average accuracy over the best QAT baseline | INT2 · distillation · Qwen3-4B-Thinking |
| +10.9 pts | average accuracy over the best QAT baseline | INT2 · math adaptation · Qwen3-4B-Base |
| 66% | lower KL divergence | INT4 · Gemma-4 E4B · vs Google QAT |
| 1.4% | latency overhead per training step | no inference overhead |

## 1. Reconstruction in QAT

QAT maintains and updates full-precision latent weights w, but computes the forward pass and loss using reconstructed weights r.

#### the training loop

**The training loops for standard QAT and QUASAR differ only in the reconstruction w ↦ q ↦ r.** Standard QAT determines the quantization grid from each group's extreme weights; QUASAR searches over code assignments and fits the dequantizer to minimize loss-aware reconstruction error.

This surrogate is generally not the optimal descent direction for the latent weights, leading training along a suboptimal trajectory. The consequence is a loss-floor gap: given the same model and training data, QAT converges to a higher final training and evaluation loss than full-precision training.

A second-order expansion of the loss around the full-precision weights w, assuming that the first-order term is negligible near an optimum, gives

```text
ℒ(r) − ℒ(w) ≈ (1/2)S
S = (r − w)^⊤ H (r − w)
```

where H(w) is the Hessian evaluated at w. **We refer to S as the loss-aware reconstruction error.** It measures the local change in loss caused by reconstructing the latent weights.

#### the borrowed gradient · illustrative

Under the STE, both methods evaluate the gradient at the reconstructed weights r and apply it to the latent weights w. QUASAR minimizes the loss-aware reconstruction error, making the gradient at r a more faithful proxy for the gradient at w.

## 2. Optimizing Both Stages of Reconstruction

At each training step, QUASAR reconstructs the latent weights by searching over a small set of clipping ranges and fitting dequantization parameters through saliency-weighted least squares.

#### real Qwen3-4B weight groups

**Scale search finds good code assignments.** The case f=1 is the full min–max range used by standard QAT. A factor f<1 narrows the range and clips weights outside it, so the quantization levels cover a smaller interval with finer spacing. QUASAR prioritizes accurate reconstruction of high-saliency weights while tolerating more error on low-saliency weights.

We use an exponential moving average of squared gradients as the per-parameter saliency signal. Adam and AdamW already maintain this quantity as the second-moment estimate v_t, allowing QUASAR to reuse it without additional memory overhead. QUASAR applies to affine and symmetric integer formats, NVFP4, and MXFP4.

## 3. Reconstruction Error Bounds QAT Final Loss

Our theoretical analysis shows that loss-aware reconstruction error directly controls QAT convergence and the quantized model's final loss, providing a principled foundation for QUASAR's objective.

#### after training · INT2 · 1,000 steps

**Reconstruction error drives final loss.** Five QUASAR INT2 runs differ only in the lower bound imposed on the scale-search factor f. Restricting the search raises both the final reconstruction error Ŝ_T and held-out KL after 1,000 training steps. The star marks the unrestricted search.

**Fig. 12 · QUASAR · INT2 · 1,000 steps.** Reconstruction error drives final loss.

| scale-search factor f | end-of-training reconstruction error Ŝ_T | final held-out KL |
|---|---|---|
| f ≥ 0.3 (unrestricted, ★) | 3.90×10⁻⁴ | 0.152 |
| f ≥ 0.5 | 4.03×10⁻⁴ | 0.152 |
| f ≥ 0.7 | 4.57×10⁻⁴ | 0.161 |
| f ≥ 0.85 | 5.50×10⁻⁴ | 0.189 |
| f = 1 | 6.70×10⁻⁴ | 0.229 |

**Fig. 12 · log-log power-law fit**

| fit | slope | R² |
|---|---|---|
| Ŝ_T vs final held-out KL | 0.77 | 0.976 |

#### end of training

**Reconstruction error tracks final KL.** End-of-training loss-aware reconstruction error versus final held-out KL to the full-precision teacher, for Standard QAT, Denoising QAT, and QUASAR at INT4, INT3, and INT2.

## 4. Results on Healing and Adaptation

### Healing with QAD.

Across both models and all bit widths, QUASAR reaches the lowest training and evaluation loss (KL). At INT2, it reduces KL by about 30% over the strongest QAT baseline. On reasoning, coding, and long-context tasks, QUASAR improves average accuracy by 13.3 points for Qwen and 2.2 points for Llama.

#### healing with QAD

**QUASAR gives the lowest held-out KL across both models and all bit widths.** For healing, we apply QAD to Qwen3-4B-Thinking-2507 and Llama-3.1-8B-Instruct at INT2, INT3, and INT4 using Open-PerfectBlend data and logits from the full-precision teachers. We show training loss over the full run, the final 1,000 steps, and held-out evaluation loss. All losses are forward KL to the full-precision model.

#### downstream accuracy

**Reasoning, coding, and long-context results for Qwen3-4B-Thinking-2507 and Llama-3.1-8B-Instruct at INT2, INT3, and INT4.**

**Table 1 · Qwen3-4B-Thinking-2507 · INT2.** Reasoning, coding, and long-context results for Qwen3-4B-Thinking-2507 and Llama-3.1-8B-Instruct at INT2, INT3, and INT4.

| Method | KL ↓ | Top-1 ↑ | HMMT '26 | AIME '25 | MATH-500 | MMLU-Pro | SuperGPQA | LCB v6 | LongBench-v2 | RULER | Avg. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Teacher (BF16) | – | – | 43.1 | 77.9 | 98.2 | 72.7 | 48.1 | 74.6 | 44.5 | 87.9 | 68.4 |
| RTN | 11.166 | 0.5 | 0.0 | 0.0 | 1.9 | 0.0 | 10.0 | 0.0 | 0.0 | 0.0 | 1.5 |
| GPTQ | 1.140 | 67.7 | 0.0 | 0.0 | 2.6 | 3.2 | 8.4 | 0.0 | 0.0 | 0.3 | 1.8 |
| AWQ | 3.016 | 37.0 | 0.0 | 0.0 | 2.4 | 0.0 | 5.2 | 0.0 | 0.0 | 0.0 | 1.0 |
| Standard QAT | 0.186 | 89.9 | 1.0 | 1.7 | 49.5 | 26.6 | 17.4 | 8.2 | 20.5 | 39.3 | 20.5 |
| LSQ | 0.205 | 89.2 | 0.8 | 0.5 | 47.2 | 26.2 | 17.8 | 7.4 | 20.7 | 41.7 | 20.3 |
| Denoising QAT | 0.179 | 90.1 | 1.0 | 1.4 | 51.8 | 27.4 | 19.0 | 9.2 | 18.9 | 39.4 | 21.0 |
| BitDistiller | 0.209 | 89.1 | 0.6 | 1.1 | 51.4 | 29.3 | 16.8 | 9.4 | 18.7 | 44.9 | 21.5 |
| QUASAR (ours) | 0.126 | 92.0 | 6.2 | 14.4 | 77.4 | 45.8 | 25.4 | 23.4 | 26.6 | 59.6 | 34.8 |

**Table 1 · Qwen3-4B-Thinking-2507 · INT3**

| Method | KL ↓ | Top-1 ↑ | HMMT '26 | AIME '25 | MATH-500 | MMLU-Pro | SuperGPQA | LCB v6 | LongBench-v2 | RULER | Avg. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Teacher (BF16) | – | – | 43.1 | 77.9 | 98.2 | 72.7 | 48.1 | 74.6 | 44.5 | 87.9 | 68.4 |
| RTN | 0.597 | 78.8 | 0.0 | 0.7 | 13.0 | 16.3 | 15.6 | 0.0 | 8.7 | 49.3 | 13.0 |
| GPTQ | 0.130 | 91.5 | 31.2 | 49.4 | 95.8 | 63.7 | 39.5 | 49.4 | 31.0 | 73.3 | 54.1 |
| AWQ | 0.240 | 88.1 | 22.7 | 31.0 | 90.6 | 61.5 | 37.0 | 35.7 | 30.2 | 76.0 | 48.1 |
| Standard QAT | 0.062 | 94.2 | 29.9 | 47.4 | 94.2 | 64.9 | 40.0 | 53.3 | 29.6 | 80.8 | 55.0 |
| LSQ | 0.070 | 93.8 | 28.3 | 45.5 | 93.3 | 64.1 | 38.2 | 52.2 | 32.8 | 80.5 | 54.4 |
| Denoising QAT | 0.060 | 94.3 | 29.3 | 49.3 | 94.7 | 64.5 | 39.7 | 52.3 | 32.8 | 79.0 | 55.2 |
| BitDistiller | 0.065 | 94.2 | 29.7 | 52.5 | 95.1 | 65.8 | 40.6 | 57.7 | 33.0 | 83.5 | 57.3 |
| QUASAR (ours) | 0.054 | 94.9 | 31.7 | 60.5 | 95.2 | 66.7 | 41.5 | 60.2 | 35.8 | 84.4 | 59.5 |

**Table 1 · Qwen3-4B-Thinking-2507 · INT4**

| Method | KL ↓ | Top-1 ↑ | HMMT '26 | AIME '25 | MATH-500 | MMLU-Pro | SuperGPQA | LCB v6 | LongBench-v2 | RULER | Avg. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Teacher (BF16) | – | – | 43.1 | 77.9 | 98.2 | 72.7 | 48.1 | 74.6 | 44.5 | 87.9 | 68.4 |
| RTN | 0.108 | 92.2 | 35.7 | 62.1 | 96.8 | 69.7 | 44.4 | 65.2 | 38.8 | 83.3 | 62.0 |
| GPTQ | 0.027 | 96.2 | 38.8 | 74.8 | 97.8 | 71.4 | 46.5 | 70.6 | 38.2 | 87.4 | 65.7 |
| AWQ | 0.050 | 94.7 | 36.6 | 70.6 | 97.6 | 71.6 | 45.7 | 70.8 | 39.0 | 86.8 | 64.8 |
| Standard QAT | 0.019 | 96.9 | 36.8 | 72.1 | 97.7 | 71.4 | 46.5 | 70.9 | 39.0 | 87.1 | 65.2 |
| LSQ | 0.024 | 96.4 | 39.3 | 68.5 | 97.5 | 70.8 | 45.6 | 69.3 | 36.4 | 87.3 | 64.3 |
| Denoising QAT | 0.018 | 96.9 | 38.8 | 71.5 | 97.2 | 70.9 | 46.4 | 71.6 | 42.9 | 86.9 | 65.8 |
| BitDistiller | 0.018 | 96.9 | 38.5 | 73.9 | 97.3 | 71.4 | 46.5 | 71.1 | 40.4 | 86.8 | 65.7 |
| QUASAR (ours) | 0.016 | 97.1 | 38.5 | 73.8 | 97.5 | 71.7 | 46.2 | 72.2 | 41.0 | 88.0 | 66.1 |

**Table 1 · Llama-3.1-8B-Instruct · INT2**

| Method | KL ↓ | Top-1 ↑ | MATH-500 | MMLU-Pro | SuperGPQA | LCB v6 | LongBench-v2 | RULER | Avg. |
|---|---|---|---|---|---|---|---|---|---|
| Teacher (BF16) | – | – | 49.6 | 42.3 | 22.4 | 17.0 | 30.0 | 89.6 | 41.8 |
| RTN | 10.810 | 0.5 | 0.0 | 0.0 | 10.2 | 0.0 | 0.0 | 0.0 | 1.7 |
| GPTQ | 2.380 | 51.8 | 2.9 | 1.8 | 8.7 | 0.0 | 0.0 | 0.1 | 2.3 |
| AWQ | 6.769 | 12.9 | 1.6 | 0.0 | 10.7 | 0.0 | 0.0 | 0.0 | 2.0 |
| Standard QAT | 0.163 | 90.1 | 21.6 | 16.8 | 11.8 | 4.0 | 15.1 | 5.5 | 12.5 |
| LSQ | 0.172 | 89.6 | 19.9 | 15.7 | 11.6 | 2.3 | 15.3 | 52.9 | 19.6 |
| Denoising QAT | 0.165 | 90.1 | 20.8 | 16.5 | 11.0 | 3.6 | 8.5 | 0.0 | 10.1 |
| BitDistiller | 0.151 | 90.2 | 21.7 | 19.0 | 11.8 | 5.5 | 20.5 | 63.5 | 23.7 |
| QUASAR (ours) | 0.105 | 92.0 | 30.0 | 22.6 | 13.7 | 7.0 | 15.9 | 66.4 | 25.9 |

**Table 1 · Llama-3.1-8B-Instruct · INT3**

| Method | KL ↓ | Top-1 ↑ | MATH-500 | MMLU-Pro | SuperGPQA | LCB v6 | LongBench-v2 | RULER | Avg. |
|---|---|---|---|---|---|---|---|---|---|
| Teacher (BF16) | – | – | 49.6 | 42.3 | 22.4 | 17.0 | 30.0 | 89.6 | 41.8 |
| RTN | 0.276 | 85.6 | 8.2 | 17.2 | 12.5 | 0.7 | 21.1 | 49.0 | 18.1 |
| GPTQ | 0.076 | 92.8 | 38.6 | 31.9 | 18.4 | 10.4 | 27.6 | 80.9 | 34.6 |
| AWQ | 0.197 | 88.0 | 16.2 | 15.3 | 13.9 | 2.4 | 22.7 | 69.0 | 23.3 |
| Standard QAT | 0.046 | 94.7 | 39.5 | 34.8 | 18.6 | 12.7 | 30.2 | 81.7 | 36.3 |
| LSQ | 0.052 | 94.2 | 39.3 | 35.0 | 17.1 | 13.7 | 27.2 | 86.1 | 36.4 |
| Denoising QAT | 0.046 | 94.7 | 41.2 | 34.6 | 18.2 | 13.0 | 29.2 | 80.3 | 36.1 |
| BitDistiller | 0.041 | 94.8 | 42.5 | 35.9 | 19.3 | 13.1 | 31.2 | 84.4 | 37.7 |
| QUASAR (ours) | 0.036 | 95.2 | 43.4 | 36.4 | 19.7 | 16.2 | 26.0 | 85.8 | 37.9 |

**Table 1 · Llama-3.1-8B-Instruct · INT4**

| Method | KL ↓ | Top-1 ↑ | MATH-500 | MMLU-Pro | SuperGPQA | LCB v6 | LongBench-v2 | RULER | Avg. |
|---|---|---|---|---|---|---|---|---|---|
| Teacher (BF16) | – | – | 49.6 | 42.3 | 22.4 | 17.0 | 30.0 | 89.6 | 41.8 |
| RTN | 0.044 | 94.4 | 44.5 | 35.5 | 20.1 | 14.2 | 29.6 | 89.0 | 38.8 |
| GPTQ | 0.015 | 96.8 | 47.9 | 40.0 | 20.6 | 16.5 | 31.2 | 88.5 | 40.8 |
| AWQ | 0.032 | 95.2 | 44.8 | 39.8 | 21.3 | 13.2 | 30.8 | 88.1 | 39.7 |
| Standard QAT | 0.014 | 97.0 | 47.7 | 42.1 | 21.1 | 15.8 | 31.0 | 89.0 | 41.1 |
| LSQ | 0.016 | 96.8 | 48.3 | 41.9 | 21.2 | 15.5 | 29.8 | 87.5 | 40.7 |
| Denoising QAT | 0.014 | 97.0 | 48.1 | 42.1 | 21.7 | 14.3 | 31.2 | 88.9 | 41.1 |
| BitDistiller | 0.013 | 97.0 | 48.4 | 41.0 | 21.0 | 15.7 | 31.0 | 88.9 | 41.0 |
| QUASAR (ours) | 0.012 | 97.3 | 47.6 | 42.2 | 20.8 | 16.4 | 30.0 | 89.0 | 41.0 |

### Adaptation with QAT.

QUASAR has the lowest held-out perplexity and the best or tied-best average accuracy at every bit width. It is also the only INT2 quantized model to outperform the original base model and score above zero on HMMT'25.

#### adaptation on math reasoning

**At INT2, QUASAR reaches 29.6 average accuracy, 10.9 points above the strongest QAT baseline and 29.0 points above full-precision fine-tuning followed by PTQ.** Comparison of QAT and PTQ methods for adapting Qwen3-4B-Base on OpenMathReasoning at INT2, INT3, and INT4.

**Table 2 · Qwen3-4B-Base · INT2.** Comparison of QAT and PTQ methods for adapting Qwen3-4B-Base on OpenMathReasoning at INT2, INT3, and INT4.

| Method | PPL ↓ | MATH-500 | GSM8K | AIME'24 | AIME'25 | HMMT'25 | Avg. |
|---|---|---|---|---|---|---|---|
| Base (no SFT) | – | 41.0 | 66.4 | 9.6 | 3.3 | 0.8 | 24.2 |
| FP-SFT | 1.59 | 83.8 | 91.3 | 22.9 | 22.5 | 10.0 | 46.1 |
| RTN | 3.5×10⁵ | 0.9 | 0.3 | 0.0 | 0.0 | 0.0 | 0.2 |
| GPTQ | 3.12 | 2.1 | 1.1 | 0.0 | 0.0 | 0.0 | 0.6 |
| AWQ | 130 | 1.5 | 1.2 | 0.0 | 0.0 | 0.0 | 0.5 |
| Standard QAT | 1.79 | 38.7 | 51.9 | 2.1 | 0.8 | 0.0 | 18.7 |
| LSQ | 1.82 | 36.5 | 49.9 | 0.8 | 0.4 | 0.0 | 17.5 |
| Denoising QAT | 1.78 | 39.2 | 52.5 | 0.8 | 0.8 | 0.0 | 18.7 |
| BitDistiller | 1.87 | 33.6 | 57.0 | 1.2 | 0.4 | 0.0 | 18.4 |
| QUASAR (ours) | 1.71 | 60.7 | 75.4 | 4.0 | 6.5 | 1.5 | 29.6 |

**Table 2 · Qwen3-4B-Base · INT3**

| Method | PPL ↓ | MATH-500 | GSM8K | AIME'24 | AIME'25 | HMMT'25 | Avg. |
|---|---|---|---|---|---|---|---|
| Base (no SFT) | – | 41.0 | 66.4 | 9.6 | 3.3 | 0.8 | 24.2 |
| FP-SFT | 1.59 | 83.8 | 91.3 | 22.9 | 22.5 | 10.0 | 46.1 |
| RTN | 2.24 | 12.8 | 7.6 | 0.0 | 1.7 | 0.0 | 4.4 |
| GPTQ | 1.68 | 71.0 | 85.0 | 11.2 | 11.2 | 4.2 | 36.5 |
| AWQ | 1.83 | 57.3 | 65.1 | 10.0 | 8.3 | 1.7 | 28.5 |
| Standard QAT | 1.64 | 75.8 | 87.5 | 15.0 | 16.2 | 4.6 | 39.8 |
| LSQ | 1.65 | 73.7 | 87.0 | 12.5 | 11.7 | 3.8 | 37.7 |
| Denoising QAT | 1.64 | 75.9 | 87.3 | 14.2 | 13.3 | 7.1 | 39.6 |
| BitDistiller | 1.64 | 75.7 | 87.8 | 16.2 | 15.4 | 5.0 | 40.0 |
| QUASAR (ours) | 1.62 | 78.5 | 88.6 | 15.9 | 16.2 | 6.0 | 41.1 |

**Table 2 · Qwen3-4B-Base · INT4**

| Method | PPL ↓ | MATH-500 | GSM8K | AIME'24 | AIME'25 | HMMT'25 | Avg. |
|---|---|---|---|---|---|---|---|
| Base (no SFT) | – | 41.0 | 66.4 | 9.6 | 3.3 | 0.8 | 24.2 |
| FP-SFT | 1.59 | 83.8 | 91.3 | 22.9 | 22.5 | 10.0 | 46.1 |
| RTN | 1.66 | 78.2 | 90.0 | 15.0 | 13.3 | 7.5 | 40.8 |
| GPTQ | 1.61 | 81.7 | 90.6 | 19.1 | 20.5 | 8.5 | 44.1 |
| AWQ | 1.63 | 80.3 | 90.5 | 15.8 | 17.5 | 8.3 | 42.5 |
| Standard QAT | 1.60 | 82.1 | 90.8 | 21.2 | 20.6 | 10.7 | 45.1 |
| LSQ | 1.62 | 79.0 | 89.1 | 17.9 | 17.1 | 6.7 | 42.0 |
| Denoising QAT | 1.60 | 82.1 | 90.4 | 20.0 | 21.4 | 9.9 | 44.8 |
| BitDistiller | 1.60 | 82.7 | 90.6 | 20.3 | 20.8 | 9.3 | 44.7 |
| QUASAR (ours) | 1.60 | 82.8 | 90.9 | 20.8 | 19.8 | 11.2 | 45.1 |

#### adaptation perplexity

**QUASAR reaches the lowest held-out perplexity at every bit width.** Training perplexity over the full run (left) and final 1,000 steps (center), and held-out perplexity (right), for QAT of Qwen3-4B-Base on OpenMathReasoning. FP-SFT is included as a full-precision reference.

#### answer outcomes · INT2

**Answer outcomes for the INT2 checkpoints.** Share of generated samples that produce a correct answer, an incorrect answer, or no final answer on MATH-500 and GSM8K. The base model and FP-SFT are included as references.

#### pass@8 / avg@1 · INT2

**Variation across repeated INT2 samples.** Ratio of pass@8 to avg@1 on MATH-500 for Qwen3-4B-Base checkpoints, using eight samples per problem at temperature 0.6. A ratio of 1 means that the same problems are solved on every attempt; higher values indicate less consistent successes. The base model and FP-SFT are included as references.

#### divergence along traces

**Divergence from FP-SFT along reasoning traces.** Forward KL to FP-SFT by trace decile for selected quantized checkpoints, averaged over 1,000 MATH-500 traces generated by FP-SFT. Every checkpoint is evaluated on the same token sequences.

## 5. NVFP4 and Checkpoint Comparisons

For Qwen3-8B and Qwen3.5-9B, QUASAR reduces held-out KL divergence by 12% and 15% relative to Standard QAT, respectively. Notably, QUASAR's INT4 Gemma-4 checkpoint outperforms Google's QAT checkpoint in KL divergence and benchmark accuracy.

#### fidelity to BF16 and accuracy

**Comparison of QUASAR with QAT and PTQ baselines across NVFP4, INT4, and Q4_0 (llama.cpp GGUF format).**

**Table 3 · Qwen3-8B.** Comparison of QUASAR with QAT and PTQ baselines across NVFP4, INT4, and Q4_0 (llama.cpp GGUF format).

| Method | Format | bpw | Fidelity · KL ↓ | Fidelity · Top-1 ↑ | Accuracy (%) ↑ · Hard reasoning and coding · HMMT'26 | Accuracy (%) ↑ · Hard reasoning and coding · AIME'25 | Accuracy (%) ↑ · Hard reasoning and coding · SuperGPQA | Accuracy (%) ↑ · Hard reasoning and coding · OJBench | Accuracy (%) ↑ · Long horizon · MRCR | Accuracy (%) ↑ · Long horizon · MRCR ≥64k | Accuracy (%) ↑ · Long horizon · MRCR 8-needle | Accuracy (%) ↑ · Long horizon · LongProc | Accuracy (%) ↑ · Long horizon · LongBench-v2 | Accuracy (%) ↑ · Long horizon · RULER | Accuracy (%) ↑ · Avg. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BF16 | BF16 | 16 | – | – | 44.6 | 68.4 | 48.8 | 22.4 | 25.8 | 19.2 | 16.2 | 48.9 | 38.4 | 80.5 | 41.3 |
| RTN | NVFP4 W4A4 | 4.50 | .053 | 93.0 | 37.4 | 64.6 | 45.6 | 14.7 | 22.4 | 15.2 | 14.1 | 39.3 | 36.0 | 76.6 | 36.6 |
| GPTQ | NVFP4 W4A4 | 4.50 | .039 | 94.0 | 40.3 | 64.0 | 46.2 | 16.8 | 23.6 | 14.6 | 15.2 | 39.5 | 36.0 | 78.5 | 37.5 |
| Standard QAT | NVFP4 W4A4 | 4.50 | .041 | 94.0 | 39.0 | 61.2 | 45.7 | 19.4 | 21.6 | 14.1 | 12.9 | 36.5 | 37.4 | 77.9 | 36.6 |
| QUASAR (ours) | NVFP4 W4A4 | 4.50 | .036 | 94.3 | 40.8 | 63.6 | 46.8 | 18.5 | 24.3 | 16.4 | 15.8 | 40.3 | 33.8 | 78.9 | 37.9 |

**Table 3 · Qwen3.5-9B**

| Method | Format | bpw | Fidelity · KL ↓ | Fidelity · Top-1 ↑ | Accuracy (%) ↑ · Hard reasoning and coding · HMMT'26 | Accuracy (%) ↑ · Hard reasoning and coding · AIME'25 | Accuracy (%) ↑ · Hard reasoning and coding · SuperGPQA | Accuracy (%) ↑ · Hard reasoning and coding · OJBench | Accuracy (%) ↑ · Long horizon · MRCR | Accuracy (%) ↑ · Long horizon · MRCR ≥64k | Accuracy (%) ↑ · Long horizon · MRCR 8-needle | Accuracy (%) ↑ · Long horizon · LongProc | Accuracy (%) ↑ · Long horizon · LongBench-v2 | Accuracy (%) ↑ · Long horizon · RULER | Accuracy (%) ↑ · Avg. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BF16 | BF16 | 16 | – | – | 47.9 | 74.5 | 58.8 | 19.4 | 79.4 | 74.5 | 53.9 | 66.8 | 43.7 | 90.1 | 60.9 |
| RTN | NVFP4 W4A4 | 4.50 | .044 | 93.2 | 21.9 | 37.3 | 49.1 | 6.5 | 54.4 | 42.6 | 32.1 | 35.5 | 23.1 | 91.4 | 39.4 |
| GPTQ | NVFP4 W4A4 | 4.50 | .029 | 94.5 | 20.0 | 29.9 | 48.6 | 3.4 | 56.8 | 44.6 | 32.6 | 42.1 | 24.3 | 91.3 | 39.4 |
| Standard QAT | NVFP4 W4A4 | 4.50 | .033 | 94.2 | 43.1 | 65.3 | 55.5 | 13.4 | 63.7 | 52.3 | 39.7 | 59.0 | 43.9 | 89.8 | 52.6 |
| QUASAR (ours) | NVFP4 W4A4 | 4.50 | .028 | 94.6 | 43.8 | 68.8 | 56.0 | 13.4 | 71.7 | 63.8 | 45.0 | 59.7 | 44.1 | 90.5 | 55.7 |

**Table 3 · Muse-Glimmer-30B**

| Method | Format | bpw | Fidelity · KL ↓ | Fidelity · Top-1 ↑ | Accuracy (%) ↑ · Hard reasoning and coding · HMMT'26 | Accuracy (%) ↑ · Hard reasoning and coding · AIME'25 | Accuracy (%) ↑ · Hard reasoning and coding · SuperGPQA | Accuracy (%) ↑ · Hard reasoning and coding · OJBench | Accuracy (%) ↑ · Long horizon · MRCR | Accuracy (%) ↑ · Long horizon · MRCR ≥64k | Accuracy (%) ↑ · Long horizon · MRCR 8-needle | Accuracy (%) ↑ · Long horizon · LongProc | Accuracy (%) ↑ · Long horizon · LongBench-v2 | Accuracy (%) ↑ · Long horizon · RULER | Accuracy (%) ↑ · Avg. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BF16 | BF16 | 16 | – | – | 71.7 | 92.2 | 60.1 | 25.0 | 46.1 | 38.0 | 24.9 | 67.0 | 60.4 | 88.4 | 57.4 |
| RTN | NVFP4 W4A16 | 4.50 | .054 | 93.2 | 69.5 | 87.7 | 58.9 | 25.0 | 44.3 | 35.6 | 26.2 | 55.7 | 59.4 | 88.3 | 55.1 |
| GPTQ | NVFP4 W4A4 | 4.50 | .066 | 92.4 | 66.4 | 90.3 | 58.5 | 25.4 | 43.1 | 40.7 | 25.5 | 60.1 | 57.3 | 84.7 | 55.2 |
| QUASAR (ours) | NVFP4 W4A16 | 4.50 | .018 | 96.1 | 72.3 | 90.8 | 59.3 | 27.2 | 48.5 | 40.0 | 28.5 | 67.3 | 58.4 | 90.2 | 58.2 |
| QUASAR (ours) | NVFP4 W4A4 | 4.50 | .053 | 93.2 | 68.3 | 88.0 | 58.9 | 26.3 | 44.1 | 35.4 | 25.5 | 62.8 | 54.5 | 89.7 | 55.3 |

**Table 3 · Gemma-4 E4B**

| Method | Format | bpw | Fidelity · KL ↓ | Fidelity · Top-1 ↑ | Accuracy (%) ↑ · Hard reasoning and coding · HMMT'26 | Accuracy (%) ↑ · Hard reasoning and coding · AIME'25 | Accuracy (%) ↑ · Hard reasoning and coding · SuperGPQA | Accuracy (%) ↑ · Hard reasoning and coding · OJBench | Accuracy (%) ↑ · Long horizon · MRCR | Accuracy (%) ↑ · Long horizon · MRCR ≥64k | Accuracy (%) ↑ · Long horizon · MRCR 8-needle | Accuracy (%) ↑ · Long horizon · LongProc | Accuracy (%) ↑ · Long horizon · LongBench-v2 | Accuracy (%) ↑ · Long horizon · RULER | Accuracy (%) ↑ · Avg. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BF16 | BF16 | 16 | – | – | 32.8 | 40.9 | 42.1 | 21.6 | 26.7 | 15.4 | 12.6 | 56.7 | 42.9 | 89.7 | 38.1 |
| RTN | INT4 g64 | 4.25 | .079 | 91.5 | 24.4 | 31.8 | 39.0 | 16.4 | 22.0 | 9.3 | 11.8 | 35.1 | 41.7 | 87.5 | 31.9 |
| Google QAT | INT4 g32 | 4.50 | .064 | 92.6 | 28.6 | 33.3 | 39.7 | 17.7 | 21.0 | 8.0 | 11.5 | 51.1 | 39.8 | 89.6 | 34.0 |
| QUASAR (ours) | INT4 g64 | 4.25 | .022 | 95.5 | 29.0 | 37.5 | 40.5 | 18.1 | 24.4 | 12.0 | 12.7 | 53.6 | 40.4 | 89.5 | 35.8 |
| RTN | GGUF Q4_0 | 4.50 | .194 | 85.7 | 18.8 | 32.8 | 36.5 | 14.2 | 22.9 | 9.1 | 11.0 | 39.0 | 38.0 | 83.8 | 30.6 |
| Google QAT | GGUF Q4_0 | 4.50 | .088 | 90.6 | 29.0 | 35.9 | 40.8 | 19.4 | 22.9 | 9.4 | 12.8 | 57.8 | 39.0 | 89.3 | 35.6 |
| imatrix (PTQ) | GGUF Q4_0 | 4.52 | .067 | 91.1 | 28.3 | 40.1 | 40.9 | 19.0 | 24.7 | 11.7 | 13.0 | 46.2 | 39.0 | 88.9 | 35.2 |
| QUASAR (ours) | GGUF Q4_0 | 4.50 | .044 | 92.8 | 27.8 | 37.6 | 39.6 | 19.4 | 24.4 | 11.8 | 12.7 | 53.1 | 40.4 | 89.6 | 35.6 |

#### long horizon · NVFP4 · Qwen3.5-9B

**QUASAR better preserves long-horizon behavior in NVFP4.** Expanded Qwen3.5-9B results. (a) OpenAI-MRCR score by context length; (b) share of long generations that terminate within the 32k-token output budget. Higher is better.

#### non-termination · NVFP4

**QUASAR has the lowest or tied-lowest non-termination rate among the quantized checkpoints.** Percentage of generations that reach the 32,768-token output budget without stopping. Lower is better.

**Table 10 · Qwen3-8B · NVFP4.** QUASAR has the lowest or tied-lowest non-termination rate among the quantized checkpoints.

| Method | MATH-500 | LiveCodeBench v6 | OJBench (C++) | OJBench (Python) |
|---|---|---|---|---|
| BF16 | 0.5 | 13.6 | 1.3 | 2.2 |
| RTN | 1.4 | 40.8 | 20.3 | 26.7 |
| GPTQ | 0.5 | 24.3 | 11.6 | 10.3 |
| Standard QAT | 0.5 | 21.6 | 4.7 | 5.6 |
| QUASAR (ours) | 0.5 | 18.4 | 3.0 | 2.2 |

**Table 10 · Qwen3.5-9B · NVFP4**

| Method | MATH-500 | LiveCodeBench v6 | OJBench (C++) | OJBench (Python) |
|---|---|---|---|---|
| BF16 | 13.9 | 54.6 | 71.5 | 80.2 |
| RTN | 37.8 | 78.1 | 94.4 | 91.8 |
| GPTQ | 41.1 | 82.8 | 96.1 | 96.1 |
| Standard QAT | 16.0 | 59.2 | 82.8 | 81.9 |
| QUASAR (ours) | 14.8 | 52.9 | 79.7 | 79.3 |

## 6. Robustness and Training Overhead

#### learning-rate sweep · INT2 · 1,000 steps

**QUASAR is robust to learning rate.** Final held-out KL after 1,000 steps of INT2 QAD of Qwen3-4B-Thinking-2507 across a 50× learning-rate range. QUASAR attains the lowest KL at every tested rate; Standard QAT diverges at high rates, while BitDistiller degrades at low rates.

**Fig. 25 · Qwen3-4B-Thinking-2507 · INT2 · final held-out KL after 1,000 steps.** QUASAR is robust to learning rate.

| Method | learning rate · 1×10⁻⁵ | learning rate · 2×10⁻⁵ | learning rate · 5×10⁻⁵ | learning rate · 1×10⁻⁴ | learning rate · 2×10⁻⁴ | learning rate · 5×10⁻⁴ |
|---|---|---|---|---|---|---|
| QUASAR (ours) | 0.2523 | 0.2013 | 0.1516 | 0.1403 | 0.1675 | 0.2604 |
| Standard QAT | 0.5007 | 0.3607 | 0.2533 | 0.2170 | 0.2399 | 1.5226 |
| LSQ | 0.4490 | 0.3489 | 0.2615 | 0.2293 | 0.2368 | 0.7611 |
| Denoising QAT | 0.4746 | 0.3497 | 0.2456 | 0.2128 | 0.2446 | 0.7311 |
| BitDistiller | 1.2288 | 0.5241 | 0.2451 | 0.1770 | 0.2020 | 0.2963 |

#### training step time · INT3 · 8× H100

**Wall-clock time of one training step, per component and in seconds: quantization-aware distillation of Qwen3-4B-Thinking-2507 at INT3 on 8x H100 GPUs.** QUASAR differs from Standard QAT only in the weight reconstruction row. QUASAR only adds 1.4% wall-clock step time compared with Standard QAT (2.97 and 2.93 seconds per step, respectively), with the overhead only coming from the weight reconstruction. Compared with Standard QAT, QUASAR introduces no memory overhead.

**Table 4.** Wall-clock time of one training step, per component and in seconds: quantization-aware distillation of Qwen3-4B-Thinking-2507 at INT3 on 8x H100 GPUs.

| Component | Standard QAT | QUASAR |
|---|---|---|
| Teacher forward | 0.373 | 0.373 |
| Student compute | 0.366 | 0.366 |
| Weight reconstruction | 0.294 | 0.335 |
| Loss computation | 0.065 | 0.065 |
| Backward | 1.805 | 1.805 |
| Optimizer update | 0.021 | 0.022 |
| Other + synchronization | 0.006 | 0.006 |
| Total step | 2.930 | 2.972 |
| % vs. Standard QAT | – | +1.4% |

## 7. Checkpoints

QUASAR checkpoints use standard layouts supported by vLLM's quantization backends.

In vLLM, Marlin and Machete serve INT4 weights, NVFP4 runs natively on Blackwell GPUs, and MXFP4 weight-only checkpoints are supported.

**Table 11 · Qwen3.5-4B.** Comparison with released 4-bit checkpoints across four model families.

| Model | Format | bpw | Fidelity · KL ↓ | Fidelity · Top-1 ↑ | Accuracy (%) ↑ · GSM8K-P | Accuracy (%) ↑ · MMLU-P | Accuracy (%) ↑ · IFEval | Accuracy (%) ↑ · MATH | Accuracy (%) ↑ · AIME25 | Accuracy (%) ↑ · GPQA-D | Accuracy (%) ↑ · Avg. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| BF16 | BF16 | 16 | – | – | 94.0 | 78.9 | 88.0 | 84.4 | 79.2 | 77.3 | 83.6 |
| RTN | NVFP4 W4A16 | 4.50 | .042 | 93.8 | 94.9 | 77.5 | 86.3 | 83.8 | 67.1 | 74.1 | 80.6 |
| GPTQ | NVFP4 W4A16 | 4.50 | .023 | 95.7 | 95.1 | 75.2 | 84.5 | 83.2 | 52.9 | 69.9 | 76.8 |
| GPTQ | INT4 g128 | 7.49 | .049 | 93.1 | 94.0 | 77.5 | 87.1 | 83.0 | 65.0 | 71.2 | 79.6 |
| AWQ | INT4 g32 | 4.50 | .042 | 93.9 | 93.9 | 77.6 | 87.6 | 84.2 | 72.5 | 74.6 | 81.7 |
| ModelOpt PTQ | NVFP4 W4A4 | 4.50 | .043 | 93.7 | 94.2 | 77.9 | 88.2 | 84.6 | 65.8 | 73.6 | 80.7 |
| QUASAR (ours) | NVFP4 W4A16 | 4.50 | .018 | 96.2 | 94.7 | 78.5 | 87.2 | 83.8 | 74.2 | 77.9 | 82.7 |
| **GGUF (llama.cpp)** |  |  |  |  |  |  |  |  |  |  |  |
| RTN | GGUF Q4_0 | 4.50 | .372 | 89.0 | 94.3 | 77.2 | 90.6 | 84.2 | 64.2 | 73.7 | 80.7 |
| KD-QAT g64 | GGUF Q4_0 | 4.50 | .363 | 88.4 | 94.9 | 77.4 | 84.5 | 84.4 | 64.6 | 73.9 | 80.0 |
| imatrix (PTQ) | GGUF Q4_0 | 4.84 | .284 | 90.4 | 94.3 | 78.0 | 90.6 | 86.0 | 70.8 | 76.1 | 82.6 |
| QUASAR (ours) | GGUF Q4_0 | 4.50 | .235 | 91.3 | 94.9 | 78.2 | 90.9 | 83.8 | 77.9 | 74.6 | 83.4 |

**Table 11 · Muse-Glimmer-30B.** ‡ denotes mixed NVFP4, FP8, and BF16 precision.

| Model | Format | bpw | Fidelity · KL ↓ | Fidelity · Top-1 ↑ | Accuracy (%) ↑ · GPQA-D | Accuracy (%) ↑ · MMLU-P | Accuracy (%) ↑ · AIME25 | Accuracy (%) ↑ · LCB | Accuracy (%) ↑ · RUL32K | Accuracy (%) ↑ · RUL64K | Accuracy (%) ↑ · RUL128K | Accuracy (%) ↑ · Avg. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BF16 | BF16 | 16 | – | – | 62.1 | 83.1 | 86.7 | 53.4 | 86.6 | 85.2 | 81.0 | 76.9 |
| RTN | NVFP4 W4A16 | 4.50 | .054 | 93.2 | 63.6 | 82.9 | 83.3 | 48.1 | 84.5 | 84.0 | 83.6 | 75.7 |
| GPTQ | NVFP4 W4A4 | 4.50 | .066 | 92.4 | 63.1 | 83.0 | 86.7 | 54.2 | 86.2 | 82.4 | 80.6 | 76.6 |
| AutoQuantize | NVFP4+FP8‡ | 5.52 | .030 | 94.9 | 63.1 | 82.9 | 83.3 | 52.7 | 85.6 | 84.8 | 83.5 | 76.6 |
| QUASAR (ours) | NVFP4 W4A16 | 4.50 | .018 | 96.1 | 63.6 | 83.3 | 90.0 | 49.6 | 87.2 | 86.4 | 84.1 | 77.7 |
| QUASAR (ours) | NVFP4 W4A4 | 4.50 | .053 | 93.2 | 63.1 | 82.7 | 83.3 | 52.7 | 87.2 | 86.4 | 83.5 | 77.0 |

**Table 11 · Gemma-4 12B**

| Model | Format | bpw | Fidelity · KL ↓ | Fidelity · Top-1 ↑ | Accuracy (%) ↑ · MMLU | Accuracy (%) ↑ · IFEval | Accuracy (%) ↑ · ARC-C | Accuracy (%) ↑ · AGIEval | Accuracy (%) ↑ · MMLU-P | Accuracy (%) ↑ · TQA | Accuracy (%) ↑ · MATH-h | Accuracy (%) ↑ · Avg. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BF16 | BF16 | 16 | – | – | 72.8 | 88.0 | 50.2 | 24.3 | 49.9 | 62.1 | 74.7 | 60.3 |
| RTN | INT4 g64 | 4.25 | .194 | 89.2 | 60.6 | 79.7 | 46.4 | 19.4 | 39.0 | 60.6 | 50.5 | 50.9 |
| GPTQ | INT4 g64 | 4.25 | .041 | 95.2 | 68.5 | 86.9 | 47.8 | 22.7 | 48.2 | 62.1 | 70.9 | 58.2 |
| Google QAT | INT4 g32 | 4.50 | .044 | 94.8 | 67.8 | 87.2 | 50.1 | 22.6 | 47.9 | 60.0 | 73.2 | 58.4 |
| QUASAR (ours) | INT4 g64 | 4.25 | .034 | 95.5 | 70.4 | 87.6 | 51.3 | 24.2 | 45.8 | 59.2 | 71.9 | 58.6 |
| **GGUF (llama.cpp)** |  |  |  |  |  |  |  |  |  |  |  |  |
| RTN | GGUF Q4_0 | 4.50 | .156 | 89.8 | 59.2 | 87.4 | 47.8 | 22.7 | 38.4 | 60.2 | 62.3 | 54.0 |
| Google QAT | GGUF Q4_0 | 4.50 | .069 | 93.5 | 71.0 | 89.1 | 48.9 | 22.8 | 45.6 | 61.3 | 74.8 | 59.1 |
| imatrix (PTQ) | GGUF Q4_0 | 4.52 | .108 | 91.6 | 64.9 | 87.1 | 48.6 | 23.5 | 43.4 | 60.3 | 66.8 | 56.4 |
| QUASAR (ours) | GGUF Q4_0 | 4.50 | .048 | 94.3 | 70.3 | 87.6 | 51.5 | 24.2 | 45.5 | 59.1 | 72.5 | 58.7 |

**Table 11 · Gemma-4 E4B**

| Model | Format | bpw | Fidelity · KL ↓ | Fidelity · Top-1 ↑ | Accuracy (%) ↑ · TrivQA | Accuracy (%) ↑ · NQ | Accuracy (%) ↑ · TQA | Accuracy (%) ↑ · ARC-E | Accuracy (%) ↑ · ARC-C | Accuracy (%) ↑ · GSM8K | Accuracy (%) ↑ · IFEval | Accuracy (%) ↑ · MATH-h | Accuracy (%) ↑ · Avg. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BF16 | BF16 | 16 | – | – | 23.6 | 3.9 | 59.1 | 79.7 | 56.5 | 84.1 | 85.2 | 63.4 | 56.9 |
| RTN | INT4 g64 | 4.25 | .079 | 91.5 | 25.2 | 3.0 | 59.3 | 78.3 | 55.2 | 79.7 | 83.0 | 56.1 | 55.0 |
| GPTQ | INT4 g64 | 4.25 | .031 | 94.7 | 21.3 | 3.3 | 56.1 | 78.2 | 54.9 | 83.5 | 83.4 | 59.4 | 55.0 |
| Google QAT | INT4 g32 | 4.50 | .064 | 92.6 | 20.1 | 2.4 | 55.4 | 78.3 | 56.0 | 81.5 | 81.9 | 59.4 | 54.4 |
| QUASAR (ours) | INT4 g64 | 4.25 | .022 | 95.5 | 23.8 | 4.7 | 58.2 | 79.8 | 56.2 | 82.0 | 82.6 | 60.7 | 56.0 |
| **GGUF (llama.cpp)** |  |  |  |  |  |  |  |  |  |  |  |  |  |
| RTN | GGUF Q4_0 | 4.50 | .194 | 85.7 | 17.3 | 2.0 | 58.5 | 76.2 | 53.8 | 75.8 | 80.2 | 48.7 | 51.6 |
| Google QAT | GGUF Q4_0 | 4.50 | .088 | 90.6 | 18.5 | 2.3 | 55.5 | 78.7 | 56.1 | 81.4 | 81.7 | 58.7 | 54.1 |
| Google QAT repack | GGUF Q4_0 | 4.50 | .071 | 91.8 | 20.0 | 2.2 | 56.2 | 79.1 | 55.4 | 83.5 | 83.2 | 61.8 | 55.2 |
| imatrix (PTQ) | GGUF Q4_0 | 4.52 | .067 | 91.1 | 20.6 | 3.0 | 58.8 | 79.3 | 53.8 | 80.4 | 83.2 | 59.7 | 54.9 |
| QUASAR (ours) | GGUF Q4_0 | 4.50 | .044 | 92.8 | 24.0 | 4.7 | 58.2 | 79.7 | 56.1 | 81.8 | 82.4 | 60.5 | 55.9 |

**QUASAR checkpoints · Hugging Face**

| Model | Format | Runtime | Repository |
|---|---|---|---|
| Qwen3.5-4B | NVFP4 | vLLM | [QUASAR-QAT/Qwen3.5-4B-QUASAR-NVFP4](https://huggingface.co/QUASAR-QAT/Qwen3.5-4B-QUASAR-NVFP4) |
| Qwen3.5-4B | NVFP4 W4A4 | vLLM | [QUASAR-QAT/Qwen3.5-4B-QUASAR-NVFP4-W4A4](https://huggingface.co/QUASAR-QAT/Qwen3.5-4B-QUASAR-NVFP4-W4A4) |
| Qwen3.5-4B | GGUF Q4_0 | llama.cpp | [QUASAR-QAT/Qwen3.5-4B-QUASAR-Q4_0-GGUF](https://huggingface.co/QUASAR-QAT/Qwen3.5-4B-QUASAR-Q4_0-GGUF) |
| Qwen3.8-27B | NVFP4 | vLLM | [QUASAR-QAT/Qwen3.8-27B-QUASAR-NVFP4](https://huggingface.co/QUASAR-QAT/Qwen3.8-27B-QUASAR-NVFP4) |
| Gemma-4 E4B | INT4 g64 | vLLM | [QUASAR-QAT/gemma-4-E4B-it-QUASAR-W4A16-G64](https://huggingface.co/QUASAR-QAT/gemma-4-E4B-it-QUASAR-W4A16-G64) |
| Gemma-4 E4B | GGUF Q4_0 | llama.cpp | [QUASAR-QAT/gemma-4-E4B-it-QUASAR-Q4_0-GGUF](https://huggingface.co/QUASAR-QAT/gemma-4-E4B-it-QUASAR-Q4_0-GGUF) |
| Gemma-4 12B | INT4 g64 | vLLM | [QUASAR-QAT/gemma-4-12B-it-QUASAR-W4A16-G64](https://huggingface.co/QUASAR-QAT/gemma-4-12B-it-QUASAR-W4A16-G64) |
| Gemma-4 12B | GGUF Q4_0 | llama.cpp | [QUASAR-QAT/gemma-4-12B-it-QUASAR-Q4_0-GGUF](https://huggingface.co/QUASAR-QAT/gemma-4-12B-it-QUASAR-Q4_0-GGUF) |
| Muse-Glimmer-30B | NVFP4 | vLLM | [QUASAR-QAT/Muse-Glimmer-30B-QUASAR-NVFP4](https://huggingface.co/QUASAR-QAT/Muse-Glimmer-30B-QUASAR-NVFP4) |
| Muse-Glimmer-30B | NVFP4 W4A4 | vLLM | [QUASAR-QAT/Muse-Glimmer-30B-QUASAR-NVFP4-W4A4](https://huggingface.co/QUASAR-QAT/Muse-Glimmer-30B-QUASAR-NVFP4-W4A4) |
| Muse-Glimmer-30B | GGUF Q4_0 | llama.cpp | [QUASAR-QAT/Muse-Glimmer-30B-QUASAR-Q4_0-GGUF](https://huggingface.co/QUASAR-QAT/Muse-Glimmer-30B-QUASAR-Q4_0-GGUF) |

**QUASAR collection · Hugging Face**

| Hugging Face | Link |
|---|---|
| All QUASAR Models | [huggingface.co/collections/QUASAR-QAT/all-quasar-models-6aab09fd2913ec22df0d5f15](https://huggingface.co/collections/QUASAR-QAT/all-quasar-models-6aab09fd2913ec22df0d5f15) |
| QUASAR-QAT | [huggingface.co/QUASAR-QAT](https://huggingface.co/QUASAR-QAT) |

**Qwen3.8-27B · NVFP4 · Hugging Face model card · public NVFP4 builds · https://huggingface.co/QUASAR-QAT/Qwen3.8-27B-QUASAR-NVFP4**

| Model | Size | NVFP4 linears | GPQA-D | AIME'26 |
|---|---|---|---|---|
| QUASAR (this model) | 19.7 GB | 496/496 | 90.91 | 100.0 |
| BF16 original | 55.6 GB | — | 91.41 | 100.0 |
| Unsloth NVFP4 | 23.4 GB | 168/496 | 89.39 | 97.78 |
| Inferact NVFP4 | 26.4 GB | 304/496 | 87.63 | 96.67 |

**Qwen3.8-27B · NVFP4 · Hugging Face model card · LLM Compressor NVFP4**

| Model | MRCR | MRCR 8-needle | HMMT'26 | SuperGPQA | LiveCodeBench | RULER 32K | RULER 64K | RULER 128K |
|---|---|---|---|---|---|---|---|---|
| QUASAR (this model) | 79.1 | 52.7 | 73.4 | 62.4 | 79.2 | 96.3 | 96.2 | 95.8 |
| BF16 original | 83.4 | 58.5 | 75.8 | 63.0 | 81.0 | 96.7 | 96.6 | 95.9 |
| GPTQ NVFP4 (LLM Compressor) | 61.3 | 35.5 | 69.7 | 58.9 | 77.9 | 96.0 | 95.4 | 95.3 |
| RTN NVFP4 (LLM Compressor) | 57.3 | 32.8 | 66.9 | 58.6 | 77.9 | 96.2 | 96.1 | 95.3 |

GGUF KL values are comparable only within each block.

[huggingface.co/QUASAR-QAT](https://huggingface.co/QUASAR-QAT)

## 8. Code

```python
import torch
from transformers import AutoModelForCausalLM
from quasar.export import save_materialized
from quasar.quant import QuantConfig, quantize_model, snapshot_saliency

path = "Qwen/Qwen3-4B-Thinking-2507"
model = AutoModelForCausalLM.from_pretrained(path, dtype=torch.bfloat16, device_map="cuda")
quantize_model(model, QuantConfig("quasar", bits=2))  # INT2, groups of 128
optimizer = torch.optim.AdamW(model.parameters(), lr=5e-5)

for batch in batches:
    model(**batch).loss.backward()
    optimizer.step()
    snapshot_saliency(model, optimizer)
    optimizer.zero_grad()

save_materialized(model, "qwen3-4b-w2", model_path=path)
```

```shell
git clone https://github.com/vincentcounathe/quasar-qat && cd quasar-qat
pip install -e .            # quantizer and trainer
pip install flash-attn --no-build-isolation   # FlashAttention-2, used by the training recipes
pip install -e ".[eval]"    # + evaluation (vLLM, lm-eval, math-verify)
```

[vincentcounathe/quasar-qat](https://github.com/vincentcounathe/quasar-qat)

## 9. Citation

```bibtex
@article{counathe2026quasar,
  title   = {{QUASAR}: Lowering the Loss Floor of Quantization-Aware Training with Loss-Aware Reconstruction},
  author  = {Counathe, Vincent and Athiwaratkun, Ben and De Sa, Christopher and Zhang, Tianyi},
  journal = {arXiv preprint arXiv:2608.13966},
  year    = {2026}
}
```

## Appendix

### Method Details

#### per-weight loss-aware reconstruction error · INT3

**Per-weight loss-aware reconstruction error for 14 Qwen3-4B weight groups at INT3.** Color shows |√h (r−w)| under (a) Standard QAT with min–max reconstruction and (b) QUASAR. Each row contains 128 weights ordered by saliency h.

#### scale search · INT3

**Scale search for Qwen3-4B weight groups at INT3.** (a) One extreme weight sets the min–max range. (b) QUASAR clips the outlier and covers the bulk. (c) Distribution of selected range factors f⋆ across 28.4M groups; 99.6% use a range narrower than min–max.

#### selected clipping-range factors

**Distribution of selected clipping-range factors f⋆ across weight groups after QAD at INT4, INT3, and INT2 for Qwen3-4B-Thinking-2507 and Llama-3.1-8B-Instruct.** Lower bit widths favor narrower ranges.

#### saliency in one layer

**Saliency h in one Qwen3-4B layer.** Weight groups span 128 weights along the input dimension. The large variation within each group lets QUASAR prioritize the most salient weights.

### Empirical Validation of the Theory

#### reduction across projection types

**QUASAR reduces reconstruction error across projection types.** Median reduction in loss-aware reconstruction error relative to Standard QAT across Qwen3-4B-Thinking-2507 modules at INT4, INT3, and INT2, measured at initialization (left) and after training (right). Error is measured against the full-precision weights.

#### before training · 4,096 steps

**Reconstruction error predicts final loss before training.** Across Standard QAT, Denoising QAT, and QUASAR at INT4, INT3, and INT2, reconstruction error at initialization predicts held-out KL to the full-precision model after 4,096 steps (R²=0.98). Results use Qwen3-4B-Thinking-2507.

**Fig. 13 · Qwen3-4B-Thinking-2507 · 4,096 steps.** Reconstruction error predicts final loss before training.

| Method | bits | init-time reconstruction error Ŝ₀ | KL to BF16 (Table 1) |
|---|---|---|---|
| QUASAR (ours) | INT4 | 6.26×10⁻⁵ | 0.016 |
| QUASAR (ours) | INT3 | 2.27×10⁻⁴ | 0.054 |
| QUASAR (ours) | INT2 | 7.27×10⁻⁴ | 0.126 |
| Denoising QAT | INT4 | 6.93×10⁻⁵ | 0.018 |
| Denoising QAT | INT3 | 3.02×10⁻⁴ | 0.060 |
| Denoising QAT | INT2 | 1.29×10⁻³ | 0.179 |
| Standard QAT | INT4 | 7.10×10⁻⁵ | 0.019 |
| Standard QAT | INT3 | 3.33×10⁻⁴ | 0.062 |
| Standard QAT | INT2 | 2.18×10⁻³ | 0.186 |

**Fig. 13 · log-log power-law fit**

| fit | R² |
|---|---|
| Ŝ₀ vs KL to BF16 | 0.98 |

#### gradient mismatch

**Reconstruction error controls gradient mismatch.** Across INT4, INT3, and INT2, the squared gradient mismatch rises with the loss-aware reconstruction error Ŝ, supporting Assumption 3. Circles, triangles, and squares show fixed clipping factors for INT4, INT3, and INT2, respectively; stars show QUASAR's per-group scale-search solutions.

#### saliency and curvature

**QUASAR's saliency tracks curvature.** Each point represents one weight matrix from a trained INT2 Qwen3-4B-Thinking checkpoint and compares its mean saliency h (Adam's second moment) with a 32-sample Hutchinson estimate of its mean Hessian diagonal. The log-scale correlation is r=0.81.

#### PL relation · INT2

**Training trajectories support a PL relation.** Each point is one step of an INT2 Qwen3-4B-Thinking run, with loss and gradient measured at the reconstruction r. For all three methods, the squared gradient norm scales with the gap above the trajectory minimum. QUASAR's estimated μ̂=1.72 is about 2.5× the baseline values. In Theorem 1(ii), a larger μ gives faster geometric convergence and smaller floor terms, which scale with 1/μ or 1/μ². This provides an optimization-side view of the healing curves. QUASAR's reconstruction adds less loss, so more of the remaining gap produces useful gradient, enabling faster healing and a lower loss floor.

#### bound terms · INT2 · SGD

**Reconstruction error dominates the measured bound.** We evaluate each term of Theorem 1(i) on an INT2 QUASAR run with plain SGD and learning rate 10⁻³. We measure λ_max by power iteration (approximating L), σ² from per-batch gradients, and C. The resulting bound is within 3.1× of the observed average squared gradient norm, and reconstruction error is its largest term.

#### plain SGD · INT2

**QUASAR retains its advantage under plain SGD.** Training (top) and held-out (bottom) loss for Standard QAT and QUASAR at INT2 across three constant learning rates. QUASAR reaches lower loss floors at every stable learning rate.

### Additional Healing Results

#### Standard Tasks and Fidelity

#### held-out KL

**QUASAR gives the lowest held-out KL across both models and all bit widths.** Forward KL to the full-precision model after QAD of Qwen3-4B-Thinking-2507 (left) and Llama-3.1-8B-Instruct (right). Lower is better.

**Table 6 · Qwen3-4B-Thinking-2507 · INT2.** QUASAR gives the highest fidelity in all six model–bit-width settings.

| Method | KL ↓ | Top-1 ↑ | GSM8K | MMLU | ARC-C | ARC-E | HellaSwag | WinoGrande | TruthfulQA | IFEval | Avg. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Teacher (FP16) | – | – | 87.0 | 68.7 | 53.1 | 76.7 | 65.7 | 66.1 | 57.5 | 54.3 | 66.1 |
| RTN | 11.166 | 0.5 | 0.0 | 25.4 | 25.6 | 25.9 | 26.0 | 52.0 | 46.8 | 8.3 | 26.3 |
| GPTQ | 1.140 | 67.7 | 0.2 | 23.4 | 25.1 | 30.0 | 30.1 | 49.3 | 52.9 | 8.9 | 27.5 |
| AWQ | 3.016 | 37.0 | 0.0 | 23.4 | 23.2 | 31.6 | 29.1 | 51.1 | 52.8 | 9.6 | 27.6 |
| Standard QAT | 0.186 | 89.9 | 47.4 | 34.5 | 31.2 | 44.8 | 46.9 | 54.5 | 51.1 | 33.5 | 43.0 |
| LSQ | 0.205 | 89.2 | 42.6 | 34.6 | 30.6 | 44.9 | 47.6 | 55.2 | 47.2 | 35.1 | 42.2 |
| Denoising QAT | 0.179 | 90.1 | 45.6 | 36.0 | 30.1 | 47.9 | 46.7 | 56.1 | 49.9 | 34.9 | 43.4 |
| BitDistiller | 0.209 | 89.1 | 49.0 | 43.2 | 38.0 | 60.1 | 52.6 | 57.9 | 52.6 | 37.7 | 48.9 |
| QUASAR (ours) | 0.126 | 92.0 | 68.8 | 48.9 | 38.8 | 55.9 | 56.4 | 59.2 | 50.5 | 47.5 | 53.2 |

**Table 6 · Qwen3-4B-Thinking-2507 · INT3**

| Method | KL ↓ | Top-1 ↑ | GSM8K | MMLU | ARC-C | ARC-E | HellaSwag | WinoGrande | TruthfulQA | IFEval | Avg. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Teacher (FP16) | – | – | 87.0 | 68.7 | 53.1 | 76.7 | 65.7 | 66.1 | 57.5 | 54.3 | 66.1 |
| RTN | 0.597 | 78.8 | 20.5 | 53.6 | 39.4 | 56.1 | 54.1 | 58.1 | 51.4 | 18.9 | 44.0 |
| GPTQ | 0.130 | 91.5 | 77.3 | 61.0 | 48.0 | 75.5 | 61.0 | 61.8 | 54.0 | 49.2 | 61.0 |
| AWQ | 0.240 | 88.1 | 73.2 | 60.1 | 46.4 | 72.3 | 60.7 | 62.7 | 49.2 | 41.8 | 58.3 |
| Standard QAT | 0.062 | 94.2 | 78.5 | 62.0 | 46.8 | 74.1 | 61.9 | 64.4 | 56.1 | 53.2 | 62.1 |
| LSQ | 0.070 | 93.8 | 83.0 | 62.3 | 49.4 | 75.8 | 62.7 | 65.6 | 55.4 | 52.9 | 63.4 |
| Denoising QAT | 0.060 | 94.3 | 80.4 | 62.7 | 46.2 | 73.5 | 61.6 | 64.2 | 56.1 | 51.0 | 62.0 |
| BitDistiller | 0.065 | 94.2 | 81.0 | 63.7 | 47.0 | 69.0 | 63.0 | 63.5 | 56.3 | 53.4 | 62.1 |
| QUASAR (ours) | 0.054 | 94.9 | 81.7 | 64.5 | 48.3 | 72.9 | 63.2 | 64.7 | 55.5 | 50.6 | 62.7 |

**Table 6 · Qwen3-4B-Thinking-2507 · INT4**

| Method | KL ↓ | Top-1 ↑ | GSM8K | MMLU | ARC-C | ARC-E | HellaSwag | WinoGrande | TruthfulQA | IFEval | Avg. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Teacher (FP16) | – | – | 87.0 | 68.7 | 53.1 | 76.7 | 65.7 | 66.1 | 57.5 | 54.3 | 66.1 |
| RTN | 0.108 | 92.2 | 80.2 | 66.1 | 48.8 | 69.7 | 63.5 | 65.4 | 58.4 | 54.2 | 63.3 |
| GPTQ | 0.027 | 96.2 | 84.9 | 67.1 | 51.4 | 75.0 | 64.7 | 65.4 | 56.5 | 51.4 | 64.6 |
| AWQ | 0.050 | 94.7 | 84.6 | 67.6 | 51.5 | 74.9 | 65.2 | 66.6 | 56.7 | 56.6 | 65.5 |
| Standard QAT | 0.019 | 96.9 | 84.9 | 67.0 | 49.7 | 73.5 | 65.1 | 65.2 | 56.7 | 54.3 | 64.6 |
| LSQ | 0.024 | 96.4 | 86.0 | 66.8 | 50.6 | 75.0 | 65.2 | 65.6 | 57.1 | 56.4 | 65.3 |
| Denoising QAT | 0.018 | 96.9 | 85.0 | 67.1 | 49.2 | 72.9 | 64.7 | 65.7 | 57.3 | 56.9 | 64.9 |
| BitDistiller | 0.018 | 96.9 | 84.8 | 67.7 | 52.6 | 76.0 | 64.8 | 65.9 | 57.3 | 54.3 | 65.4 |
| QUASAR (ours) | 0.016 | 97.1 | 86.4 | 68.0 | 50.6 | 76.0 | 65.1 | 65.2 | 57.7 | 55.8 | 65.6 |

**Table 6 · Llama-3.1-8B-Instruct · INT2**

| Method | KL ↓ | Top-1 ↑ | GSM8K | MMLU | ARC-C | ARC-E | HellaSwag | WinoGrande | TruthfulQA | IFEval | Avg. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Teacher (FP16) | – | – | 70.1 | 68.3 | 55.6 | 79.9 | 79.5 | 73.6 | 54.5 | 73.9 | 69.4 |
| RTN | 10.810 | 0.5 | 0.0 | 25.5 | 26.2 | 26.1 | 26.1 | 51.8 | 47.6 | 11.8 | 26.9 |
| GPTQ | 2.380 | 51.8 | 0.0 | 24.9 | 23.3 | 28.9 | 30.0 | 48.0 | 49.0 | 9.1 | 26.7 |
| AWQ | 6.769 | 12.9 | 0.0 | 23.6 | 23.3 | 25.9 | 27.2 | 48.2 | 48.8 | 7.9 | 25.6 |
| Standard QAT | 0.163 | 90.1 | 1.8 | 23.4 | 22.9 | 30.9 | 34.8 | 49.3 | 46.8 | 44.4 | 31.8 |
| LSQ | 0.172 | 89.6 | 42.2 | 39.7 | 32.8 | 52.8 | 55.7 | 53.5 | 47.4 | 42.1 | 45.8 |
| Denoising QAT | 0.165 | 90.1 | 0.0 | 24.6 | 26.2 | 25.6 | 26.9 | 50.0 | 49.1 | 40.9 | 30.4 |
| BitDistiller | 0.151 | 90.2 | 53.1 | 49.3 | 43.5 | 69.9 | 66.6 | 66.3 | 47.7 | 51.8 | 56.0 |
| QUASAR (ours) | 0.105 | 92.0 | 66.4 | 52.5 | 43.8 | 73.1 | 68.1 | 66.8 | 49.5 | 56.0 | 59.5 |

**Table 6 · Llama-3.1-8B-Instruct · INT3**

| Method | KL ↓ | Top-1 ↑ | GSM8K | MMLU | ARC-C | ARC-E | HellaSwag | WinoGrande | TruthfulQA | IFEval | Avg. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Teacher (FP16) | – | – | 70.1 | 68.3 | 55.6 | 79.9 | 79.5 | 73.6 | 54.5 | 73.9 | 69.4 |
| RTN | 0.276 | 85.6 | 19.0 | 44.8 | 40.2 | 64.6 | 69.5 | 66.9 | 47.0 | 52.9 | 50.6 |
| GPTQ | 0.076 | 92.8 | 61.4 | 59.2 | 49.1 | 71.6 | 75.7 | 71.0 | 53.1 | 69.1 | 63.8 |
| AWQ | 0.197 | 88.0 | 23.9 | 53.2 | 43.0 | 67.6 | 72.2 | 67.6 | 42.1 | 58.6 | 53.5 |
| Standard QAT | 0.046 | 94.7 | 70.7 | 59.7 | 47.4 | 72.8 | 75.2 | 72.9 | 52.1 | 69.9 | 65.1 |
| LSQ | 0.052 | 94.2 | 76.8 | 62.3 | 51.8 | 76.9 | 75.8 | 71.6 | 50.9 | 67.5 | 66.7 |
| Denoising QAT | 0.046 | 94.7 | 68.8 | 59.8 | 48.0 | 74.5 | 75.0 | 72.2 | 51.0 | 70.2 | 64.9 |
| BitDistiller | 0.041 | 94.8 | 74.2 | 61.6 | 53.1 | 79.0 | 76.4 | 71.9 | 52.2 | 68.6 | 67.1 |
| QUASAR (ours) | 0.036 | 95.2 | 74.1 | 63.3 | 54.9 | 79.1 | 77.1 | 71.0 | 51.6 | 71.5 | 67.9 |

**Table 6 · Llama-3.1-8B-Instruct · INT4**

| Method | KL ↓ | Top-1 ↑ | GSM8K | MMLU | ARC-C | ARC-E | HellaSwag | WinoGrande | TruthfulQA | IFEval | Avg. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Teacher (FP16) | – | – | 70.1 | 68.3 | 55.6 | 79.9 | 79.5 | 73.6 | 54.5 | 73.9 | 69.4 |
| RTN | 0.044 | 94.4 | 70.7 | 64.1 | 53.3 | 76.9 | 78.0 | 73.9 | 50.7 | 72.1 | 67.5 |
| GPTQ | 0.015 | 96.8 | 69.0 | 67.3 | 52.0 | 77.3 | 78.7 | 73.2 | 55.1 | 73.6 | 68.3 |
| AWQ | 0.032 | 95.2 | 65.6 | 66.6 | 53.7 | 78.3 | 78.7 | 72.4 | 53.7 | 73.4 | 67.8 |
| Standard QAT | 0.014 | 97.0 | 76.3 | 66.3 | 54.4 | 77.7 | 78.4 | 73.8 | 53.9 | 73.0 | 69.2 |
| LSQ | 0.016 | 96.8 | 73.2 | 66.5 | 54.6 | 80.1 | 78.7 | 74.1 | 53.2 | 74.1 | 69.3 |
| Denoising QAT | 0.014 | 97.0 | 77.0 | 66.2 | 55.7 | 77.8 | 78.6 | 73.9 | 53.6 | 72.1 | 69.3 |
| BitDistiller | 0.013 | 97.0 | 70.4 | 67.0 | 55.1 | 79.7 | 78.8 | 73.3 | 53.8 | 74.1 | 69.0 |
| QUASAR (ours) | 0.012 | 97.3 | 74.6 | 66.5 | 55.5 | 78.9 | 78.8 | 74.2 | 54.2 | 72.5 | 69.4 |

#### accuracy vs bit width

**QUASAR attains the highest INT2 average accuracy on both models.** Average accuracy over the eight benchmarks. Gray circles mark the full-precision models.

#### per-task accuracy · INT2

**QUASAR preserves INT2 accuracy broadly across tasks.** Per-task accuracy normalized by the full-precision model for Qwen3-4B-Thinking-2507 (left) and Llama-3.1-8B-Instruct (right) on the eight benchmarks.

#### LLM-as-a-Judge Preference at 2 Bits

#### LLM judge · INT2

**The judge prefers QUASAR to every INT2 quantized baseline.** Pairwise win, tie, and loss rates on responses to 128 WildChat prompts for Qwen3-4B-Thinking-2507 and Llama-3.1-8B-Instruct. Llama-3.3-70B-Instruct serves as the judge. QUASAR wins all 14 comparisons with quantized baselines. Mean per-prompt preference in [−1,1], with 95% bootstrap confidence intervals over 128 prompts. Positive values favor QUASAR. The final row compares QUASAR with the full-precision model.

**Table 7 · INT2 · judge Llama-3.3-70B-Instruct.** QUASAR wins all 14 comparisons with quantized baselines.

| vs. QUASAR | Qwen3-4B-Thinking-2507 · mean | Qwen3-4B-Thinking-2507 · 95% CI | Llama-3.1-8B-Instruct · mean | Llama-3.1-8B-Instruct · 95% CI |
|---|---|---|---|---|
| RTN | +1.00 | [+1.00, +1.00] | +0.98 | [+0.96, +1.00] |
| GPTQ | +1.00 | [+1.00, +1.00] | +0.97 | [+0.94, +0.99] |
| AWQ | +1.00 | [+1.00, +1.00] | +0.99 | [+0.97, +1.00] |
| Standard QAT | +0.32 | [+0.21, +0.42] | +0.97 | [+0.94, +0.99] |
| LSQ | +0.27 | [+0.15, +0.38] | +0.37 | [+0.25, +0.49] |
| Denoising QAT | +0.31 | [+0.21, +0.41] | +0.98 | [+0.95, +1.00] |
| BitDistiller | +0.24 | [+0.12, +0.35] | +0.29 | [+0.17, +0.41] |
| FP16 | −0.30 | [−0.40, −0.20] | −0.46 | [−0.56, −0.37] |

#### response stability · INT2

**QUASAR matches the full-precision models' response stability at INT2.** Mean word-repetition ratio over 128 WildChat prompts for Qwen3-4B-Thinking-2507 (left) and Llama-3.1-8B-Instruct (right), with greedy decoding. Dashed lines mark the full-precision models; counts show responses that close the reasoning block for Qwen or stop before the token cap for Llama.

#### responses

**The beginning of each method's response to one held-out prompt, for Qwen3-4B-Thinking-2507 at INT2, INT3, and INT4 with greedy decoding.**
