"""Offline-first command line interface for the Tabman vault."""

from __future__ import annotations

import getpass
import json
from collections.abc import Sequence
from dataclasses import replace
from pathlib import Path
from typing import Annotated, Any

import typer
from pydantic import ValidationError

from tabman import __version__
from tabman.capture import CaptureError, capture_collection
from tabman.config import (
    SECRET_ENV_NAMES,
    load_config,
    public_config,
    save_config,
    store_secret,
)
from tabman.legacy import LegacyImportError, import_legacy
from tabman.models import ExportDocument, ProposalStatus
from tabman.organize import (
    OrganizeError,
    apply_proposal,
    build_provider,
    create_proposal,
    proposal_rows,
)
from tabman.vault import Vault, read_document, write_document

app = typer.Typer(
    name="tabman",
    help="Manage a local vault of Chromium tabs and collections.",
    no_args_is_help=True,
)
config_app = typer.Typer(help="Inspect or update non-secret local configuration.")
app.add_typer(config_app, name="config")

VaultOption = Annotated[
    Path | None,
    typer.Option("--vault", help="SQLite vault path; defaults to the user data dir."),
]


def _vault(path: Path | None) -> Vault:
    return Vault(path or load_config().vault_path)


def _require_vault(source: Vault) -> None:
    if not source.path.is_file():
        raise FileNotFoundError(f"vault does not exist: {source.path}")


def _tsv_cell(value: str) -> str:
    return value.replace("\t", " ").replace("\r", " ").replace("\n", " ")


def _fail(error: Exception) -> None:
    typer.echo(f"Error: {error}", err=True)
    raise typer.Exit(2)


def _version_callback(value: bool) -> None:
    if value:
        typer.echo(__version__)
        raise typer.Exit()


@app.callback()
def root(
    version: Annotated[
        bool | None,
        typer.Option(
            "--version",
            callback=_version_callback,
            is_eager=True,
            help="Show the installed Tabman version.",
        ),
    ] = None,
) -> None:
    """Manage a local vault of Chromium tabs and collections."""
    del version


@app.command()
def version() -> None:
    """Print the version sourced from installed package metadata."""
    typer.echo(__version__)


@app.command("import")
def import_command(
    source: Annotated[Path, typer.Argument(exists=True, dir_okay=False)],
    vault: VaultOption = None,
    legacy: Annotated[
        bool, typer.Option(help="Convert old dated JSON or all_tabs.md.")
    ] = False,
    replace_existing: Annotated[
        bool, typer.Option("--replace", help="Atomically replace the vault.")
    ] = False,
) -> None:
    """Validate and import a shared export or an explicitly marked legacy file."""
    try:
        document = import_legacy(source) if legacy else read_document(source)
        _vault(vault).import_document(
            document,
            replace=replace_existing,
            write_settings=not legacy,
        )
    except (OSError, ValidationError, LegacyImportError, RuntimeError) as error:
        _fail(error)
    typer.echo(
        f"Imported {sum(len(item.tabs) for item in document.collections)} tabs "
        f"across {len(document.collections)} collections."
    )


@app.command()
def export(
    destination: Annotated[Path, typer.Argument(dir_okay=False)],
    vault: VaultOption = None,
    format_: Annotated[
        str, typer.Option("--format", help="Export format: json or markdown.")
    ] = "json",
) -> None:
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
    except (OSError, ValidationError, RuntimeError, ValueError) as error:
        _fail(error)
    typer.echo(f"Exported vault to {destination}.")


@app.command()
def search(
    query: Annotated[str, typer.Argument()] = "",
    vault: VaultOption = None,
    hostname: Annotated[
        str | None, typer.Option(help="Match this host or a true subdomain.")
    ] = None,
    format_: Annotated[
        str, typer.Option("--format", help="Output format: table or json.")
    ] = "table",
) -> None:
    """Search titles, URLs, and hosts and always print the matches."""
    try:
        source = _vault(vault)
        _require_vault(source)
        matches = source.search_tabs(query, hostname=hostname)
    except (OSError, ValidationError, RuntimeError) as error:
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
    if format_.casefold() == "json":
        typer.echo(json.dumps(rows, indent=2))
    elif format_.casefold() == "table":
        typer.echo("COLLECTION\tTITLE\tHOSTNAME\tURL")
        for row in rows:
            typer.echo(
                "\t".join(
                    _tsv_cell(row[key])
                    for key in ("collection", "title", "hostname", "url")
                )
            )
    else:
        _fail(ValueError("format must be table or json"))


