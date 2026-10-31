#!/usr/bin/env bash
# Setup AI virtual environment for EmbeddingGemma 2 on Python 3.12 with CUDA
set -eo pipefail
[ -n "${ZSH_VERSION:-}" ] && setopt NO_NOMATCH 2>/dev/null || true

VENV_NAME="${1:-tabman-ai}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Setting up $VENV_NAME in $REPO_DIR (Python 3.12)..."
cd "$REPO_DIR"

if [ ! -d "$VENV_NAME" ]; then
    uv venv "$VENV_NAME" --python 3.12
fi

echo "Installing PyTorch CUDA and AI dependencies..."
uv pip install -r scripts/ai/requirements.txt --python "$VENV_NAME" --torch-backend=auto

echo "AI environment $VENV_NAME successfully configured!"
echo "To activate: source $VENV_NAME/bin/activate"
