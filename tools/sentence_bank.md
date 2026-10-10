# QUASAR project page: verbatim sentence bank

Every quoted line below (`> ...`) and every backticked fragment in the fragment table is an exact substring of `tools/paper_plain.txt`, the plain-text rendering of the arXiv v2 source (2608.13966v2) built by `tools/paper_text.py`. `tools/check_bank.py` verifies this. Each entry line gives id · source · sentence / fragment / caption · `sent N` = id in `tools/paper_sentences.json` · suggested role. Source locations are `file.tex:line` in the arXiv source (for short fragments: the first sentence that contains them).

Rules for using the bank on the page:

- Prose on the page must be one of these strings, or a contiguous fragment of one; do not join fragments into new sentences.
- Numbers, model names, benchmark names, axis ticks, legend keys and link labels are data, not prose, and may come from tables and `assets/data/`.
- Apostrophes are straight (`'`) here; the PDF shows `’`. Dashes are typographic (`–`, `—`). Math is a plain rendering (`ℒ`, `Ŝ_t`, `w ↦ q ↦ r`); entries whose role mentions math need the page checker to normalise math markup (or render that math outside the checked prose).
- `*` in the role column marks the 25 strongest entries.
- The paper has no Limitations section, does not mention Qwen3.8-27B, and gives no prose for individual HF repos beyond Appendix H.

## Hook / one-liners

Hero title, subtitle, one-line claims.

**H1** · `main.tex:43` · fragment · role: * hero title (paper title)
> QUASAR: Lowering the Loss Floor of Quantization-Aware Training with Loss-Aware Reconstruction

**H2** · `main.tex:59` · sentence · sent 5 · role: * hero subtitle
> We introduce QUASAR, a QAT method that brings lightweight, loss-aware reconstruction into the training loop.

**H3** · `introduction.tex:61` · sentence · sent 38 · role: hero subtitle (long) / acronym reveal
> We introduce QUASAR (Quantization-aware training with loss-aware reconstruction), a QAT method that continually minimizes loss-aware reconstruction error to improve the training trajectory and lower the loss floor.

**H4** · `body.tex:9` · sentence · sent 55 · role: * hero tagline / 'what's new' card
> QUASAR directly optimizes that map: it brings the reconstruction PTQ solves once into the training loop as the weights adapt, while still deploying exactly as an RTN-quantized model.

**H5** · `body.tex:21` · sentence · sent 215 · role: * stat-card strip under hero (1.4% / 0)
> It adds only 1.4% latency overhead per training step and incurs no inference overhead.

**H6** · `main.tex:59` · sentence · sent 11 · role: * hero results line / stat cards (+13.3, +10.9)
> At INT2, QUASAR improves average accuracy over the best QAT baseline by 13.3 points with quantization-aware distillation and by 10.9 points with QAT on mathematical reasoning data.

**H7** · `main.tex:59` · sentence · sent 12 · role: * hero results line / vs-Google teaser
> Notably, after distillation on only ~600M tokens, QUASAR's INT4 Gemma-4 E4B checkpoint outperforms the corresponding QAT checkpoint released by Google, with 66% lower KL divergence and 1.8 points higher average accuracy.

**H8** · `main.tex:59` · sentence · sent 10 · role: results overview lead
> QUASAR consistently achieves lower training and evaluation loss than competitive QAT methods and outperforms QAT and PTQ baselines on downstream benchmarks.

**H9** · `main.tex:59` · sentence · sent 9 · role: scope line above results grid
> We evaluate QUASAR across four model families and across INT4, INT3, INT2, and NVFP4 quantization formats.

**H11** · `methodology.tex:77` · sentence · sent 118 · role: one-line method summary / caption under loop animation
> QUASAR changes only the weight reconstruction used in the forward pass.

## Why QAT (motivation)

Short context block before the problem; use at most two.

**V1** · `main.tex:59` · sentence · sent 1 · role: intro paragraph opener
> As large language model inference shifts toward lower precision, post-training quantization (PTQ) becomes increasingly brittle, making quantization-aware training (QAT) essential for preserving model quality.

**V2** · `introduction.tex:3` · sentence · sent 13 · role: context line
> As large language models (LLMs) grow in size and adoption, inference is overtaking training as the dominant recurring cost of deployment.

**V4** · `introduction.tex:11` · sentence · sent 16 · role: PTQ-vs-QAT card
> Post-training quantization (PTQ) has been the standard way to convert a trained model to low precision, but it is becoming increasingly brittle on newer models.

**V5** · `introduction.tex:13` · sentence · sent 17 · role: PTQ-vs-QAT card
> Reasoning and agentic models often operate over long contexts, where quantization errors can accumulate and degrade performance.

**V6** · `introduction.tex:16` · sentence · sent 18 · role: PTQ-vs-QAT card
> PTQ models may also exhibit behavioral shifts and biases relative to their full-precision counterparts.

**V7** · `introduction.tex:18` · sentence · sent 19 · role: bridge into QAT
> Producing a native low-precision model with stronger quality guarantees therefore requires training under the same precision used for serving.

**V8** · `introduction.tex:29` · sentence · sent 23 · role: caption under qat_loop animation
> Quantization-aware training (QAT) addresses this need by inserting quantization into the training loop, allowing the model to adapt to quantization noise as it learns.

**V9** · `body.tex:9` · sentence · sent 53 · role: caption over INT2 PTQ transcripts
> Below four bits, the PTQ methods that do not add inference overhead degrade sharply.

## The problem: structural mismatch, borrowed gradient, STE, r vs w

Pairs with the Figure 1 family (fig1_live, hero_replay, borrowed_gradient_2d/3d, gradient_compass, loss_floor).

**P1** · `main.tex:59` · sentence · sent 2 · role: * problem section lead
> However, QAT has a structural mismatch: gradient updates are applied to latent full-precision weights, while the loss and gradients are computed on lossy reconstructions of those weights.

**P2** · `main.tex:59` · sentence · sent 3 · role: * problem section second line / loss_floor caption
> This mismatch can lead to suboptimal training trajectories and a higher loss floor.

**P3** · `introduction.tex:31` · fragment · sent 24 · role: fragment (math: r, w); label for the two-panel diagram
> the forward pass and loss computation use quantized–dequantized reconstruction weights r, while the gradient updates are applied to the latent full-precision weights w.

**P4** · `methodology.tex:7` · sentence · sent 59 · role: r-vs-w explainer (math: r, w)
> QAT maintains and updates full-precision latent weights w, but computes the forward pass and loss using reconstructed weights r.

