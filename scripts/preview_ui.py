"""Serve the built extension UI in a normal browser for visual review.

The extension pages expect the WebExtension APIs. This script copies the
build output into a temporary folder, injects a small stub for the browser
globals, and serves the result over HTTP so the dashboard and the side
panel can be opened, seeded, and screenshotted in a regular browser.

Usage:
    uv run python scripts/preview_ui.py --port 8765
"""

from __future__ import annotations

import argparse
import functools
import http.server
import shutil
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "extension" / "output" / "chrome-mv3"
STUB = ROOT / "scripts" / "preview_stub.js"
PAGES = ("dashboard.html", "sidepanel.html")


def build_preview(target: Path) -> Path:
    """Copy the extension build and inject the browser API stub."""
    if not BUILD.exists():
        raise SystemExit(
            f"Build the extension first: cd extension && bun run build "
            f"({BUILD} is missing)"
        )
    shutil.copytree(BUILD, target, dirs_exist_ok=True)
    script = f"<script>\n{STUB.read_text(encoding='utf-8')}\n</script>"
    for page in PAGES:
        path = target / page
        if not path.exists():
            continue
        html = path.read_text(encoding="utf-8")
        if "tabman-preview" in html:
            continue
        path.write_text(
            html.replace("</head>", f"{script}\n</head>", 1), encoding="utf-8"
        )
    return target


def serve(directory: Path, port: int) -> http.server.ThreadingHTTPServer:
    """Serve ``directory`` on ``port`` without logging every request."""
    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler, directory=str(directory)
    )
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def main() -> int:
    """Run the preview server until interrupted."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--keep", action="store_true", help="keep the temporary copy")
    args = parser.parse_args()

    workdir = Path(tempfile.mkdtemp(prefix="tabman-preview-"))
    directory = build_preview(workdir)
    server = serve(directory, args.port)
    print(f"dashboard: http://127.0.0.1:{args.port}/dashboard.html")
    print(f"side panel: http://127.0.0.1:{args.port}/sidepanel.html")
    print(f"serving from {directory} (ctrl-c to stop)")
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        server.shutdown()
        if not args.keep:
            shutil.rmtree(workdir, ignore_errors=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
