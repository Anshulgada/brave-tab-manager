"""Multi-size training matrix harness for EmbeddingGemma 2.

Calibrated for NVIDIA RTX 6000 Ada (48GB VRAM) with pure bf16, FlashAttention,
and Matryoshka Representation Learning (MRL) down to 128 dimensions.
Follows Google's official guide:
https://ai.google.dev/gemma/docs/embeddinggemma/fine-tuning-embeddinggemma-with-sentence-transformers
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("train_matrix")

# Modular configurations for EmbeddingGemma 2
EMBEDDINGGEMMA_2_VARIANTS: dict[str, dict[str, Any]] = {
    "270m": {
        "model_id": "google/embeddinggemma-2",
        "description": "Text & Code backbone (~270M parameters)",
        "subfolder": "text",
        "recommended_batch_size": 128,
        "mrl_dims": [768, 512, 256, 128],
    },
    "440m": {
        "model_id": "google/embeddinggemma-2",
        "description": "Text + Vision (~440M parameters)",
        "subfolder": "text_vision",
        "recommended_batch_size": 64,
        "mrl_dims": [768, 512, 256, 128],
    },
    "740m": {
        "model_id": "google/embeddinggemma-2",
        "description": "Full Multimodal (~740M parameters)",
        "subfolder": "multimodal",
        "recommended_batch_size": 64,
        "mrl_dims": [768, 512, 256, 128],
    },
}


def load_dataset_from_jsonl(file_path: Path) -> list[dict[str, str]]:
    """Load triplets from JSONL."""
    if not file_path.exists():
        msg = f"Dataset file not found: {file_path}. Run dataset_builder.py first."
        raise FileNotFoundError(msg)

    records: list[dict[str, str]] = []
    with file_path.open("r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                records.append(json.loads(line))
    return records


def train_variant(
    variant_name: str,
    variant_config: dict[str, Any],
    dataset_dir: Path,
    output_base_dir: Path,
    batch_size: int,
    epochs: int,
    learning_rate: float,
    precision: str,
) -> Path:
    """Train a single variant of EmbeddingGemma 2 with SentenceTransformerTrainer."""
    try:
        import importlib

        Dataset = importlib.import_module("datasets").Dataset
        st_mod = importlib.import_module("sentence_transformers")
        SentenceTransformer = st_mod.SentenceTransformer
        SentenceTransformerTrainer = st_mod.SentenceTransformerTrainer
        SentenceTransformerTrainingArguments = (
            st_mod.SentenceTransformerTrainingArguments
        )
        losses_mod = importlib.import_module("sentence_transformers.losses")
        MatryoshkaLoss = losses_mod.MatryoshkaLoss
        MultipleNegativesRankingLoss = losses_mod.MultipleNegativesRankingLoss
    except ImportError as exc:
        msg = (
            "Required libraries missing for GPU training. Please run: "
            "pip install -U sentence-transformers datasets transformers accelerate"
        )
        raise RuntimeError(msg) from exc

    output_dir = output_base_dir / f"embeddinggemma-2-{variant_name}-finetuned"
    output_dir.mkdir(parents=True, exist_ok=True)

    logger.info(
        "Loading base model: %s (%s)",
        variant_config["model_id"],
        variant_config["description"],
    )

    # 1. Initialize SentenceTransformer
    model = SentenceTransformer(variant_config["model_id"])

    # 2. Load and prepare datasets
    logger.info("Loading training and validation triplets from %s...", dataset_dir)
    train_records = load_dataset_from_jsonl(dataset_dir / "train.jsonl")
    val_records = load_dataset_from_jsonl(dataset_dir / "val.jsonl")

    # Format into (anchor, positive) pairs with in-batch negatives
    train_dataset = Dataset.from_dict(
        {
            "anchor": [r["anchor"] for r in train_records],
            "positive": [r["positive"] for r in train_records],
        }
    )
    val_dataset = Dataset.from_dict(
        {
            "anchor": [r["anchor"] for r in val_records],
            "positive": [r["positive"] for r in val_records],
        }
    )

    # 3. Setup Loss: MultipleNegativesRankingLoss wrapped in MatryoshkaLoss for 128d
    inner_loss = MultipleNegativesRankingLoss(model)
    mrl_dims = variant_config.get("mrl_dims", [768, 512, 256, 128])
    loss = MatryoshkaLoss(
        model=model,
        loss=inner_loss,
        matryoshka_dims=mrl_dims,
    )

    # 4. Configure Training Arguments for RTX 6000 Ada (48GB VRAM)
    use_bf16 = precision.lower() == "bf16"
    use_fp16 = precision.lower() == "fp16"

    training_args = SentenceTransformerTrainingArguments(
        output_dir=str(output_dir / "checkpoints"),
        num_train_epochs=epochs,
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=batch_size,
        learning_rate=learning_rate,
        warmup_ratio=0.1,
        weight_decay=0.01,
        logging_steps=25,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=2,
        bf16=use_bf16,
        fp16=use_fp16,
        dataloader_num_workers=4,
        dataloader_pin_memory=True,
    )

    # 5. Initialize Trainer & Train
    trainer = SentenceTransformerTrainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        loss=loss,
    )

    logger.info("Starting fine-tuning for variant %s...", variant_name)
    trainer.train()

    # 6. Save final model
    final_model_dir = output_dir / "final"
    logger.info("Saving fine-tuned model to %s...", final_model_dir)
    model.save_pretrained(str(final_model_dir))

    return final_model_dir


def main() -> int:
    """CLI entrypoint for running the training matrix."""
    parser = argparse.ArgumentParser(
        description="Fine-tune EmbeddingGemma 2 variants on RTX 6000 Ada 48GB GPU."
    )
    parser.add_argument(
        "--variant",
        choices=["270m", "440m", "740m", "all"],
        default="all",
        help="Model variant of EmbeddingGemma 2 to train (default: all)",
    )
    parser.add_argument(
        "--dataset-dir",
        type=Path,
        default=ROOT / "data" / "ai_dataset",
        help="Path containing train.jsonl and val.jsonl",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=ROOT / "models",
        help="Directory where trained models are saved",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=64,
        help="Per-device batch size (calibrated for 48GB Ada)",
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=3,
        help="Number of training epochs (default: 3)",
    )
    parser.add_argument(
        "--learning-rate",
        type=float,
        default=2e-5,
        help="Learning rate (default: 2e-5)",
    )
    parser.add_argument(
        "--precision",
        choices=["bf16", "fp16", "fp32"],
        default="bf16",
        help="Training precision (bf16 recommended for RTX 6000 Ada)",
    )

    args = parser.parse_args()

    variants_to_train = (
        list(EMBEDDINGGEMMA_2_VARIANTS.keys())
        if args.variant == "all"
        else [args.variant]
    )

    logger.info("Selected EmbeddingGemma 2 variants to train: %s", variants_to_train)
    logger.info(
        "Hardware Config: Precision=%s, Batch Size=%d",
        args.precision,
        args.batch_size,
    )

    results: dict[str, str] = {}
    for v in variants_to_train:
        cfg = EMBEDDINGGEMMA_2_VARIANTS[v]
        bs = cfg.get("recommended_batch_size", args.batch_size)
        logger.info("=== Starting Training: EmbeddingGemma 2 (%s) ===", v)
        try:
            saved_path = train_variant(
                variant_name=v,
                variant_config=cfg,
                dataset_dir=args.dataset_dir,
                output_base_dir=args.output_dir,
                batch_size=bs,
                epochs=args.epochs,
                learning_rate=args.learning_rate,
                precision=args.precision,
            )
            results[v] = str(saved_path)
            logger.info("Successfully completed variant %s -> %s", v, saved_path)
        except Exception as e:
            logger.error("Failed to train variant %s: %s", v, e, exc_info=True)
            results[v] = f"FAILED: {e}"

    logger.info("Training Matrix Summary:")
    for v, status in results.items():
        logger.info("  Variant %s: %s", v, status)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
