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
                },
                {
                    "type": "page",
                    "title": "Duplicate URL in another target",
                    "url": "https://example.com/path",
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
