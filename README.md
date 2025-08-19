# Tabman: Brave Tab Manager

A command-line tool designed to streamline your browsing experience by intelligently organizing your open tabs from the Brave browser (Works for any chromium-based browser). `tabman` helps you categorize, tag, and save your browsing sessions, making it easier to find and revisit websites later.

## Features

- **Tab Retrieval:** Fetches all open tabs from Brave using its remote debugging interface.
- **Intelligent Categorization:** Uses AI-powered language models to categorize your tabs:
  - **Google Gemini:** Employs the Gemini 2.0 Flash model for advanced and fast categorization.
  - **Mistral AI:** Leverages Mistral's large language models as an alternative to Gemini.
  - **Ollama:** Enables local categorization using Ollama, supporting a variety of LLMs (e.g., llama 3.2, Mistral).
- **Dynamic Tagging:** Generates a list of concise and relevant keywords to describe the content of each tab.
- **Flexible Saving:**
  - Saves the tab data (title, URL, main category, and tags) as a JSON file, organized in date-based subfolders within the `data/` directory.
  - Creates a Markdown version of each tab session, also stored in the date-based subfolders within the `data/` directory.
  - Maintains a central `all_tabs.md` file in the `data/` directory, where all tab data is appended for easy access.
- **Secure API Key Management:** Utilizes a `.env` file to securely store API keys, which can be set using command-line arguments.

## Installation

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/Anshulgada/brave-tab-manager.git
    ```

2.  **Navigate to the project directory:**

    ```bash
    cd Brave Tab Manager
    ```

    This assumes that your project folder is named `Brave Tab Manager`.

3.  **Install `pipx` (if you don't have it):**

    ```bash
    python -m pip install --user pipx
    python -m pipx ensurepath
    ```

    This ensures that `pipx` is installed globally and its executables are present in your system's PATH. You may need to restart your terminal for these changes to take effect.

4.  **Install `tabman` using `pipx`:**
    ```bash
    pipx install -e .
    ```
    This command installs your tool into an isolated environment and makes the `tabman` command accessible from anywhere. Make sure you run this command from the root of the project directory, i.e. `Brave Tab Manager`.

## Usage

1.  **Enable Remote Debugging in Brave:**
    To allow `tabman` to connect with your Brave browser, you must enable remote debugging. Here's how:

    - **Windows:**
      1.  Right-click on the Brave shortcut in your Start Menu or Taskbar and select "Properties."
      2.  In the "Target" field, add `--remote-debugging-port=9222` (or your preferred port number) to the end of the existing path, ensuring there's a space between the path and the flag. For example:
          ```
          "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" --remote-debugging-port=9222
          ```
      3.  Click "Apply" and "OK."
    - **macOS/Linux:** Modify the Brave shortcut (or application launcher) to include the `--remote-debugging-port=9222` flag in the command line that launches Brave. Consult your system's documentation for the specific method.
    - After enabling remote debugging, make sure that you have restarted your Brave browser.

2.  **Run the `tabman` tool:**

    ```bash
    tabman [OPTIONS]
    ```

    You can use the following options:

    - `-h`, `--help`: Displays the `help` or `info` menu.
    - `-c`, `--categorize`: Categorize your open tabs using the selected LLM model, and save the data. This is not necessary when setting the api keys.
    - `-v`, `--version`: Display the version of `tabman` and exits.
    - `-m`, `--model <MODEL-NAME>`: Specify the LLM model for categorization (`gemini`, `mistral`, or `ollama`).
    - `--save-keys`: Save API keys to the `.env` file. Use this in combination with `-gk` or `-mk` to set the keys.
    - `-mk`, `--mistral-key <API-KEY>`: Provide your Mistral AI API key.
    - `-gk`, `--gemini-key <API-KEY>`: Provide your Google Gemini API key.
    - `-om`, `--ollama-model <MODEL-NAME>`: Specify the Ollama model name (e.g., `llama3.2`, `mistral`). Default is `llama3.2`.
    - `-o`, `--output-dir <PATH>`: Specify the directory to store the output JSON and Markdown files, as well as the central `all_tabs.md` file (default: `data`). You can specify any directory with absolute path as well, but do note that it will remove the directory if the test fails, or any new files with same name are created in that directory.

**Examples:**

- **Categorize tabs using the default Gemini model:**
  ```bash
  tabman -c
  ```
- **Categorize tabs using Mistral:**
  ```bash
  tabman -c -m mistral
  ```
- **Categorize tabs using Ollama with a specific model:**
  ```bash
  tabman -c -m ollama -om mistral
  ```
- **Save API keys to the `.env` file:**
  ```bash
  tabman --save-keys -gk YOUR_GEMINI_API_KEY -mk YOUR_MISTRAL_API_KEY
  ```
  Replace `YOUR_GEMINI_API_KEY` and `YOUR_MISTRAL_API_KEY` with your actual API keys.
- **Specify a custom output directory:**
  ```bash
  tabman -c -o custom_output
  ```
  This will save the output into a directory named `custom_output`, which will be created in the root of your project.
- **Specify an absolute path as an output directory:**

  ```bash
   tabman -c -o "C:\\Users\\<user-name>\\Desktop\\My_Tabs"
  ```

- **Show help message:**
  ```bash
   tabman
  ```

## Configuration

- **API Keys:** API keys for Gemini and Mistral can be provided either directly via command-line arguments or saved to a `.env` file for later use. The tool will read keys from environment variables, and then the command line arguments and the `.env` file when using the tool.
- **Ollama:** If you select Ollama model, then you will have to install and run ollama on your system with your desired models.

## Development and Testing

- To avoid re-installing the package again and again, during local development, you should run the tool inside your virtual environment. For this you have to activate your environment and then run `pip install -e .` from the root directory. Now you can use the tool with the activated virtual environment. Whenever you want to update the global version then you have to uninstall the current version using `pipx uninstall tabman` and install again using `pipx install .`.

- **Running tests:**
  - The tests are located in the `tabman/tests` directory. You can run the tests using `pytest` rom the root of your project i.e. where `setup.py` exists.
  ```bash
  pytest -v -s tabman/tests
  ```

## Dependencies

- `openai`
- `ollama`
- `markdown`
- `requests`
- `tenacity`
- `playwright`
- `python-dotenv`
- `beautifulsoup4`
- `google-generativeai`
- `google-api-python-client`

## License

This project is licensed under the MIT License.

#### This project is tested with BrowserStack
