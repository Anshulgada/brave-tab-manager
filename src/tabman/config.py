"""Local paths and secret-safe CLI configuration."""

from __future__ import annotations

import getpass
import json
import os
import re
from contextlib import suppress
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from platformdirs import user_config_path, user_data_path

APP_NAME = "tabman"
SECRET_ENV_NAMES = {
    "gemini": "GEMINI_API_KEY",
    "mistral": "MISTRAL_API_KEY",
}
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}
LEGACY_PROVIDERS = ("gemini", "mistral")
DETERMINISTIC_PROVIDER = "deterministic"


class ApiFormat(StrEnum):
    """Wire format spoken by a configured AI provider."""

    OPENAI = "openai"
    RESPONSES = "responses"
    ANTHROPIC = "anthropic"
    OLLAMA = "ollama"


def _slug(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_").upper()


def validate_base_url(base_url: str) -> str:
    """Return a normalized provider base URL or raise ``ValueError``."""
    candidate = base_url.strip().rstrip("/")
    parsed = urlsplit(candidate)
    host = parsed.hostname
    if parsed.scheme not in {"http", "https"} or not host:
        raise ValueError("provider base URL must be an absolute http(s) URL")
    if parsed.scheme == "http" and host not in LOCAL_HOSTS:
        raise ValueError("provider base URL must use HTTPS or local HTTP")
    return candidate


@dataclass(frozen=True, slots=True)
class ProviderProfile:
    """A user-configured OpenAI- or Anthropic-compatible endpoint."""

    name: str
    base_url: str
    model: str
    api_format: ApiFormat = ApiFormat.OPENAI
    api_key_env: str | None = None

    @property
    def env_name(self) -> str:
        """Environment variable that holds this provider's API key."""
        if self.api_key_env:
            return self.api_key_env
        return f"TABMAN_{_slug(self.name)}_API_KEY"

    def to_dict(self) -> dict[str, str]:
        payload = {
            "name": self.name,
            "baseUrl": self.base_url,
            "model": self.model,
            "apiFormat": self.api_format.value,
        }
        if self.api_key_env:
            payload["apiKeyEnv"] = self.api_key_env
        return payload

    @classmethod
    def from_dict(cls, payload: object) -> ProviderProfile:
        """Build a profile from one ``config.json`` entry."""
        if not isinstance(payload, dict):
            raise ValueError("each provider must be a JSON object")
        name = payload.get("name")
        if not isinstance(name, str) or not name.strip():
            raise ValueError("provider name must be a non-empty string")
        base_url = payload.get("baseUrl")
        if not isinstance(base_url, str) or not base_url.strip():
            raise ValueError(f"provider {name} needs a baseUrl")
        model = payload.get("model")
        if not isinstance(model, str) or not model.strip():
            raise ValueError(f"provider {name} needs a model")
        raw_format = payload.get("apiFormat", ApiFormat.OPENAI.value)
        if not isinstance(raw_format, str):
            raise ValueError(f"provider {name} has an invalid apiFormat")
        try:
            api_format = ApiFormat(raw_format.casefold())
        except ValueError as error:
            raise ValueError(
                f"provider {name} apiFormat must be openai or anthropic"
            ) from error
        raw_env = payload.get("apiKeyEnv")
        if raw_env is not None and (
            not isinstance(raw_env, str) or not raw_env.strip()
        ):
            raise ValueError(f"provider {name} apiKeyEnv must be a non-empty string")
        return cls(
            name=name.strip(),
            base_url=validate_base_url(base_url),
            model=model.strip(),
            api_format=api_format,
            api_key_env=raw_env.strip() if isinstance(raw_env, str) else None,
        )


BUILTIN_PROVIDERS: dict[str, ProviderProfile] = {
    "openai": ProviderProfile(
        name="openai",
        base_url="https://api.openai.com/v1",
        model="gpt-6-luna",
        api_format=ApiFormat.RESPONSES,
        api_key_env="OPENAI_API_KEY",  # pragma: allowlist secret
    ),
    "anthropic": ProviderProfile(
        name="anthropic",
        base_url="https://api.anthropic.com",
        model="claude-haiku-5-5",
        api_format=ApiFormat.ANTHROPIC,
        api_key_env="ANTHROPIC_API_KEY",  # pragma: allowlist secret
    ),
}


@dataclass(frozen=True, slots=True)
class AppConfig:
    vault_path: Path
    provider: str = DETERMINISTIC_PROVIDER
    mistral_base_url: str = "https://api.mistral.ai/v1"
    include_full_url_in_ai: bool = False
    providers: tuple[ProviderProfile, ...] = ()


def config_dir() -> Path:
    return user_config_path(APP_NAME, appauthor=False)


def default_vault_path() -> Path:
    return user_data_path(APP_NAME, appauthor=False) / "vault.sqlite3"


def config_path() -> Path:
    return config_dir() / "config.json"


def secrets_path() -> Path:
    return config_dir() / "secrets.env"


def known_profiles(config: AppConfig) -> tuple[ProviderProfile, ...]:
    """Return the built-in and user-configured provider profiles."""
    profiles = list(BUILTIN_PROVIDERS.values())
    profiles.extend(config.providers)
    return tuple(profiles)


def provider_names(config: AppConfig) -> tuple[str, ...]:
    """Return every provider name the CLI can build, in display order."""
    names = [DETERMINISTIC_PROVIDER, *BUILTIN_PROVIDERS, *LEGACY_PROVIDERS]
    names.extend(profile.name for profile in config.providers)
    return tuple(names)


def find_profile(config: AppConfig, name: str) -> ProviderProfile | None:
    """Return the profile matching ``name`` case-insensitively."""
    normalized = name.casefold()
    builtin = BUILTIN_PROVIDERS.get(normalized)
    if builtin is not None:
        return builtin
    for profile in config.providers:
        if profile.name.casefold() == normalized:
            return profile
    return None


def load_config() -> AppConfig:
    path = config_path()
    if not path.exists():
        return AppConfig(vault_path=default_vault_path())
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"cannot read configuration: {error}") from error
    if not isinstance(payload, dict):
        raise ValueError("configuration must be a JSON object")
    include_full_url = payload.get("includeFullUrlInAi", False)
    if not isinstance(include_full_url, bool):
        raise ValueError("includeFullUrlInAi must be a JSON boolean")
    raw_vault_path = payload.get("vaultPath", str(default_vault_path()))
    if not isinstance(raw_vault_path, str) or not raw_vault_path.strip():
        raise ValueError("vaultPath must be a non-empty string")
    raw_provider = payload.get("provider", DETERMINISTIC_PROVIDER)
    if not isinstance(raw_provider, str) or not raw_provider.strip():
        raise ValueError("provider must be a non-empty string")
    raw_base_url = payload.get("mistralBaseUrl", "https://api.mistral.ai/v1")
    if not isinstance(raw_base_url, str) or not raw_base_url.strip():
        raise ValueError("mistralBaseUrl must be a non-empty string")
    raw_providers = payload.get("providers", [])
    if not isinstance(raw_providers, list):
        raise ValueError("providers must be a JSON array")
    providers = tuple(ProviderProfile.from_dict(item) for item in raw_providers)
    names = [profile.name.casefold() for profile in providers]
    if len(names) != len(set(names)):
        raise ValueError("provider names must be unique")
    return AppConfig(
        vault_path=Path(raw_vault_path),
        provider=raw_provider,
        mistral_base_url=raw_base_url.rstrip("/"),
        include_full_url_in_ai=include_full_url,
        providers=providers,
    )


