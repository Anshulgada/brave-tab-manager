"""Control the local Chromium DevTools port used by live capture.

The port is opened by the browser itself, so it has to be enabled before the
browser starts. On Linux the ``scripts/install-cdp-linux.sh`` installer wires
a launcher wrapper and a desktop entry override so the port opens on every
cold start; this module only flips the toggle that the wrapper reads.

The toggle lives next to the other Tabman state so it survives a reboot and
is shared by every tool that reads it.
"""

from __future__ import annotations

import socket
from dataclasses import dataclass
from pathlib import Path

from platformdirs import user_data_path

APP_NAME = "tabman"
DEFAULT_PORT = 9222
TOGGLE_NAME = "cdp-enabled"


class CdpError(RuntimeError):
    """Raised when the DevTools port state cannot be read or changed."""


def cdp_state_dir() -> Path:
    """Return the directory holding the DevTools toggle."""
    return user_data_path(APP_NAME, appauthor=False)


def toggle_path() -> Path:
    """Return the path of the file that enables the DevTools port."""
    return cdp_state_dir() / TOGGLE_NAME


def is_enabled() -> bool:
    """Return whether the port is enabled for the next browser start."""
    return toggle_path().is_file()


def set_enabled(enabled: bool) -> None:
    """Enable or disable the port for the next browser start."""
    path = toggle_path()
    try:
        if enabled:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.touch()
        elif path.exists():
            path.unlink()
    except OSError as error:
        raise CdpError(f"cannot change the DevTools toggle: {error}") from error


def port_is_listening(port: int = DEFAULT_PORT, host: str = "127.0.0.1") -> bool:
    """Return whether something is already listening on the DevTools port."""
    try:
        with socket.create_connection((host, port), timeout=1.0):
            return True
    except OSError:
        return False


@dataclass(frozen=True)
class CdpStatus:
    """A snapshot of the DevTools port state."""

    enabled: bool
    listening: bool
    port: int
    toggle: Path

    @property
    def summary(self) -> str:
        """Return a one-line description of the current state."""
        if self.listening:
            return f"listening on port {self.port}"
        if self.enabled:
            return f"enabled for the next browser start (port {self.port})"
        return "disabled"


def status(port: int = DEFAULT_PORT) -> CdpStatus:
    """Return the current DevTools port state."""
    return CdpStatus(
        enabled=is_enabled(),
        listening=port_is_listening(port),
        port=port,
        toggle=toggle_path(),
    )


def endpoint_for(port: int = DEFAULT_PORT) -> str:
    """Return the discovery endpoint for the given port."""
    return f"http://127.0.0.1:{port}"
