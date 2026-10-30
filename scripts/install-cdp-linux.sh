#!/usr/bin/env sh
# Enable Chromium DevTools (CDP) capture for a Linux Brave install.
#
# `tabman capture` reads open tabs from a local Chromium DevTools endpoint
# (http://127.0.0.1:9222). Brave only serves that endpoint when it is started
# with --remote-debugging-port, and Chromium is single-instance: a flag handed
# to an already-running browser is ignored. Both are solved here by installing
# a launcher wrapper and pointing the desktop entry at it, so the port opens
# on every cold start -- from the dock, the app grid, or a file manager.
#
# Usage:
#   curl -LsSf https://raw.githubusercontent.com/Anshulgada/brave-tab-manager/main/scripts/install-cdp-linux.sh | sh
#
#   sh scripts/install-cdp-linux.sh            # install
#   sh scripts/install-cdp-linux.sh status     # show the current state
#   sh scripts/install-cdp-linux.sh on         # enable the port
#   sh scripts/install-cdp-linux.sh off        # disable the port
#   sh scripts/install-cdp-linux.sh uninstall  # remove everything again
#
# Environment variables:
#   TABMAN_CDP_PORT        DevTools port to use (default: 9222)
#   TABMAN_CDP_AUTOSTART   Set to 0 to install with the port off, so it only
#                          opens when you run `tabman cdp enable`. Default is 1:
#                          the port is ready whenever Brave starts.
#
# The port is bound to 127.0.0.1 only, so it is reachable from this machine
# but not from the network. Any process running as you can still drive the
# browser through it, which is why `tabman cdp disable` exists.
#
# Chromium no longer has a --remote-debugging-address switch: the DevTools
# server hardcodes 127.0.0.1 and then ::1, so there is no way to widen the
# binding from the command line.

set -eu

CDP_PORT="${TABMAN_CDP_PORT:-9222}"

# Where Tabman keeps its state. The CLI resolves this with platformdirs, so
# ask platformdirs too when it is available, and fall back to the Linux
# default otherwise. Both must agree, or `tabman cdp enable` and this script
# would read different files.
DATA_ROOT="${TABMAN_EXTENSION_ROOT:-}"
if [ -z "$DATA_ROOT" ]; then
    for python_cmd in python3 python; do
        if command -v "$python_cmd" >/dev/null 2>&1; then
            resolved="$("$python_cmd" -c \
                'import platformdirs; print(platformdirs.user_data_path("tabman", appauthor=False))' \
                2>/dev/null || true)"
            if [ -n "$resolved" ]; then
                DATA_ROOT="$resolved"
                break
            fi
        fi
    done
fi
: "${DATA_ROOT:=$HOME/.local/share/tabman}"

BIN_ROOT="$HOME/.local/bin"
APPS_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
BACKUP_ROOT="$DATA_ROOT/desktop-backups"
TOGGLE_FILE="$DATA_ROOT/cdp-enabled"
WRAPPER="$BIN_ROOT/brave-with-cdp"
HELPER="$BIN_ROOT/tabman-cdp"
MARKER="# Tabman: launched through brave-with-cdp so the DevTools port opens."

# The system directories that may hold a Brave desktop entry, in priority
# order. The first hit is the one that is shown in the app grid; the rest are
# overridden too so the portal, the dock, and "Open with" all agree.
SYSTEM_APP_DIRS="/usr/share/applications
/var/lib/flatpak/exports/share/applications
/var/lib/snapd/desktop/applications"

# Autostart directories, in XDG priority order. A user file with the same
# desktop file ID shadows the system one, so a system-wide Brave autostart
# entry is overridden here rather than edited in place.
AUTOSTART_DIRS="${XDG_CONFIG_HOME:-$HOME/.config}/autostart
/etc/xdg/autostart
/etc/xdg/xdg-ubuntu/autostart"

# --- helpers ----------------------------------------------------------------

say() {
    printf '%s\n' "$*"
}

die() {
    printf '%s\n' "$*" >&2
    exit 1
}

