"""Safe local CDP discovery tests."""

import httpx
import pytest

from tabman.capture import CaptureError, capture_collection


def test_capture_reads_metadata_without_browser_control_calls() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json=[
                {
                    "type": "page",
                    "title": "Example",
                    "url": "https://example.com/path",
                    "faviconUrl": "data:image/png;base64,abc",
                },
                {
                    "type": "page",
                    "title": "Duplicate URL in another target",
                    "url": "https://example.com/path",
                    "faviconUrl": "https://example.com/favicon.ico",
                },
                {
                    "type": "service_worker",
                    "title": "ignored",
                    "url": "https://example.com/worker",
                },
            ],
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        collection = capture_collection(
            "http://127.0.0.1:9222", "Captured", client=client
        )

    assert [request.url.path for request in requests] == ["/json/list"]
    assert len(collection.tabs) == 2
    assert collection.tabs[0].id != collection.tabs[1].id
    assert collection.tabs[0].hostname == "example.com"
    assert collection.tabs[0].fav_icon_url is None
    assert collection.tabs[1].fav_icon_url == "https://example.com/favicon.ico"


def test_capture_drops_http_favicons_without_a_host() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json=[
                {
                    "type": "page",
                    "title": "Example",
                    "url": "https://example.com/",
                    "faviconUrl": "https://",
                }
            ],
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        collection = capture_collection(
            "http://127.0.0.1:9222", "Captured", client=client
        )

    assert collection.tabs[0].fav_icon_url is None


def test_capture_skips_credentialed_urls_without_aborting() -> None:
    secret_page = "https://user:unused@example.com/private"  # pragma: allowlist secret
    secret_icon = (
        "https://user:unused@example.com/favicon.ico"  # pragma: allowlist secret
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json=[
                {
                    "type": "page",
                    "title": "Secret",
                    "url": secret_page,
                    "faviconUrl": "https://example.com/favicon.ico",
                },
                {
                    "type": "page",
                    "title": "Safe",
                    "url": "https://example.com/public",
                    "faviconUrl": secret_icon,
                },
            ],
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        collection = capture_collection(
            "http://127.0.0.1:9222", "Captured", client=client
        )

    assert len(collection.tabs) == 1
    assert collection.tabs[0].title == "Safe"
    assert collection.tabs[0].fav_icon_url is None


@pytest.mark.parametrize(
    "endpoint",
    [
        "https://127.0.0.1:9222",
        "http://example.com:9222",
        "file:///tmp/debug",
    ],
)
def test_capture_rejects_nonlocal_or_non_http_endpoints(endpoint: str) -> None:
    with pytest.raises(CaptureError, match="local HTTP"):
        capture_collection(endpoint, "Unsafe")
