"""Configuration and secret-boundary tests."""

import json
from pathlib import Path

import pytest

import tabman.config as config_module
from tabman.config import (
    AppConfig,
    public_config,
    resolve_secret,
    save_config,
    store_secret,
)


def test_config_round_trip_and_public_view_exclude_secret_values(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(config_module, "config_dir", lambda: tmp_path)
    monkeypatch.delenv("MISTRAL_API_KEY", raising=False)
    expected = AppConfig(
        vault_path=tmp_path / "vault.sqlite3",
        provider="mistral",
        mistral_base_url="https://mistral.example/v1",
    )

    save_config(expected)
    store_secret("mistral", "top-secret-value")

    assert config_module.load_config() == expected
    view = json.dumps(public_config(expected))
    assert "mistral" in view
    assert "top-secret-value" not in view
    assert resolve_secret("mistral", prompt=False) == "top-secret-value"


def test_environment_secret_takes_precedence(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(config_module, "config_dir", lambda: tmp_path)
    store_secret("gemini", "file-secret")
    monkeypatch.setenv("GEMINI_API_KEY", "environment-secret")

    assert resolve_secret("gemini", prompt=False) == "environment-secret"