**P5** · `methodology.tex:7` · sentence · sent 60 · role: pipeline diagram caption (math)
> At each step, QAT maps w to low-bit codes q and then dequantizes those codes to obtain r: w ↦ q ↦ r.

**P6** · `methodology.tex:9` · sentence · sent 61 · role: label for the w→q→r box
> We refer to this process as weight reconstruction.

**P7** · `methodology.tex:9` · sentence · sent 62 · role: qat_loop caption
> It exposes the model to inference-time quantization error during training while allowing the latent weights to adapt.

**P8** · `methodology.tex:9` · sentence · sent 63 · role: STE callout (math)
> Because the code assignment involves rounding and has no useful derivative, QAT uses the straight-through estimator (STE): ∂ℒ/∂w ≈ ∂ℒ/∂r.

**P9** · `methodology.tex:9` · fragment · sent 63 · role: STE callout without math (fragment)
> Because the code assignment involves rounding and has no useful derivative, QAT uses the straight-through estimator (STE)

**P10** · `methodology.tex:11` · fragment · sent 64 · role: borrowed-gradient arrow label (fragment, math: r, w)
> The gradient evaluated at r is therefore applied to w

**P11** · `introduction.tex:37` · sentence · sent 26 · role: * caption under fig1_live / gradient_compass
> This surrogate is generally not the optimal descent direction for the latent weights, leading training along a suboptimal trajectory.

**P12** · `introduction.tex:38` · sentence · sent 27 · role: * loss_floor animation caption
> The consequence is a loss-floor gap: given the same model and training data, QAT converges to a higher final training and evaluation loss than full-precision training.

**P13** · `introduction.tex:40` · sentence · sent 28 · role: related-work one-liner
> Prior QAT methods narrow this gap by softening the rounding operation, learning quantization parameters jointly with the weights, or improving initialization.

**P14** · `methodology.tex:23` · fragment · sent 70 · role: grid_hijack caption, beat 1 (fragment)
> Standard QAT uses the minimum and maximum weights in each group for both stages

**P15** · `methodology.tex:23` · sentence · sent 71 · role: grid_hijack caption, beat 1
> This uniform grid represents the full range of weight values without clipping and preserves the extreme values in the group, but it may not be optimal for reducing the training loss.

**P16** · `methodology.tex:23` · sentence · sent 69 · role: two-stage diagram caption (math)
> Reconstruction has two stages: code assignment, w ↦ q, and dequantization, q ↦ r.

**P17** · `methodology.tex:25` · sentence · sent 72 · role: section kicker
> Reconstruction quality directly affects the training loss of QAT.

**P19** · `introduction.tex:51` · sentence · sent 31 · role: definition chip next to S formula (math)
> We refer to S as the loss-aware reconstruction error.

**P20** · `methodology.tex:33` · sentence · sent 76 · role: definition chip, line 2
> It measures the local change in loss caused by reconstructing the latent weights.

**P21** · `introduction.tex:44` · fragment · sent 30 · role: lead-in to the S = (r−w)ᵀH(r−w) formula (fragment)
> A second-order expansion of the loss around the full-precision weights w, assuming that the first-order term is negligible near an optimum, gives

**P22** · `introduction.tex:41` · sentence · sent 29 · role: bridge into the method
> We instead draw on a complementary insight from second-order PTQ methods: the excess training loss caused by QAT's structural mismatch can be reduced by optimizing reconstruction.

**P23** · `body.tex:9` · fragment · sent 54 · role: related-work punchline (fragment)
> none of these optimize the map from latent weights to reconstructed weights, which is set by heuristics.

## Why PTQ ideas don't transfer directly

Pairs with the every_step animation (PTQ reconstructs once; QAT every step).

**X1** · `main.tex:59` · sentence · sent 4 · role: * every_step caption
> Second-order PTQ methods address a similar problem by minimizing loss-aware reconstruction error, but applying such expensive reconstruction repeatedly during QAT as the weights evolve is impractical.

**X2** · `introduction.tex:54` · sentence · sent 35 · role: every_step left panel
> In PTQ, the full-precision model is frozen, so its reconstruction needs to be optimized only once, typically requiring minutes to hours for a billion-parameter LLM.

**X3** · `introduction.tex:56` · sentence · sent 36 · role: every_step right panel
> In QAT, however, the latent weights change at every step, requiring the reconstruction to be continually re-optimized.

**X4** · `introduction.tex:58` · sentence · sent 37 · role: every_step closing line
> Running a conventional second-order optimization procedure on every forward pass would therefore be prohibitively expensive.

**X5** · `introduction.tex:54` · sentence · sent 34 · role: section kicker
> The challenge, however, is computational cost.

**X6** · `body.tex:7` · sentence · sent 51 · role: PTQ card
> All rest on the premise that the weights are frozen, so the reconstruction happens only once.

**X8** · `introduction.tex:52` · sentence · sent 32 · role: PTQ card
> Many modern PTQ methods minimize this quantity, or an approximation to it, to construct a low-precision model whose loss remains close to that of a frozen full-precision model.

**X9** · `introduction.tex:54` · sentence · sent 33 · role: bridge (math)
> Applying the same principle to QAT would keep the low-precision loss ℒ(r) closer to the full-precision loss ℒ(w) as the latent weights evolve, thereby mitigating the effect of the structural mismatch.

**X11** · `body.tex:7` · sentence · sent 49 · role: positioning chip
> QUASAR sits between two lines of work: PTQ and QAT.

**X12** · `body.tex:7` · fragment · sent 52 · role: codebook-PTQ footnote (fragment)
> these are the strongest PTQ methods at two and three bits, but their inference-time transforms and decodes hurt throughput, while hardware moves toward simpler formats such as MXFP4 and NVFP4.

**X13** · `introduction.tex:63` · sentence · sent 44 · role: contribution card 1
> We identify loss-aware reconstruction error, previously optimized for frozen models in second-order PTQ, as a principled objective for QAT.

## The method

Scale search, clipping ranges, saliency-weighted least squares, Adam's second moment as saliency. Pairs with grid_hijack, every_weight_pulls, one_point_fan, wasted_levels, qat_loop.

**M1** · `main.tex:59` · sentence · sent 6 · role: * method section lead
> At each training step, QUASAR reconstructs the latent weights by searching over a small set of clipping ranges and fitting dequantization parameters through saliency-weighted least squares.

