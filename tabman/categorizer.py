import re
import os
import openai
import ollama
import asyncio
import logging
import google.generativeai as genai
from dotenv import load_dotenv
from asyncio import TimeoutError
from urllib.parse import urlparse
from typing import List, Dict, Optional
from .tab_capture import get_brave_tabs
from .content_fetcher import get_content_from_url
from .tab_saver import save_tabs_to_json, convert_json_to_markdown
from tenacity import retry, stop_after_attempt, wait_fixed, retry_if_exception_type


# Silence the google-generativeai logs, has to be done before the config import
logging.getLogger("google.generativeai").setLevel(logging.ERROR)
load_dotenv()  # Load the environment variables

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
gemini_model = genai.GenerativeModel("gemini-2.0-flash-exp")

MAIN_CATEGORIES = {
    "YouTube": ["youtube.com", "youtu.be"],
    "Coding": ["github.com", "stackoverflow.com"],
    "Articles": [],
    "Social Media": ["facebook.com", "twitter.com", "instagram.com"],
    "News": [],
    "Personal": [],
    "Other": [],
}


def get_main_category(url: str) -> str:
    """
    Determines the main category of a URL based on predefined rules.

    Args:
        url (str): The URL to analyze.

    Returns:
        str: The main category.
    """
    parsed_url = urlparse(url)
    netloc = parsed_url.netloc

    for category, domains in MAIN_CATEGORIES.items():
        for domain in domains:
            if domain in netloc:
                return category
    return "Other"


def capitalize_tags(tags: List[str]) -> List[str]:
    """Capitalizes the first letter of each word in the tag.

    Args:
        tags(list): list of tags

    Returns:
        list: capitalized tags
    """
    return [" ".join(word.capitalize() for word in tag.split()) for tag in tags]


def post_process_tags(tags: List[str]) -> List[str]:
    """
    Post processes tags by removing empty string, duplicate tags, and extra text.

    Args:
        tags(list): List of tags

    Returns:
        list(str): A filtered list of tags.
    """
    filtered_tags = [tag for tag in tags if tag]  # Remove empty strings
    filtered_tags = list(set(filtered_tags))  # Remove duplicates
    filtered_tags = [
        re.sub(
            r"^(tag|tags|keyword|keywords|topic|topics|sub):?\s*",
            "",
            tag,
            flags=re.IGNORECASE,
        ).strip()
        for tag in filtered_tags
    ]  # remove extra text
    return capitalize_tags(filtered_tags)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_fixed(2),
    retry=retry_if_exception_type(TimeoutError),
)
async def generate_tags(
    content: Optional[str],
    main_category: str,
    model_type: str = "gemini",
    ollama_model: str = "llama3.2",
) -> Optional[List[str]]:
    """
    Generates a list of tags for the given content, using the Gemini, Mistral, or Ollama API.

    Args:
        content (str): The content to be tagged.
        main_category (str): The main category of the content.
        model_type(str): The model used to generate the tags (gemini or mistral or ollama)
        ollama_model(str): The ollama model to use for generating tags

    Returns:
        list: A list of tags (or None if tag generation fails).
    """
    if not content:
        return None
    try:
        prompt = f"""
        Given the following text content:
        {content}
        And given that the main category is: {main_category}.
        Generate a comma separated list of the most relevant and concise keywords to describe the content.
        Do not use full sentences or phrases as tags.
        Maximum 5 tags.
        Only return the comma separated list of keywords. Do not add any extra text.
        """
        if model_type == "gemini":

            async def generate_with_timeout():
                return await asyncio.to_thread(gemini_model.generate_content, prompt)

            response = await asyncio.wait_for(
                generate_with_timeout(), timeout=10
            )  # Run in thread to not block main thread and apply timeout
        elif model_type == "mistral":
            client = openai.OpenAI(api_key=os.getenv("MISTRAL_API_KEY"))

            async def generate_with_timeout():
                return await asyncio.to_thread(
                    client.chat.completions.create,
                    model="mistral-tiny",
                    messages=[{"role": "user", "content": prompt}],
                )

            response = await asyncio.wait_for(generate_with_timeout(), timeout=10)
            if response and response.choices:
                return post_process_tags(
                    [
                        tag.strip()
                        for tag in response.choices[0].message.content.split(",")
                    ]
                )
            else:
                return ["Other"]
        elif model_type == "ollama":

            async def generate_with_timeout():
                return await asyncio.to_thread(
                    ollama.generate, model=ollama_model, prompt=prompt
                )

            response = await asyncio.wait_for(generate_with_timeout(), timeout=10)
            if response and response["response"]:
                return post_process_tags(
                    [tag.strip() for tag in response["response"].split(",")]
                )
            else:
                return ["Other"]

        else:
            return ["Other"]
        if response and response.text:
            return post_process_tags([tag.strip() for tag in response.text.split(",")])
        else:
            return ["Other"]  # Return other if no proper response
    except TimeoutError as e:
        print(f"Error during tag generation, request timed out: {e}")
        return None
    except Exception as e:
        print(f"Error during tag generation: {e}")
        return None


async def categorize_tabs(
    tabs: List[Dict[str, str]], model_type: str = "gemini", ollama_model: str = "llama3.2"
) -> List[Dict[str, str]]:
    """
    Categorizes a list of tabs based on their content.

    Args:
        tabs (list): A list of dictionaries, each with 'title' and 'url' keys.
        model_type(str): The model used to generate the tags (gemini or mistral or ollama)
        ollama_model(str): The ollama model to use for generating tags

    Returns:
         list: A list of dictionaries, each with 'title', 'url', 'main_category', and 'tags' keys.
    """
    categorized_tabs = []
    for tab in tabs:
        print(f"Categorizing tab: {tab['title']}")
        url = tab["url"]
        main_category = get_main_category(url)
        content = await asyncio.to_thread(get_content_from_url, url)
        if content:
            tags = await generate_tags(content, main_category, model_type, ollama_model)
            tab["main_category"] = main_category
            tab["tags"] = tags if tags else ["Other"]
        else:
            tab["main_category"] = "Other"
            tab["tags"] = ["Other"]

        categorized_tabs.append(tab)
    return categorized_tabs


async def main_categorizer(
    model_type: str = "gemini",
    save_keys: bool = False,
    mistral_key=None,
    gemini_key=None,
    ollama_model="llama3.2",
    output_dir="data",
):
    """
    Main function for categorizing and saving tabs
    Args:
        model_type(str): The model used to generate the tags (gemini or mistral or ollama)
        save_keys (bool): If we want to save the keys
        mistral_key (str): Mistral api key if we want to set using command line args
        gemini_key (str): Gemini api key if we want to set using command line args
        ollama_model (str): The ollama model to use for generating tags
        output_dir (str): The path to store the json and md files, and where the central data file will be stored
    """
    if save_keys:
        if gemini_key:
            os.environ["GEMINI_API_KEY"] = gemini_key
        if mistral_key:
            os.environ["MISTRAL_API_KEY"] = mistral_key

    tabs = await get_brave_tabs()
    if tabs:
        categorized_tabs = await categorize_tabs(tabs, model_type, ollama_model)
        json_file = save_tabs_to_json(categorized_tabs, output_dir)
        print(f"Saved tabs to JSON: {json_file}")

        markdown_file = convert_json_to_markdown(json_file, output_dir)
        print(f"Converted JSON to markdown: {markdown_file}")
    else:
        print("Could not get the tabs from brave browser.")


if __name__ == "__main__":

    async def main():
        await main_categorizer()

    asyncio.run(main())
