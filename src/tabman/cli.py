"""Offline-first command line interface for the Tabman vault."""

from __future__ import annotations

import getpass
import json
import sqlite3
from collections.abc import Sequence
from dataclasses import replace
from pathlib import Path

import rich_click as click
import rich_click.rich_click as rich_click_config
from click.exceptions import Exit as ClickExit
from pydantic import ValidationError
from rich import box as rich_box
from rich.console import Console
from rich.markup import escape
from rich.table import Table
from rich.text import Text
from rich_click.utils import CommandGroupDict

from tabman import __version__
from tabman.config import (
    DETERMINISTIC_PROVIDER,
    SECRET_ENV_NAMES,
    ApiFormat,
    AppConfig,
    ProviderProfile,
    find_profile,
    known_profiles,
    load_config,
    provider_names,
    public_config,
    resolve_secret,
    save_config,
    store_secret,
)
from tabman.legacy import LegacyImportError, import_legacy
from tabman.models import ExportDocument, ProposalStatus
from tabman.theme import (
    CONTEXT_SETTINGS,
    AutoWidthCommand,
    AutoWidthGroup,
    apply_theme,
    panel,
)
from tabman.vault import Vault, read_document, write_document

VaultPath = click.Path(dir_okay=False, path_type=Path)


apply_theme()

COMMAND_GROUPS: dict[str, list[CommandGroupDict]] = {
    "tabman": [
        panel("Vault", "import", "export", "search"),
        panel("Tabs", "capture", "organize"),
        panel("Setup", "config", "version"),
    ],
    "tabman config": [
        panel("Read", "show", "list-providers"),
        panel(
            "Write",
            "set",
            "set-key",
            "add-provider",
            "remove-provider",
        ),
    ],
}
rich_click_config.COMMAND_GROUPS = COMMAND_GROUPS

console = Console(highlight=False, legacy_windows=False)
stderr_console = Console(stderr=True, highlight=False, legacy_windows=False)


def _vault(path: Path | None) -> Vault:
    return Vault(path or load_config().vault_path)


def _require_vault(source: Vault) -> None:
    if not source.path.is_file():
        raise FileNotFoundError(f"vault does not exist: {source.path}")


def _tsv_cell(value: str) -> str:
    return value.replace("\t", " ").replace("\r", " ").replace("\n", " ")


def _fail(error: Exception) -> None:
    stderr_console.print(f"[bold red]Error:[/] {escape(str(error))}")
    raise ClickExit(2)


def _secret_env_name(config: AppConfig, provider: str) -> str | None:
    """Return the environment variable that holds ``provider``'s API key."""
    profile = find_profile(config, provider)
    if profile is not None:
        return profile.env_name
    return SECRET_ENV_NAMES.get(provider.casefold())


def _display_url(url: str) -> str:
    """Return a base URL without its scheme so the table stays readable."""
    for prefix in ("https://", "http://"):
        if url.startswith(prefix):
            return url[len(prefix) :]
    return url


def _provider_table(rows: list[dict[str, object]], title: str) -> Table:
    # Use the whole terminal first, then let long values wrap instead of being
    # cut off.
    table = Table(
        box=rich_box.ROUNDED,
        border_style="cyan",
        header_style="bold cyan",
        title=title,
        title_style="bold cyan",
        title_justify="left",
        expand=True,
        pad_edge=False,
    )
    table.add_column("Name", style="bold", no_wrap=True)
    table.add_column("Format", style="magenta", no_wrap=True)
    table.add_column("Model", overflow="fold")
    table.add_column("Base URL", style="dim", overflow="fold")
    table.add_column("Key", no_wrap=True)
    for row in rows:
        table.add_row(
            Text(str(row["name"])),
            Text(str(row["format"])),
            Text(str(row["model"])),
            Text(_display_url(str(row["base_url"]))),
            Text(str(row["key"])),
        )
    return table