**M2** · `main.tex:59` · sentence · sent 7 · role: * saliency callout
> We use an exponential moving average of squared gradients as the per-parameter saliency signal.

**M3** · `introduction.tex:61` · sentence · sent 39 · role: two-stage diagram caption
> QUASAR decomposes reconstruction into two stages: quantization, which maps full-precision weights to discrete codes while treating the clipping range as a free parameter, and dequantization, which maps those codes back to reconstructed weights using a learned scale and offset.

**M4** · `introduction.tex:61` · sentence · sent 40 · role: saliency explainer
> To make the loss-aware objective tractable during training, QUASAR approximates the Hessian using an exponential moving average of squared gradients, yielding per-parameter saliency scores that estimate each weight's effect on the loss.

**M5** · `introduction.tex:61` · sentence · sent 41 · role: grid_hijack caption, beat 2
> It then searches over a small set of candidate clipping ranges, each defining a different assignment of discrete codes; for each assignment, it solves for the dequantization parameters in closed form by saliency-weighted least squares and selects the candidate with the smallest loss-aware reconstruction error.

**M7** · `methodology.tex:33` · sentence · sent 80 · role: method summary (math: S_t)
> QUASAR instead minimizes a close approximation to S_t at every training step using a lightweight procedure that combines scale search with a closed-form fit for dequantization.

**M8** · `methodology.tex:3` · sentence · sent 58 · role: three-part method overview (three icons)
> We then introduce QUASAR, which makes this reconstruction loss-aware through an efficient curvature approximation, scale search over clipping ranges, and optimal dequantization.

**M10** · `methodology.tex:44` · sentence · sent 87 · role: saliency card, line 2
> We therefore use the diagonal Fisher information matrix as a proxy for the Hessian.

**M11** · `methodology.tex:44` · fragment · sent 88 · role: saliency card, line 3 (fragment)
> we approximate it with an exponential moving average (EMA) of squared gradients.

**M12** · `methodology.tex:44` · sentence · sent 89 · role: * qat_loop caption: Adam's v feeds saliency (math: v_t)
> Adam and AdamW already maintain this quantity as the second-moment estimate v_t, allowing QUASAR to reuse it without additional memory overhead.

**M13** · `methodology.tex:44` · sentence · sent 90 · role: saliency card footnote
> The EMA also smooths noise from individual training steps.

**M15** · `methodology.tex:54` · fragment · sent 94 · role: curvature heatmap caption (fragment)
> Saliency varies substantially within a weight group

**M16** · `methodology.tex:54` · sentence · sent 95 · role: every_weight_pulls caption, line 1 (math: g)
> Because all g weights in a group share dequantization parameters, reducing the reconstruction error of one weight can increase that of another.

**M17** · `methodology.tex:54` · fragment · sent 96 · role: * every_weight_pulls caption, line 2 (fragment)
> QUASAR prioritizes accurate reconstruction of high-saliency weights while tolerating more error on low-saliency weights

**M18** · `methodology.tex:58` · sentence · sent 98 · role: side-by-side: Standard QAT column
> Standard QAT uses the same scale and offset to assign codes and reconstruct weights.

**M19** · `methodology.tex:58` · sentence · sent 99 · role: side-by-side: QUASAR column
> In contrast, QUASAR searches over candidate clipping scales to find code assignments and, for each assignment, computes the optimal dequantization scale and offset in closed form.

**M20** · `methodology.tex:58` · sentence · sent 100 · role: one_point_fan caption
> It then selects the candidate with the smallest loss-aware reconstruction error.

**M21** · `methodology.tex:60` · sentence · sent 102 · role: step-2 heading
> A weighted least-squares fit gives the optimal dequantization.

**M22** · `methodology.tex:61` · fragment · sent 104 · role: step-2 caption (fragment)
> This is a weighted linear regression and therefore has a closed-form solution

**M23** · `methodology.tex:63` · sentence · sent 105 · role: step-1 heading
> Scale search finds good code assignments.

**M24** · `methodology.tex:64` · sentence · sent 106 · role: step-1 caption (math: q)
> The closed-form fit is optimal for a fixed q, but the code assignment itself may be far from optimal.

**M25** · `methodology.tex:64` · sentence · sent 107 · role: * step-1 caption
> QUASAR therefore searches over scale factors that shrink the clipping range.

**M26** · `methodology.tex:64` · sentence · sent 108 · role: interactive clipping slider caption
> Each range creates a different code assignment.

**M27** · `methodology.tex:72` · sentence · sent 110 · role: slider endpoint label (math: f)
> The case f=1 is the full min–max range used by standard QAT.

**M28** · `methodology.tex:72` · sentence · sent 111 · role: interactive clipping slider caption (math: f)
> A factor f<1 narrows the range and clips weights outside it, so the quantization levels cover a smaller interval with finer spacing.

**M29** · `methodology.tex:72` · sentence · sent 112 · role: slider tick legend (math)
> In our integer experiments, we search ℱ={0.30,0.35,…,1.00}.

**M30** · `methodology.tex:75` · sentence · sent 116 · role: qat_loop caption
> This search is performed as part of each QAT forward pass.

**M31** · `methodology.tex:77` · sentence · sent 119 · role: 'drop-in' card
> It leaves activation quantization and backpropagation unchanged: gradients still pass through the weight quantizer with the standard STE, and neither scale search nor dequantization fitting requires a separate backward rule.

**M32** · `methodology.tex:80` · sentence · sent 122 · role: Algorithm 1 caption / code-block title
> QUASAR reconstruction of one weight group, run at every training step.

**M33** · `appendix_formats.tex:90` · sentence · sent 256 · role: kernel card
> All candidates are evaluated in one batched kernel.

**M35** · `appendix_formats.tex:92` · sentence · sent 258 · role: 'drop-in' card
> Backpropagation uses the same STE as standard QAT.

**M36** · `appendix_formats.tex:3` · sentence · sent 241 · role: formats chip row
> QUASAR applies to affine and symmetric integer formats, NVFP4, and MXFP4.

**M37** · `appendix_formats.tex:5` · fragment · sent 242 · role: formats card (fragment)
> it searches over code assignments, fits the allowed dequantization parameters when the format permits, and selects the reconstruction with the lowest loss-aware error.

**M38** · `appendix_formats.tex:201` · sentence · sent 276 · role: NVFP4 format tooltip
> For each candidate, QUASAR rounds the assignment scale to E4M3, assigns E2M1 codes, and fits the stored E4M3 dequantization scale.

