#!/usr/bin/env sh
# Download the latest Tabman extension release and prepare it for "Load unpacked".
#
# Usage:
#   curl -LsSf https://raw.githubusercontent.com/Anshulgada/brave-tab-manager/main/scripts/install-extension.sh | sh
#
# Environment variables:
#   TABMAN_EXTENSION_ROOT  where the extension is unpacked
#                           (default: $HOME/.local/share/tabman)

set -eu

REPOSITORY="Anshulgada/brave-tab-manager"
DESTINATION_ROOT="${TABMAN_EXTENSION_ROOT:-$HOME/.local/share/tabman}"
DESTINATION="$DESTINATION_ROOT/extension-latest"
URL="https://github.com/${REPOSITORY}/releases/latest/download/tabmanextension-latest-chrome.zip"

if ! command -v curl >/dev/null 2>&1; then
    echo "curl is required to download the extension." >&2
    exit 1
fi

ARCHIVE="$(mktemp "${TMPDIR:-/tmp}/tabman-extension.XXXXXX.zip")"
echo "Downloading the Tabman extension ..."
if ! curl -fsSL "$URL" -o "$ARCHIVE"; then
    rm -f "$ARCHIVE"
    echo "The extension archive could not be downloaded yet." >&2
    echo "Get it from https://github.com/${REPOSITORY}/releases once a release exists." >&2
    exit 1
fi

rm -rf "$DESTINATION"
mkdir -p "$DESTINATION"
if command -v unzip >/dev/null 2>&1; then
    unzip -q "$ARCHIVE" -d "$DESTINATION"
elif command -v python3 >/dev/null 2>&1; then
    python3 -m zipfile -e "$ARCHIVE" "$DESTINATION"
else
    rm -f "$ARCHIVE"
    echo "unzip or python3 is required to extract the extension." >&2
    exit 1
fi
rm -f "$ARCHIVE"

echo ""
echo "Extension unpacked at:"
echo "  $DESTINATION"
echo ""
echo "Next steps"
echo "  1. Open chrome://extensions (brave://extensions in Brave)."
echo "  2. Enable Developer mode."
echo "  3. Choose Load unpacked and select the folder above."
echo "  4. Open the browser side panel and pick Tabman."
