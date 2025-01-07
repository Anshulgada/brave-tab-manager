import os
import requests
from typing import Optional
from bs4 import BeautifulSoup
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# from config import GEMINI_API_KEY
from dotenv import load_dotenv

load_dotenv()

YOUTUBE_API_KEY = os.getenv(
    "GEMINI_API_KEY"
)  # For using Gemini API, reuse this api key


def extract_limited_content(html_content: str) -> Optional[str]:
    """
    Extracts limited key text content from HTML (title, meta description, and initial content).

    Args:
        html_content (str): The HTML content as a string.

    Returns:
        str: The extracted text content, or None if extraction fails.
    """
    try:
        soup = BeautifulSoup(html_content, "html.parser")

        title = soup.title.string if soup.title else ""
        meta_description = soup.find("meta", attrs={"name": "description"})
        meta_description = (
            meta_description.get("content", "") if meta_description else ""
        )
        main_content_elements = soup.find_all(["p", "h1", "h2", "h3", "h4"])
        main_content = " ".join(
            element.get_text(separator=" ", strip=True)
            for element in main_content_elements[:5]
        )

        return f"{title}. {meta_description}. {main_content}"
    except Exception as e:
        print(f"Error extracting content from HTML: {e}")
        return None


def fetch_url_content(url: str) -> Optional[str]:
    """
    Fetches the HTML content from a given URL.

    Args:
        url (str): The URL to fetch.

    Returns:
        str: The HTML content or None if the request fails.
    """
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()  # Raise an exception for bad status codes
        return response.text
    except requests.exceptions.RequestException as e:
        print(f"Error fetching URL {url}: {e}")
        return None


def extract_youtube_data(video_id: str) -> Optional[str]:
    """
    Extracts the title and description from a YouTube video.

    Args:
        video_id (str): The YouTube video ID.

    Returns:
        str: The title and description of the youtube video or None if something goes wrong.
    """
    try:
        youtube = build("youtube", "v3", developerKey=YOUTUBE_API_KEY)
        request = youtube.videos().list(part="snippet", id=video_id)
        response = request.execute()
        if not response or "items" not in response or not response["items"]:
            return None
        video_data = response["items"][0]["snippet"]
        title = video_data.get("title", "")
        description = video_data.get("description", "")
        return f"{title}. {description}"
    except HttpError as e:
        print(f"An HTTP error {e.resp.status} occurred:\n{e.content}")
        return None
    except Exception as e:
        print(f"An Error occurred: {e}")
        return None


def get_content_from_url(url: str) -> Optional[str]:
    """
    Helper function to extract content from both normal urls and youtube urls.

    Args:
        url (str): url to get content from

    Returns:
        str: The content of the url or None.
    """
    if "youtube.com" in url or "youtu.be" in url:
        video_id = get_youtube_id(url)
        if video_id:
            return extract_youtube_data(video_id)
        return None
    html_content = fetch_url_content(url)
    if html_content:
        return extract_limited_content(
            html_content
        )  # Changed this to extract limited content
    return None


def get_youtube_id(url: str) -> Optional[str]:
    """
    Extracts the YouTube video ID from a URL.

    Args:
        url (str): The URL of the YouTube video.

    Returns:
        str: The video ID or None if not found
    """
    try:
        if "youtube.com" in url:
            from urllib.parse import urlparse, parse_qs

            parsed_url = urlparse(url)
            if parsed_url.query:
                query_params = parse_qs(parsed_url.query)
                if "v" in query_params:
                    return query_params["v"][0]
            if parsed_url.path.startswith("/watch/"):
                return parsed_url.path.split("/")[2]
        elif "youtu.be" in url:
            from urllib.parse import urlparse

            parsed_url = urlparse(url)
            return parsed_url.path[1:]
        return None
    except Exception as e:
        print(f"Error extracting youtube id: {e}")
        return None


if __name__ == "__main__":
    sample_url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    content = get_content_from_url(sample_url)
    if content:
        print(f"Content of url : {content[:200]} ...")
    else:
        print("Error fetching content")