**M39** · `appendix_formats.tex:239` · sentence · sent 282 · role: MXFP4 format tooltip
> Because the stored scale is discrete, QUASAR searches the E8M0 scale grid directly rather than fitting a continuous scale.

**M40** · `appendix_method.tex:21` · fragment · sent 226 · role: range-factor histogram stat (fragment, math: Ŝ_t)
> At INT3, 99.6% of Qwen3-4B weight groups select a range narrower than min–max, reducing Ŝ_t to 69% of the full-range baseline

**M41** · `appendix_method.tex:37` · sentence · sent 233 · role: range-factor-by-bit-width caption
> With fewer codes, the search clips extreme weights more aggressively to better represent the bulk of the distribution.

**M42** · `appendix_method.tex:36` · fragment · sent 232 · role: range-factor stat (fragment)
> Across both models, the median selected range factor decreases from 0.95 at INT4 to 0.60 at INT2

**M44** · `appendix_method.tex:101` · sentence · sent 289 · role: H-vs-H² note (math: h_t)
> Weighting by h_t gives lower held-out loss in all six settings.

## Overhead and deployment

Stat cards: +1.4% step time, 0 memory, 0 inference overhead.

**O1** · `experiments.tex:53` · sentence · sent 209 · role: overhead bar chart caption
> QUASAR only adds 1.4% wall-clock step time compared with Standard QAT (2.97 and 2.93 seconds per step, respectively), with the overhead only coming from the weight reconstruction.

**O2** · `experiments.tex:53` · sentence · sent 210 · role: stat card: 0 memory
> Compared with Standard QAT, QUASAR introduces no memory overhead.

**O3** · `appendix_method.tex:67` · sentence · sent 240 · role: overhead table footnote
> QUASAR differs from Standard QAT only in the weight reconstruction row.

**O5** · `appendix_method.tex:65` · sentence · sent 239 · role: overhead chart title (Table 4 caption)
> Wall-clock time of one training step, per component and in seconds: quantization-aware distillation of Qwen3-4B-Thinking-2507 at INT3 on 8x H100 GPUs.

**O6** · `appendix_formats.tex:11` · sentence · sent 245 · role: deploy card / checkpoints section lead
> QUASAR checkpoints use standard layouts supported by vLLM's quantization backends.

**O7** · `appendix_formats.tex:12` · sentence · sent 246 · role: deploy card
> In vLLM, Marlin and Machete serve INT4 weights, NVFP4 runs natively on Blackwell GPUs, and MXFP4 weight-only checkpoints are supported.

**O8** · `appendix_formats.tex:92` · fragment · sent 259 · role: deploy chip (fragment)
> preserves the standard RTN/GPTQ inference layout.

## Theory (use one or two)

The page should carry at most two of these; the rest are captions for a theory figure if one is shown.

**T1** · `main.tex:59` · sentence · sent 8 · role: * theory callout (primary)
> Our theoretical analysis shows that optimizing QUASAR's reconstruction objective tightens both the convergence and final-loss bounds of QAT.

**T2** · `body.tex:21` · sentence · sent 216 · role: theory callout (alt)
> Our theoretical analysis shows that loss-aware reconstruction error directly controls QAT convergence and the quantized model's final loss, providing a principled foundation for QUASAR's objective.

**T3** · `introduction.tex:64` · sentence · sent 46 · role: theory callout (alt)
> Under empirically validated assumptions, we prove that reducing this error tightens bounds on both QAT convergence and the loss of the final quantized model.

**T4** · `theory.tex:77` · sentence · sent 148 · role: second line under the bound
> QUASAR directly minimizes this term at every step, hence tightening the bound on the quantized model's final loss.

**T5** · `theory.tex:45` · fragment · sent 140 · role: theorem chip title (fragment)
> Reconstruction error controls QAT convergence and final loss

**T6** · `appendix_theory_validation.tex:52` · sentence · sent 364 · role: init_predictor caption title
> Reconstruction error predicts final loss before training.

**T7** · `appendix_theory_validation.tex:11` · sentence · sent 353 · role: dose_trained caption (math)
> The relationship is also causal: restricting the scale search raises both Ŝ_T and final KL.

**T8** · `appendix_theory_validation.tex:93` · fragment · sent 378 · role: loss_floor / PL caption
> QUASAR's reconstruction adds less loss, so more of the remaining gap produces useful gradient, enabling faster healing and a lower loss floor.

**T9** · `appendix_theory_validation.tex:130` · sentence · sent 388 · role: SGD ladder caption title
> QUASAR retains its advantage under plain SGD.

## Results: healing with QAD (INT4/3/2, Qwen3-4B-Thinking-2507, Llama-3.1-8B-Instruct)

Pairs with finish_line and the healing-curve figure.

**R1** · `experiments.tex:23` · sentence · sent 170 · role: * healing section headline
> Across both models and all bit widths, QUASAR reaches the lowest training and evaluation loss (KL).

**R2** · `experiments.tex:23` · sentence · sent 171 · role: * stat card (−30% KL)
> At INT2, it reduces KL by about 30% over the strongest QAT baseline.

**R3** · `experiments.tex:24` · fragment · sent 172 · role: stat cards (+13.3 / +2.2) (fragment)
> On reasoning, coding, and long-context tasks, QUASAR improves average accuracy by 13.3 points for Qwen and 2.2 points for Llama

**R4** · `experiments.tex:6` · sentence · sent 154 · role: setup line under healing curves
> For healing, we apply QAD to Qwen3-4B-Thinking-2507 and Llama-3.1-8B-Instruct at INT2, INT3, and INT4 using Open-PerfectBlend data and logits from the full-precision teachers.

**R5** · `experiments.tex:6` · sentence · sent 157 · role: fairness footnote under every results block
> Baselines in each experiment use the same data, objective, training budget, and tuned learning rate, with matched inference formats.

**R6** · `appendix_healing.tex:16` · sentence · sent 423 · role: KL matrix caption
> QUASAR gives the lowest held-out KL across both models and all bit widths.

**R7** · `appendix_healing.tex:26` · sentence · sent 426 · role: accuracy-vs-bits caption
> QUASAR attains the highest INT2 average accuracy on both models.

**R8** · `appendix_healing.tex:37` · sentence · sent 429 · role: size-frontier caption
> QUASAR gives the best fidelity at each quantized model size.

