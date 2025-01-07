import os
import asyncio
import argparse
from dotenv import load_dotenv, set_key
from .categorizer import main_categorizer

load_dotenv()


async def main():
    # Create argument parser for CLI usage
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
        help="Specify the LLM model for categorization",
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
    args = parser.parse_args()

    # If we're saving keys, update environment and .env file
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

    # Run categorization if requested
    if args.categorize:
        await main_categorizer(
            args.model,
            args.save_keys,
            args.mistral_key,
            args.gemini_key,
            args.ollama_model,
        )
    elif not args.save_keys and not getattr(args, "version", False):
        parser.print_help()


def entry_point():
    # Wrap async main in a synchronous entry point
    asyncio.run(main())


if __name__ == "__main__":
    entry_point()
