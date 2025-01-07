import asyncio
from playwright.async_api import async_playwright

BRAVE_DEBUG_PORT = 9222  # Define the debug port here


async def get_browser_tabs(browser_url: str):
    """
    Retrieves a list of open tabs from the browser.

    Args:
        browser_url (str): The browser's http url.

    Returns:
        list[dict]: A list of dictionaries, each containing 'title' and 'url' keys.
                   Returns empty list if it fails to connect to browser.
    """
    try:
        async with async_playwright() as p:
            browser = await p.chromium.connect_over_cdp(browser_url)

            tabs = []
            for context in browser.contexts:  # Iterate through contexts
                for page in context.pages:  # Iterate through pages in each context
                    title = await page.title()
                    url = page.url
                    tabs.append({"title": title, "url": url})
            await browser.close()
            return tabs
    except Exception as e:
        print(f"Failed to get browser tabs: {e}")
        return []


async def get_brave_tabs():
    """
    Helper function to get brave browser's http url using debug port.
    Returns:
        list[dict]: A list of dictionaries, each containing 'title' and 'url' keys.
                   Returns empty list if it fails to get browser tabs.
    """
    try:
        browser_url = f"http://127.0.0.1:{BRAVE_DEBUG_PORT}"
        return await get_browser_tabs(browser_url)
    except Exception as e:
        print(f"Failed to get browser tabs: {e}")
        return []


if __name__ == "__main__":

    async def main():
        tabs = await get_brave_tabs()
        if tabs:
            for tab in tabs:
                print(f"Title: {tab['title']}, URL: {tab['url']}")
        else:
            print("No tabs found.")

    asyncio.run(main())
