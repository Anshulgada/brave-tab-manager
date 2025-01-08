import os
import re
from typing import Optional, List, Dict


def search_tabs(
    search_term: Optional[str] = None,
    search_tag: Optional[str] = None,
    search_category: Optional[str] = None,
    data_dir: str = "data",
) -> List[Dict[str, str]]:
    """
    Searches for tabs in the all_tabs.md file based on a given search term and filters.

    Args:
        search_term (str, optional): The term to search for in title, url, main category and tags.
        search_tag (str, optional): The tag by which to filter.
        search_category(str, optional): The main category by which to filter.
        data_dir (str, optional): The directory where all_tabs.md is present.

    Returns:
        list: A list of dictionaries containing the search results.
    """
    all_tabs_file = os.path.join(data_dir, "all_tabs.md")
    if not os.path.exists(all_tabs_file):
        print("No tab data available. Please categorize tabs first.")
        return []

    tabs = load_tabs_from_markdown(all_tabs_file)

    filtered_tabs = []
    for tab in tabs:
        title = tab.get("title", "").lower()
        url = tab.get("url", "").lower()
        main_category = tab.get("main_category", "").lower()
        tags = [tag.lower() for tag in tab.get("tags", [])]

        if search_term:
            if (
                search_term.lower() not in title
                and search_term.lower() not in url
                and search_term.lower() not in main_category
                and not any(search_term.lower() in tag for tag in tags)
            ):
                continue
        if search_tag:
            if not any(search_tag.lower() in tag for tag in tags):
                continue
        if search_category:
            if search_category.lower() not in main_category:
                continue

        filtered_tabs.append(tab)

    return filtered_tabs


def load_tabs_from_markdown(markdown_file: str) -> List[Dict[str, str]]:
    """
    Loads the tab data from the given markdown file.

    Args:
       markdown_file(str): Path to markdown file

    Returns:
        list: List of dictionaries containing tab information.
    """
    tabs = []
    try:
        with open(markdown_file, "r", encoding="utf-8") as f:
            lines = f.readlines()
        i = 0
        while i < len(lines):
            if lines[i].startswith("## "):
                title = lines[i][3:].strip()

                url_match = re.search(r"- \*\*URL:\*\* (.*)", lines[i + 1])
                url = url_match.group(1).strip() if url_match else ""

                main_category_match = re.search(
                    r"- \*\*Main Category:\*\* (.*)", lines[i + 2]
                )
                main_category = (
                    main_category_match.group(1).strip() if main_category_match else ""
                )

                tags_match = re.search(r"- \*\*Tags:\*\* (.*)", lines[i + 3])
                tags_str = tags_match.group(1).strip() if tags_match else ""
                tags = [tag.strip() for tag in tags_str.split(",")]

                tabs.append(
                    {
                        "title": title,
                        "url": url,
                        "main_category": main_category,
                        "tags": tags,
                    }
                )
                i = i + 4
            else:
                i = i + 1
        return tabs

    except FileNotFoundError as e:
        print(f"Error: {markdown_file} not found: {e}")
        return []
    except Exception as e:
        print(f"An error occurred: {e}")
        return []