@app.command()
def capture(
    name: Annotated[str, typer.Option(help="Name for the captured collection.")],
    vault: VaultOption = None,
    endpoint: Annotated[
        str,
        typer.Option(
            help="Local Chromium debugging endpoint (browser must be started with CDP)."
        ),
    ] = "http://127.0.0.1:9222",
) -> None:
    """Capture CDP metadata; importing extension JSON remains preferred."""
    try:
        collection = capture_collection(endpoint, name)
        _vault(vault).append_collection(collection)
    except (CaptureError, OSError, ValidationError, RuntimeError) as error:
        _fail(error)
    typer.echo(f"Captured {len(collection.tabs)} tabs into {collection.name}.")


@app.command()
def organize(
    vault: VaultOption = None,
    provider: Annotated[
        str | None, typer.Option(help="deterministic, mistral, or gemini.")
    ] = None,
    apply: Annotated[
        bool, typer.Option("--apply", help="Persist the previewed proposal.")
    ] = False,
    yes: Annotated[
        bool,
        typer.Option(
            "--yes",
            help="Skip the replace confirmation when applying a proposal.",
        ),
    ] = False,
    prompt_for_secret: Annotated[
        bool,
        typer.Option(
            "--prompt-secret",
            help="Prompt securely when the provider key is unavailable.",
        ),
    ] = False,
) -> None:
    """Batch all tabs into one validated proposal; apply only when requested."""
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
                selected, config, prompt_for_secret=prompt_for_secret
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
        typer.echo(
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
            typer.echo(
                "Applying replaces the entire vault with the proposal result.",
                err=True,
            )
            if not yes and not typer.confirm(
                "Replace the entire vault with this proposal?",
                default=False,
            ):
                raise typer.Abort()
            source.import_document(
                apply_proposal(document, proposal),
                replace=True,
            )
            typer.echo("Applied proposal.")
        else:
            typer.echo("Preview only; rerun with --apply --yes to persist.")
    except (OrganizeError, OSError, ValidationError, RuntimeError, ValueError) as error:
        _fail(error)


@config_app.command("show")
def config_show() -> None:
    """Print non-secret settings and only the names of available keys."""
    try:
        typer.echo(json.dumps(public_config(load_config()), indent=2))
    except (OSError, ValueError) as error:
        _fail(error)


@config_app.command("set")
def config_set(
    vault: Annotated[
        Path | None, typer.Option(help="Default SQLite vault path.")
    ] = None,
    provider: Annotated[str | None, typer.Option()] = None,
    mistral_base_url: Annotated[str | None, typer.Option()] = None,
    include_full_url_in_ai: Annotated[bool | None, typer.Option()] = None,
) -> None:
    """Update non-secret settings."""
    try:
        current = load_config()
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
    typer.echo("Configuration updated.")


@config_app.command("set-key")
def config_set_key(
    provider: Annotated[str, typer.Argument(help="gemini or mistral")],
) -> None:
    """Prompt securely and store a provider key in the user config directory."""
    if provider.casefold() not in SECRET_ENV_NAMES:
        _fail(ValueError(f"unsupported provider: {provider}"))
    value = getpass.getpass(f"{SECRET_ENV_NAMES[provider.casefold()]}: ").strip()
    if not value:
        _fail(ValueError("key cannot be empty"))
    try:
        store_secret(provider, value)
    except (OSError, ValueError) as error:
        _fail(error)
    typer.echo("Key stored outside command history.")


def build_parser() -> Any:
    """Return the Click command for compatibility with embedding and tests."""
    return typer.main.get_command(app)


def main(argv: Sequence[str] | None = None) -> int:
    """Run Tabman and return a process-compatible status code."""
    try:
        app(
            args=list(argv) if argv is not None else None,
            prog_name="tabman",
            standalone_mode=True,
        )
    except SystemExit as error:
        return int(error.code or 0)
    return 0
