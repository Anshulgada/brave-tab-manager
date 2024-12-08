import re
import os
import json
import glob
import html
import ftfy
import argparse
import requests
from dotenv import load_dotenv
from typing import List, Dict, Optional
from unicodedata import normalize, category


# Load environment variables
load_dotenv()

# Optional imports for different categorization methods
try:
    import ollama
    OLLAMA_AVAILABLE = True  # Ollama is available for categorization
except ImportError:
    OLLAMA_AVAILABLE = False  # Ollama not available

try:
    import openai
    OPENAI_AVAILABLE = True  # OpenAI (Mistral) is available for categorization
except ImportError:
    OPENAI_AVAILABLE = False  # OpenAI not available

try:
    import spacy
    SPACY_AVAILABLE = True  # spaCy is available for categorization
except ImportError:
    SPACY_AVAILABLE = False  # spaCy not available

try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True  # Google Gemini is available for categorization
except ImportError:
    GEMINI_AVAILABLE = False  # Google Gemini not available


# Constants
OUTPUT_FILE = "Open_Tabs.json"  # Default file for saving the tabs
FILTER_CONDITIONS = [
    # Filter conditions to exclude specific tabs based on their URL or title
    lambda tab: "chrome-extension://" in tab.get("url", ""),
    lambda tab: "youtube.com/embed" in tab.get("url", ""),
    lambda tab: not tab.get("title", ""),
    lambda tab: re.search(r"headless", tab.get("url", "")) and "stackblitz.com" in tab.get("url", ""),
    lambda tab: re.search(r"recaptcha|RotateCookiesPage", tab.get("url", "")),
    lambda tab: "seamlessaccess" in tab.get("url", ""),
    lambda tab: "accounts.google.com" in tab.get("url", "") and not re.search(r"RotateCookiesPage|recaptcha", tab.get("url", "")),
]


def fetch_all_tabs() -> List[Dict]:
    """
    Fetch all the open browser tabs from Brave Debugging API.
    Returns a list of tab data as dictionaries.
    """
    try:
        response = requests.get("http://localhost:9222/json")  # Connect to the browser debugging API
        return response.json() if response.status_code == 200 else []  # Return JSON if successful
    except requests.exceptions.RequestException as e:
        print(f"Error connecting to Brave Debugging API: {e}")
        return []


def decode_title(title: str) -> str:
    """
    Clean and decode the title of a tab.
    Fixes any encoding issues, unescapes HTML entities, and removes control characters.
    """
    fixed_title = ftfy.fix_text(title)  # Fix text encoding issues
    decoded_title = html.unescape(fixed_title)  # Unescape HTML entities like &lt; -> <
    normalized_title = normalize('NFC', decoded_title)  # Normalize the Unicode string
    cleaned_title = ''.join(char for char in normalized_title if not category(char).startswith('C'))  # Remove control characters
    return cleaned_title


def filter_iframe_tabs(tabs: List[Dict]) -> List[Dict]:
    """
    Filter out iframe tabs and any tabs that match the given filter conditions.
    Returns only relevant tabs.
    """
    filtered_tabs = []
    for tab in tabs:
        # Exclude iframe tabs and tabs that match any filter condition
        if tab.get("type") != "iframe" and not any(condition(tab) for condition in FILTER_CONDITIONS):  
            filtered_tabs.append({
                "title": decode_title(tab.get("title", "")),  # Decode and clean the title
                "url": tab.get("url", "")
            })
    return filtered_tabs


def generate_categories_with_spacy(tabs: List[Dict]) -> Dict[str, List[Dict]]:
    """
    Categorize tabs using spaCy's named entity recognition and keyword-based classification.
    Returns a dictionary with categories as keys and list of tabs as values.
    """
    try:
        # Load the spaCy model, or download it if not already available
        try:
            nlp = spacy.load("en_core_web_sm")
        except OSError:
            print("Downloading spaCy model...")
            os.system("python -m spacy download en_core_web_sm")
            nlp = spacy.load("en_core_web_sm")

        categories = {}
        for tab in tabs:
            doc = nlp(tab['title'] + " " + tab['url'])  # Process the tab title and URL

            # Extract named entities (e.g., organization names, locations)
            entities = set(ent.label_ for ent in doc.ents)
            
            # Fallback to keyword-based categorization if no entities found
            if not entities:
                if any(keyword in tab['title'].lower() for keyword in ['research', 'paper', 'study']):
                    entities.add('Academic')
                elif any(keyword in tab['title'].lower() for keyword in ['github', 'gitlab', 'bitbucket']):
                    entities.add('Development')
                else:
                    entities.add('Miscellaneous')

            # Add to categories based on the extracted entities
            for entity in entities:
                if entity not in categories:
                    categories[entity] = []
                categories[entity].append(tab)
        
        return categories

    except Exception as e:
        print(f"SpaCy categorization error: {e}")
        return {"Uncategorized": tabs}


