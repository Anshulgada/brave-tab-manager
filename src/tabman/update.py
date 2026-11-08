"""Version checking and self-upgrade for the Tabman CLI."""

from __future__ import annotations

import contextlib
import json
import os
import re
import shutil
import subprocess  # nosec B404
import sys
import urllib.request
from typing import NamedTuple

from tabman import __version__

PYPI_URL = "https://pypi.org/pypi/tabman/json"
GITHUB_RELEASES_URL = (
    "https://api.github.com/repos/Anshulgada/brave-tab-manager/releases/latest"
)


class VersionInfo(NamedTuple):
    current: str
    latest: str
    update_available: bool


def parse_version(v: str) -> tuple[int, ...]:
    """Extract integer segments for semantic version comparison."""
    nums = re.findall(r"\d+", v)
    return tuple(map(int, nums)) if nums else (0,)


def check_latest_version(timeout: float = 4.0) -> VersionInfo:
    """Fetch the latest release version from PyPI, falling back to GitHub."""
    latest = __version__
    try:
        req = urllib.request.Request(
            PYPI_URL,
            headers={
                "User-Agent": (
                    f"tabman/{__version__} "
                    "(https://github.com/Anshulgada/brave-tab-manager)"
                )
            },
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # nosec B310
            data = json.loads(resp.read().decode("utf-8"))
            latest = data.get("info", {}).get("version", __version__)
    except Exception:
        # Fallback to GitHub releases
        with contextlib.suppress(Exception):
            gh_req = urllib.request.Request(
                GITHUB_RELEASES_URL,
                headers={"User-Agent": f"tabman/{__version__}"},
            )
            with urllib.request.urlopen(gh_req, timeout=timeout) as resp:  # nosec B310
                data = json.loads(resp.read().decode("utf-8"))
                tag = data.get("tag_name", "").lstrip("v")
                if tag:
                    latest = tag

    has_update = parse_version(latest) > parse_version(__version__)
    return VersionInfo(current=__version__, latest=latest, update_available=has_update)


def find_uv_binary() -> str | None:
    """Find uv in PATH or standard installation directories."""
    found = shutil.which("uv")
    if found:
        return found

    from pathlib import Path

    home = Path.home()
    candidates = [
        home / ".local" / "bin" / ("uv.exe" if sys.platform == "win32" else "uv"),
        home / ".cargo" / "bin" / ("uv.exe" if sys.platform == "win32" else "uv"),
    ]
    for c in candidates:
        if c.is_file() and os.access(c, os.X_OK):
            return str(c)
    return None


def run_upgrade() -> tuple[bool, str]:
    """Execute the best available package manager upgrade command.

    Supports uv tool, pipx, standard pip, and official one-line release installers.
    """
    # 1. Check uv first (Used by official one-line install scripts)
    uv_bin = find_uv_binary()
    if uv_bin:
        cmd = [uv_bin, "tool", "upgrade", "tabman"]
        with contextlib.suppress(Exception):
            res = subprocess.run(  # nosec B603
                cmd, capture_output=True, text=True, check=False
            )
            if res.returncode == 0:
                return (
                    True,
                    f"Successfully upgraded via uv:\n{res.stdout or res.stderr}",
                )

    # 2. Check pipx
    if shutil.which("pipx"):
        cmd = ["pipx", "upgrade", "tabman"]
        with contextlib.suppress(Exception):
            res = subprocess.run(  # nosec B603
                cmd, capture_output=True, text=True, check=False
            )
            if res.returncode == 0:
                return (
                    True,
                    f"Successfully upgraded via pipx:\n{res.stdout or res.stderr}",
                )

    # 3. Check official PowerShell / curl release installer if installed via one-liner
    if sys.platform == "win32":
        ps = shutil.which("pwsh") or shutil.which("powershell")
        if ps:
            script_url = (
                "https://raw.githubusercontent.com/Anshulgada/"
                "brave-tab-manager/main/scripts/install.ps1"
            )
            install_cmd = [
                ps,
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                f"irm {script_url} | iex",
            ]
            with contextlib.suppress(Exception):
                res = subprocess.run(  # nosec B603
                    install_cmd, capture_output=True, text=True, check=False
                )
                if res.returncode == 0:
                    return (
                        True,
                        f"Successfully upgraded via official installer:\n{res.stdout}",
                    )
    else:
        if shutil.which("curl") and shutil.which("sh"):
            sh_url = (
                "https://raw.githubusercontent.com/Anshulgada/"
                "brave-tab-manager/main/scripts/install.sh"
            )
            install_cmd = [
                "sh",
                "-c",
                f"curl -LsSf {sh_url} | sh",
            ]
            with contextlib.suppress(Exception):
                res = subprocess.run(  # nosec B603
                    install_cmd, capture_output=True, text=True, check=False
                )
                if res.returncode == 0:
                    return (
                        True,
                        f"Successfully upgraded via official installer:\n{res.stdout}",
                    )

    # 4. Fallback to pip
    cmd = [sys.executable, "-m", "pip", "install", "--upgrade", "tabman"]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=False)  # nosec B603
        if res.returncode == 0:
            return True, f"Successfully upgraded via pip:\n{res.stdout or res.stderr}"
        return False, f"Upgrade failed: {res.stderr or res.stdout}"
    except Exception as e:
        return False, f"Upgrade execution error: {e}"
