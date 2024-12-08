
# Brave Tab Sorter

A command-line tool to fetch, filter, and categorize open tabs from the Brave browser. This tool helps you manage your browsing sessions by organizing tabs into meaningful categories, making it easier to find and revisit websites later.

## Features

* **Fetching Tabs:** Retrieves all open tabs from Brave using its remote debugging API.
* **Filtering:** Filters out unwanted tabs (e.g., extensions, embedded videos, blank tabs) based on customizable rules.
* **Categorization:**  Dynamically categorizes tabs using AI-powered methods:
    * **Google Gemini:**  (Default) Advanced categorization using Google's Gemini language model(Uses Gemini 1.5 Flash Model by default).
    * **Mistral AI:** Categorization using Mistral's large language models.
    * **Ollama:** Local categorization using Ollama, supporting various LLMs (e.g., Llama 2).
    * **spaCy:**  Lightweight, local categorization using spaCy's named entity recognition (suitable for offline use or as a fallback).
* **Saving:**
    * Saves tabs as a JSON file.
    * Saves categorized tabs into a structured directory hierarchy:
        - Tabs are stored as individual `.txt` files within category-specific folders.
        - Each `.txt` file contains the tab's details in the following format:
            ```
            Title: <Tab Title>
            URL: <Tab URL>
            ```
    * Saves API keys securely in a `.env` file.
* **Customizable Filtering:** Add or modify filtering rules to match your specific needs.

## Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/Anshulgada/brave-tab-manager.git
   ```

2. **Navigate to the project directory:**

   ```bash
   cd brave-tab-sorter
   ```

3. **Create and activate a virtual environment (highly recommended):**

   ```bash
   python -m venv brave-tab-manager
   source brave-tab-manager/bin/activate  # On Linux/macOS
   brave-tab-manager\Scripts\activate  # On Windows
   ```

4. **Install the required packages:**

   ```bash
   pip install -e .
   ```

## Usage

1. **Enable Remote Debugging in Brave:**

   Edit the Brave browser shortcut's target to include the `--remote-debugging-port` flag. Here's how:

   * **Windows:**
     1. Right-click on the Brave shortcut in your Start Menu or Taskbar.
     2. Select "Properties".
     3. In the "Target" field, add `--remote-debugging-port=9222` to the end of the existing path, making sure there's a space between the path and the flag. The target should look like this (adjust the path if your Brave installation is in a different location):
        ```
        "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" --remote-debugging-port=9222
        ```
     4. Click "Apply" and "OK".

   * **macOS/Linux:**
     The process for modifying the shortcut target may vary slightly depending on your desktop environment. Consult your distribution's documentation for how to edit `.desktop` files or application launchers. You'll need to add the `--remote-debugging-port=9222` flag to the Brave executable's command line.

   After making this change, restart Brave or your computer for the remote debugging port to become active.

2. **Run the tool:**

   ```bash
   tab-man [OPTIONS]
   ```

**Options:**

* `-o, --output <FILE>`: Output JSON file path (default: `Open_Tabs.json`).
* `-c, --categorize`: Categorize tabs. The default method is Gemini, or the method specified by other options.
* `-d, --output-dir <DIRECTORY>`: Directory to save categorized tabs.
* `-m, --model <MODEL>`: Specify the Ollama model for categorization (e.g., `llama2`).
* `-mk, --mistral-key <KEY>`: Mistral AI API key.
* `-gk, --gemini-key <KEY>`: Google Gemini API key (default if available and key is provided).
* `--save-keys`: Save API keys to the `.env` file. Use this option with `-gk` or `-mk` to set the keys.
* `-h, --help`: Shows this help message and exits.


**Examples:**

* **Save all tabs to a JSON file:**

   ```bash
   tab-man -o my_tabs.json
   ```

* **Categorize tabs using Gemini and save to a directory:**

   ```bash
   tab-man -c -d categorized_tabs -gk YOUR_GEMINI_API_KEY
   ```

* **Categorize tabs using a specific Ollama model:**

   ```bash
   tab-man -c -d categorized_tabs -m llama2
   ```
* **Save API keys to the `.env` file:**

   ```bash
   tab-man --save-keys -gk YOUR_GEMINI_API_KEY -mk YOUR_MISTRAL_API_KEY
   ```

## Configuration

API keys for Gemini and Mistral are read from environment variables or can be provided as command-line arguments. To simplify configuration, rename the `.env.local` file in the project's root directory to `.env`.

## Dependencies

* `requests`
* `ftfy`
* `python-dotenv`
* `argparse`
* `google-generativeai` (for Gemini categorization)
* `openai` (for Mistral categorization)
* `ollama` (for Ollama categorization)
* `spacy` (for spaCy categorization)

## Testing

Tests are located in the `tests` directory. Run tests using `pytest`:

```bash
pytest -v -s  # or pytest -v -rfE --tb=long for detailed failure reports
```