# Print the system desktop entries for Brave, one per line.
detect_desktop_sources() {
    for dir in $SYSTEM_APP_DIRS; do
        for file in "$dir"/*.desktop; do
            [ -f "$file" ] || continue
            if grep -qiE "^Name=.*Brave" "$file" 2>/dev/null; then
                printf '%s\n' "$file"
            fi
        done
    done
}

# The command the wrapper actually execs. Native packages win, then flatpak,
# then snap.
detect_launch_command() {
    for candidate in /usr/bin/brave-browser-stable /usr/bin/brave-browser /usr/bin/brave; do
        if [ -x "$candidate" ]; then
            printf '%s' "$candidate"
            return 0
        fi
    done
    if command -v flatpak >/dev/null 2>&1 && flatpak info com.brave.Browser >/dev/null 2>&1; then
        printf '%s' "flatpak run com.brave.Browser"
        return 0
    fi
    if command -v snap >/dev/null 2>&1 && snap list brave >/dev/null 2>&1; then
        printf '%s' "snap run brave"
        return 0
    fi
    return 1
}

# Print the autostart entries that launch Brave, one per line. A user entry
# with the same desktop file ID shadows the system one, so the first match per
# directory is enough.
detect_autostart_sources() {
    for dir in $AUTOSTART_DIRS; do
        [ -d "$dir" ] || continue
        for file in "$dir"/*.desktop; do
            [ -f "$file" ] || continue
            # Only entries that actually run the browser.
            if grep -qiE "^Exec=.*brave" "$file" 2>/dev/null; then
                printf '%s\n' "$file"
            fi
        done
    done
}

# --- install ----------------------------------------------------------------

write_wrapper() {
    mkdir -p "$BIN_ROOT"
    cat > "$WRAPPER" <<EOF
#!/usr/bin/env bash
# Launch Brave with the Chromium DevTools port enabled so that
# \`tabman capture\` can read the open tabs over CDP.
#
# Installed by the Tabman installer. The port is only added when the toggle
# file exists:
#   enable :  touch "$TOGGLE_FILE"
#   disable:  rm -f    "$TOGGLE_FILE"
#
# Remote debugging lets any local process control the browser. Chromium binds
# the DevTools port to 127.0.0.1 (then ::1) and has no way to widen it, so
# the port is not reachable from the network. \`tabman cdp disable\` turns it off
# completely.
#
# Chromium is single-instance. If Brave is already running, a new launch is
# forwarded to the running process and the flag is ignored, so the port only
# opens on a cold start. The wrapper says so instead of failing silently.

set -uo pipefail

BRAVE_CMD=($(printf '%s' "$LAUNCH_COMMAND"))
ENABLE_FILE="$TOGGLE_FILE"
CDP_PORT="$CDP_PORT"

port_open() {
    ss -tln 2>/dev/null | grep -q ":\${CDP_PORT}[[:space:]]"
}

# The profile this launch would use. Chromium is single-instance per
# user-data-dir, so only an instance already on this profile would swallow
# the flag; a Brave running on a different profile does not.
target_user_data_dir() {
    local arg next
    for arg in "\$@"; do
        case "\$arg" in
            --user-data-dir=*) printf '%s' "\${arg#--user-data-dir=}"; return 0 ;;
            --user-data-dir) next=1; continue ;;
        esac
        if [ "\${next:-}" = "1" ]; then printf '%s' "\$arg"; return 0; fi
    done
    printf ''
}

same_profile_running() {
    local want pid cmd
    want="\$(target_user_data_dir "\$@")"
    for pid in \$(pgrep -x brave 2>/dev/null); do
        cmd="\$(tr '\\0' ' ' < "/proc/\$pid/cmdline" 2>/dev/null)" || continue
        case "\$cmd" in
            *--type=*) continue ;;   # child process, not a browser instance
        esac
        if [ -z "\$want" ]; then
            # Default profile: any instance without an explicit --user-data-dir
            # is on the default profile.
            case "\$cmd" in
                *--user-data-dir=*) continue ;;
            esac
            return 0
        fi
        case "\$cmd" in
            "--user-data-dir=\$want "*|*" --user-data-dir=\$want "*|*"--user-data-dir=\$want")
                return 0 ;;
        esac
    done
    return 1
}

if [[ ! -f "\$ENABLE_FILE" ]]; then
    exec "\${BRAVE_CMD[@]}" "\$@"
fi

if port_open; then
    # A CDP-enabled instance is already up; this launch just forwards to it.
    exec "\${BRAVE_CMD[@]}" "\$@"
fi

if same_profile_running "\$@"; then
    notify-send --app-name=Brave "Tabman / CDP" \\
        "Brave is already running on this profile, so the DevTools port was not enabled. Quit Brave completely, then reopen it." \\
        2>/dev/null || true
    exec "\${BRAVE_CMD[@]}" "\$@"
fi

exec "\${BRAVE_CMD[@]}" \\
    --remote-debugging-port="\$CDP_PORT" \\
    "\$@"
EOF
    chmod 0755 "$WRAPPER"
}

write_helper() {
    mkdir -p "$BIN_ROOT"
    # `tabman cdp` is the canonical interface. This helper delegates to it
    # when the CLI is on PATH and falls back to the same toggle file
    # otherwise, so the port can be controlled before the CLI is installed.
    cat > "$HELPER" <<EOF
#!/usr/bin/env sh
# Toggle the Tabman DevTools (CDP) port used by \`tabman capture\`.
#
#   tabman-cdp on         enable the port for the next Brave start
#   tabman-cdp off        disable it
#   tabman-cdp status     show whether the port is on and reachable
#
# This is a thin alias for \`tabman cdp\`, which is the canonical interface.
# It exists so the port can be toggled even before the CLI is on PATH.
#
# The port opens when Brave starts from the dock or the app grid. Quit Brave
# completely before expecting it to take effect, because Chromium ignores
# flags handed to a browser that is already running.

set -eu

if command -v tabman >/dev/null 2>&1; then
    case "\${1:-status}" in
        on) exec tabman cdp enable ;;
        off) exec tabman cdp disable ;;
        status) exec tabman cdp status ;;
        *)
            echo "usage: tabman-cdp [on|off|status]" >&2
            exit 1
            ;;
    esac
fi

TOGGLE_FILE="$TOGGLE_FILE"
CDP_PORT="$CDP_PORT"

case "\${1:-status}" in
    on)
        mkdir -p "\$(dirname "\$TOGGLE_FILE")"
        : > "\$TOGGLE_FILE"
        echo "Tabman DevTools port enabled. Restart Brave to apply it."
        ;;
    off)
        rm -f "\$TOGGLE_FILE"
        echo "Tabman DevTools port disabled. Restart Brave to apply it."
        ;;
    status)
        if [ -f "\$TOGGLE_FILE" ]; then
            echo "port enabled for the next Brave start (port \$CDP_PORT)"
        else
            echo "port disabled"
        fi
        if command -v ss >/dev/null 2>&1 && ss -tln 2>/dev/null | grep -q ":\${CDP_PORT}[[:space:]]"; then
            echo "port \$CDP_PORT is listening right now"
        else
            echo "port \$CDP_PORT is not listening"
        fi
        ;;
    *)
        echo "usage: tabman-cdp [on|off|status]" >&2
        exit 1
        ;;
esac
EOF
    chmod 0755 "$HELPER"
}

# Build the override for one system desktop entry. The system file stays
# untouched; the override lives in the user applications directory, which
# takes precedence in the XDG lookup.
write_desktop_override() {
    source_file="$1"
    base=$(basename "$source_file")
    target="$APPS_ROOT/$base"

    mkdir -p "$APPS_ROOT" "$BACKUP_ROOT"

    # Preserve a user override that already existed, so uninstall can put it
    # back instead of leaving the user with nothing.
    if [ -f "$target" ] && ! grep -q "$MARKER" "$target" 2>/dev/null; then
        if [ ! -f "$BACKUP_ROOT/$base" ]; then
            cp "$target" "$BACKUP_ROOT/$base"
        fi
    fi

    # Replace the leading command of every Exec line with the wrapper and
    # keep the trailing field codes (%U, --incognito, and so on).
    sed -E \
        -e "s|^Exec=flatpak run com\.brave\.Browser(.*)\$|Exec=$WRAPPER\\1|" \
        -e "s|^Exec=snap run brave(.*)\$|Exec=$WRAPPER\\1|" \
        -e "s|^Exec=[^[:space:]]+(.*)\$|Exec=$WRAPPER\\1|" \
        "$source_file" > "$target"

    # Mark the file so status and uninstall can recognise it.
    if ! grep -q "$MARKER" "$target"; then
        sed -i "1a $MARKER" "$target"
    fi

    chmod 0644 "$target"
    if command -v desktop-file-validate >/dev/null 2>&1; then
        if ! desktop-file-validate "$target" >/dev/null 2>&1; then
            say "warning: desktop-file-validate reported a problem with $target"
        fi
    fi
    printf '%s' "$target"
}

# Build the override for one Brave autostart entry. A system entry is never
# edited; instead a copy with the same desktop file ID is written to the user
# autostart directory, which takes precedence in the XDG lookup. A user entry
# is rewritten in place, with a backup.
write_autostart_override() {
    source_file="$1"
    base=$(basename "$source_file")
    user_dir="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
    target="$user_dir/$base"

    mkdir -p "$user_dir" "$BACKUP_ROOT/autostart"

    if [ "$source_file" = "$target" ]; then
        # User-owned entry: back it up, then rewrite in place.
        if [ ! -f "$BACKUP_ROOT/autostart/$base" ]; then
            cp "$source_file" "$BACKUP_ROOT/autostart/$base"
        fi
    else
        # System entry: keep the original untouched and shadow it from the
        # user directory.
        if [ -f "$target" ] && ! grep -q "$MARKER" "$target" 2>/dev/null; then
            if [ ! -f "$BACKUP_ROOT/autostart/$base" ]; then
                cp "$target" "$BACKUP_ROOT/autostart/$base"
            fi
        fi
    fi

    # Swap the browser command for the wrapper, keeping the arguments. The
    # rewrite goes through a temporary file: for a user-owned entry the
    # source and the target are the same path, and sed would otherwise read
    # and write it at the same time and truncate it.
    tmp_file="$BACKUP_ROOT/autostart/.$base.new"
    sed -E \
        -e "s|^Exec=flatpak run com\.brave\.Browser(.*)\$|Exec=$WRAPPER\\1|" \
        -e "s|^Exec=snap run brave(.*)\$|Exec=$WRAPPER\\1|" \
        -e "s|^Exec=[^[:space:]]+(.*)\$|Exec=$WRAPPER\\1|" \
        "$source_file" > "$tmp_file"
    cat "$tmp_file" > "$target"
    rm -f "$tmp_file"

    if ! grep -q "$MARKER" "$target"; then
        sed -i "1a $MARKER" "$target"
    fi

    chmod 0644 "$target"
    if command -v desktop-file-validate >/dev/null 2>&1; then
        if ! desktop-file-validate "$target" >/dev/null 2>&1; then
            say "warning: desktop-file-validate reported a problem with $target"
        fi
    fi
    printf '%s' "$target"
}

# --- commands ---------------------------------------------------------------

status() {
    say "Tabman DevTools (CDP) setup"
    say ""
    if [ -x "$WRAPPER" ]; then
        say "  wrapper   : $WRAPPER"
    else
        say "  wrapper   : not installed"
    fi
    if [ -x "$HELPER" ]; then
        say "  helper    : $HELPER"
    else
        say "  helper    : not installed"
    fi
    if [ -f "$TOGGLE_FILE" ]; then
        say "  port      : enabled for the next Brave start (port $CDP_PORT)"
    else
        say "  port      : disabled"
    fi
    if command -v ss >/dev/null 2>&1 && ss -tln 2>/dev/null | grep -q ":${CDP_PORT}[[:space:]]"; then
        say "  listening : yes, port $CDP_PORT is open right now"
    else
        say "  listening : no, port $CDP_PORT is closed"
    fi
    say ""
    say "  Desktop entry overrides:"
    for file in "$APPS_ROOT"/*.desktop; do
        [ -f "$file" ] || continue
        if grep -q "$MARKER" "$file" 2>/dev/null; then
            say "    $file"
        fi
    done
    say ""
    say "  Autostart overrides:"
    autostart_found=0
    for file in $(detect_autostart_sources); do
        if grep -q "$MARKER" "$file" 2>/dev/null; then
            say "    $file"
            autostart_found=1
        fi
    done
    if [ "$autostart_found" -eq 0 ]; then
        say "    (none -- Brave does not autostart on this machine)"
    fi
}

install() {
    launch_command="$(detect_launch_command)" ||
        die "Brave does not seem to be installed. Install Brave first, then rerun this script."

    sources="$(detect_desktop_sources)"
    [ -n "$sources" ] || die "No Brave desktop entry was found."

    say "Installing the Tabman DevTools setup for Brave..."
    say "  launch command: $launch_command"
    say "  devtools port : $CDP_PORT"
    say ""

    LAUNCH_COMMAND="$launch_command" write_wrapper
    write_helper

    for source_file in $sources; do
        target="$(write_desktop_override "$source_file")"
        say "  desktop  -> $target"
    done

    say "  wrapper  -> $WRAPPER"
    say "  helper   -> $HELPER"

    # If Brave autostarts, route that entry through the wrapper too, so a
    # login-launched browser opens the port as well.
    for source_file in $(detect_autostart_sources); do
        target="$(write_autostart_override "$source_file")"
        say "  autostart-> $target"
    done
    say ""

    if [ "${TABMAN_CDP_AUTOSTART:-1}" = "1" ]; then
        mkdir -p "$DATA_ROOT"
        : > "$TOGGLE_FILE"
        say "The DevTools port is enabled for the next Brave start."
    else
        rm -f "$TOGGLE_FILE"
        say "The DevTools port is off. Turn it on when you want it:"
        say "  tabman cdp enable"
    fi

    say ""
    say "Next steps"
    say "  1. Quit Brave completely, then reopen it from the dock or the app grid."
    say "  2. Check the port:   tabman cdp status"
    say "  3. Capture the tabs:  tabman capture --name \"Open tabs\""
    say ""
    say "Remote debugging lets any local process control the browser, so turn it"
    say "off again when you are done:  tabman cdp disable"
}

uninstall() {
    say "Removing the Tabman DevTools setup..."
    rm -f "$WRAPPER" "$HELPER" "$TOGGLE_FILE"

    for file in "$APPS_ROOT"/*.desktop; do
        [ -f "$file" ] || continue
        grep -q "$MARKER" "$file" 2>/dev/null || continue
        base=$(basename "$file")
        if [ -f "$BACKUP_ROOT/$base" ]; then
            cp "$BACKUP_ROOT/$base" "$file"
            say "  restored $file"
        else
            rm -f "$file"
            say "  removed  $file"
        fi
    done

    # Autostart entries: restore the backup for a user entry, and drop the
    # shadow for a system entry so the original applies again.
    user_autostart="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
    for file in "$user_autostart"/*.desktop; do
        [ -f "$file" ] || continue
        grep -q "$MARKER" "$file" 2>/dev/null || continue
        base=$(basename "$file")
        if [ -f "$BACKUP_ROOT/autostart/$base" ]; then
            cp "$BACKUP_ROOT/autostart/$base" "$file"
            say "  restored $file"
        else
            rm -f "$file"
            say "  removed  $file"
        fi
    done

    say "Done. The Tabman DevTools setup has been removed."
}

case "${1:-install}" in
    install)
        install
        ;;
    status)
        status
        ;;
    on)
        mkdir -p "$DATA_ROOT"
        : > "$TOGGLE_FILE"
        say "Tabman DevTools port enabled. Restart Brave to apply it."
        ;;
    off)
        rm -f "$TOGGLE_FILE"
        say "Tabman DevTools port disabled. Restart Brave to apply it."
        ;;
    uninstall)
        uninstall
        ;;
    *)
        echo "usage: install-cdp-linux.sh [install|status|on|off|uninstall]" >&2
        exit 1
        ;;
esac