@click.group(
    cls=AutoWidthGroup,
    name="tabman",
    help=(
        "Manage a local vault of Chromium tabs and collections.\n"
        "[dim]Import, search, organize, and export without a cloud account.[/]"
    ),
    no_args_is_help=True,
    context_settings=CONTEXT_SETTINGS,
)
@click.version_option(
    version=__version__,
    prog_name="tabman",
    message="%(version)s",
)
def app() -> None:
    """Manage a local vault of Chromium tabs and collections."""


@app.command(cls=AutoWidthCommand, name="version")
def version_command() -> None:
    """Print the version sourced from installed package metadata."""
    click.echo(__version__)


@app.command(cls=AutoWidthCommand, name="import")
@click.argument(
    "source",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
)
@click.option(
    "--vault", type=VaultPath, help="SQLite vault path; defaults to the user data dir."
)
@click.option("--legacy", is_flag=True, help="Convert old dated JSON or all_tabs.md.")
@click.option(
    "--replace",
    "replace_existing",
    is_flag=True,
    help="Atomically replace the vault.",
)
def import_command(
    source: Path,
    vault: Path | None,
    legacy: bool,
    replace_existing: bool,
) -> None:
    """Validate and import a shared export or an explicitly marked legacy file."""
    try:
        document = import_legacy(source) if legacy else read_document(source)
        _vault(vault).import_document(
            document,
            replace=replace_existing,
            write_settings=not legacy,
        )
    except (
        OSError,
        sqlite3.Error,
        ValidationError,
        LegacyImportError,
        RuntimeError,
        ValueError,
    ) as error:
        _fail(error)
    tabs = sum(len(item.tabs) for item in document.collections)
    collections = len(document.collections)
    tab_word = "tab" if tabs == 1 else "tabs"
    collection_word = "collection" if collections == 1 else "collections"
    console.print(
        f"[green]Imported[/] {tabs} {tab_word} across {collections} {collection_word}."
    )


@app.command(cls=AutoWidthCommand, name="export")
@click.argument("destination", type=click.Path(dir_okay=False, path_type=Path))
@click.option(
    "--vault", type=VaultPath, help="SQLite vault path; defaults to the user data dir."
)
@click.option(
    "--format", "format_", default="json", help="Export format: json or markdown."
)
def export_command(destination: Path, vault: Path | None, format_: str) -> None:
    """Export the SQLite vault; Markdown remains a read-only snapshot."""
    try:
        source = _vault(vault)
        _require_vault(source)
        if format_.casefold() == "json":
            write_document(destination, source.export_document())
        elif format_.casefold() in {"markdown", "md"}:
            source.write_markdown(destination)
        else:
            raise ValueError("format must be json or markdown")
    except (OSError, sqlite3.Error, ValidationError, RuntimeError, ValueError) as error:
        _fail(error)
    console.print(f"[green]Exported[/] vault to [cyan]{escape(str(destination))}[/].")


@app.command(cls=AutoWidthCommand, name="search")
@click.argument("query", required=False, default="")
@click.option(
    "--vault", type=VaultPath, help="SQLite vault path; defaults to the user data dir."
)
@click.option("--hostname", help="Match this host or a true subdomain.")
@click.option(
    "--format",
    "format_",
    default="table",
    help="Output format: table, tsv, or json.",
)
def search_command(
    query: str,
    vault: Path | None,
    hostname: str | None,
    format_: str,
) -> None:
    """Search titles, URLs, and hosts and always print the matches."""
    normalized_format = format_.casefold()
    if normalized_format not in {"table", "tsv", "json"}:
        _fail(ValueError("format must be table, tsv, or json"))
    try:
        source = _vault(vault)
        _require_vault(source)
        matches = source.search_tabs(query, hostname=hostname)
    except (OSError, sqlite3.Error, ValidationError, RuntimeError, ValueError) as error:
        _fail(error)
    rows = [
        {
            "collection": collection.name,
            "title": tab.title,
            "url": tab.url,
            "hostname": tab.hostname,
        }
        for collection, tab in matches
    ]
    if normalized_format == "json":
        click.echo(json.dumps(rows, indent=2))
        return
    if normalized_format == "tsv":
        click.echo("COLLECTION\tTITLE\tHOSTNAME\tURL")
        for row in rows:
            click.echo(
                "\t".join(
                    _tsv_cell(row[key])
                    for key in ("collection", "title", "hostname", "url")
                )
            )
        return
    if not rows:
        console.print("[dim]No matching tabs.[/]")
        return
    table = Table(
        box=rich_box.ROUNDED,
        border_style="cyan",
        header_style="bold cyan",
        title="Matches",
        title_style="bold cyan",
        title_justify="left",
        expand=True,
        pad_edge=False,
        padding=(0, 1),
    )
    table.add_column("Collection", style="magenta", no_wrap=True)
    table.add_column("Title", overflow="fold")
    table.add_column("Host", style="green", no_wrap=True)
    table.add_column("URL", style="dim", overflow="fold")
    for row in rows:
        table.add_row(
            Text(row["collection"]),
            Text(row["title"]),
            Text(row["hostname"]),
            Text(row["url"]),
        )
    console.print(table)


