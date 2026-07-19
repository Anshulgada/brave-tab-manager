"""Local paths and secret-safe CLI configuration."""

from __future__ import annotations

import getpass
import json
import os
from contextlib import suppress
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from platformdirs import user_config_path, user_data_path

APP_NAME = "tabman"
SECRET_ENV_NAMES = {
    "gemini": "GEMINI_API_KEY",
    "mistral": "MISTRAL_API_KEY",
}


@dataclass(frozen=True, slots=True)
class AppConfig:
    vault_path: Path
    provider: str = "deterministic"
    mistral_base_url: str = "https://api.mistral.ai/v1"
    include_full_url_in_ai: bool = False


def config_dir() -> Path:
    return user_config_path(APP_NAME, appauthor=False)


def default_vault_path() -> Path:
    return user_data_path(APP_NAME, appauthor=False) / "vault.sqlite3"


def config_path() -> Path:
    return config_dir() / "config.json"


def secrets_path() -> Path:
    return config_dir() / "secrets.env"


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
    return AppConfig(
        vault_path=Path(payload.get("vaultPath", default_vault_path())),
        provider=str(payload.get("provider", "deterministic")),
        mistral_base_url=str(
            payload.get("mistralBaseUrl", "https://api.mistral.ai/v1")
        ).rstrip("/"),
        include_full_url_in_ai=bool(payload.get("includeFullUrlInAi", False)),
    )


def public_config(config: AppConfig) -> dict[str, Any]:
    values = asdict(config)
    values["vault_path"] = str(values["vault_path"])
    values["available_secrets"] = sorted(
        provider
        for provider in SECRET_ENV_NAMES
        if resolve_secret(provider, prompt=False)
    )
    return values


def save_config(config: AppConfig) -> None:
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "vaultPath": str(config.vault_path),
        "provider": config.provider,
        "mistralBaseUrl": config.mistral_base_url,
        "includeFullUrlInAi": config.include_full_url_in_ai,
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


def resolve_secret(provider: str, *, prompt: bool) -> str | None:
    env_name = SECRET_ENV_NAMES.get(provider.casefold())
    if env_name is None:
        return None
    value = os.environ.get(env_name) or _file_secrets().get(env_name)
    if value:
        return value
    if prompt:
        entered = getpass.getpass(f"{env_name}: ").strip()
        return entered or None
    return None


def store_secret(provider: str, value: str) -> None:
    env_name = SECRET_ENV_NAMES.get(provider.casefold())
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