def generate_categories_with_gemini(tabs: List[Dict], api_key: str) -> Dict[str, List[Dict]]:
    """
    Categorize tabs using Google Gemini API.
    Returns a dictionary with categories as keys and list of tabs as values.
    """
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash')

        # Prepare input for Gemini model
        tab_texts = [f"Title: {tab['title']}, URL: {tab['url']}" for tab in tabs]
        input_prompt = (
            "Organize these browser tabs into meaningful categories and subcategories based on their content. "
            "The number of categories and subcategories should be determined by the nature of the data, without any fixed limits. "
            "Provide a JSON response where each category (and optional subcategory) is a key, and the associated tab indices are the values. "
            "Be concise, logical, and thoughtful in forming categories.\n\n" + 
            "\n".join(tab_texts)
        )

        # Generate categories using Gemini
        response = model.generate_content(input_prompt)

        # Extract JSON from response
        response_text = response.text
        try:
            categories = json.loads(response_text)
        except json.JSONDecodeError:
            # Attempt to parse manually if JSON parsing fails
            print("AI response parsing failed. Attempting manual extraction.")
            json_match = re.search(r'\{.*?\}', response_text, re.DOTALL)
            if json_match:
                categories = json.loads(json_match.group(0))
            else:
                print("Could not extract categories. Falling back to default.")
                categories = {"Uncategorized": list(range(len(tabs)))}

        # Map the indices to the actual tabs
        categorized_tabs = {}
        for category, indices in categories.items():
            categorized_tabs[category] = [tabs[i] for i in indices if 0 <= i < len(tabs)]

        return categorized_tabs

    except Exception as e:
        print(f"Gemini categorization error: {e}")
        return {"Uncategorized": tabs}


def generate_categories_with_mistral(tabs: List[Dict], api_key: str) -> Dict[str, List[Dict]]:
    """
    Use Mistral AI for tab categorization
    """
    try:
        openai.api_base = "https://api.mistral.ai/v1"
        openai.api_key = api_key

        # Prepare input for AI model
        tab_texts = [f"Title: {tab['title']}, URL: {tab['url']}" for tab in tabs]
        input_prompt = (
            "Organize these browser tabs into meaningful categories and subcategories based on their content. "
            "The number of categories and subcategories should be determined by the nature of the data, without any fixed limits. "
            "Provide a JSON response where each category (and optional subcategory) is a key, and the associated tab indices are the values. "
            "Be concise, logical, and thoughtful in forming categories.\n\n" + 
            "\n".join(tab_texts)
)


        # Generate categories using Mistral
        response = openai.ChatCompletion.create(
            model="mistral-small-latest",
            messages=[{
                'role': 'user',
                'content': input_prompt
            }]
        )

        # Extract JSON from response
        response_text = response.choices[0].message.content
        try:
            categories = json.loads(response_text)
        except json.JSONDecodeError:
            # Fallback if direct JSON parsing fails
            print("AI response parsing failed. Attempting manual extraction.")
            json_match = re.search(r'\{.*?\}', response_text, re.DOTALL)
            if json_match:
                categories = json.loads(json_match.group(0))
            else:
                print("Could not extract categories. Falling back to default.")
                categories = {"Uncategorized": list(range(len(tabs)))}

        # Convert indices to actual tabs
        categorized_tabs = {}
        for category, indices in categories.items():
            categorized_tabs[category] = [tabs[i] for i in indices if 0 <= i < len(tabs)]

        return categorized_tabs

    except Exception as e:
        print(f"Mistral categorization error: {e}")
        return {"Uncategorized": tabs}


