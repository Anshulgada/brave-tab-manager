#!/usr/bin/env sh
# Install the Tabman CLI with uv and, optionally, the browser extension.
#
# Usage:
#   curl -LsSf https://raw.githubusercontent.com/Anshulgada/brave-tab-manager/main/scripts/install.sh | sh
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
# Default to "main" for the published one-liner ("curl | sh"). When running
# from the repository root (Detected by the sibling .git), use whatever branch
# the checkout is on, so a feature branch never silently fetches main's
# older copy.
BRANCH="${TABMAN_BRANCH:-}"
if [ -z "$BRANCH" ] && [ -d "$(dirname "$0")/../.git" ]; then
    BRANCH="$(git -C "$(dirname "$0")/.." rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
fi
: "${BRANCH:=main}"
MINIMUM_VERSION="0.3.0"
VERSION="${TABMAN_VERSION:-latest}"
# Tabman requires Python 3.14 or newer. uv can download it, so the system
# Python does not have to match.
PYTHON_SPEC="${TABMAN_PYTHON:->=3.14}"

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
    # Tabman needs Python 3.14 or newer. Without this pin, uv resolves
    # against the system Python and silently picks the last release that
    # supports it -- 0.2.0 on Python 3.12, which is the old CLI and reports
    # itself as 0.1.0.
    if ! uv tool install --force --python "$PYTHON_SPEC" "$spec"; then
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
    if ! uv tool install --force --python "$PYTHON_SPEC" "$git_spec"; then
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
    if [ "$cdp_ready" = "1" ]; then
        echo ""
        echo "Live capture (CDP)"
        echo "  The browser was set up to open the DevTools port on start."
        echo "  Enable it for a session with:  tabman cdp enable"
        echo "  Then capture the tabs with:    tabman capture --name \"Open tabs\""
    fi
    echo ""
    echo "Docs: https://github.com/${REPOSITORY}"
}

install_cdp() {
    # Linux only for now: the Windows and macOS browsers are started by hand.
# Their desktop entries differ in format (Windows registry keys, macOS
# Application Support), so wiring the DevTools port there is out of scope
# for this script.
    [ "$(uname -s)" = "Linux" ] || return 0
    [ "${TABMAN_SKIP_CDP:-0}" = "1" ] && return 0

    # The script sits next to this one in a checkout, but when this installer
    # is piped straight from a URL ("curl ... | sh") there is no sibling
    # file to run. Fetch it in that case.
    cdp_script="$(dirname "$0")/install-cdp-linux.sh"
    if [ ! -f "$cdp_script" ]; then
        if ! command -v curl >/dev/null 2>&1; then
            echo "curl is required to fetch the DevTools setup. Run scripts/install-cdp-linux.sh later." >&2
            return 0
        fi
        cdp_script="$(mktemp "${TMPDIR:-/tmp}/tabman-cdp.XXXXXX.sh")"
        url="https://raw.githubusercontent.com/${REPOSITORY}/${BRANCH}/scripts/install-cdp-linux.sh"
        if ! curl -fsSL "$url" -o "$cdp_script" 2>/dev/null; then
            rm -f "$cdp_script"
            echo "The DevTools setup could not be downloaded. Run scripts/install-cdp-linux.sh later." >&2
            return 0
        fi
    fi

    echo ""
    echo "Setting up the DevTools port for live capture ..."
    if sh "$cdp_script" install; then
        cdp_ready=1
    else
        echo "The DevTools setup was skipped. Run scripts/install-cdp-linux.sh later." >&2
    fi

    # Only the downloaded copy is temporary; a sibling script is left alone.
    case "$cdp_script" in
        "${TMPDIR:-/tmp}"/tabman-cdp.*) rm -f "$cdp_script" ;;
    esac
}

ensure_uv
install_cli

extension_ready=0
cdp_ready=0
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

install_cdp

echo ""
echo "Tabman is installed. If 'tabman' is not found, open a new terminal."
tabman --version 2>/dev/null || true
show_next_steps
if [ "$extension_ready" -eq 0 ]; then
    echo "  (the extension was not downloaded; run scripts/install-extension.sh later)"
fi
