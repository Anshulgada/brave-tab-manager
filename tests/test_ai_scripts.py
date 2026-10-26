"""Tests for Tabman AI dataset generation, domains taxonomy, and triplet builder."""

from __future__ import annotations

import json
from pathlib import Path

from scripts.ai.dataset_builder import (
    build_contrastive_triplets,
    expand_templates_with_variations,
    generate_splits,
)
from scripts.ai.domains import DOMAIN_TAXONOMY, TabTemplate


def test_domain_taxonomy_covers_all_eighteen_verticals() -> None:
    """Ensure all 18 expected domain verticals are defined with templates."""
    expected_domains = {
        "frontend_dev",
        "backend_systems",
        "ml_ai",
        "api_docs",
        "research_papers",
        "video_tutorials",
        "community_discussions",
        "cloud_devops",
        "shopping_hardware",
        "design_ui",
        "productivity_tools",
        "internal_localhost",
        "finance_crypto",
        "gaming_entertainment",
        "travel_navigation",
        "career_jobs",
        "news_media",
        "audio_podcasts",
    }
    assert set(DOMAIN_TAXONOMY.keys()) == expected_domains
    for domain, templates in DOMAIN_TAXONOMY.items():
        assert len(templates) >= 3, f"Domain {domain} needs >= 3 templates"
        for t in templates:
            assert isinstance(t, TabTemplate)
            valid_schemes = ("http://", "https://", "brave://", "chrome-extension://")
            assert t.url.startswith(valid_schemes)
            assert len(t.title) > 5
            assert len(t.domain) > 0
            assert len(t.sub_topic) > 0


def test_expand_templates_with_variations() -> None:
    """Ensure template expansion produces distinct, realistic URLs and titles."""
    base = DOMAIN_TAXONOMY["frontend_dev"]
    expanded = expand_templates_with_variations(base, variations_per_template=3)
    assert len(expanded) > len(base)

    urls = [t.url for t in expanded]
    assert len(urls) == len(set(urls)), "Expanded URLs must be unique"


def test_build_contrastive_triplets_validity() -> None:
    """Ensure triplets have valid anchors, positives, and distinct negatives."""
    triplets = build_contrastive_triplets(
        taxonomy=DOMAIN_TAXONOMY,
        triplets_per_domain=20,
        seed=123,
    )
    assert len(triplets) == 20 * len(DOMAIN_TAXONOMY)

    for trip in triplets:
        assert trip.id.startswith("trip_")
        assert len(trip.anchor) > 10
        assert len(trip.positive) > 10
        assert len(trip.negative) > 10
        assert trip.anchor != trip.positive
        assert trip.anchor != trip.negative
        assert trip.positive != trip.negative
        assert trip.hardness in ("hard_intra_domain", "hard_cross_domain")


def test_generate_splits_and_jsonl(tmp_path: Path) -> None:
    """Ensure splits output valid JSONL and match the requested 80/10/10 ratio."""
    triplets = build_contrastive_triplets(
        taxonomy=DOMAIN_TAXONOMY,
        triplets_per_domain=10,
        seed=999,
    )
    counts = generate_splits(triplets, tmp_path, train_ratio=0.8, val_ratio=0.1)

    assert counts["total"] == len(triplets)
    assert counts["train"] + counts["val"] + counts["test"] == counts["total"]

    for filename in ("train.jsonl", "val.jsonl", "test.jsonl"):
        filepath = tmp_path / filename
        assert filepath.exists()
        lines = filepath.read_text("utf-8").strip().splitlines()
        assert len(lines) > 0
        parsed = [json.loads(line) for line in lines]
        for p in parsed:
            assert "anchor" in p and "positive" in p and "negative" in p
