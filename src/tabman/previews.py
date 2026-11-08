"""Hierarchical on-disk preview cache with cross-collection symlink deduplication.

Stores offline link preview metadata and thumbnails under:
    %LOCALAPPDATA%\\tabman\\previews\\<collection_slug>\\<tab_slug>\\preview.json

If a tab exists across multiple collections, duplicate entries are stored as
symlinks pointing back to the primary canonical folder, eliminating redundant storage.
When tabs or collections are removed, assets and symlinks are cleanly pruned.
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import os
import re
import shutil
import urllib.parse
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from tabman.config import previews_dir


def slugify(text: str, max_length: int = 48) -> str:
    """Generate a clean, filesystem-safe directory slug."""
    text = re.sub(r"[^\w\s-]", "", text.strip().lower())
    text = re.sub(r"[-\s]+", "-", text).strip("-")
    if not text:
        text = "item"
    return text[:max_length].rstrip("-")


def url_slug(url: str) -> str:
    """Generate a stable, descriptive directory name for a URL."""
    try:
        parsed = urllib.parse.urlsplit(url)
        host = parsed.netloc.split(":")[0].replace("www.", "")
        path_frag = parsed.path.strip("/").replace("/", "-")
        host_slug = slugify(host, max_length=24)
        path_slug = slugify(path_frag, max_length=20) if path_frag else ""
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:8]
        if path_slug:
            return f"{host_slug}-{path_slug}-{digest}"
        return f"{host_slug}-{digest}"
    except Exception:
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:12]
        return f"url-{digest}"


def get_previews_root() -> Path:
    """Return the base directory for disk preview storage."""
    return previews_dir()


def find_existing_preview_dir(url: str, root: Path | None = None) -> Path | None:
    """Search existing collection dirs for a primary (non-symlink) preview of url."""
    base = root or get_previews_root()
    if not base.exists():
        return None

    target_hash = hashlib.sha256(url.strip().encode("utf-8")).hexdigest()

    with contextlib.suppress(Exception):
        for col_entry in os.scandir(base):
            if not col_entry.is_dir(follow_symlinks=False):
                continue
            for tab_entry in os.scandir(col_entry.path):
                # We want the real canonical folder, not a symlink
                if (
                    tab_entry.is_dir(follow_symlinks=False)
                    and not tab_entry.is_symlink()
                ):
                    meta_path = Path(tab_entry.path) / "preview.json"
                    if meta_path.is_file():
                        try:
                            with meta_path.open("r", encoding="utf-8") as f:
                                data = json.load(f)
                            existing_url = data.get("url", "")
                            if (
                                existing_url.strip() == url.strip()
                                or hashlib.sha256(
                                    existing_url.strip().encode("utf-8")
                                ).hexdigest()
                                == target_hash
                            ):
                                return Path(tab_entry.path)
                        except OSError, json.JSONDecodeError, UnicodeDecodeError:
                            continue

    return None


def _create_symlink_or_copy(source: Path, target: Path) -> None:
    """Create a directory symlink or junction, falling back to relative pointer."""
    try:
        os.symlink(source.resolve(), target, target_is_directory=True)
    except OSError, NotImplementedError:
        # On Windows without Dev Mode, symlinks can fail with privilege error.
        # Fall back to a lightweight pointer file or directory clone
        target.mkdir(parents=True, exist_ok=True)
        pointer = target / ".tabman_symlink"
        pointer.write_text(str(source.resolve()), encoding="utf-8")
        src_json = source / "preview.json"
        if src_json.exists():
            shutil.copy2(src_json, target / "preview.json")


def save_tab_preview(
    collection_name: str,
    url: str,
    metadata: dict[str, Any],
    image_bytes: bytes | None = None,
    root: Path | None = None,
) -> Path:
    """Persist tab preview metadata to disk with cross-collection deduplication."""
    base = root or get_previews_root()
    col_slug = slugify(collection_name) or "default"
    t_slug = url_slug(url)

    col_dir = base / col_slug
    col_dir.mkdir(parents=True, exist_ok=True)
    target_tab_dir = col_dir / t_slug

    # If it already exists in this exact collection, update metadata and return
    if target_tab_dir.exists():
        if target_tab_dir.is_symlink():
            real_dir = target_tab_dir.resolve()
        else:
            real_dir = target_tab_dir
        json_path = real_dir / "preview.json"
        with (
            contextlib.suppress(Exception),
            json_path.open("w", encoding="utf-8") as f,
        ):
            json.dump(metadata, f, indent=2)
        return target_tab_dir

    # Check if this URL is already stored in another collection
    existing_primary = find_existing_preview_dir(url, root=base)

    if existing_primary and existing_primary != target_tab_dir:
        # Deduplicate: create a symlink to the primary collection copy
        _create_symlink_or_copy(existing_primary, target_tab_dir)
        return target_tab_dir

    # Otherwise create a fresh primary directory
    target_tab_dir.mkdir(parents=True, exist_ok=True)
    record = {
        "url": url,
        "title": metadata.get("title", ""),
        "description": metadata.get("description", ""),
        "site": metadata.get("site", ""),
        "author": metadata.get("author", ""),
        "favicon": metadata.get("favicon", ""),
        "thumbnailUrl": metadata.get("thumbnailUrl", ""),
        "savedAt": datetime.now(UTC).isoformat(),
        **metadata,
    }

    json_path = target_tab_dir / "preview.json"
    with json_path.open("w", encoding="utf-8") as f:
        json.dump(record, f, indent=2)

    if image_bytes:
        ext = ".png" if image_bytes[:8].startswith(b"\x89PNG") else ".jpg"
        img_path = target_tab_dir / f"thumbnail{ext}"
        img_path.write_bytes(image_bytes)

    return target_tab_dir


def delete_tab_preview(
    collection_name: str,
    url: str,
    root: Path | None = None,
) -> bool:
    """Remove a tab preview from a collection, preserving remaining symlink targets."""
    base = root or get_previews_root()
    col_slug = slugify(collection_name) or "default"
    t_slug = url_slug(url)

    target_dir = base / col_slug / t_slug
    if not target_dir.exists() and not target_dir.is_symlink():
        return False

    # Case 1: Target is a symlink or pointer
    if target_dir.is_symlink():
        target_dir.unlink()
        return True

    pointer = target_dir / ".tabman_symlink"
    if pointer.is_file():
        shutil.rmtree(target_dir, ignore_errors=True)
        return True

    # Case 2: Target is the primary copy. Find any other collections pointing to it.
    canonical_path = target_dir.resolve()
    dependent_symlinks: list[Path] = []

    with contextlib.suppress(Exception):
        for c in os.scandir(base):
            if not c.is_dir(follow_symlinks=False) or c.name == col_slug:
                continue
            for t in os.scandir(c.path):
                tab_p = Path(t.path)
                if tab_p.is_symlink():
                    with contextlib.suppress(Exception):
                        if tab_p.resolve() == canonical_path:
                            dependent_symlinks.append(tab_p)
                elif (tab_p / ".tabman_symlink").is_file():
                    with contextlib.suppress(Exception):
                        ref = (
                            (tab_p / ".tabman_symlink")
                            .read_text(encoding="utf-8")
                            .strip()
                        )
                        if Path(ref).resolve() == canonical_path:
                            dependent_symlinks.append(tab_p)

    if dependent_symlinks:
        # Migrate primary storage to the first dependent collection
        new_primary = dependent_symlinks[0]
        if new_primary.is_symlink():
            new_primary.unlink()
        else:
            shutil.rmtree(new_primary, ignore_errors=True)

        # Move files from old primary to new primary
        shutil.move(str(canonical_path), str(new_primary))

        # Re-point any remaining dependents to new primary
        for dep in dependent_symlinks[1:]:
            if dep.is_symlink():
                dep.unlink()
            else:
                shutil.rmtree(dep, ignore_errors=True)
            _create_symlink_or_copy(new_primary, dep)
    else:
        # No dependents; safely delete primary from disk
        shutil.rmtree(canonical_path, ignore_errors=True)

    return True


def delete_collection_previews(
    collection_name: str,
    root: Path | None = None,
) -> int:
    """Delete all preview assets for a collection, pruning folder from disk."""
    base = root or get_previews_root()
    col_slug = slugify(collection_name) or "default"
    col_dir = base / col_slug
    if not col_dir.exists():
        return 0

    count = 0
    with contextlib.suppress(Exception):
        for entry in list(os.scandir(col_dir)):
            tab_dir = Path(entry.path)
            meta = tab_dir / "preview.json"
            url = ""
            if meta.is_file():
                with (
                    contextlib.suppress(Exception),
                    meta.open("r", encoding="utf-8") as f,
                ):
                    url = json.load(f).get("url", "")
            if url:
                if delete_tab_preview(collection_name, url, root=base):
                    count += 1
            else:
                if tab_dir.is_symlink():
                    tab_dir.unlink()
                else:
                    shutil.rmtree(tab_dir, ignore_errors=True)
                count += 1

    with contextlib.suppress(Exception):
        shutil.rmtree(col_dir, ignore_errors=True)

    return count


def list_previews(
    collection_name: str | None = None,
    root: Path | None = None,
) -> list[dict[str, Any]]:
    """List stored previews from disk hierarchy, with symlink status."""
    base = root or get_previews_root()
    if not base.exists():
        return []

    results: list[dict[str, Any]] = []
    collections = (
        [slugify(collection_name)]
        if collection_name
        else [c.name for c in os.scandir(base) if c.is_dir(follow_symlinks=False)]
    )

    for col in collections:
        col_dir = base / col
        if not col_dir.is_dir():
            continue
        for entry in os.scandir(col_dir):
            tab_path = Path(entry.path)
            is_sym = entry.is_symlink() or (tab_path / ".tabman_symlink").is_file()
            meta_path = tab_path / "preview.json"
            if meta_path.is_file():
                with (
                    contextlib.suppress(Exception),
                    meta_path.open("r", encoding="utf-8") as f,
                ):
                    data = json.load(f)
                    results.append(
                        {
                            "collection": col,
                            "slug": entry.name,
                            "path": str(tab_path),
                            "isSymlink": is_sym,
                            "metadata": data,
                        }
                    )

    return results
