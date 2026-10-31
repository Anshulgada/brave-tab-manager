"""Lightweight high-throughput embedding API server for Tabman.

Exposes OpenAI-compatible (/v1/embeddings) and Ollama-compatible (/api/embeddings)
endpoints directly from fine-tuned EmbeddingGemma 2 checkpoints.
Runs natively on GPU (CUDA / BF16) with zero external server dependencies.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("serve_embeddings")

# Global model store
LOADED_MODELS: dict[str, Any] = {}
DEFAULT_MODEL = "270m"
TARGET_MRL_DIM = 128


def get_model(variant: str = "270m") -> Any:
    """Retrieve or load SentenceTransformer model into GPU memory."""
    import importlib

    if variant in LOADED_MODELS:
        return LOADED_MODELS[variant]

    model_dir = ROOT / "models" / f"embeddinggemma-2-{variant}-finetuned" / "final"
    if not model_dir.exists():
        msg = f"Model checkpoint not found at {model_dir}"
        raise FileNotFoundError(msg)

    st_mod = importlib.import_module("sentence_transformers")
    SentenceTransformer = st_mod.SentenceTransformer

    logger.info("Loading fine-tuned EmbeddingGemma 2 (%s) into GPU...", variant)
    model = SentenceTransformer(str(model_dir))
    LOADED_MODELS[variant] = model
    logger.info("Model %s loaded successfully and ready for inference.", variant)
    return model


class EmbeddingHandler(BaseHTTPRequestHandler):
    """HTTP handler for OpenAI and Ollama embedding requests."""

    def _set_headers(self, status_code: int = 200) -> None:
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_OPTIONS(self) -> None:
        """Handle CORS pre-flight."""
        self._set_headers(204)

    def do_GET(self) -> None:
        """Health check endpoint."""
        if self.path in ("/", "/health", "/api/version"):
            self._set_headers(200)
            payload = {
                "status": "healthy",
                "service": "tabman-embeddinggemma-2",
                "active_models": list(LOADED_MODELS.keys()),
                "mrl_dimension": TARGET_MRL_DIM,
            }
            self.wfile.write(json.dumps(payload).encode("utf-8"))
        else:
            self._set_headers(404)
            self.wfile.write(b'{"error": "Not Found"}')

    def do_POST(self) -> None:
        """Handle embedding generation."""
        content_len = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_len).decode("utf-8")

        try:
            data = json.loads(raw_body) if raw_body else {}
        except json.JSONDecodeError:
            self._set_headers(400)
            self.wfile.write(b'{"error": "Invalid JSON"}')
            return

        variant = data.get("model", DEFAULT_MODEL)
        if "440" in variant:
            variant = "440m"
        elif "740" in variant:
            variant = "740m"
        else:
            variant = "270m"

        try:
            model = get_model(variant)
        except Exception as exc:
            self._set_headers(500)
            self.wfile.write(json.dumps({"error": str(exc)}).encode("utf-8"))
            return

        # Extract texts from payload
        texts: list[str] = []
        is_ollama_format = False

        if "prompt" in data:
            # Ollama format: {"model": "...", "prompt": "..."}
            is_ollama_format = True
            prompt = data["prompt"]
            texts = [prompt] if isinstance(prompt, str) else list(prompt)
        elif "input" in data:
            # OpenAI format: {"model": "...", "input": [...] or "..."}
            inp = data["input"]
            texts = [inp] if isinstance(inp, str) else list(inp)
        else:
            self._set_headers(400)
            self.wfile.write(
                b"{\"error\": \"Missing 'input' or 'prompt' in request payload\"}"
            )
            return

        dim = int(data.get("dimensions", TARGET_MRL_DIM))
        embeddings = model.encode(
            texts,
            batch_size=64,
            normalize_embeddings=True,
        )

        import importlib

        np = importlib.import_module("numpy")

        # Truncate to Matryoshka dimension and re-normalize
        if dim < embeddings.shape[1]:
            truncated = embeddings[:, :dim]
            norms = np.linalg.norm(truncated, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            embeddings = truncated / norms

        if is_ollama_format:
            # Return Ollama format: {"embedding": [...]}
            response = {"embedding": embeddings[0].tolist()}
        else:
            # Return OpenAI format
            data_items = [
                {
                    "object": "embedding",
                    "index": i,
                    "embedding": emb.tolist(),
                }
                for i, emb in enumerate(embeddings)
            ]
            response = {
                "object": "list",
                "data": data_items,
                "model": f"tabman-embeddinggemma-2-{variant}",
                "usage": {"prompt_tokens": 0, "total_tokens": 0},
            }

        self._set_headers(200)
        self.wfile.write(json.dumps(response).encode("utf-8"))


def main() -> int:
    """Run HTTP server."""
    parser = argparse.ArgumentParser(
        description="Serve fine-tuned EmbeddingGemma 2 via HTTP API."
    )
    parser.add_argument("--host", default="0.0.0.0", help="Binding host")
    parser.add_argument("--port", type=int, default=11434, help="Binding port")
    parser.add_argument(
        "--variant",
        choices=["270m", "440m", "740m"],
        default="270m",
        help="Default model variant to pre-load",
    )
    parser.add_argument(
        "--dim",
        type=int,
        default=128,
        help="Default Matryoshka dimension truncation (default: 128)",
    )

    args = parser.parse_args()
    global DEFAULT_MODEL, TARGET_MRL_DIM
    DEFAULT_MODEL = args.variant
    TARGET_MRL_DIM = args.dim

    # Pre-load default model
    get_model(DEFAULT_MODEL)

    server_address = (args.host, args.port)
    httpd = ThreadingHTTPServer(server_address, EmbeddingHandler)

    logger.info("=" * 60)
    logger.info("TABMAN EMBEDDING SERVER ACTIVE")
    logger.info("Listening on: http://%s:%d", args.host, args.port)
    logger.info("Default Model:       tabman-embeddinggemma-2-%s", DEFAULT_MODEL)
    logger.info("Target Dimension:    %d-dim (MRL)", TARGET_MRL_DIM)
    logger.info("OpenAI API:   POST http://%s:%d/v1/embeddings", args.host, args.port)
    logger.info("Ollama API:   POST http://%s:%d/api/embeddings", args.host, args.port)
    logger.info("=" * 60)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("Server shutting down.")
        httpd.server_close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
