"""Configuration and secret-boundary tests."""

import json
from pathlib import Path

import pytest

import tabman.config as config_module
from tabman.config import (
    AppConfig,
    ProviderProfile,
    find_profile,
    provider_names,
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


@pytest.mark.parametrize(
    "payload",
    [
        {"vaultPath": None},
        {"vaultPath": 42},
        {"vaultPath": ""},
        {"provider": None},
        {"provider": "   "},
        {"mistralBaseUrl": 3},
        {"mistralBaseUrl": ""},
    ],
)
def test_load_config_rejects_malformed_field_types(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    payload: dict[str, object],
) -> None:
    monkeypatch.setattr(config_module, "config_dir", lambda: tmp_path)
    (tmp_path / "config.json").write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(ValueError):
        config_module.load_config()


def test_load_config_fills_missing_fields_with_safe_defaults(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(config_module, "config_dir", lambda: tmp_path)
    (tmp_path / "config.json").write_text("{}", encoding="utf-8")

    loaded = config_module.load_config()

    assert loaded.vault_path == config_module.default_vault_path()
    assert loaded.provider == "deterministic"
    assert loaded.mistral_base_url == "https://api.mistral.ai/v1"
    assert loaded.include_full_url_in_ai is False
    assert loaded.providers == ()


def test_provider_profiles_round_trip_through_the_config_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(config_module, "config_dir", lambda: tmp_path)
    profile = ProviderProfile(
        name="Local Ollama",
        base_url="http://127.0.0.1:11434/v1",
        model="llama3.1",
    )
    expected = AppConfig(
        vault_path=tmp_path / "vault.sqlite3",
        providers=(profile,),
    )

    save_config(expected)

    assert config_module.load_config() == expected
    view = public_config(expected)
    assert view["providers"] == [
        {
            "name": "Local Ollama",
            "baseUrl": "http://127.0.0.1:11434/v1",
            "model": "llama3.1",
            "apiFormat": "openai",
        }
    ]


def test_provider_environment_variable_is_derived_from_the_display_name() -> None:
    profile = ProviderProfile(
        name="My Gateway", base_url="https://api.example/v1", model="m"
    )

    assert profile.env_name == "TABMAN_MY_GATEWAY_API_KEY"


def test_provider_environment_variable_can_be_overridden() -> None:
    profile = ProviderProfile(
        name="My Gateway",
        base_url="https://api.example/v1",
        model="m",
        api_key_env="CUSTOM_KEY",  # pragma: allowlist secret
    )

    assert profile.env_name == "CUSTOM_KEY"


@pytest.mark.parametrize(
    "payload",
    [
        {"name": ""},
        {"name": 7},
        {"name": "a", "baseUrl": ""},
        {"name": "a", "baseUrl": "https://x.example/v1"},
        {"name": "a", "baseUrl": "https://x.example/v1", "model": ""},
        {
            "name": "a",
            "baseUrl": "https://x.example/v1",
            "model": "m",
            "apiFormat": "llama",
        },
        {
            "name": "a",
            "baseUrl": "https://x.example/v1",
            "model": "m",
            "apiKeyEnv": 5,
        },
        {
            "name": "a",
            "baseUrl": "http://api.example/v1",
            "model": "m",
        },
        "not-an-object",
    ],
)
def test_provider_profiles_reject_malformed_entries(payload: object) -> None:
    with pytest.raises(ValueError):
        ProviderProfile.from_dict(payload)


def test_load_config_rejects_duplicate_provider_names(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(config_module, "config_dir", lambda: tmp_path)
    entry = {
        "name": "Gateway",
        "baseUrl": "https://api.example/v1",
        "model": "m",
    }
    (tmp_path / "config.json").write_text(
        json.dumps({"providers": [entry, entry]}), encoding="utf-8"
    )

    with pytest.raises(ValueError, match="unique"):
        config_module.load_config()


def test_load_config_rejects_a_providers_field_that_is_not_a_list(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(config_module, "config_dir", lambda: tmp_path)
    (tmp_path / "config.json").write_text(
        json.dumps({"providers": {"name": "Gateway"}}), encoding="utf-8"
    )

    with pytest.raises(ValueError, match="array"):
        config_module.load_config()


def test_store_secret_uses_the_provider_environment_variable(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(config_module, "config_dir", lambda: tmp_path)

    store_secret("My Gateway", "typed-secret", env_var="TABMAN_MY_GATEWAY_API_KEY")

    assert (
        resolve_secret("My Gateway", prompt=False, env_var="TABMAN_MY_GATEWAY_API_KEY")
        == "typed-secret"
    )
    assert "typed-secret" not in json.dumps(
        public_config(AppConfig(vault_path=tmp_path / "vault.sqlite3"))
    )


def test_known_providers_include_builtins_and_configured_profiles(
    tmp_path: Path,
) -> None:
    profile = ProviderProfile(
        name="Local Ollama", base_url="http://127.0.0.1:11434/v1", model="llama"
    )
    config = AppConfig(vault_path=tmp_path / "vault.sqlite3", providers=(profile,))

    names = provider_names(config)

    assert "deterministic" in names
    assert "openai" in names
    assert "anthropic" in names
    assert "Local Ollama" in names
    assert find_profile(config, "local ollama") == profile
    assert find_profile(config, "openai") is not None
    assert find_profile(config, "missing") is None
