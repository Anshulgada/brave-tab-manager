# Project Description

This project involves developing a command-line interface (CLI) tool called `tabman` using Python, and a corresponding web application to help users manage their browser tabs, specifically from the Brave browser. The overall goal is to create a flexible and user-friendly solution for tab management, organization, and categorization.

## CLI Tool (`tabman`) Description:

The primary goal of the CLI tool is to help users manage their Brave browser tabs through the command line. This tool is designed to be distributed using PyPI, making it globally accessible via `pipx`.

**Core Functionality:**

1.  **Tab Capture:**
    *   The tool connects to the Brave browser using its remote debugging port and fetches all open tabs, along with their titles and URLs. This is done using the `playwright` library.
2.  **Tab Categorization and Tagging:**
    *   The tool fetches the content of each URL (including YouTube videos), extracts meaningful text, and utilizes AI-powered language models to categorize and generate tags for the tabs.
    *   This is done using the Gemini API, and optionally Mistral AI and Ollama for local LLM. The tool has been setup in a way that if an API key is not present, then the tests should skip gracefully.
    *   It then creates a comma-separated list of relevant keywords to be used as tags.
3. **Output Directory:**
    * The tool provides two separate ways to save output: The `-o` or `--output-dir` flag which defines the output directory only for that session.
    *   And a `central-repo` argument which allows the user to define a permanent directory where all `all_tabs.md` files are stored.
4.  **Data Storage:**
    *   The tool saves the tab data, which includes title, URL, main category, and tags, into JSON files.
    *   Each time it is executed, a new JSON file is created using the current date and is saved in subfolders inside the main `data` folder.
    *   The data is also appended to a single `all_tabs.md` file, which can be saved in a user-defined location for all the tabs ever saved.
    *   A markdown version of each daily save is also created inside the same subfolder as the JSON file.
5.  **Search Functionality**:
     * The tool also provides a search functionality using the flags:
        *  `-s` or `--search` to search for a given string in all tab titles, urls, main categories and tags.
        *  `--search-tag` to filter the results to only show results which contain the given tag.
        *  `--search-category` to filter the results to only show results which have the given category.
6.  **Command-Line Interface:**
    *   The main tool is accessed via command-line using the command `tabman` which is made available globally using `pipx`.
    *   Command-line flags for:
        *   `-c` or `--categorize` to categorize and save current open tabs.
        *   `-v` or `--version` to show program's version number and exit.
        *   `-m` or `--model` to specify the model to use (`gemini`, `mistral`, or `ollama`).
        *   `--save-keys` to save API keys to a `.env` file. Use this option with `-gk` or `-mk` to set the keys.
        *   `-mk` or `--mistral-key` to set the Mistral API key.
        *   `-gk` or `--gemini-key` to set the Gemini API key.
        *   `-om` or `--ollama-model` to specify the Ollama model.
        *   `-o` or `--output-dir` to define output directory for the current session.
        *  `-cr` or `--central-repo` to define a permanent central repo directory for `all_tabs.md` file.
        *  `-s` or `--search` to search for a given string in all tab titles, urls, main categories and tags.
        *  `--search-tag` to filter the results to only show results which contain the given tag.
        * `--search-category` to filter the results to only show results which have the given category.
        * `--gui` to launch the web app.
    * The CLI is implemented using `argparse`.
7.  **Unit Tests:**
    *   The project has unit tests in the `/tabman/tests` directory, which can be executed using pytest.
    *   The tests are configured to use an `os.environ` variable for accessing the API keys.
    *   Tests also check the folder creation, deletion, and everything else.
8.  **Distribution:** The tool will be distributed as a package on PyPI so it can be installed globally.
9.  **Workflow Automation:**
    *   A GitHub Actions workflow is set up to automatically build the package and publish to PyPI when a new release is created.
    *   The same workflow also runs tests on each push or pull request to the main branch.

## Web App Description:

The web application serves as the user interface for the tab management tool, building on the functionality of the `tabman` CLI. The web app should be completely local and should be launched using the command-line tool with the `--gui` flag. The following technologies are to be used for developing this web app:

