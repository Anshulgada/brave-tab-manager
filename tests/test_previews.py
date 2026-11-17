"""Tests for hierarchical on-disk preview storage and deduplication."""

import json
from pathlib import Path

from tabman.previews import (
    delete_collection_previews,
    delete_tab_preview,
    find_existing_preview_dir,
    list_previews,
    save_tab_preview,
    slugify,
    url_slug,
)


def test_slugify() -> None:
    assert slugify("Reading List 2026!") == "reading-list-2026"
    assert slugify("   ") == "item"
    assert slugify("Work & Research") == "work-research"


def test_url_slug_stability() -> None:
    s1 = url_slug("https://github.com/Anshulgada/brave-tab-manager")
    s2 = url_slug("https://github.com/Anshulgada/brave-tab-manager")
    assert s1 == s2
    assert "github" in s1


def test_save_and_deduplicate_previews(tmp_path: Path) -> None:
    url = "https://example.com/article-1"
    meta = {
        "title": "Example Article",
        "description": "A very useful article",
        "site": "example.com",
        "author": "Jane Doe",
    }

    # Save to collection A
    dir_a = save_tab_preview("Research", url, meta, root=tmp_path)
    assert dir_a.exists()
    assert (dir_a / "preview.json").exists()

    with (dir_a / "preview.json").open("r", encoding="utf-8") as f:
        data = json.load(f)
    assert data["title"] == "Example Article"

    # Verify discovery
    found = find_existing_preview_dir(url, root=tmp_path)
    assert found is not None
    assert found.resolve() == dir_a.resolve()

    # Save same URL to collection B -> Must deduplicate via symlink/pointer
    dir_b = save_tab_preview("Daily Reading", url, meta, root=tmp_path)
    assert dir_b.exists()
    assert dir_a.resolve() == dir_b.resolve() or (dir_b / ".tabman_symlink").exists()

    # Listing previews should show both collections
    all_previews = list_previews(root=tmp_path)
    assert len(all_previews) == 2
    collections = {p["collection"] for p in all_previews}
    assert collections == {"research", "daily-reading"}

    # Deleting from collection A should preserve data in collection B (migrated)
    deleted = delete_tab_preview("Research", url, root=tmp_path)
    assert deleted is True

    # Collection B must still be intact and readable
    assert dir_b.exists()
    assert (dir_b / "preview.json").exists()

    # Clean up collection B
    col_cleaned = delete_collection_previews("Daily Reading", root=tmp_path)
    assert col_cleaned >= 1
    assert not dir_b.exists()
