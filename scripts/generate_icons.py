"""Generate the Tabman extension icons.

Renders a rounded square with the Tabman gradient and a bold "T" glyph at
four sizes, using only the standard library so the icons can be rebuilt
without a native image dependency.

Usage:
    uv run python scripts/generate_icons.py
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "extension" / "public"
SIZES = (16, 32, 48, 128)
SUPERSAMPLE = 4
BACKGROUND_START = (91, 108, 255)
BACKGROUND_END = (154, 91, 255)
GLYPH = (255, 255, 255)


def _rounded_rect(
    x: int, y: int, left: float, top: float, right: float, bottom: float, radius: float
) -> bool:
    """Return whether a pixel sits inside a rounded rectangle."""
    if x < left or x > right or y < top or y > bottom:
        return False
    nearest_x = min(max(x, left + radius), right - radius)
    nearest_y = min(max(y, top + radius), bottom - radius)
    return (x - nearest_x) ** 2 + (y - nearest_y) ** 2 <= radius * radius


def _render(size: int) -> bytes:
    """Render one RGBA icon and return its raw pixel bytes."""
    scale = size * SUPERSAMPLE
    radius = scale * 0.22
    inset = scale * 0.06
    left, top = inset, inset
    right, bottom = scale - inset, scale - inset

    bar_left, bar_right = scale * 0.28, scale * 0.72
    bar_top, bar_bottom = scale * 0.26, scale * 0.40
    stem_left, stem_right = scale * 0.44, scale * 0.56
    stem_top, stem_bottom = scale * 0.26, scale * 0.74
    stem_radius = (stem_right - stem_left) / 2

    pixels = bytearray()
    for y in range(size):
        for x in range(size):
            totals = [0, 0, 0, 0]
            for sub_y in range(SUPERSAMPLE):
                for sub_x in range(SUPERSAMPLE):
                    px = x * SUPERSAMPLE + sub_x
                    py = y * SUPERSAMPLE + sub_y
                    if not _rounded_rect(px, py, left, top, right, bottom, radius):
                        continue
                    ratio = (px - left + py - top) / max(
                        (right - left) + (bottom - top), 1
                    )
                    color = [
                        round(start + (end - start) * ratio)
                        for start, end in zip(
                            BACKGROUND_START, BACKGROUND_END, strict=True
                        )
                    ]
                    in_bar = _rounded_rect(
                        px, py, bar_left, bar_top, bar_right, bar_bottom, stem_radius
                    )
                    in_stem = _rounded_rect(
                        px,
                        py,
                        stem_left,
                        stem_top,
                        stem_right,
                        stem_bottom,
                        stem_radius,
                    )
                    if in_bar or in_stem:
                        color = list(GLYPH)
                    totals[0] += color[0]
                    totals[1] += color[1]
                    totals[2] += color[2]
                    totals[3] += 255
            samples = SUPERSAMPLE * SUPERSAMPLE
            if totals[3] == 0:
                pixels.extend((0, 0, 0, 0))
                continue
            pixels.extend(
                (
                    totals[0] // samples,
                    totals[1] // samples,
                    totals[2] // samples,
                    totals[3] // samples,
                )
            )
    return bytes(pixels)


def _chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def _png(size: int, pixels: bytes) -> bytes:
    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    rows = b"".join(
        b"\x00" + pixels[row * size * 4 : (row + 1) * size * 4] for row in range(size)
    )
    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", header)
        + _chunk(b"IDAT", zlib.compress(rows, 9))
        + _chunk(b"IEND", b"")
    )


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        path = OUTPUT_DIR / f"icon-{size}.png"
        path.write_bytes(_png(size, _render(size)))
        print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
