import json
from datetime import datetime
import os
from typing import List, Dict
import markdown
import logging
import shutil

# Silence the google-generativeai logs, has to be done before the config import
logging.getLogger("google.generativeai").setLevel(logging.ERROR)


def save_tabs_to_json(tabs: List[Dict[str, str]], data_dir: str = "data") -> str:
    """
    Saves tab data to a JSON file.

    Args:
        tabs (list): A list of dictionaries, each with 'title', 'url', 'main_category', and 'tags' keys.
        data_dir (str): The directory to save the JSON file in

    Returns:
        str: The path to the saved JSON file
    """
    now = datetime.now()
    date_str = now.strftime("%d-%m-%Y")
    time_str = now.strftime("%H-%M-%S")
    day_str = now.strftime("%A")
    filename = f"tabs_{date_str}_{day_str}_{time_str}.json"

    dated_dir = os.path.join(data_dir, date_str)
    filepath = os.path.join(dated_dir, filename)

    os.makedirs(dated_dir, exist_ok=True)

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(tabs, f, indent=4)

    all_tabs_filepath = os.path.join(data_dir, "all_tabs.md")
    append_tabs_to_all_markdown(tabs, all_tabs_filepath)
    return filepath


def append_tabs_to_all_markdown(tabs: List[Dict[str, str]], filepath: str):
    """
    Appends tab data to the central all_tabs.md file.

    Args:
       tabs(list): A list of dictionaries, each with 'title', 'url', 'main_category', and 'tags' keys.
       filepath(str): The path of the all_tabs.md file
    """
    with open(filepath, "a", encoding="utf-8") as f:
        f.write("# Browser Tab Data\n\n")
        for tab in tabs:
            title = tab.get("title", "No Title")
            url = tab.get("url", "No URL")
            main_category = tab.get("main_category", "Other")
            tags = tab.get("tags", [])

            f.write(f"## {title}\n")
            f.write(f"- **URL:** {url}\n")
            f.write(f"- **Main Category:** {main_category}\n")
            f.write(f"- **Tags:** {', '.join(tags)}\n\n")


def convert_json_to_markdown(json_filepath: str, data_dir: str = "data") -> str:
    """
    Converts the saved JSON data to markdown format.

    Args:
        json_filepath(str): The path of the json file
        data_dir(str): The directory where data is stored (used to get the markdown output folder path)

    Returns:
        str: The path of the created markdown file
    """
    with open(json_filepath, "r", encoding="utf-8") as f:
        tabs = json.load(f)

    now = datetime.now()
    date_str = now.strftime("%d-%m-%Y")
    time_str = now.strftime("%H-%M-%S")
    day_str = now.strftime("%A")
    markdown_dir = os.path.join(data_dir, date_str)
    os.makedirs(markdown_dir, exist_ok=True)
    markdown_file = os.path.join(
        markdown_dir, f"tabs_{date_str}_{day_str}_{time_str}.md"
    )
    with open(markdown_file, "w", encoding="utf-8") as f:
        f.write(f"# Tabs - {date_str} ({day_str})\n\n")
        for tab in tabs:
            title = tab.get("title", "No Title")
            url = tab.get("url", "No URL")
            main_category = tab.get("main_category", "Other")
            tags = tab.get("tags", [])

            f.write(f"## {title}\n")
            f.write(f"- **URL:** {url}\n")
            f.write(f"- **Main Category:** {main_category}\n")
            f.write(f"- **Tags:** {', '.join(tags)}\n\n")
    return markdown_file


if __name__ == "__main__":
    sample_tabs = [
        {
            "title": "Playwright Docs",
            "url": "https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp",
            "main_category": "Other",
            "tags": [
                "Playwright",
                "Browsertype",
                "Connect",
                "Browser Instance",
                "Automation",
            ],
        },
        {
            "title": "Rick Astley - Never Gonna Give You Up",
            "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "main_category": "YouTube",
            "tags": [
                "Music Video",
                "Rick Astley",
                "Official",
                "Never Gonna Give You Up",
                "1980s",
            ],
        },
        {
            "title": "Brave Tab Manager: Design Plan",
            "url": "https://aistudio.google.com/u/3/prompts/1SyHQU8Re8fJ8Cga95N5jG5ptRmvV8BoL",
            "main_category": "Other",
            "tags": [
                "Sign In",
                "Guest Mode",
                "Private Browsing",
                "Forgot Email",
                "Google Accounts",
            ],
        },
        {
            "title": "Github OAuth",
            "url": "https://github.com/login/oauth/authorize?client_id=01ab8ac9400c4e429b23&redirect_uri=https%3A%2F%2Fvscode.dev%2Fredirect&scope=user%3Aemail&skip_account_picker=true&state=vscode%253A%252F%252Fvscode.github-authentication%252Fdid-authenticate%253Fnonce%253Db9147fedcf4304bb%2526windowId%253D1",
            "main_category": "Coding",
            "tags": ["Projects", "Software", "Passkey", "Coding", "Github"],
        },
    ]
    json_file = save_tabs_to_json(sample_tabs, "test_data")
    print(f"Saved tabs to JSON: {json_file}")

    markdown_file = convert_json_to_markdown(json_file, "test_data")
    print(f"Converted JSON to markdown: {markdown_file}")