*   **Frontend:** Use **React** and also use `tailwindcss` and `shadcn-ui` for styling, so that it has a consistent UI. All of the components for the UI should be created by following the guidelines in the `page_with_styles_and_js.html` file, which contains the layout and styling of the UI from Raindrop.io, without adding any additional styles, layouts or functionalities.
*   **Backend:** Use **Flask** for the backend API which will be used to fetch data for the React app, and will also host the react app by serving static files using it's routes. This will also be the primary server which will use the python files provided here, to implement search using the logic specified in that file, and also for fetching favicons for the links.

**Core Components (to be implemented using the provided HTML file for reference):**

1.  **Main Layout:** Overall page structure using a component which manages other components.
2.  **Navbar:** Top navigation bar with all the action items such as:
    *   A search input bar to search for tab entries.
    *   A category dropdown which will filter results by a main category.
    *   A tag input field for filtering the results based on tags.
    *  A dropdown to handle sort options (By Date, By Name, By Site).
    *   A dropdown to switch between List or Card view.
    * No additional buttons or adornments, other than what is present in the HTML file.
3.  **Sidebar:**
    *   A sidebar on the left for displaying different categories, tags, and collections that is a scrollable view.
4.  **Main Content:**
    *   This section will display the search results.
    *   **ResultList:** A component to display results in a list with thumbnail or favicon, title, URLs, main category and tags.
    *   **ResultCard:** A component to display results in a card view with thumbnail or favicon, title, URL, main category and tags.
5.  **Data Fetching:**
     * Use `axios` library to fetch data from Flask API when a search is performed. The data returned from the backend should include all metadata including thumbnail urls and other details of each link.
     * Use the backend APIs to fetch data for sidebar.

The following files are available for the project:

`tabman/`
*   This folder contains all of the python files, which are to be used for the implementation of the python app, and backend for the react application.
*  Use the files in this folder for implementing the cli functionality, and also for backend functionality for the web application.

`web_tabman/`
* `client/` : This contains the react files.

*   `server/` : This contains the backend flask files.
*   The requirements.txt for client and server side is also present inside the respective folders.


## Current File Structure of the entire project:

```
Brave Tab Manager/
├── .github/workflows/pypi-publish.yml
├── build/
├── data/
├── dist/
├── tabman/
│   ├── gui/                  
│   │   ├── __init__.py       
│   │   └── gui_main.py       
│   ├── tabman-venv/
│   ├── tests/
│   │   └── tabman_tests.py
│   ├── __init__.py
│   ├── .env
│   ├── .env.example
│   ├── categorizer.py
│   ├── content_fetcher.py
│   ├── main.py
│   ├── requirements.txt
│   ├── search.py
│   ├── tab_capture.py
│   └── tab_saver.py
├── web_tabman/
│   ├── client
│   │   ├── node_modules/
│   │   ├── public/
│   │   │   └── index.html 
│   │   ├── src/
│   │   │   ├── components
│   │   │   │   ├── FilterSection.jsx
│   │   │   │   ├── MainContent.jsx
│   │   │   │   ├── MainLayout.jsx
│   │   │   │   ├── Navbar.jsx
│   │   │   │   ├── ResultCard.jsx
│   │   │   │   ├── ResultList.jsx
│   │   │   │   ├── SearchBar.jsx
│   │   │   │   ├── Sidebar.jsx
│   │   │   │   ├── SortOptions.jsx
│   │   │   │   ├── TabListItem.jsx
│   │   │   │   └── ViewOptions.jsx
│   │   │   ├── App.js
│   │   │   ├── index.css
│   │   │   └── index.js
│   │   ├── .gitignore 
│   │   ├── package-lock.json
│   │   ├── package.json
│   │   ├── postcss.config.js
│   │   ├── README.md
│   │   ├── requirements.txt
│   │   └── tailwind.config.js
│   │
│   └── server/
│       ├── .gitignore
│       ├── requirements.txt
│       └── server.py
├── .gitignore
├── .structure
├── LICENSE
├── pytest.ini
├── README.md
├── setup.py
└── tabman.egg-info

```
You are allowed to make changes to this structure as well as add/remove files based on ur coding approach.

The main goal is to make a web-app resembling raindrop.io's ui as well as functionality to match our use case.

Please follow the instructions carefully and implement the whole thing, by strictly following the html file that I have provided.