def public_config(config: AppConfig) -> dict[str, Any]:
    """Return the configuration that is safe to print."""
    return {
        "vault_path": str(config.vault_path),
        "provider": config.provider,
        "mistral_base_url": config.mistral_base_url,
        "include_full_url_in_ai": config.include_full_url_in_ai,
        "providers": [profile.to_dict() for profile in config.providers],
        "available_secrets": sorted(available_secret_names(config)),
    }


def save_config(config: AppConfig) -> None:
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "vaultPath": str(config.vault_path),
        "provider": config.provider,
        "mistralBaseUrl": config.mistral_base_url,
        "includeFullUrlInAi": config.include_full_url_in_ai,
        "providers": [profile.to_dict() for profile in config.providers],
    }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _file_secrets() -> dict[str, str]:
    path = secrets_path()
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def resolve_secret(
    provider: str, *, prompt: bool, env_var: str | None = None
) -> str | None:
    """Return the API key for ``provider`` from the environment or config dir."""
    env_name = env_var or SECRET_ENV_NAMES.get(provider.casefold())
    if env_name is None:
        return None
    value = os.environ.get(env_name) or _file_secrets().get(env_name)
    if value:
        return value
    if prompt:
        entered = getpass.getpass(f"{env_name}: ").strip()
        return entered or None
    return None


def store_secret(provider: str, value: str, *, env_var: str | None = None) -> None:
    """Store an API key in the user config directory, never in shell history."""
    env_name = env_var or SECRET_ENV_NAMES.get(provider.casefold())
    if env_name is None:
        raise ValueError(f"unsupported provider: {provider}")
    path = secrets_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    values = _file_secrets()
    values[env_name] = value.strip()
    path.write_text(
        "".join(f"{key}={secret}\n" for key, secret in sorted(values.items())),
        encoding="utf-8",
    )
    with suppress(OSError):
        path.chmod(0o600)


def available_secret_names(config: AppConfig) -> list[str]:
    """Return the names of providers that currently have a usable key."""
    names: list[str] = []
    for profile in known_profiles(config):
        if resolve_secret(profile.name, prompt=False, env_var=profile.env_name):
            names.append(profile.name)
    for provider in LEGACY_PROVIDERS:
        if resolve_secret(provider, prompt=False):
            names.append(provider)
    return names
