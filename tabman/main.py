import asyncio
import argparse
from .categorizer import main_categorizer
import os
from dotenv import load_dotenv, set_key

load_dotenv()


async def main():
    parser = argparse.ArgumentParser(description="Brave Tab Manager CLI Tool")
    parser.add_argument(
        "-c",
        "--categorize",
        action="store_true",
        help="Categorize and save current open tabs.",
    )
    parser.add_argument("-v", "--version", action="version", version="%(prog)s 0.1.0")
    parser.add_argument(
        "-m",
        "--model",
        type=str,
        choices=["gemini", "mistral", "ollama"],
        default="gemini",
        help="Specify the LLM model for categorization (gemini, mistral, or ollama)",
    )
    parser.add_argument(
        "--save-keys",
        action="store_true",
        help="Save API keys to the .env file. Use this option with -gk or -mk to set the keys.",
    )
    parser.add_argument("-mk", "--mistral-key", type=str, help="Mistral AI API key.")
    parser.add_argument("-gk", "--gemini-key", type=str, help="Google Gemini API key.")
    parser.add_argument(
        "-om",
        "--ollama-model",
        type=str,
        default="llama3.2",
        help="Ollama model to use for categorization (default: llama3.2)",
    )
    parser.add_argument(
        "-o",
        "--output-dir",
        type=str,
        default="data",
        help="Path to store output files, central directory for all data (default: data)",
    )
    args = parser.parse_args()

    if args.save_keys:
        env_path = ".env"
        if args.gemini_key:
            os.environ["GEMINI_API_KEY"] = args.gemini_key
            set_key(env_path, "GEMINI_API_KEY", args.gemini_key)
            print("Gemini key has been set")
        if args.mistral_key:
            os.environ["MISTRAL_API_KEY"] = args.mistral_key
            set_key(env_path, "MISTRAL_API_KEY", args.mistral_key)
            print("Mistral key has been set")

    if args.categorize:
        await main_categorizer(
            args.model,
            args.save_keys,
            args.mistral_key,
            args.gemini_key,
            args.ollama_model,
            args.output_dir,
        )
    elif not args.save_keys and not getattr(args, "version", False):
        parser.print_help()


def entry_point():
    asyncio.run(main())
