"""Test tab categorization accuracy using fine-tuned EmbeddingGemma 2.

Encodes realistic browser tabs into 128-dimensional Matryoshka embeddings
and classifies them against the 18 domain centroid vectors via cosine similarity.
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.ai.domains import DOMAIN_TAXONOMY  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("test_categorization")

DOMAIN_DISPLAY_NAMES: dict[str, str] = {
    "frontend_dev": "Frontend & UI Engineering",
    "backend_systems": "Backend & Systems",
    "ml_ai": "Machine Learning & AI",
    "api_docs": "API References & Docs",
    "research_papers": "Research & Academic Papers",
    "video_tutorials": "Video & Tutorials",
    "community_discussions": "Community & Discussions",
    "cloud_devops": "Cloud & DevOps",
    "shopping_hardware": "Shopping & Hardware",
    "design_ui": "Design & UX",
    "productivity_tools": "Productivity & Workspace",
    "internal_localhost": "Localhost & Internal Dev",
    "finance_crypto": "Finance & Markets",
    "gaming_entertainment": "Gaming & Esports",
    "travel_navigation": "Travel & Navigation",
    "career_jobs": "Career & Jobs",
    "news_media": "News & Media",
    "audio_podcasts": "Audio & Podcasts",
}

# 12 diverse test tabs spanning distinct domains
SAMPLE_TABS = [
    {
        "url": "https://react.dev/reference/react/useState",
        "title": "useState - React Documentation",
        "expected": "frontend_dev",
    },
    {
        "url": "https://github.com/facebook/react/pull/28231",
        "title": "feat(react-compiler): add memoization analysis for custom hooks",
        "expected": "frontend_dev",
    },
    {
        "url": "https://docs.aws.amazon.com/AmazonECS/latest/developerguide/welcome.html",
        "title": "What is Amazon Elastic Container Service? - Amazon ECS Documentation",
        "expected": "cloud_devops",
    },
    {
        "url": "https://registry.terraform.io/providers/hashicorp/aws/latest/docs",
        "title": "AWS Provider Overview | Terraform Registry",
        "expected": "cloud_devops",
    },
    {
        "url": "https://arxiv.org/abs/2402.12345",
        "title": "Matryoshka Representation Learning in Multimodal Transformer Embeddings",
        "expected": "research_papers",
    },
    {
        "url": "https://huggingface.co/google/embeddinggemma-2",
        "title": "google/embeddinggemma-2 · Hugging Face Model Card",
        "expected": "ml_ai",
    },
    {
        "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "title": "Rick Astley - Never Gonna Give You Up (Official Music Video)",
        "expected": "video_tutorials",
    },
    {
        "url": "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
        "title": "Today's Top Hits - Spotify Music Playlist",
        "expected": "audio_podcasts",
    },
    {
        "url": "https://stripe.com/docs/api/charges/create",
        "title": "Create a charge | Stripe Payments API Reference Documentation",
        "expected": "api_docs",
    },
    {
        "url": "https://www.amazon.com/dp/B0CX234567",
        "title": "NVIDIA GeForce RTX 4090 Gaming Graphics Card 24GB GDDR6X",
        "expected": "shopping_hardware",
    },
    {
        "url": "http://localhost:3000/dashboard",
        "title": "Vite + React Local Development Server - Tabman Dashboard",
        "expected": "internal_localhost",
    },
    {
        "url": "https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster",
        "title": "Why is processing a sorted array faster than processing an unsorted array? - Stack Overflow",
        "expected": "community_discussions",
    },
]


def load_model(model_name_or_path: str):
    """Load model from local path or Hugging Face Hub."""
    import importlib

    st_mod = importlib.import_module("sentence_transformers")
    SentenceTransformer = st_mod.SentenceTransformer

    logger.info("Loading model: %s...", model_name_or_path)
    return SentenceTransformer(model_name_or_path)


def compute_domain_centroids(model, mrl_dim: int = 128) -> tuple[list[str], Any]:
    """Compute 128-dimensional centroid embeddings for all 18 domains."""
    import importlib

    np = importlib.import_module("numpy")

    domain_keys = list(DOMAIN_TAXONOMY.keys())
    centroids = []

    for d_key in domain_keys:
        templates = DOMAIN_TAXONOMY[d_key]
        texts = [t.formatted_text for t in templates]
        embeddings = model.encode(texts, batch_size=64, normalize_embeddings=True)
        # Slice to Matryoshka dimension
        truncated = embeddings[:, :mrl_dim]
        # Average and re-normalize
        mean_vec = np.mean(truncated, axis=0)
        norm = np.linalg.norm(mean_vec)
        centroid = mean_vec / (norm if norm > 0 else 1.0)
        centroids.append(centroid)

    return domain_keys, np.array(centroids)


def test_categorization(
    model_path: str,
    mrl_dim: int = 128,
) -> None:
    """Run tab categorization benchmark against sample tabs."""
    import importlib

    np = importlib.import_module("numpy")

    model = load_model(model_path)
    domain_keys, centroids = compute_domain_centroids(model, mrl_dim=mrl_dim)

    tab_texts = [f"{t['title']} | {t['url']}" for t in SAMPLE_TABS]

    t0 = time.perf_counter()
    tab_embeddings = model.encode(tab_texts, normalize_embeddings=True)
    t1 = time.perf_counter()

    tab_embeddings_128d = tab_embeddings[:, :mrl_dim]
    # Re-normalize
    norms = np.linalg.norm(tab_embeddings_128d, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    tab_embeddings_128d = tab_embeddings_128d / norms

    # Compute cosine similarity matrix (N_tabs x 18_domains)
    sim_matrix = np.dot(tab_embeddings_128d, centroids.T)

    latency_ms = (t1 - t0) * 1000
    latency_per_tab = latency_ms / len(SAMPLE_TABS)

    print("\n" + "=" * 90)
    print(f"TABMAN AI CATEGORIZATION BENCHMARK (EmbeddingGemma 2 @ {mrl_dim}d MRL)")
    print(f"Total Inference Time: {latency_ms:.2f} ms ({latency_per_tab:.2f} ms / tab)")
    print("=" * 90)

    correct_count = 0
    header = f"{'Tab Title / URL':<35} | {'Predicted Category':<25} | {'Confidence':<10} | {'Status'}"
    print(header)
    print("-" * 90)

    for idx, tab in enumerate(SAMPLE_TABS):
        sims = sim_matrix[idx]
        best_idx = int(np.argmax(sims))
        best_domain = domain_keys[best_idx]
        confidence = float(sims[best_idx])
        is_correct = best_domain == tab["expected"]
        if is_correct:
            correct_count += 1

        status_str = (
            "✅ PASS" if is_correct else f"❌ MISMATCH (expected {tab['expected']})"
        )
        display_name = DOMAIN_DISPLAY_NAMES.get(best_domain, best_domain)
        short_title = (
            (tab["title"][:32] + "...") if len(tab["title"]) > 32 else tab["title"]
        )

        print(
            f"{short_title:<35} | {display_name:<25} | {confidence:+.4f}    | {status_str}"
        )

    accuracy = (correct_count / len(SAMPLE_TABS)) * 100
    print("=" * 90)
    print(
        f"FINAL CATEGORIZATION ACCURACY: {accuracy:.1f}% ({correct_count}/{len(SAMPLE_TABS)} tabs)"
    )
    print("=" * 90 + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Test tab categorization with EmbeddingGemma 2."
    )
    parser.add_argument(
        "--model",
        default="models/embeddinggemma-2-270m-finetuned/final",
        help="Path to model checkpoint or Hugging Face repo ID",
    )
    parser.add_argument(
        "--dim",
        type=int,
        default=128,
        help="Matryoshka dimension truncation (default: 128)",
    )
    args = parser.parse_args()

    test_categorization(args.model, mrl_dim=args.dim)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