@app.command(cls=AutoWidthCommand, name="capture")
@click.option("--name", required=True, help="Name for the captured collection.")
@click.option(
    "--vault", type=VaultPath, help="SQLite vault path; defaults to the user data dir."
)
@click.option(
    "--endpoint",
    default="http://127.0.0.1:9222",
    help="Local Chromium debugging endpoint (browser must be started with CDP).",
)
def capture_command(name: str, vault: Path | None, endpoint: str) -> None:
    """Capture CDP metadata; importing extension JSON remains preferred."""
    from tabman.capture import capture_collection

    try:
        collection = capture_collection(endpoint, name)
        _vault(vault).append_collection(collection)
    except (OSError, sqlite3.Error, ValidationError, RuntimeError, ValueError) as error:
        _fail(error)
    count = len(collection.tabs)
    tab_word = "tab" if count == 1 else "tabs"
    console.print(
        f"[green]Captured[/] {count} {tab_word} into "
        f"[cyan]{escape(collection.name)}[/]."
    )


@app.command(cls=AutoWidthCommand, name="organize")
@click.option(
    "--vault", type=VaultPath, help="SQLite vault path; defaults to the user data dir."
)
@click.option(
    "--provider",
    help="Provider name: deterministic, openai, anthropic, or a configured profile.",
)
@click.option("--base-url", help="Override the provider base URL for this run.")
@click.option("--model", help="Override the provider model for this run.")
@click.option(
    "--api-format",
    type=click.Choice(["openai", "responses", "anthropic"], case_sensitive=False),
    default=None,
    help="Compatibility format for an ad-hoc provider.",
)
@click.option("--apply", is_flag=True, help="Persist the previewed proposal.")
@click.option(
    "--yes",
    is_flag=True,
    help="Skip the replace confirmation when applying a proposal.",
)
@click.option(
    "--prompt-secret",
    is_flag=True,
    help="Prompt securely when the provider key is unavailable.",
)
def organize_command(
    vault: Path | None,
    provider: str | None,
    base_url: str | None,
    model: str | None,
    api_format: str | None,
    apply: bool,
    yes: bool,
    prompt_secret: bool,
) -> None:
    """Batch all tabs into one validated proposal; apply only when requested."""
    from tabman.organize import (
        apply_proposal,
        build_provider,
        create_proposal,
        proposal_rows,
    )

    try:
        config = load_config()
        selected = provider or config.provider
        source = _vault(vault)
        _require_vault(source)
        document = source.export_document()
        if apply:
            pending = [
                item
                for item in document.proposals
                if item.status == ProposalStatus.PREVIEW
            ]
            if not pending:
                raise ValueError(
                    "No stored preview proposal; "
                    "run `tabman organize` without --apply first"
                )
            proposal = max(pending, key=lambda item: item.created_at)
        else:
            adapter = build_provider(
                selected,
                config,
                prompt_for_secret=prompt_secret,
                base_url=base_url,
                model=model,
                api_format=ApiFormat(api_format) if api_format else None,
            )
            proposal = create_proposal(
                document,
                adapter,
                include_full_url=config.include_full_url_in_ai,
            )
            source.import_document(
                ExportDocument(
                    schema_version=1,
                    exported_at=proposal.created_at,
                    collections=(),
                    sessions=(),
                    proposals=(proposal,),
                    settings=document.settings,
                ),
                replace=False,
                write_settings=False,
            )
        click.echo(
            json.dumps(
                {
                    "provider": proposal.provider,
                    "status": proposal.status,
                    "items": list(proposal_rows(proposal)),
                },
                indent=2,
            )
        )
        if apply:
            stderr_console.print(
                "[yellow]Applying replaces the entire vault "
                "with the proposal result.[/]"
            )
            if not yes and not click.confirm(
                "Replace the entire vault with this proposal?",
                default=False,
            ):
                raise click.Abort()
            source.import_document(
                apply_proposal(document, proposal),
                replace=True,
            )
            console.print("[green]Applied proposal.[/]")
        else:
            console.print(
                "[yellow]Preview only[/] - rerun with "
                "[bold]--apply --yes[/] to persist."
            )
    except click.Abort:
        raise
    except (OSError, sqlite3.Error, ValidationError, RuntimeError, ValueError) as error:
        _fail(error)


