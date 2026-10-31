#!/usr/bin/env bash
set -eo pipefail

CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

START_TIME=$(date +%s)

# 1. Locate and cd into brave-tab-manager
if [ -f "scripts/ai/dataset_builder.py" ]; then
    REPO_DIR="$(pwd)"
elif [ -f "brave-tab-manager/scripts/ai/dataset_builder.py" ]; then
    cd brave-tab-manager
    REPO_DIR="$(pwd)"
elif [ -f "$HOME/Desktop/brave-tab-manager/scripts/ai/dataset_builder.py" ]; then
    cd "$HOME/Desktop/brave-tab-manager"
    REPO_DIR="$(pwd)"
elif [ -f "$HOME/brave-tab-manager/scripts/ai/dataset_builder.py" ]; then
    cd "$HOME/brave-tab-manager"
    REPO_DIR="$(pwd)"
else
    FOUND=$(find "$HOME" -maxdepth 3 -name "dataset_builder.py" 2>/dev/null | head -n 1)
    if [ -n "$FOUND" ]; then
        cd "$(dirname "$FOUND")/../.."
        REPO_DIR="$(pwd)"
    else
        echo -e "${RED}Error: Could not locate brave-tab-manager repo. Please cd into it first.${NC}"
        exit 1
    fi
fi

# 2. Select Python inside .venv-ai (Python 3.12 with CUDA RTX A6000)
if [ -f "$REPO_DIR/.venv-ai/bin/python" ]; then
    PY="$REPO_DIR/.venv-ai/bin/python"
    source "$REPO_DIR/.venv-ai/bin/activate" 2>/dev/null || true
elif [ -f "$REPO_DIR/.venv/bin/python" ]; then
    PY="$REPO_DIR/.venv/bin/python"
    source "$REPO_DIR/.venv/bin/activate" 2>/dev/null || true
else
    PY="python3"
fi

echo -e "${CYAN}==================================================================${NC}"
echo -e "${CYAN} TABMAN AI PIPELINE: EMBEDDINGGEMMA 2 (270M, 440M, 740M)${NC}"
echo -e "${CYAN} Target: Ubuntu 24.04 | RTX A6000 48GB VRAM | Pure BF16${NC}"
echo -e "${CYAN} Workspace: $REPO_DIR${NC}"
echo -e "${CYAN} Python:    $($PY --version) ($PY)${NC}"
echo -e "${CYAN}==================================================================${NC}"

# PRE-FLIGHT: Verify / Upgrade transformers for embedding_gemma2 architecture
if ! $PY -c "import transformers.models.embedding_gemma2" 2>/dev/null; then
    echo -e "\n${YELLOW}>>> Updating transformers & sentence-transformers to support embedding_gemma2 architecture...${NC}"
    uv pip install --python "$PY" "git+https://github.com/huggingface/transformers.git" "sentence-transformers>=6.1.0" --torch-backend=auto
fi

$PY -c "import torch; assert torch.cuda.is_available(), 'CUDA not available'; print(f'CUDA Verified: {torch.cuda.get_device_name(0)}')"

# STEP 1: Generate Dataset
echo -e "\n${YELLOW}>>> STEP 1/5: Generating Contrastive Triplet Dataset...${NC}"
$PY scripts/ai/dataset_builder.py --per-domain 1000

# STEP 2: Fine-Tuning Sweep Across All Variants (270M, 440M, 740M)
echo -e "\n${YELLOW}>>> STEP 2/5: Fine-Tuning EmbeddingGemma 2 Matrix (270M, 440M, 740M)...${NC}"
$PY scripts/ai/train_matrix.py --variant all --epochs 3 --precision bf16

# STEP 3: Evaluation Benchmark Across MRL Dimensions (768d, 512d, 256d, 128d)
echo -e "\n${YELLOW}>>> STEP 3/5: Evaluating Held-Out Accuracy Across MRL Dimensions...${NC}"
for v in 270m 440m 740m; do
    MODEL_PATH="models/embeddinggemma-2-${v}-finetuned/final"
    EVAL_JSON="models/embeddinggemma-2-${v}-finetuned/eval.json"
    if [ -d "$MODEL_PATH" ]; then
        echo -e "\n${GREEN}--- Evaluating Variant: ${v} ---${NC}"
        $PY scripts/ai/evaluate.py --model "$MODEL_PATH" --save-json "$EVAL_JSON"
    fi
done

# STEP 4: Export to ONNX INT8 (WebGPU) and Generate Ollama Modelfiles
echo -e "\n${YELLOW}>>> STEP 4/5: Exporting Models to ONNX INT8 and Ollama Modelfiles...${NC}"
for v in 270m 440m 740m; do
    MODEL_PATH="models/embeddinggemma-2-${v}-finetuned/final"
    EXPORT_DIR="models/exported-${v}"
    if [ -d "$MODEL_PATH" ]; then
        echo -e "\n${GREEN}--- Exporting Variant: ${v} to ${EXPORT_DIR} ---${NC}"
        $PY scripts/ai/export_models.py --model "$MODEL_PATH" --output-dir "$EXPORT_DIR"
    fi
done

# STEP 5: Register All Models in Ollama
echo -e "\n${YELLOW}>>> STEP 5/5: Registering Models with Ollama...${NC}"
if command -v ollama >/dev/null 2>&1; then
    for v in 270m 440m 740m; do
        MODELFILE="models/exported-${v}/Modelfile"
        if [ -f "$MODELFILE" ]; then
            echo -e "${GREEN}Registering Ollama model: tabman-embed-${v}...${NC}"
            ollama create "tabman-embed-${v}" -f "$MODELFILE"
        fi
    done
    if [ -f "models/exported-270m/Modelfile" ]; then
        echo -e "${GREEN}Registering default alias: tabman-embed...${NC}"
        ollama create tabman-embed -f "models/exported-270m/Modelfile"
    fi
    echo -e "\n${GREEN}Ollama Models Successfully Registered:${NC}"
    ollama list
else
    echo -e "${YELLOW}Ollama CLI not detected in PATH. Modelfiles ready in models/exported-*/Modelfile${NC}"
fi

END_TIME=$(date +%s)
DIFF=$(( END_TIME - START_TIME ))
MINS=$(( DIFF / 60 ))
SECS=$(( DIFF % 60 ))

echo -e "\n${CYAN}==================================================================${NC}"
echo -e "${CYAN} PIPELINE COMPLETE IN ${MINS}m ${SECS}s${NC}"
echo -e "${CYAN}==================================================================${NC}"
echo -e "To serve Ollama over LAN / Remote API:"
echo -e "  ${YELLOW}OLLAMA_HOST=0.0.0.0:11434 ollama serve${NC}\n"
