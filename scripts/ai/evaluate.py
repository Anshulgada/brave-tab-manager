"""Evaluation benchmark harness for EmbeddingGemma 2.

Tests fine-tuned models on held-out test.jsonl across:
1. Triplet ranking accuracy: cosine(anchor, pos) > cosine(anchor, neg)
2. Mean cosine margin: avg(cosine(anchor, pos) - cosine(anchor, neg))
3. Matryoshka dimension truncation: 768d vs 512d vs 256d vs 128d
4. Per-domain breakdown across the 12 web verticals
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
logger = logging.getLogger("evaluate")


def load_test_triplets(test_file: Path) -> list[dict[str, Any]]:
    """Load evaluation test triplets from JSONL."""
    if not test_file.exists():
        msg = f"Test file not found: {test_file}. Run dataset_builder.py first."
        raise FileNotFoundError(msg)

    records: list[dict[str, Any]] = []
    with test_file.open("r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                records.append(json.loads(line))
    return records


def evaluate_model(
    model_path_or_id: str,
    test_triplets: list[dict[str, Any]],
    mrl_dimensions: list[int] | None = None,
    batch_size: int = 64,
) -> dict[str, Any]:
    """Run full evaluation suite over triplets across multiple MRL dimensions."""
    try:
        import importlib

        np = importlib.import_module("numpy")
        st_mod = importlib.import_module("sentence_transformers")
        SentenceTransformer = st_mod.SentenceTransformer
    except ImportError as exc:
        msg = (
            "sentence-transformers and numpy are required: "
            "pip install sentence-transformers numpy"
        )
        raise RuntimeError(msg) from exc

    if mrl_dimensions is None:
        mrl_dimensions = [768, 512, 256, 128]

    logger.info("Loading model from %s...", model_path_or_id)
    model = SentenceTransformer(model_path_or_id)

    anchors = [t["anchor"] for t in test_triplets]
    positives = [t["positive"] for t in test_triplets]
    negatives = [t["negative"] for t in test_triplets]

    logger.info("Encoding %d test triplets...", len(test_triplets))
    anchor_embs = model.encode(
        anchors, batch_size=batch_size, normalize_embeddings=True
    )
    positive_embs = model.encode(
        positives, batch_size=batch_size, normalize_embeddings=True
    )
    negative_embs = model.encode(
        negatives, batch_size=batch_size, normalize_embeddings=True
    )

    results: dict[str, Any] = {"mrl_dimensions": {}}

    for dim in mrl_dimensions:
        logger.info("Evaluating Matryoshka dimension: %d-dim...", dim)
        # Truncate and re-normalize for MRL evaluation
        a_dim = anchor_embs[:, :dim]
        p_dim = positive_embs[:, :dim]
        n_dim = negative_embs[:, :dim]

        # Re-normalize vectors
        a_norm = a_dim / np.linalg.norm(a_dim, axis=1, keepdims=True)
        p_norm = p_dim / np.linalg.norm(p_dim, axis=1, keepdims=True)
        n_norm = n_dim / np.linalg.norm(n_dim, axis=1, keepdims=True)

        # Dot product of normalized vectors = Cosine similarity
        pos_sims = np.sum(a_norm * p_norm, axis=1)
        neg_sims = np.sum(a_norm * n_norm, axis=1)

        correct = pos_sims > neg_sims
        accuracy = float(np.mean(correct))
        margin = float(np.mean(pos_sims - neg_sims))

        # Domain breakdown for this dimension
        domain_correct: dict[str, list[bool]] = {}
        for idx, t in enumerate(test_triplets):
            domain = t.get("domain", "unknown")
            domain_correct.setdefault(domain, []).append(bool(correct[idx]))

        domain_accs = {
            dom: float(np.mean(hits)) for dom, hits in domain_correct.items()
        }

        results["mrl_dimensions"][str(dim)] = {
            "accuracy": round(accuracy * 100, 2),
            "mean_margin": round(margin, 4),
            "domain_accuracies": {k: round(v * 100, 1) for k, v in domain_accs.items()},
        }

    return results


def print_evaluation_report(model_name: str, results: dict[str, Any]) -> None:
    """Print structured, readable evaluation summary."""
    print("\n" + "=" * 70)
    print(f"EVALUATION BENCHMARK REPORT: {model_name}")
    print("=" * 70)
    print(f"{'Dimension':<12} | {'Accuracy (%)':<15} | {'Mean Cosine Margin':<20}")
    print("-" * 70)

    for dim, stats in results["mrl_dimensions"].items():
        acc_str = f"{stats['accuracy']:<15.2f}%"
        margin_str = f"{stats['mean_margin']:<20.4f}"
        print(f"{dim + 'd':<12} | {acc_str} | {margin_str}")

    print("-" * 70)
    # Print domain breakdown for 128d (the target browser deployment dimension)
    if "128" in results["mrl_dimensions"]:
        print("\nDomain-by-Domain Accuracy at 128-dim (Target Browser Runtime):")
        dom_stats = results["mrl_dimensions"]["128"]["domain_accuracies"]
        for dom, acc in sorted(dom_stats.items()):
            bar = "█" * int(acc // 5)
            print(f"  {dom:<25} : {acc:>5.1f}% | {bar}")
    print("=" * 70 + "\n")


def main() -> int:
    """CLI entrypoint for running evaluation benchmark."""
    parser = argparse.ArgumentParser(
        description="Evaluate fine-tuned EmbeddingGemma 2 models."
    )
    parser.add_argument(
        "--model",
        type=str,
        required=True,
        help="Path or Hugging Face ID of the model to evaluate",
    )
    parser.add_argument(
        "--test-file",
        type=Path,
        default=ROOT / "data" / "ai_dataset" / "test.jsonl",
        help="Path to held-out test.jsonl",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=64,
        help="Batch size for encoding",
    )
    parser.add_argument(
        "--save-json",
        type=Path,
        default=None,
        help="Optional path to save JSON metrics report",
    )

    args = parser.parse_args()

    test_triplets = load_test_triplets(args.test_file)
    logger.info("Loaded %d test triplets from %s", len(test_triplets), args.test_file)

    results = evaluate_model(
        model_path_or_id=args.model,
        test_triplets=test_triplets,
        batch_size=args.batch_size,
    )

    print_evaluation_report(args.model, results)

    if args.save_json:
        args.save_json.parent.mkdir(parents=True, exist_ok=True)
        with args.save_json.open("w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)
        logger.info("Saved evaluation JSON report to %s", args.save_json)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
