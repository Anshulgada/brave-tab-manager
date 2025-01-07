import asyncio
import pytest
from tabman.categorizer import categorize_tabs, get_main_category, generate_tags
from tabman.content_fetcher import get_content_from_url
from tabman.tab_saver import save_tabs_to_json, convert_json_to_markdown
from unittest.mock import patch
from playwright.async_api import async_playwright
from dotenv import load_dotenv
import os
import shutil

load_dotenv()


@pytest.mark.asyncio
async def test_get_main_category():
    """Test the get_main_category function."""
    assert get_main_category("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "YouTube"
    assert (
        get_main_category("https://github.com/Anshulgada/brave-tab-manager") == "Coding"
    )
    assert get_main_category("https://example.com/article") == "Other"
    assert get_main_category("https://facebook.com/profile") == "Social Media"


@pytest.mark.asyncio
async def test_generate_tags():
    """Test the generate_tags function."""
    content = "Playwright is a framework for Web Testing and automation."
    tags = await generate_tags(content, "Coding", "gemini")
    assert isinstance(tags, list)
    assert len(tags) > 0

    content = "Rick Astley - Never Gonna Give You Up Official Music Video"
    tags = await generate_tags(content, "YouTube", "gemini")
    assert isinstance(tags, list)
    assert len(tags) > 0


@pytest.mark.asyncio
async def test_categorize_tabs():
    """Test the categorize_tabs function."""
    sample_tabs = [
        {
            "title": "Playwright Docs",
            "url": "https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp",
        },
        {
            "title": "Rick Astley - Never Gonna Give You Up",
            "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        },
        {
            "title": "Brave Tab Manager: Design Plan",
            "url": "https://aistudio.google.com/u/3/prompts/1SyHQU8Re8fJ8Cga95N5jG5ptRmvV8BoL",
        },
        {
            "title": "Github OAuth",
            "url": "https://github.com/login/oauth/authorize?client_id=01ab8ac9400c4e429b23&redirect_uri=https%3A%2F%2Fvscode.dev%2Fredirect&scope=user%3Aemail&skip_account_picker=true&state=vscode%253A%252F%252Fvscode.github-authentication%252Fdid-authenticate%253Fnonce%253Db9147fedcf4304bb%2526windowId%253D1",
        },
    ]
    categorized_tabs = await categorize_tabs(sample_tabs, "gemini")
    assert isinstance(categorized_tabs, list)
    assert len(categorized_tabs) == len(sample_tabs)
    for tab in categorized_tabs:
        assert "main_category" in tab
        assert "tags" in tab
        assert isinstance(tab["tags"], list)


@pytest.mark.asyncio
async def test_save_and_convert_json():
    """Test the saving and converting the json function."""
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
    ]
    json_file = save_tabs_to_json(sample_tabs, "test_data")
    assert json_file
    markdown_file = convert_json_to_markdown(json_file, "test_data")
    assert markdown_file

    # Cleanup
    os.remove(json_file)
    shutil.rmtree(os.path.dirname(markdown_file))


@pytest.mark.asyncio
async def test_save_with_custom_output_dir():
    """Test the save function using custom output directory"""
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
    output_dir = "custom_output"
    json_file = save_tabs_to_json(sample_tabs, output_dir)
    assert output_dir in json_file
    markdown_file = convert_json_to_markdown(json_file, output_dir)
    assert output_dir in markdown_file

    # Cleanup
    os.remove(json_file)
    shutil.rmtree(os.path.dirname(markdown_file))
    shutil.rmtree(output_dir)  # remove custom output directory


@pytest.mark.asyncio
async def test_get_content_from_url():
    """Test content fetching function"""
    sample_url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    content = await asyncio.to_thread(get_content_from_url, sample_url)
    assert content is not None
    sample_url = "https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp"
    content = await asyncio.to_thread(get_content_from_url, sample_url)
    assert content is not None
