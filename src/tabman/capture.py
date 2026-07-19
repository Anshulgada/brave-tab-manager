"""Read-only capture from Chromium's local DevTools discovery endpoint."""

from __future__ import annotations

from datetime import UTC, datetime
from urllib.parse import urlsplit
from uuid import uuid4

import httpx

from tabman.models import Collection, CollectionStatus, Tab


class CaptureError(RuntimeError):
    """Raised when the local browser endpoint cannot provide valid tabs."""


def _discovery_url(endpoint: str) -> str:
    parsed = urlsplit(endpoint)
    local_hosts = {"127.0.0.1", "localhost", "::1"}
    if parsed.scheme != "http" or parsed.hostname not in local_hosts:
        raise CaptureError("CDP discovery endpoint must be local HTTP")
    return f"{endpoint.rstrip('/')}/json/list"


def capture_collection(
    endpoint: str,
    name: str,
    *,
    client: httpx.Client | None = None,
) -> Collection:
    """Capture page metadata without opening a control socket or closing the browser."""
    owns_client = client is None
    http = client or httpx.Client(timeout=5.0)
    try:
        response = http.get(_discovery_url(endpoint))
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise CaptureError(f"cannot read Chromium tabs: {error}") from error
    finally:
        if owns_client:
            http.close()
    if not isinstance(payload, list):
        raise CaptureError("Chromium discovery response must be an array")

    now = datetime.now(UTC)
    tabs: list[Tab] = []
    for item in payload:
        if not isinstance(item, dict) or item.get("type") != "page":
            continue
        title, url = item.get("title"), item.get("url")
        if not isinstance(title, str) or not isinstance(url, str):
            continue
        parsed = urlsplit(url)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
        ):
            continue
        raw_favicon = item.get("faviconUrl")
        fav_icon = raw_favicon if isinstance(raw_favicon, str) else None
        if fav_icon is not None:
            fav_parsed = urlsplit(fav_icon)
            if (
                fav_parsed.scheme.casefold() not in {"http", "https"}
                or not fav_parsed.hostname
                or fav_parsed.username is not None
                or fav_parsed.password is not None
            ):
                fav_icon = None
        tabs.append(
            Tab(
                id=uuid4(),
                title=title,
                url=url,
                hostname=parsed.hostname,
                fav_icon_url=fav_icon,
                pinned=False,
                position=len(tabs),
                created_at=now,
                last_accessed_at=None,
            )
        )
    if not tabs:
        raise CaptureError("no HTTP(S) page tabs were returned")
    return Collection(
        id=uuid4(),
        name=name,
        description="Captured from Chromium's local debugging endpoint",
        color=None,
        created_at=now,
        updated_at=now,
        status=CollectionStatus.ACTIVE,
        tags=(),
        tabs=tuple(tabs),
    )
