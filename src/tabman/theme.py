"""Shared rich-click styling for every Tabman command line surface.

The CLI, the installer scripts, and the local CI runner all present the same
look: rounded panels, a calm neutral palette, and quiet usage lines.
"""

from __future__ import annotations

import sys
from contextlib import suppress

import rich_click.rich_click as rich_click_config
from rich_click.utils import CommandGroupDict

MAX_WIDTH = 100
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
    rich_click_config.MAX_WIDTH = MAX_WIDTH
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
