"""Shared rich-click styling for every Tabman command line surface.

The CLI, the installer scripts, and the local CI runner all present the same
look: rounded panels, a calm neutral palette, and quiet usage lines.
"""

from __future__ import annotations

import sys
from contextlib import suppress

import rich_click as click
import rich_click.rich_click as rich_click_config
from rich_click.utils import CommandGroupDict

CONTEXT_SETTINGS = {"help_option_names": ["-h", "--help"]}


def _enable_utf8_output() -> None:
    """Ask the terminal for UTF-8 so panel borders render as real box art.

    Windows consoles still default to a legacy code page, and Rich falls back
    to ASCII boxes when the stream cannot encode them.
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        encoding = (getattr(stream, "encoding", "") or "").casefold()
        if encoding.startswith("utf"):
            continue
        with suppress(OSError, ValueError):
            reconfigure(encoding="utf-8", errors="replace")


def apply_theme() -> None:
    """Apply the Tabman look to the rich-click globals."""
    _enable_utf8_output()
    # Let the help use the whole terminal before it wraps a description, and
    # size the panels to their content instead of always filling the width.
    rich_click_config.MAX_WIDTH = None
    rich_click_config.STYLE_OPTIONS_TABLE_EXPAND = False
    rich_click_config.STYLE_COMMANDS_TABLE_EXPAND = False
    rich_click_config.TEXT_MARKUP = "rich"
    rich_click_config.COMMANDS_BEFORE_OPTIONS = True
    rich_click_config.STYLE_OPTIONS_PANEL_BOX = "ROUNDED"
    rich_click_config.STYLE_COMMANDS_PANEL_BOX = "ROUNDED"
    rich_click_config.STYLE_ERRORS_PANEL_BOX = "ROUNDED"
    rich_click_config.STYLE_OPTIONS_PANEL_BORDER = "cyan"
    rich_click_config.STYLE_COMMANDS_PANEL_BORDER = "magenta"
    rich_click_config.STYLE_ERRORS_PANEL_BORDER = "red"
    rich_click_config.STYLE_OPTIONS_PANEL_TITLE_STYLE = "bold cyan"
    rich_click_config.STYLE_COMMANDS_PANEL_TITLE_STYLE = "bold magenta"
    rich_click_config.STYLE_OPTIONS_PANEL_PADDING = (0, 1)
    rich_click_config.STYLE_COMMANDS_PANEL_PADDING = (0, 1)
    rich_click_config.STYLE_USAGE = "dim"
    rich_click_config.STYLE_USAGE_COMMAND = "bold"
    rich_click_config.STYLE_COMMAND = "bold cyan"
    rich_click_config.STYLE_OPTION = "cyan"
    rich_click_config.STYLE_METAVAR = "magenta"
    rich_click_config.STYLE_HEADER_TEXT = "bold"
    rich_click_config.STYLE_EPILOG_TEXT = "dim"
    rich_click_config.ERRORS_SUGGESTION = None
    # Rich downgrades rounded boxes to square ones on legacy Windows consoles.
    # Tabman forces UTF-8 output, so keep the rounded art everywhere.
    rich_click_config.LEGACY_WINDOWS = False


def panel(title: str, *commands: str) -> CommandGroupDict:
    """Build one rich-click command panel."""
    return {"name": title, "commands": list(commands)}


def _longest_line(text: str) -> int:
    """Return the length of the longest line in a block of text."""
    return max((len(line) for line in text.splitlines()), default=0)


def natural_help_width(ctx: click.Context, formatter: object) -> int:
    """Return the width the help needs before anything has to wrap.

    Rich-click always draws its panels at the full console width, so the help
    would look empty on a wide terminal. Measuring the longest row gives the
    width the content actually needs, capped by the terminal.
    """
    limit = 80
    console = getattr(formatter, "console", None)
    width = getattr(console, "width", None)
    if isinstance(width, int) and width > 0:
        limit = width

    longest = _longest_line(getattr(ctx.command, "help", None) or "")
    commands = getattr(ctx.command, "commands", {})
    for name, command in commands.items():
        help_text = getattr(command, "help", None) or ""
        longest = max(longest, len(name) + 2 + _longest_line(help_text))
    for param in ctx.command.params:
        label = " ".join(param.opts)
        if param.metavar:
            label = f"{label} {param.metavar}"
        help_text = getattr(param, "help", None) or ""
        longest = max(longest, len(label) + 2 + _longest_line(help_text))
    if not longest:
        return 0
    return min(longest + 4, limit)


def _resize_console(ctx: click.Context, formatter: object) -> None:
    """Narrow the help console to the width the content actually needs."""
    width = natural_help_width(ctx, formatter)
    console = getattr(formatter, "console", None)
    if not width or console is None:
        return
    terminal = getattr(console, "size", None)
    limit = getattr(terminal, "width", width)
    console.width = min(width, limit)


class AutoWidthGroup(click.RichGroup):
    """A group whose help is only as wide as its content."""

    def format_help(self, ctx: click.Context, formatter: object) -> None:
        """Size the help to the content before rendering it."""
        _resize_console(ctx, formatter)
        super().format_help(ctx, formatter)  # ty: ignore[invalid-argument-type]


class AutoWidthCommand(click.RichCommand):
    """A command whose help is only as wide as its content."""

    def format_help(self, ctx: click.Context, formatter: object) -> None:
        """Size the help to the content before rendering it."""
        _resize_console(ctx, formatter)
        super().format_help(ctx, formatter)  # ty: ignore[invalid-argument-type]
