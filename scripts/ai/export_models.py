"""Export fine-tuned EmbeddingGemma 2 models to ONNX and Ollama Modelfile formats.

Generates:
1. ONNX INT8 / FP16 models optimized for in-browser Transformers.js WebGPU execution.
2. Ollama Modelfile configuration for serving via http://localhost:11434.
"""

from __future__ import annotations

import argparse
import logging
import shutil
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


def _patch_transformers_utils() -> None:
    """Ensure transformers exposes legacy functions expected by Optimum."""
    import importlib
    import os

    try:
        transformers_utils = importlib.import_module("transformers.utils")
        if not hasattr(transformers_utils, "is_offline_mode"):
            transformers_utils.is_offline_mode = lambda: (
                os.environ.get("TRANSFORMERS_OFFLINE", "0").upper()
                in ("1", "ON", "YES")
                or os.environ.get("HF_HUB_OFFLINE", "0").upper() in ("1", "ON", "YES")
            )
    except Exception as exc:
        logger.debug("Could not patch transformers.utils: %s", exc)

    try:
        modeling_utils = importlib.import_module("transformers.modeling_utils")
        if not hasattr(modeling_utils, "get_parameter_dtype"):
            torch = importlib.import_module("torch")

            def _get_parameter_dtype(parameter_or_module):
                if hasattr(parameter_or_module, "parameters"):
                    try:
                        return next(parameter_or_module.parameters()).dtype
                    except StopIteration:
                        return torch.float32
                return getattr(parameter_or_module, "dtype", torch.float32)

            modeling_utils.get_parameter_dtype = _get_parameter_dtype
    except Exception as exc:
        logger.debug("Could not patch transformers.modeling_utils: %s", exc)


def _ensure_onnxscript() -> None:
    """Ensure onnxscript is installed for PyTorch ONNX exporter."""
    import importlib

    try:
        importlib.import_module("onnxscript")
    except ImportError:
        logger.info(
            "onnxscript is required for PyTorch ONNX exporter. Installing via uv/pip..."
        )
        import subprocess

        try:
            subprocess.check_call(["uv", "pip", "install", "onnxscript"])
        except Exception:
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install", "onnxscript"]
            )


def export_via_torch_onnx(
    model_path: str,
    output_dir: Path,
    quantize_int8: bool = True,
) -> Path:
    """Fallback: export SentenceTransformer model directly using PyTorch ONNX."""
    import importlib

    _ensure_onnxscript()

    torch = importlib.import_module("torch")
    st_mod = importlib.import_module("sentence_transformers")
    SentenceTransformer = st_mod.SentenceTransformer
    transformers_mod = importlib.import_module("transformers")
    AutoTokenizer = transformers_mod.AutoTokenizer

    output_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Loading model on CPU for ONNX export: %s...", model_path)
    model = SentenceTransformer(model_path, device="cpu")
    # Ensure all parameters and computation graph are pure float32, removing any bfloat16 tensors
    model = model.float()
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    tokenizer.save_pretrained(str(output_dir))

    class SentenceEmbeddingWrapper(torch.nn.Module):
        def __init__(self, st):
            super().__init__()
            self.st = st

        def forward(
            self, input_ids: torch.Tensor, attention_mask: torch.Tensor
        ) -> torch.Tensor:
            features = {"input_ids": input_ids, "attention_mask": attention_mask}
            out = self.st(features)
            return out["sentence_embedding"].float()

    wrapper = SentenceEmbeddingWrapper(model).eval()
    dummy = tokenizer(["sample search query for tab discovery"], return_tensors="pt")

    onnx_path = output_dir / "model.onnx"
    logger.info("Tracing and exporting to %s...", onnx_path)
    torch.onnx.export(
        wrapper,
        (dummy["input_ids"], dummy["attention_mask"]),
        str(onnx_path),
        input_names=["input_ids", "attention_mask"],
        output_names=["sentence_embedding"],
        dynamic_axes={
            "input_ids": {0: "batch_size", 1: "sequence_length"},
            "attention_mask": {0: "batch_size", 1: "sequence_length"},
            "sentence_embedding": {0: "batch_size"},
        },
        opset_version=17,
        do_constant_folding=True,
    )
    logger.info("Base ONNX model successfully exported: %s", onnx_path)

    if quantize_int8:
        int8_dir = output_dir / "int8"
        int8_dir.mkdir(parents=True, exist_ok=True)
        tokenizer.save_pretrained(str(int8_dir))
        int8_onnx_path = int8_dir / "model_int8.onnx"

        ort_quant = importlib.import_module("onnxruntime.quantization")
        quantize_dynamic = ort_quant.quantize_dynamic
        QuantType = ort_quant.QuantType

        logger.info("Applying dynamic INT8 quantization to %s...", int8_onnx_path)
        quantize_dynamic(
            model_input=str(onnx_path),
            model_output=str(int8_onnx_path),
            weight_type=QuantType.QInt8,
        )
        logger.info(
            "INT8 ONNX model ready for WebGPU / NPU / CPU: %s",
            int8_onnx_path,
        )
        shutil.copy2(int8_onnx_path, output_dir / "model_int8.onnx")
        # Also copy as model_quantized.onnx for full backward compatibility
        shutil.copy2(int8_onnx_path, output_dir / "model_quantized.onnx")
        return int8_dir

    return output_dir


def export_to_onnx(
    model_path: str,
    output_dir: Path,
    quantize_int8: bool = True,
) -> Path:
    """Export SentenceTransformer model to ONNX and model_int8.onnx with dynamic INT8 quantization."""
    return export_via_torch_onnx(
        model_path=model_path,
        output_dir=output_dir,
        quantize_int8=quantize_int8,
    )


def create_ollama_modelfile(
    model_name_or_path: str,
    output_file: Path,
) -> None:
    """Generate an Ollama Modelfile for serving via http://localhost:11434."""
    output_file.parent.mkdir(parents=True, exist_ok=True)

    abs_path = Path(model_name_or_path).resolve()
    target_path = str(abs_path) if abs_path.exists() else model_name_or_path

    sys_instruction = (
        'SYSTEM """You are an expert embedding encoder optimized for '
        'browser tab organization and semantic clustering."""'
    )
    content = f"""# Ollama Modelfile for Tabman EmbeddingGemma 2
FROM {target_path}

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
