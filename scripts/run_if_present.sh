#!/usr/bin/env sh
# Run a tool only when it is installed, so local `pre-commit` runs do not
# fail on machines that are missing the optional (and sometimes heavy) dev
# tools. The same checks are enforced for real in CI, which installs the
# tooling.
#
# Usage: scripts/run_if_present.sh <tool> [args...]
#   e.g.  scripts/run_if_present.sh shellcheck
#         scripts/run_if_present.sh bun --cwd extension run check
set -u

if [ $# -eq 0 ]; then
    echo "usage: $0 <tool> [args...]" >&2
    exit 1
fi

tool="$1"
shift

if [ "${1:-}" = "--" ]; then
    shift
fi

if ! command -v "$tool" >/dev/null 2>&1; then
    echo "[skip] $tool is not installed. CI installs it and enforces the check."
    echo "  To enable locally: install $tool, then re-run pre-commit."
    exit 0
fi

exec "$tool" "$@"