def generate_categories_with_ollama(tabs: List[Dict], model: str = "llama2") -> Dict[str, List[Dict]]:
    """
    Use Ollama to dynamically categorize tabs
    """
    try:
        # Prepare input for AI model
        tab_texts = [f"Title: {tab['title']}, URL: {tab['url']}" for tab in tabs]
        input_prompt = (
            "Organize these browser tabs into meaningful categories and subcategories based on their content. "
            "The number of categories and subcategories should be determined by the nature of the data, without any fixed limits. "
            "Provide a JSON response where each category (and optional subcategory) is a key, and the associated tab indices are the values. "
            "Be concise, logical, and thoughtful in forming categories.\n\n" + 
            "\n".join(tab_texts)
)


        # Generate categories using Ollama
        response = ollama.chat(model=model, messages=[
            {
                'role': 'user',
                'content': input_prompt
            }
        ])

        # Extract JSON from response
        try:
            categories = json.loads(response['message']['content'])
        except json.JSONDecodeError:
            # Fallback if direct JSON parsing fails
            print("AI response parsing failed. Attempting manual extraction.")
            # Basic regex to extract JSON-like structure
            json_match = re.search(r'\{.*?\}', response['message']['content'], re.DOTALL)
            if json_match:
                categories = json.loads(json_match.group(0))
            else:
                print("Could not extract categories. Falling back to default.")
                categories = {"Uncategorized": list(range(len(tabs)))}

        # Convert indices to actual tabs
        categorized_tabs = {}
        for category, indices in categories.items():
            categorized_tabs[category] = [tabs[i] for i in indices if 0 <= i < len(tabs)]

        return categorized_tabs

    except Exception as e:
        print(f"Ollama categorization error: {e}")
        return {"Uncategorized": tabs}


def save_api_keys(gemini_key: Optional[str] = None, mistral_key: Optional[str] = None):
    """
    Save the Gemini and Mistral API keys to the .env file.
    """
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    
    # Read the existing .env file if it exists
    existing_keys = {}
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if '=' in line:
                    key, value = line.strip().split('=', 1)
                    existing_keys[key] = value
    
    # Update the API keys if provided
    if gemini_key:
        existing_keys['GEMINI_API_KEY'] = gemini_key
    if mistral_key:
        existing_keys['MISTRAL_API_KEY'] = mistral_key
    
    # Write the updated .env file
    with open(env_path, 'w') as f:
        for key, value in existing_keys.items():
            f.write(f"{key}={value}\n")
    
    print("API keys updated successfully.")


def save_categorized_tabs(categorized_tabs: Dict[str, List[Dict]], output_dir: str):
    """
    Save the categorized tabs into a folder structure where each category is a folder.
    Each tab within the category will be saved as a text file.
    """
    os.makedirs(output_dir, exist_ok=True)  # Ensure the output directory exists

    for category, tabs in categorized_tabs.items():
        # Create a safe directory name for the category
        safe_category = re.sub(r'[^\w\-_\. ]', '_', category)
        category_dir = os.path.join(output_dir, safe_category)
        os.makedirs(category_dir, exist_ok=True)

        for tab in tabs:
            # Save each tab's details in a text file
            filename = f"{tab['title'][:50].replace('/', '_')}.txt"
            filepath = os.path.join(category_dir, filename)
            
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(f"Title: {tab['title']}\n")
                f.write(f"URL: {tab['url']}")