**R9** · `appendix_healing.tex:48` · sentence · sent 432 · role: radar caption
> QUASAR preserves INT2 accuracy broadly across tasks.

**R10** · `appendix_healing.tex:58` · sentence · sent 434 · role: KL-vs-accuracy scatter caption
> Lower held-out KL correlates with higher downstream accuracy.

**R11** · `appendix_healing.tex:71` · sentence · sent 437 · role: agreement-curves caption
> QUASAR reaches the highest final top-1 agreement in all six settings.

**R12** · `appendix_healing.tex:92` · sentence · sent 442 · role: horizon strip caption title
> QUASAR becomes the final leader early in training.

**R13** · `appendix_healing.tex:94` · sentence · sent 444 · role: horizon strip caption
> QUASAR leads from step 128 at INT3 and INT2, and from step 1,408 at INT4, through the end of training.

**R15** · `appendix_healing.tex:101` · fragment · sent 445 · role: judge widget lead (fragment)
> Across 128 WildChat prompts per model, Llama-3.3-70B-Instruct prefers QUASAR to all seven quantized baselines for both models

**R16** · `appendix_healing.tex:103` · fragment · sent 446 · role: INT2 transcript widget caption (fragment)
> The margin is largest against PTQ, whose INT2 responses are often repetitive or incomplete

**R17** · `appendix_healing.tex:105` · sentence · sent 447 · role: judge widget honesty footnote
> The full-precision models remain preferred.

**R18** · `appendix_healing.tex:111` · sentence · sent 449 · role: judge bar chart caption
> The judge prefers QUASAR to every INT2 quantized baseline.

**R19** · `appendix_healing.tex:120` · sentence · sent 452 · role: judge stat card
> QUASAR wins all 14 comparisons with quantized baselines.

**R20** · `appendix_healing.tex:147` · sentence · sent 456 · role: repetition chart caption
> QUASAR matches the full-precision models' response stability at INT2.

**R21** · `appendix_healing.tex:194` · sentence · sent 459 · role: transcript widget caption
> The beginning of each method's response to one held-out prompt, for Qwen3-4B-Thinking-2507 at INT2, INT3, and INT4 with greedy decoding.

**R22** · `healing_hard_table.tex:4` · sentence · sent 167 · role: metric legend
> We report KL and top-1 agreement between quantized checkpoints and the BF16 original, as well as benchmark accuracy.

**R23** · `appendix_setup.tex:16` · sentence · sent 398 · role: setup footnote
> We apply QAD for 4,096 steps at sequence length 4,096.

**R24** · `appendix_setup.tex:19` · sentence · sent 401 · role: setup footnote
> This corresponds to roughly 60k supervised tokens per step.

## Results: adaptation with QAT (Qwen3-4B-Base on OpenMathReasoning)

Pairs with beat_the_base.

**A1** · `experiments.tex:30` · sentence · sent 176 · role: adaptation headline
> QUASAR has the lowest held-out perplexity and the best or tied-best average accuracy at every bit width.

**A2** · `experiments.tex:31` · fragment · sent 177 · role: beat_the_base caption (fragment)
> At INT2, QUASAR reaches 29.6 average accuracy, 10.9 points above the strongest QAT baseline and 29.0 points above full-precision fine-tuning followed by PTQ

**A3** · `experiments.tex:34` · sentence · sent 178 · role: * beat_the_base punchline
> It is also the only INT2 quantized model to outperform the original base model and score above zero on HMMT'25.

**A4** · `experiments.tex:6` · sentence · sent 155 · role: setup line
> For adaptation, we train all weights of Qwen3-4B-Base on OpenMathReasoning using cross-entropy.

**A5** · `appendix_adaptation.tex:8` · sentence · sent 463 · role: long-reasoning callout
> QUASAR's advantage is largest on benchmarks requiring long reasoning.

**A6** · `appendix_adaptation.tex:9` · sentence · sent 464 · role: long-reasoning stat
> FP-SFT generates median responses of 27k tokens on AIME'24 and 20k on HMMT'25.

**A7** · `appendix_adaptation.tex:10` · sentence · sent 465 · role: long-reasoning callout (alt)
> At INT2, QUASAR is the only quantized model to score above zero on HMMT'25, suggesting that it better preserves the adapted behavior over long generations.

**A8** · `appendix_adaptation.tex:17` · sentence · sent 466 · role: adaptation curves caption
> QUASAR reaches the lowest held-out perplexity at every bit width.

**A9** · `adaptation_table.tex:4` · sentence · sent 180 · role: adaptation table title
> Comparison of QAT and PTQ methods for adapting Qwen3-4B-Base on OpenMathReasoning at INT2, INT3, and INT4.

**A10** · `adaptation_table.tex:4` · sentence · sent 181 · role: adaptation metric legend
> We report held-out perplexity and accuracy on five math benchmarks.

**A11** · `appendix_adaptation.tex:6` · sentence · sent 476 · role: divergence chart title
> Divergence from FP-SFT along reasoning traces.

## Results: NVFP4 (Qwen3-8B, Qwen3.5-9B, Muse-Glimmer-30B)

**N1** · `experiments.tex:42` · sentence · sent 186 · role: * NVFP4 stat cards (−12% / −15%)
> For Qwen3-8B and Qwen3.5-9B, QUASAR reduces held-out KL divergence by 12% and 15% relative to Standard QAT, respectively.

**N2** · `experiments.tex:42` · fragment · sent 187 · role: NVFP4 bar chart caption (fragment)
> On the more challenging reasoning, coding, and long-horizon benchmarks, Qwen3.5-9B achieves an average score of 55.7, compared with 52.6 for Standard QAT and 39.4 for GPTQ

**N3** · `experiments.tex:42` · sentence · sent 188 · role: QAT-vs-PTQ long-generation callout
> These results also highlight the value of QAD: both QAD checkpoints remain stable over long generations, whereas the PTQ checkpoints often fail to complete them, despite GPTQ achieving lower held-out KL divergence than Standard QAT.

**N4** · `experiments.tex:42` · sentence · sent 185 · role: eval footnote
> All checkpoints are evaluated using vLLM's native NVFP4 path.

**N5** · `appendix_nvfp4.tex:10` · sentence · sent 480 · role: NVFP4 curves caption
> QUASAR reaches lower held-out loss for both NVFP4 models.

**N6** · `appendix_nvfp4.tex:52` · sentence · sent 485 · role: MRCR / termination chart caption
> QUASAR better preserves long-horizon behavior in NVFP4.

