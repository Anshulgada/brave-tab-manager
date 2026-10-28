"""Tests for the DevTools port controls."""

from __future__ import annotations

from pathlib import Path

import pytest
from click.testing import CliRunner

from tabman.cdp import (
    CdpError,
    cdp_state_dir,
    endpoint_for,
    is_enabled,
    port_is_listening,
    set_enabled,
    status,
    toggle_path,
)
from tabman.cli import app

pytestmark = pytest.mark.usefixtures("isolated_cdp_state")


def invoke(*args: str):
    return CliRunner().invoke(app, list(args))


@pytest.fixture
def isolated_cdp_state(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point the DevTools toggle at a throwaway directory."""
    monkeypatch.setattr("tabman.cdp.user_data_path", lambda *a, **k: tmp_path)
    return tmp_path


def test_toggle_defaults_to_disabled() -> None:
    assert is_enabled() is False
    assert toggle_path().name == "cdp-enabled"
    assert toggle_path().parent == cdp_state_dir()


def test_enable_and_disable_flip_the_toggle() -> None:
    set_enabled(True)
    assert is_enabled() is True
    assert toggle_path().is_file()

    set_enabled(False)
    assert is_enabled() is False
    assert not toggle_path().exists()


def test_disabling_a_missing_toggle_is_not_an_error() -> None:
    set_enabled(False)
    set_enabled(False)
    assert is_enabled() is False


def test_status_reports_the_three_states(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("tabman.cdp.port_is_listening", lambda *a, **k: False)

    off = status()
    assert off.enabled is False
    assert off.listening is False
    assert off.summary == "disabled"

    set_enabled(True)
    on = status()
    assert on.enabled is True
    assert on.summary == "enabled for the next browser start (port 9222)"

    monkeypatch.setattr("tabman.cdp.port_is_listening", lambda *a, **k: True)
    live = status()
    assert live.listening is True
    assert live.summary == "listening on port 9222"


def test_endpoint_helper() -> None:
    assert endpoint_for(9222) == "http://127.0.0.1:9222"
    assert endpoint_for(9333) == "http://127.0.0.1:9333"


def test_port_is_listening_reports_closed_ports() -> None:
    # Port 1 is privileged and nothing listens on it in the test sandbox.
    assert port_is_listening(1) is False


def test_set_enabled_wraps_os_errors(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def boom(*args, **kwargs):
        raise OSError("read-only filesystem")

    monkeypatch.setattr(Path, "touch", boom)
    with pytest.raises(CdpError, match="cannot change the DevTools toggle"):
        set_enabled(True)


def test_cli_help_lists_the_cdp_group() -> None:
    result = invoke("--help")

    assert result.exit_code == 0
    assert "cdp" in result.output


def test_cli_cdp_group_help_lists_every_subcommand() -> None:
    result = invoke("cdp", "--help")

    assert result.exit_code == 0
    for command in ("status", "enable", "disable"):
        assert command in result.output


def test_cli_enable_then_disable_round_trips() -> None:
    enabled = invoke("cdp", "enable")
    assert enabled.exit_code == 0
    assert is_enabled() is True
    assert "tabman cdp enable" not in enabled.output

    disabled = invoke("cdp", "disable")
    assert disabled.exit_code == 0
    assert is_enabled() is False


def test_cli_status_reports_the_port_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("tabman.cdp.port_is_listening", lambda *a, **k: False)

    result = invoke("cdp", "status")

    assert result.exit_code == 0
    assert "disabled" in result.output
    assert "cdp-enabled" in result.output

    # The listening state must reach the output, not just the toggle state.
    monkeypatch.setattr("tabman.cdp.port_is_listening", lambda *a, **k: True)
    live = invoke("cdp", "status")

    assert live.exit_code == 0
    assert "listening on port 9222" in live.output
