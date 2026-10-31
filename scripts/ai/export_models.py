"""Export fine-tuned EmbeddingGemma 2 models to ONNX and Ollama Modelfile formats.

Generates:
1. ONNX INT8 / FP16 models optimized for in-browser Transformers.js WebGPU execution.
2. Ollama Modelfile configuration for serving via http://localhost:11434.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("export_models")


def export_to_onnx(
    model_path: str,
    output_dir: Path,
    quantize_int8: bool = True,
) -> Path:
    """Export SentenceTransformer/HuggingFace model to ONNX with INT8 quantization."""
    try:
        import importlib

        ort = importlib.import_module("optimum.onnxruntime")
        ORTModelForFeatureExtraction = ort.ORTModelForFeatureExtraction
        ORTQuantizer = ort.ORTQuantizer
        ort_cfg = importlib.import_module("optimum.onnxruntime.configuration")
        AutoQuantizationConfig = ort_cfg.AutoQuantizationConfig
        transformers_mod = importlib.import_module("transformers")
        AutoTokenizer = transformers_mod.AutoTokenizer
    except ImportError as exc:
        msg = (
            "Optimum and ONNX Runtime are required for export: "
            "pip install optimum[onnxruntime] onnx"
        )
        raise RuntimeError(msg) from exc

    output_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Exporting %s to ONNX in %s...", model_path, output_dir)

    # 1. Export base ONNX model
    ort_model = ORTModelForFeatureExtraction.from_pretrained(model_path, export=True)
    tokenizer = AutoTokenizer.from_pretrained(model_path)

    ort_model.save_pretrained(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))
    logger.info("Base ONNX model exported.")

    # 2. Quantize to INT8 for WebGPU / Browser performance
    if quantize_int8:
        quantized_dir = output_dir / "quantized_int8"
        quantized_dir.mkdir(parents=True, exist_ok=True)
        logger.info("Quantizing ONNX model to INT8 in %s...", quantized_dir)

        quantizer = ORTQuantizer.from_pretrained(ort_model)
        try:
            dqconfig = AutoQuantizationConfig.avx2(is_static=False, per_channel=False)
            quantizer.quantize(
                save_dir=str(quantized_dir),
                quantization_config=dqconfig,
            )
        except Exception:
            dqconfig = AutoQuantizationConfig.avx512_vnni(
                is_static=False, per_channel=False
            )
            quantizer.quantize(
                save_dir=str(quantized_dir),
                quantization_config=dqconfig,
            )
        tokenizer.save_pretrained(str(quantized_dir))
        logger.info("INT8 Quantized ONNX model ready for browser WebGPU.")
        return quantized_dir

    return output_dir


def create_ollama_modelfile(
    model_name_or_path: str,
    output_file: Path,
) -> None:
    """Generate an Ollama Modelfile for serving via http://localhost:11434."""
    output_file.parent.mkdir(parents=True, exist_ok=True)

    sys_instruction = (
        'SYSTEM """You are an expert embedding encoder optimized for '
        'browser tab organization and semantic clustering."""'
    )
    content = f"""# Ollama Modelfile for Tabman EmbeddingGemma 2
FROM {model_name_or_path}

# Set parameters for embedding inference
PARAMETER num_ctx 4096
PARAMETER temperature 0.0

# System instruction for tab clustering
{sys_instruction}
"""
    output_file.write_text(content, encoding="utf-8")
    logger.info("Generated Ollama Modelfile at %s", output_file)
    logger.info("Register with: ollama create tabman-embed -f %s", output_file)


def main() -> int:
    """CLI entrypoint for exporting models."""
    parser = argparse.ArgumentParser(
        description="Export fine-tuned EmbeddingGemma 2 to ONNX and Ollama."
    )
    parser.add_argument(
        "--model",
        type=str,
        required=True,
        help="Path to fine-tuned model checkpoint",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=ROOT / "models" / "onnx_export",
        help="Target directory for ONNX models",
    )
    parser.add_argument(
        "--no-quantize",
        action="store_true",
        help="Skip INT8 quantization",
    )

    args = parser.parse_args()

    # 1. Export ONNX
    onnx_path = export_to_onnx(
        model_path=args.model,
        output_dir=args.output_dir,
        quantize_int8=not args.no_quantize,
    )

    # 2. Generate Ollama Modelfile
    modelfile_path = args.output_dir / "Modelfile"
    create_ollama_modelfile(
        model_name_or_path=args.model,
        output_file=modelfile_path,
    )

    print("\n" + "=" * 60)
    print("MODEL EXPORT COMPLETE")
    print("=" * 60)
    print(f"ONNX Model:       {onnx_path}")
    print(f"Ollama Modelfile: {modelfile_path}")
    print("=" * 60 + "\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