**N7** · `nvfp4_longctx_tables.tex:3` · sentence · sent 488 · role: termination chart caption
> QUASAR has the lowest or tied-lowest non-termination rate among the quantized checkpoints.

**N8** · `appendix_nvfp4.tex:19` · sentence · sent 482 · role: NVFP4 table caption
> QUASAR gives the best average accuracy among the quantized checkpoints.

**N9** · `merged_table.tex:3` · sentence · sent 190 · role: merged comparison table title
> Comparison of QUASAR with QAT and PTQ baselines across NVFP4, INT4, and Q4_0 (llama.cpp GGUF format).

**N10** · `merged_table.tex:3` · sentence · sent 191 · role: merged table legend
> We report fidelity to BF16 and accuracy on ten reasoning, coding, and long-horizon benchmarks.

**N11** · `appendix_formats.tex:198` · sentence · sent 273 · role: NVFP4 tooltip (math: σ)
> NVFP4 represents groups of 16 weights with E2M1 codes, an E4M3 scale per group, and a tensor-level FP32 scale σ.

## Results: Gemma-4 E4B vs Google's QAT checkpoint

Pairs with vs_google.

**G1** · `experiments.tex:48` · sentence · sent 194 · role: vs_google caption
> For the INT4 Gemma model, QUASAR achieves a held-out KL divergence of 0.022 and an average accuracy of 35.8 on the ten downstream benchmarks, compared with 0.064 and 34.0 for Google's QAT checkpoint.

**G2** · `experiments.tex:48` · sentence · sent 195 · role: vs_google stat line
> This corresponds to 66% lower KL divergence and 1.8 points higher average accuracy.

**G3** · `experiments.tex:48` · sentence · sent 196 · role: * vs_google footnote
> Notably, QUASAR achieves these results with only 600M tokens of distillation and 5 hours of training, while Google does not disclose the training data or compute used for its QAT checkpoint.

**G4** · `experiments.tex:48` · sentence · sent 197 · role: vs_google footnote
> QUASAR also uses a larger quantization group size of 64, compared with 32 for Google's checkpoint.

**G5** · `introduction.tex:64` · fragment · sent 48 · role: vs_google caption (alt, fragment)
> at INT4, its Gemma-4 E4B checkpoint achieves 66% lower held-out KL and 1.8 points higher average accuracy than Google's public QAT checkpoint.

**G6** · `appendix_released.tex:18` · sentence · sent 503 · role: comparison table footnote
> Google QAT uses Google's unpublished INT4 recipe with 32-weight groups.

**G7** · `body.tex:21` · sentence · sent 219 · role: short vs-Google line
> Notably, QUASAR's INT4 Gemma-4 checkpoint outperforms Google's QAT checkpoint in KL divergence and benchmark accuracy.

## Released checkpoints

Gemma-4 E4B and 12B, Qwen3.5-4B and Muse-Glimmer-30B appear in the paper; Qwen3.8-27B does NOT, so its card needs data-only labels (no prose).

**C1** · `released_table_full.tex:3` · sentence · sent 493 · role: checkpoints section title
> Comparison with released 4-bit checkpoints across four model families.

**C2** · `appendix_released.tex:2` · fragment · role: checkpoints section heading (fragment)
> Comparison with Google's QAT and Other 4-bit Checkpoints

**C3** · `appendix_released.tex:4` · fragment · sent 492 · role: comparison table footnote (fragment)
> The RTN rows, and the GPTQ rows at NVFP4 W4A16 and INT4 g64, are our own conversions of the BF16 models; all other rows are public artifacts

**C4** · `released_table_full.tex:3` · fragment · sent 495 · role: GGUF table footnote
> GGUF KL values are comparable only within each block.

**C5** · `appendix_released.tex:10` · sentence · sent 496 · role: bpw column tooltip
> bpw includes the quantized transformer-block weights, scales, and zero-points.

**C6** · `appendix_released.tex:11` · sentence · sent 497 · role: bpw column tooltip, line 2
> Embeddings, output layers, norms, and small gating tensors are excluded.

**C7** · `appendix_released.tex:20` · sentence · sent 506 · role: GGUF row legend
> imatrix (PTQ) selects GGUF Q4_0 scales using activation-weighted reconstruction error; the GGUF RTN rows use plain round-to-nearest.

**C9** · `experiments.tex:6` · fragment · sent 156 · role: NVFP4 checkpoint group label (fragment)
> We also apply QAD in NVFP4 to Qwen3-8B, Qwen3.5-9B, and Muse-Glimmer-30B

## Results: learning-rate robustness

Pairs with one_line_every_lr.

**L1** · `appendix_healing.tex:81` · sentence · sent 439 · role: LR-sweep heading
> QUASAR is robust to learning rate.

**L2** · `appendix_healing.tex:82` · sentence · sent 440 · role: LR-sweep chart subtitle
> Final held-out KL after 1,000 steps of INT2 QAD of Qwen3-4B-Thinking-2507 across a 50× learning-rate range.

**L3** · `appendix_healing.tex:83` · sentence · sent 441 · role: * LR-sweep caption
> QUASAR attains the lowest KL at every tested rate; Standard QAT diverges at high rates, while BitDistiller degrades at low rates.

## Results: ablations (scale search vs saliency fit)

**B1** · `experiments.tex:51` · sentence · sent 203 · role: * ablation chart caption
> Scale search provides most of the gain, while Adam and Fisher saliency perform similarly, despite Adam being computationally cheaper.

**B2** · `experiments.tex:51` · sentence · sent 204 · role: ablation headline
> QUASAR achieves the lowest training and evaluation loss across ablations.

**B3** · `experiments.tex:51` · sentence · sent 201 · role: ablation legend note
> Removing both recovers Standard QAT.

**B4** · `experiments.tex:51` · fragment · sent 200 · role: ablation toggle labels (fragment)
> QUASAR's two components: scale search and saliency for weighted least squares.

**B5** · `ablation_table_main.tex:4` · fragment · sent 460 · role: ablation table title
> Effect of QUASAR's scale search and weighted dequantization fit on Qwen3-4B-Thinking-2507 with INT2 QAD.

**B6** · `ablation_table_main.tex:5` · sentence · sent 461 · role: ablation table legend
> We report final held-out KL and its change from Standard QAT.

## Figure captions (verbatim, for the paper figures or their animated versions)

