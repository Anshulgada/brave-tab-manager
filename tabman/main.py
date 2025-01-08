import asyncio
import argparse
from .categorizer import main_categorizer
import os
from dotenv import load_dotenv, set_key
from .search import search_tabs
from .gui.gui_main import entry_point as gui_entry_point

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
        default="llama2",
        help="Ollama model to use for categorization (default: llama2)",
    )
    parser.add_argument(
        "-o",
        "--output-dir",
        type=str,
        default="data",
        help="Path to store output files, central directory for all data (default: data)",
    )
    parser.add_argument(
        "-cr",
        "--central-repo",
        type=str,
        help="Path where you want to save your central all_tabs.md file permanently. The existing central file and folder will be moved there.",
    )
    parser.add_argument(
        "-s",
        "--search",
        type=str,
        help="Search for the given string in all tabs, title, url, main category and tags",
    )
    parser.add_argument(
        "--search-tag", type=str, help="Search for the given string only inside tags"
    )
    parser.add_argument(
        "--search-category",
        type=str,
        help="Search for the given string only inside main categories",
    )
    parser.add_argument("--gui", action="store_true", help="Run the gui application")

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
            args.central_repo,
        )
    elif args.search:
        await search_tabs(
            args.search, args.search_tag, args.search_category, args.output_dir
        )
    elif args.central_repo:
        await main_categorizer(
            output_dir=args.output_dir, central_repo=args.central_repo
        )
    elif args.gui:
        gui_entry_point()
    elif not args.save_keys and not getattr(args, "version", False):
        parser.print_help()


def entry_point():
    asyncio.run(main())
