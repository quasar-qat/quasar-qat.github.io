<!-- source: https://huggingface.co/QUASAR-QAT/Qwen3.8-27B-QUASAR-NVFP4/raw/main/README.md · fetched 2026-10-08 · repo revision d9af17e20644c5b9a6d66dff1d14f349e2e61b05 (lastModified 2026-10-05T19:44:00Z) · verbatim below this line -->
---
library_name: transformers
pipeline_tag: image-text-to-text
license: apache-2.0
base_model: Qwen/Qwen3.8-27B
base_model_relation: quantized
tags:
  - Qwen3.8
  - nvfp4
  - fp4
  - w4a4
  - 4bit
  - quantization
  - quantized
  - quantization-aware-training
  - quasar
  - blackwell
  - compressed-tensors
  - vllm
  - sglang
  - qwen3.8-27b
  - 4-bit precision
  - multimodal
  - vision
  - reasoning
  - thinking
  - long-context
  - agentic
  - mtp
  - speculative-decoding
---

# Qwen3.8-27B NVFP4, trained with QUASAR

**19.7 GB · 496/496 transformer linears in NVFP4 (W4A4) · 0.909 GPQA-Diamond vs. 0.914 BF16 · serves directly with vLLM.**

**Among the public NVFP4 builds compared below, QUASAR is both the smallest and the highest-scoring: 90.9 GPQA-Diamond and 100% AIME'26.**

**Independent evaluation:** A third-party [NVFP4 shootout on the official Qwen3.8-27B repo](https://huggingface.co/Qwen/Qwen3.8-27B/discussions/192) compares QUASAR against other public NVFP4 checkpoints under the same evaluation and serving setup.

**Smaller sibling — Qwen3.5-4B:** [W4A16 / vLLM](https://huggingface.co/QUASAR-QAT/Qwen3.5-4B-QUASAR-NVFP4) · [W4A4 / Blackwell](https://huggingface.co/QUASAR-QAT/Qwen3.5-4B-QUASAR-NVFP4-W4A4) · [Q4_0 GGUF / llama.cpp](https://huggingface.co/QUASAR-QAT/Qwen3.5-4B-QUASAR-Q4_0-GGUF) · [collection](https://huggingface.co/collections/QUASAR-QAT/quasar-qat-models-6aa3452a0caa78ce72bbbe0f) · [paper](https://arxiv.org/abs/2608.13966)

More QUASAR checkpoints: [Gemma 4 collection](https://huggingface.co/collections/QUASAR-QAT/quasar-native-4-bit-gemma-4-6aa3561770e6e4001271bf1e) · [Muse-Glimmer collection](https://huggingface.co/collections/QUASAR-QAT/quasar-native-4-bit-muse-glimmer-6aa4736ca711a87d471e807d) · [paper](https://arxiv.org/abs/2608.13966).

`QUASAR-QAT/Qwen3.8-27B-QUASAR-NVFP4` is a 4-bit NVFP4 version of
[`Qwen/Qwen3.8-27B`](https://huggingface.co/Qwen/Qwen3.8-27B), produced with
[**QUASAR**](https://arxiv.org/abs/2608.13966), a quantization-aware training (QAT) method.

QUASAR trains the NVFP4 weights directly against the frozen BF16 model, then exports standard NVFP4 weights with no custom inference path. This lets us quantize all 496 transformer linears—including attention and gated delta-net—to NVFP4 while preserving near-BF16 quality: the smallest of the compared public NVFP4 builds, while scoring highest among them on both GPQA-Diamond and AIME'26.

📄 Paper: [QUASAR: Lowering the Loss Floor of Quantization-Aware Training with Loss-Aware
Reconstruction](https://arxiv.org/abs/2608.13966)

## How to run

Compatible with vLLM, with no conversion step:

```bash
pip install "vllm>=0.27"

vllm serve QUASAR-QAT/Qwen3.8-27B-QUASAR-NVFP4 \
  --max-model-len 262144 \
  --gpu-memory-utilization 0.85 \
  --max-num-seqs 512 \
  --speculative-config '{"method": "mtp", "num_speculative_tokens": 2}' \
  --enable-auto-tool-choice --tool-call-parser qwen3_xml \
  --reasoning-parser qwen3
```

On a 32 GB card such as an RTX 5090, lower the context to `--max-model-len 65536`.

Requires an NVIDIA GPU with FP4 support (Blackwell, compute capability 10.0+).

## Quality and size comparison

Two other public NVFP4 builds of this model, evaluated under the same setup (GPQA-Diamond: 2 runs, n=396; AIME'26: 3 repeats, n=90). **Bold = best among the NVFP4 builds.**

| Model | Size | NVFP4 linears | GPQA-D | AIME'26 |
|---|---:|---:|---:|---:|
| **QUASAR (this model)** | **19.7 GB** | **496/496** | **90.91** | **100.0** |
| [BF16 original](https://huggingface.co/Qwen/Qwen3.8-27B) | 55.6 GB | — | 91.41 | 100.0 |
| [Unsloth NVFP4](https://huggingface.co/unsloth/Qwen3.8-27B-NVFP4) | 23.4 GB | 168/496 | 89.39 | 97.78 |
| [Inferact NVFP4](https://huggingface.co/Inferact/Qwen3.8-27B-NVFP4) | 26.4 GB | 304/496 | 87.63 | 96.67 |

| Model | MRCR | MRCR 8-needle | HMMT'26 | SuperGPQA | LiveCodeBench | RULER 32K | RULER 64K | RULER 128K |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **QUASAR (this model)** | **79.1** | **52.7** | **73.4** | **62.4** | **79.2** | **96.3** | **96.2** | **95.8** |
| [BF16 original](https://huggingface.co/Qwen/Qwen3.8-27B) | 83.4 | 58.5 | 75.8 | 63.0 | 81.0 | 96.7 | 96.6 | 95.9 |
| GPTQ NVFP4 (LLM Compressor, ours) | 61.3 | 35.5 | 69.7 | 58.9 | 77.9 | 96.0 | 95.4 | 95.3 |
| RTN NVFP4 (LLM Compressor, ours) | 57.3 | 32.8 | 66.9 | 58.6 | 77.9 | 96.2 | 96.1 | 95.3 |

## Training

One epoch of loss-aware NVFP4 quantization-aware distillation against the frozen BF16
teacher: global batch size 32, learning rate 1e-6, 2446 steps.

## Citation

[arxiv.org/abs/2608.13966](https://arxiv.org/abs/2608.13966)

```bibtex
@article{counathe2026quasar,
  title={QUASAR: Lowering the Loss Floor of Quantization-Aware Training with Loss-Aware Reconstruction},
  author={Counathe, Vincent and Athiwaratkun, Ben and De Sa, Christopher and Zhang, Tianyi},
  journal={arXiv preprint arXiv:2608.13966},
  year={2026}
}
```