Full captions minus the 'Figure N:' prefix; trailing appendix pointers dropped where noted.

**FC1** · `introduction.tex:24` · caption · sent 21,22 · role: * Figure 1 (borrowed_gradient_pair / fig1_live / hero_replay) full caption
> The structural mismatch of gradients in standard QAT versus QUASAR. Under the STE, both methods evaluate the gradient at the reconstructed weights r and apply it to the latent weights w. QUASAR minimizes the loss-aware reconstruction error, making the gradient at r a more faithful proxy for the gradient at w.

**FC2** · `methodology.tex:38` · caption · sent 82 · role: Figure 2 (method_simple) caption, appendix pointer dropped
> The training loops for standard QAT and QUASAR differ only in the reconstruction w ↦ q ↦ r. Standard QAT determines the quantization grid from each group's extreme weights; QUASAR searches over code assignments and fits the dequantizer to minimize loss-aware reconstruction error. The right panels show the resulting grids and error distributions

**FC3** · `experiments.tex:16` · caption · sent 164,165 · role: Figure 3 (healing curves grid) full caption
> QAD of Qwen3-4B-Thinking-2507 (left) and Llama-3.1-8B-Instruct (right) at INT4, INT3, and INT2 on Open-PerfectBlend. We show training loss over the full run, the final 1,000 steps, and held-out evaluation loss. All losses are forward KL to the full-precision model.

**FC4** · `experiments.tex:58` · caption · sent 212 · role: Figure 4 (ablation curves) full caption
> Ablation Study: INT2 QAD for Qwen3-4B-Thinking-2507 with different choices for QUASAR's components. Training and evaluation (held-out) loss both use forward KL.

**FC5** · `appendix_method.tex:29` · caption · sent 229,230,231 · role: Figure 6 (range_decomp; matches grid_hijack) full caption
> Scale search for Qwen3-4B weight groups at INT3. (a) One extreme weight sets the min–max range. (b) QUASAR clips the outlier and covers the bulk. (c) Distribution of selected range factors f⋆ across 28.4M groups; 99.6% use a range narrower than min–max.

**FC6** · `appendix_method.tex:15` · caption · sent 224,225 · role: Figure 5 (beforeafter_heatmaps) full caption (math)
> Per-weight loss-aware reconstruction error for 14 Qwen3-4B weight groups at INT3. Color shows |√h (r−w)| under (a) Standard QAT with min–max reconstruction and (b) QUASAR. Each row contains 128 weights ordered by saliency h.

**FC7** · `appendix_method.tex:54` · caption · sent 237,238 · role: Figure 8 (curvature_heatmap) full caption
> Saliency h in one Qwen3-4B layer. Weight groups span 128 weights along the input dimension. The large variation within each group lets QUASAR prioritize the most salient weights.

**FC8** · `appendix_method.tex:46` · caption · sent 235 · role: Figure 7 (range-factor histograms) full caption
> Distribution of selected clipping-range factors f⋆ across weight groups after QAD at INT4, INT3, and INT2 for Qwen3-4B-Thinking-2507 and Llama-3.1-8B-Instruct. Lower bit widths favor narrower ranges.

**FC9** · `appendix_theory_validation.tex:42` · caption · sent 361,362,363 · role: Figure 12 (dose_trained) full caption (math)
> Reconstruction error drives final loss. Five QUASAR INT2 runs differ only in the lower bound imposed on the scale-search factor f. Restricting the search raises both the final reconstruction error Ŝ_T and held-out KL after 1,000 training steps. The star marks the unrestricted search.

## Conclusion

Footer / closing block.

**K1** · `body.tex:21` · sentence · sent 213 · role: closing statement
> We introduce QUASAR, which integrates loss-aware reconstruction into the training loop to lower the loss floor of QAT.

**K2** · `body.tex:21` · sentence · sent 214 · role: closing method recap / TL;DR
> QUASAR combines scale search with a saliency-weighted dequantization fit, using an exponential moving average of squared gradients as the saliency signal.

**K3** · `body.tex:21` · sentence · sent 217 · role: closing scope line
> We evaluate QUASAR across four model families and four quantization formats.

**K4** · `body.tex:21` · sentence · sent 218 · role: closing results line
> Across these settings, QUASAR achieves lower training and evaluation loss than competitive QAT baselines and improves downstream accuracy over QAT and PTQ methods.

## Limitations and caveats (the paper has no Limitations section; these are its own caveats)

**Z1** · `appendix_formats.tex:16` · sentence · sent 247 · role: caveat under INT3/INT2 results
> INT3 and INT2 currently lack dedicated fast kernels, so we treat them as accuracy frontiers rather than deployment formats.

**Z2** · `appendix_proofs.tex:239` · sentence · sent 336 · role: theory caveat
> Adam's second moment motivates the saliency estimate but does not guarantee the condition.

**Z3** · `methodology.tex:25` · fragment · sent 74 · role: assumption caveat next to the S formula (fragment)
> When the first-order term is negligible, as near a stationary region

**Z4** · `body.tex:9` · fragment · sent 56 · role: related-work caveat (fragment)
> Other methods are complementary and compose with QUASAR

## Setup facts

Small print under results.

**S1** · `appendix_setup.tex:9` · sentence · sent 394 · role: setup footnote
> The controlled INT experiments use asymmetric weight-only INT4, INT3, or INT2 quantization with group size 128.

**S2** · `appendix_setup.tex:21` · sentence · sent 403 · role: setup footnote / slider legend
> QUASAR uses AdamW's second moment as saliency and searches clipping factors from 0.30 to 1.00 in increments of 0.05.

**S3** · `appendix_setup.tex:10` · sentence · sent 395 · role: setup footnote
> We quantize every linear projection in the transformer blocks and keep activations, embeddings, the language-model head, and norms in BF16.

**S4** · `appendix_setup.tex:12` · sentence · sent 396 · role: setup footnote
> Healing updates only the quantized linear weights; adaptation updates all student parameters.

## Short fragments (3–10 words) for headings, labels, chips