@click.group(
    "config",
    cls=AutoWidthGroup,
    help="Inspect or update non-secret local configuration.",
    context_settings=CONTEXT_SETTINGS,
)
def config_app() -> None:
    """Inspect or update non-secret local configuration."""


@config_app.command(cls=AutoWidthCommand, name="show")
def config_show() -> None:
    """Print non-secret settings and only the names of available keys."""
    try:
        click.echo(json.dumps(public_config(load_config()), indent=2))
    except (OSError, ValueError) as error:
        _fail(error)


@config_app.command(cls=AutoWidthCommand, name="list-providers")
@click.option(
    "--format",
    "format_",
    type=click.Choice(["table", "json"], case_sensitive=False),
    default="table",
    help="Output format: table or json.",
)
def config_list_providers(format_: str) -> None:
    """List the AI providers this machine can use."""
    try:
        config = load_config()
    except (OSError, ValueError) as error:
        _fail(error)
    rows: list[dict[str, object]] = [
        {
            "name": DETERMINISTIC_PROVIDER,
            "format": "local",
            "model": "hostname rules",
            "base_url": "-",
            "key": "n/a",
            "key_env": "-",
        }
    ]
    for profile in known_profiles(config):
        available = resolve_secret(profile.name, prompt=False, env_var=profile.env_name)
        rows.append(
            {
                "name": profile.name,
                "format": profile.api_format.value,
                "model": profile.model,
                "base_url": profile.base_url,
                "key": "ready" if available else "missing",
                "key_env": profile.env_name,
            }
        )
    if format_.casefold() == "json":
        click.echo(json.dumps(rows, indent=2))
        return
    console.print(_provider_table(rows, "Providers"))
    console.print(
        "[dim]Keys come from the environment or the config directory: "
        "OPENAI_API_KEY, ANTHROPIC_API_KEY, or TABMAN_<NAME>_API_KEY.[/]"
    )


@config_app.command(cls=AutoWidthCommand, name="add-provider")
@click.argument("name")
@click.option(
    "--base-url",
    required=True,
    help="API base URL, for example https://api.openai.com/v1",
)
@click.option(
    "--model",
    required=True,
    help="Model name exactly as the provider expects it.",
)
@click.option(
    "--format",
    "api_format",
    type=click.Choice(["openai", "responses", "anthropic"], case_sensitive=False),
    default="openai",
    help="Compatibility format: openai, responses, or anthropic.",
)
@click.option(
    "--env-var",
    help="Environment variable that holds the API key.",
)
@click.option(
    "--replace",
    "replace_existing",
    is_flag=True,
    help="Replace an existing provider that uses the same name.",
)
def config_add_provider(
    name: str,
    base_url: str,
    model: str,
    api_format: str,
    env_var: str | None,
    replace_existing: bool,
) -> None:
    """Add an OpenAI- or Anthropic-compatible provider profile."""
    try:
        current = load_config()
        profile = ProviderProfile.from_dict(
            {
                "name": name,
                "baseUrl": base_url,
                "model": model,
                "apiFormat": api_format,
                "apiKeyEnv": env_var,
            }
        )
        kept = tuple(
            item
            for item in current.providers
            if item.name.casefold() != profile.name.casefold()
        )
        if len(kept) != len(current.providers) and not replace_existing:
            raise ValueError(
                f"provider already exists: {profile.name} "
                "(use --replace to overwrite it)"
            )
        save_config(replace(current, providers=(*kept, profile)))
    except (OSError, ValueError) as error:
        _fail(error)
    console.print(
        f"[green]Provider added[/] [cyan]{escape(profile.name)}[/] "
        f"({escape(profile.model)} via {escape(profile.api_format.value)})."
    )
    console.print(
        f"[dim]Add the key with[/] tabman config set-key {escape(profile.name)} "
        f"[dim]or export[/] {escape(profile.env_name)}"
    )