def main(output_file: Optional[str] = None, 
         categorize: bool = False, 
         output_dir: Optional[str] = None, 
         model: Optional[str] = None,
         mistral_api_key: Optional[str] = None,
         gemini_api_key: Optional[str] = None,
         save_keys: bool = False):
    """
    Main function for Brave tab management
    """
    # Save keys if requested
    if save_keys:
        save_api_keys(gemini_api_key, mistral_api_key)
        return

    # Use environment variables if keys not provided
    gemini_api_key = gemini_api_key or os.getenv('GEMINI_API_KEY')
    mistral_api_key = mistral_api_key or os.getenv('MISTRAL_API_KEY')

    print("\nFetching Brave tabs...\n")

    # Fetch tabs
    fetched_tabs = fetch_all_tabs()
    if not fetched_tabs:
        print("No tabs found or unable to connect to Brave.")
        return

    #Separate and filter iframe tabs ONLY  -- KEY CHANGE!!
    iframe_tabs = filter_iframe_tabs([tab for tab in fetched_tabs if tab.get("type") == "iframe"]) #Correct filtering
    page_tabs = filter_iframe_tabs([tab for tab in fetched_tabs if tab.get("type") == "page"]) # Correct filter

    # Combine tabs
    all_tabs = page_tabs + iframe_tabs  # Now correctly filtered

    # Categorize if requested
    if categorize:
        print("\nCategorizing tabs...\n")
        try:
            # Prioritize categorization methods based on availability
            if gemini_api_key and GEMINI_AVAILABLE:
                # Google Gemini categorization (default)
                categorized_tabs = generate_categories_with_gemini(all_tabs, gemini_api_key)
            elif mistral_api_key and OPENAI_AVAILABLE:
                # Mistral AI categorization
                categorized_tabs = generate_categories_with_mistral(all_tabs, mistral_api_key)
            elif model and OLLAMA_AVAILABLE:
                # User-specified Ollama model
                categorized_tabs = generate_categories_with_ollama(all_tabs, model)
            elif SPACY_AVAILABLE:
                # Lightweight spaCy categorization
                categorized_tabs = generate_categories_with_spacy(all_tabs)
            else:
                print("No categorization method available. Performing no categorization.")
                categorized_tabs = {"Uncategorized": all_tabs}
            
            # Save to directory if output_dir is specified
            if output_dir:
                save_categorized_tabs(categorized_tabs, output_dir)
                print(f"\nCategorized tabs saved to {output_dir}\n")
            
            return categorized_tabs
        except Exception as e:
            print(f"Categorization failed: {e}")

    # Save to JSON if output file is specified
    if output_file:
        try:
            with open(output_file, "w", encoding="utf-8") as file:
                json.dump(all_tabs, file, ensure_ascii=False, indent=4)
            print(f"Saved {len(all_tabs)} tabs to {output_file}.")
        except Exception as e:
            print(f"Error saving tabs to file: {e}")

    return all_tabs


def cli():
    parser = argparse.ArgumentParser(
        description="Brave Browser Tab Management Tool",
        epilog="Example usage: brave-tabs -o my_tabs.json -c -d categorized_tabs -gk YOUR_GEMINI_API_KEY",  # Added epilog
        formatter_class=argparse.RawTextHelpFormatter  # For better formatting of help message
    )
    parser.add_argument('-o', '--output', help='Output JSON file path (default: Open_Tabs.json if not categorized)')
    parser.add_argument('-c', '--categorize', action='store_true', help='Categorize tabs (default method: Gemini)')
    parser.add_argument('-d', '--output-dir', help='Directory to save categorized tabs (required with -c)')
    parser.add_argument('-m', '--model', help='Specify Ollama model for categorization (e.g., "llama2")')
    parser.add_argument('-mk', '--mistral-key', help='Mistral AI API key')
    parser.add_argument('-gk', '--gemini-key', help='Google Gemini API key')
    parser.add_argument('--save-keys', action='store_true', help='Save API keys to .env file. Use with -gk or -mk.')
    
    
    args = parser.parse_args()
    
    if not args.categorize and not args.output and not args.save_keys:  # Check if at least one is given
        parser.print_help()  # If not, print help, and exit
        return

    # Expand the wildcard if used in --output-dir
    if args.output_dir:
        expanded_paths = glob.glob(os.path.expanduser(args.output_dir))  # Expand ~ and wildcards
        if not expanded_paths:
            print(f"Error: No paths found for {args.output_dir}")
            return
        args.output_dir = expanded_paths[0]  # Use the first match

    print(f"Output directory is set to: {args.output_dir}")


    main(output_file=args.output,
         categorize=args.categorize,
         output_dir=args.output_dir,
         model=args.model,
         mistral_api_key=args.mistral_key,
         gemini_api_key=args.gemini_key,
         save_keys=args.save_keys)


if __name__ == "__main__":
    cli()