| id | fragment | src | suggested use |
|---|---|---|---|
| F1 | `loss-aware reconstruction into the training loop` | `main.tex:59` | hero kicker / section heading |
| F2 | `Lowering the Loss Floor of Quantization-Aware Training` | `main.tex:43` | hero title line 1 |
| F3 | `with Loss-Aware Reconstruction` | `main.tex:43` | hero title line 2 |
| F4 | `QAT has a structural mismatch` | `main.tex:59` | problem heading |
| F5 | `a higher loss floor` | `main.tex:59` | loss_floor label |
| F6 | `lower the loss floor` | `introduction.tex:61` | solution heading |
| F7 | `The consequence is a loss-floor gap` | `introduction.tex:38` | loss_floor annotation |
| F8 | `the loss-aware reconstruction error` | `introduction.tex:24` | axis / chip label |
| F9 | `only in the weight reconstruction` | `appendix_method.tex:67` | diagram box label |
| F10 | `latent full-precision weights` | `main.tex:59` | label for w |
| F11 | `lossy reconstructions of those weights` | `main.tex:59` | label for r |
| F12 | `reconstructed weights r` | `introduction.tex:24` | label for r (math) |
| F13 | `latent weights w` | `introduction.tex:24` | label for w (math) |
| F14 | `a more faithful proxy for the gradient at w` | `introduction.tex:24` | arrow annotation (math) |
| F15 | `straight-through estimator (STE)` | `introduction.tex:34` | STE label |
| F16 | `the optimal descent direction` | `introduction.tex:37` | gradient_compass label |
| F17 | `searching over a small set of clipping ranges` | `main.tex:59` | method step 1 label |
| F18 | `saliency-weighted least squares` | `main.tex:59` | method step 2 label |
| F19 | `an exponential moving average of squared gradients` | `main.tex:59` | saliency label |
| F20 | `the per-parameter saliency signal` | `main.tex:59` | saliency label |
| F21 | `scale search over clipping ranges` | `methodology.tex:3` | step-1 label |
| F22 | `a saliency-weighted dequantization fit` | `body.tex:21` | step-2 label |
| F23 | `Optimizing Both Stages of Reconstruction` | `methodology.tex:56` | method section heading |
| F24 | `A Tractable Loss-Aware Objective` | `methodology.tex:42` | saliency section heading |
| F25 | `Reconstruction in QAT` | `methodology.tex:5` | problem section heading |
| F26 | `Reconstruction has two stages` | `methodology.tex:23` | two-stage diagram title |
| F27 | `dequantization parameters in closed form` | `introduction.tex:61` | stage-2 label |
| F28 | `closed-form saliency-weighted least squares` | `introduction.tex:63` | step-2 label |
| F29 | `a small clipping-range search` | `introduction.tex:63` | step-1 label |
| F30 | `deploying exactly as an RTN-quantized model` | `body.tex:9` | deploy chip |
| F31 | `no inference overhead` | `body.tex:21` | stat card label |
| F32 | `introduces no memory overhead` | `experiments.tex:53` | stat card label |
| F33 | `1.4% latency overhead per training step` | `body.tex:21` | stat card label |
| F34 | `without additional memory overhead` | `methodology.tex:44` | saliency chip |
| F35 | `the reconstruction PTQ solves once` | `body.tex:9` | every_step label |
| F36 | `requiring the reconstruction to be continually re-optimized` | `introduction.tex:56` | every_step label |
| F37 | `would therefore be prohibitively expensive` | `introduction.tex:58` | every_step label |
| F38 | `differ only in the reconstruction` | `methodology.tex:38` | loop diagram label |
| F39 | `One extreme weight sets the min–max range.` | `appendix_method.tex:29` | grid_hijack beat 1 |
| F40 | `QUASAR clips the outlier and covers the bulk.` | `appendix_method.tex:30` | grid_hijack beat 2 |
| F41 | `prioritize the most salient weights` | `appendix_method.tex:55` | every_weight_pulls label |
| F42 | `accurate reconstruction of high-saliency weights` | `methodology.tex:54` | legend label |
| F43 | `tolerating more error on low-saliency weights` | `methodology.tex:54` | legend label |
| F44 | `Results on Healing and Adaptation` | `experiments.tex:11` | results heading |
| F45 | `Healing with QAD.` | `experiments.tex:23` | results subheading |
| F46 | `Adaptation with QAT.` | `experiments.tex:30` | results subheading |
| F47 | `NVFP4 and Checkpoint Comparisons` | `experiments.tex:40` | results subheading |
| F48 | `Comparison with Google's QAT checkpoints.` | `experiments.tex:47` | results subheading |
| F49 | `Ablations and Training Overhead` | `experiments.tex:50` | results heading |
| F50 | `Quantization-aware Distillation (QAD)` | `experiments.tex:3` | glossary label |
| F51 | `66% lower KL divergence` | `main.tex:59` | vs_google stat label |
| F52 | `1.8 points higher average accuracy` | `main.tex:59` | vs_google stat label |
| F53 | `only 600M tokens of distillation and 5 hours of training` | `experiments.tex:48` | vs_google stat label |
| F54 | `four model families and four quantization formats` | `introduction.tex:64` | scope chip |
| F55 | `the strongest QAT baseline` | `introduction.tex:64` | chart reference-line label |
| F56 | `only INT2 quantized model to outperform the original base model` | `experiments.tex:34` | beat_the_base label |
| F57 | `remain stable over long generations` | `experiments.tex:42` | NVFP4 long-generation label |
| F58 | `Scale search provides most of the gain` | `experiments.tex:51` | ablation label |
| F59 | `lower training and held-out loss floors` | `appendix_theory_validation.tex:122` | SGD ladder label |
| F60 | `held-out KL divergence` | `experiments.tex:42` | axis label |
| F61 | `top-1 agreement between quantized checkpoints and the BF16 original` | `healing_hard_table.tex:4` | axis label / metric legend |
| F62 | `the lowest held-out perplexity` | `experiments.tex:30` | axis annotation |
| F63 | `average accuracy over the best QAT baseline` | `main.tex:59` | axis annotation |
| F64 | `non-termination rate among the quantized checkpoints` | `nvfp4_longctx_tables.tex:3` | axis label |
| F65 | `standard layouts supported by vLLM's quantization backends` | `appendix_formats.tex:11` | deploy chip |
| F66 | `Reconstruction error drives final loss.` | `appendix_theory_validation.tex:41` | theory figure heading |
| F67 | `at every tested rate` | `appendix_healing.tex:83` | LR chart annotation |
| F68 | `Comparison with released 4-bit checkpoints` | `released_table_full.tex:3` | checkpoints heading |
| F69 | `LLM-as-a-Judge Preference at 2 Bits` | `appendix_healing.tex:100` | judge heading |
| F70 | `INT4, INT3, INT2, and NVFP4 quantization formats` | `main.tex:59` | formats chip row |