@config_app.command(cls=AutoWidthCommand, name="remove-provider")
@click.argument("name")
def config_remove_provider(name: str) -> None:
    """Remove a configured provider profile."""
    try:
        current = load_config()
        kept = tuple(
            item
            for item in current.providers
            if item.name.casefold() != name.casefold()
        )
        if len(kept) == len(current.providers):
            raise ValueError(f"unknown provider: {name}")
        save_config(replace(current, providers=kept))
    except (OSError, ValueError) as error:
        _fail(error)
    console.print(f"[green]Provider removed[/] [cyan]{escape(name)}[/].")


@config_app.command(cls=AutoWidthCommand, name="set")
@click.option("--vault", type=VaultPath, help="Default SQLite vault path.")
@click.option("--provider", help="Default organize provider.")
@click.option("--mistral-base-url", help="Mistral-compatible API base URL.")
@click.option(
    "--include-full-url-in-ai/--no-include-full-url-in-ai",
    default=None,
    help="Send full URLs to the selected AI provider.",
)
def config_set(
    vault: Path | None,
    provider: str | None,
    mistral_base_url: str | None,
    include_full_url_in_ai: bool | None,
) -> None:
    """Update non-secret settings."""
    try:
        current = load_config()
        if provider is not None and provider.casefold() not in {
            name.casefold() for name in provider_names(current)
        }:
            available = ", ".join(provider_names(current))
            raise ValueError(
                f"unknown provider: {provider}. Available providers: {available}"
            )
        updated = replace(
            current,
            vault_path=vault or current.vault_path,
            provider=provider or current.provider,
            mistral_base_url=mistral_base_url or current.mistral_base_url,
            include_full_url_in_ai=(
                include_full_url_in_ai
                if include_full_url_in_ai is not None
                else current.include_full_url_in_ai
            ),
        )
        save_config(updated)
    except (OSError, ValueError) as error:
        _fail(error)
    console.print("[green]Configuration updated.[/]")


@config_app.command(cls=AutoWidthCommand, name="set-key")
@click.argument("provider")
def config_set_key(provider: str) -> None:
    """Prompt securely and store a provider key in the user config directory."""
    try:
        current = load_config()
    except (OSError, ValueError) as error:
        _fail(error)
    env_name = _secret_env_name(current, provider)
    if env_name is None:
        available = ", ".join(provider_names(current))
        _fail(
            ValueError(
                f"unknown provider: {provider}. Available providers: {available}"
            )
        )
    value = getpass.getpass(f"{env_name}: ").strip()
    if not value:
        _fail(ValueError("key cannot be empty"))
    try:
        store_secret(provider, value, env_var=env_name)
    except (OSError, ValueError) as error:
        _fail(error)
    console.print("[green]Key stored outside command history.[/]")


app.add_command(config_app)


def build_parser() -> click.Group:
    """Return the Click command for compatibility with embedding and tests."""
    return app


def main(argv: Sequence[str] | None = None) -> int:
    """Run Tabman and return a process-compatible status code."""
    try:
        app.main(
            args=list(argv) if argv is not None else None,
            prog_name="tabman",
            standalone_mode=True,
        )
    except SystemExit as error:
        return int(error.code or 0)
    return 0
