#!/usr/bin/env sh
# Install the Tabman CLI with uv and, optionally, the browser extension.
#
# Usage:
#   curl -LsSf https://raw.githubusercontent.com/Anshulgada/brave-tab-manager/feat/rebuild/scripts/install.sh | sh
#   TABMAN_VERSION=0.3.14 sh scripts/install.sh
#
# Environment variables:
#   TABMAN_VERSION         pin a released version (default: latest)
#   TABMAN_ASSUME_YES      set to 1 to accept the extension prompt
#   TABMAN_SKIP_EXTENSION  set to 1 to skip the extension download
#   TABMAN_EXTENSION_ROOT  where the extension is unpacked
#                           (default: $HOME/.local/share/tabman)

set -eu

REPOSITORY="Anshulgada/brave-tab-manager"
# TODO: switch back to "main" once the rebuild branch is merged.
BRANCH="feat/rebuild"
MINIMUM_VERSION="0.3.0"
VERSION="${TABMAN_VERSION:-latest}"

ensure_uv() {
    if command -v uv >/dev/null 2>&1; then
        return
    fi
    echo "uv was not found; installing it first..."
    if ! command -v curl >/dev/null 2>&1; then
        echo "curl is required to install uv." >&2
        exit 1
    fi
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
}

version_is_current() {
    # Succeeds when the installed version is at least $MINIMUM_VERSION.
    awk -v current="$1" -v minimum="$MINIMUM_VERSION" 'BEGIN {
        split(current, parts, ".");
        split(minimum, floor, ".");
        for (i = 1; i <= 3; i++) {
            left = (i <= length(parts)) ? parts[i] + 0 : 0;
            right = (i <= length(floor)) ? floor[i] + 0 : 0;
            if (left > right) { exit 0; }
            if (left < right) { exit 1; }
        }
        exit 0;
    }'
}

tabman_version() {
    command -v tabman >/dev/null 2>&1 || return 0
    tabman --version 2>/dev/null | tr -d '[:space:]' || true
}

install_cli() {
    if [ "$VERSION" = "latest" ]; then
        spec="tabman"
    else
        spec="tabman==$VERSION"
    fi
    echo "Installing ${spec} ..."
    if ! uv tool install --force "$spec"; then
        echo "The published package could not be installed; using the Git branch."
    fi
    export PATH="$HOME/.local/bin:$PATH"
    uv tool update-shell >/dev/null 2>&1 || true

    current="$(tabman_version)"
    if [ -n "$current" ] && version_is_current "$current"; then
        return
    fi

    git_spec="git+https://github.com/${REPOSITORY}.git@${BRANCH}"
    echo "Installing ${git_spec} (current development build) ..."
    if ! uv tool install --force "$git_spec"; then
        echo "Tabman could not be installed. Check your network connection and retry." >&2
        exit 1
    fi
    export PATH="$HOME/.local/bin:$PATH"
    current="$(tabman_version)"
    if [ -z "$current" ]; then
        echo "Tabman was installed but 'tabman --version' failed. Open a new terminal and retry." >&2
        exit 1
    fi
}

install_extension() {
    destination_root="${TABMAN_EXTENSION_ROOT:-$HOME/.local/share/tabman}"
    destination="$destination_root/extension-latest"
    url="https://github.com/${REPOSITORY}/releases/latest/download/tabmanextension-latest-chrome.zip"
    archive="$(mktemp "${TMPDIR:-/tmp}/tabman-extension.XXXXXX.zip")"

    echo "Downloading the Tabman extension ..."
    if ! curl -fsSL "$url" -o "$archive"; then
        rm -f "$archive"
        echo ""
        echo "The extension archive could not be downloaded yet."
        echo "Get it from https://github.com/${REPOSITORY}/releases once a release exists."
        return 1
    fi

    rm -rf "$destination"
    mkdir -p "$destination"
    if command -v unzip >/dev/null 2>&1; then
        unzip -q "$archive" -d "$destination"
    elif command -v python3 >/dev/null 2>&1; then
        python3 -m zipfile -e "$archive" "$destination"
    else
        rm -f "$archive"
        echo "unzip or python3 is required to extract the extension." >&2
        return 1
    fi
    rm -f "$archive"

    echo ""
    echo "Extension unpacked at:"
    echo "  $destination"
    return 0
}

show_next_steps() {
    extension_path="${TABMAN_EXTENSION_ROOT:-$HOME/.local/share/tabman}/extension-latest"
    echo ""
    echo "Next steps"
    echo "  1. tabman --help              show every command"
    echo "  2. tabman config show         check the vault and provider settings"
    echo "  3. tabman import <export>     import a Tabman export into the vault"
    echo "  4. tabman search <text>       search the vault"
    echo "  5. uvx tabman --help          run the CLI without installing it"
    echo ""
    echo "Browser extension"
    echo "  Open chrome://extensions, enable Developer mode,"
    echo "  choose Load unpacked, and select:"
    echo "    $extension_path"
    echo ""
    echo "Docs: https://github.com/${REPOSITORY}"
}

ensure_uv
install_cli

extension_ready=0
if [ "${TABMAN_SKIP_EXTENSION:-0}" != "1" ]; then
    answer="n"
    if [ "${TABMAN_ASSUME_YES:-0}" = "1" ]; then
        answer="y"
    elif [ -r /dev/tty ]; then
        printf "Download the Tabman browser extension too? [y/N] " >/dev/tty
        read -r answer </dev/tty || answer="n"
    fi
    case "$answer" in
        y|Y|yes|YES)
            if install_extension; then
                extension_ready=1
            fi
            ;;
    esac
fi

echo ""
echo "Tabman is installed. If 'tabman' is not found, open a new terminal."
tabman --version 2>/dev/null || true
show_next_steps
if [ "$extension_ready" -eq 0 ]; then
    echo "  (the extension was not downloaded; run scripts/install-extension.sh later)"
fi
