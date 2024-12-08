import os
import json
import re
import html
import ftfy
import argparse
import requests
from dotenv import load_dotenv
from unicodedata import normalize, category
from typing import List, Dict, Optional

# Load environment variables
load_dotenv()

# Optional imports for different categorization methods
try:
    import ollama
    OLLAMA_AVAILABLE = True
except ImportError:
    OLLAMA_AVAILABLE = False

try:
    import openai
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

try:
    import spacy
    SPACY_AVAILABLE = True
except ImportError:
    SPACY_AVAILABLE = False

try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

# Constants
OUTPUT_FILE = "Open_Tabs.json"
FILTER_CONDITIONS = [
    lambda tab: "chrome-extension://" in tab.get("url", ""),
    lambda tab: "youtube.com/embed" in tab.get("url", ""),
    lambda tab: not tab.get("title", ""),
    lambda tab: re.search(r"headless", tab.get("url", "")) and "stackblitz.com" in tab.get("url", ""),
    lambda tab: re.search(r"recaptcha|RotateCookiesPage", tab.get("url", "")),
    lambda tab: "seamlessaccess" in tab.get("url", ""),
    lambda tab: "accounts.google.com" in tab.get("url", "") and not re.search(r"RotateCookiesPage|recaptcha", tab.get("url", "")),
]

def fetch_all_tabs() -> List[Dict]:
    try:
        response = requests.get("http://localhost:9222/json")
        return response.json() if response.status_code == 200 else []
    except requests.exceptions.RequestException as e:
        print(f"Error connecting to Brave Debugging API: {e}")
        return []

def decode_title(title: str) -> str:
    fixed_title = ftfy.fix_text(title)
    decoded_title = html.unescape(fixed_title)
    normalized_title = normalize('NFC', decoded_title)
    cleaned_title = ''.join(char for char in normalized_title if not category(char).startswith('C'))
    return cleaned_title

def filter_iframe_tabs(tabs: List[Dict]) -> List[Dict]:
    filtered_tabs = []
    for tab in tabs:
        should_exclude = any(condition(tab) for condition in FILTER_CONDITIONS)
        if not should_exclude:
            filtered_tabs.append({
                "title": decode_title(tab.get("title", "")),
                "url": tab.get("url", "")
            })
    return filtered_tabs

def generate_categories_with_spacy(tabs: List[Dict]) -> Dict[str, List[Dict]]:
    """
    Use spaCy for lightweight categorization
    """
    try:
        # Use the smallest available spaCy model
        try:
            nlp = spacy.load("en_core_web_sm")
        except OSError:
            print("Downloading spaCy model...")
            os.system("python -m spacy download en_core_web_sm")
            nlp = spacy.load("en_core_web_sm")

        # Basic categorization using spaCy's named entity recognition
        categories = {}
        for i, tab in enumerate(tabs):
            doc = nlp(tab['title'] + " " + tab['url'])
            
            # Extract named entities
            entities = set(ent.label_ for ent in doc.ents)
            
            # Fallback to keyword-based categorization if no entities
            if not entities:
                if any(keyword in tab['title'].lower() for keyword in ['research', 'paper', 'study']):
                    entities.add('Academic')
                elif any(keyword in tab['title'].lower() for keyword in ['github', 'gitlab', 'bitbucket']):
                    entities.add('Development')
                else:
                    entities.add('Miscellaneous')
            
            # Add to categories
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
    Use Google Gemini for tab categorization
    """
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-pro')

        # Prepare input for AI model
        tab_texts = [f"Title: {tab['title']}, URL: {tab['url']}" for tab in tabs]
        input_prompt = (
            "Categorize these browser tabs into 5-10 meaningful groups as per input data(groups and sub-groups may increase or decrease the given range). "
            "Provide a JSON response with category names as keys and lists of tab indices as values. "
            "Be concise and thoughtful in creating categories.\n\n" + 
            "\n".join(tab_texts)
        )

        # Generate categories using Gemini
        response = model.generate_content(input_prompt)

        # Extract JSON from response
        response_text = response.text
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
            "Categorize these browser tabs into 5-10 meaningful groups as per input data(groups and sub-groups may increase or decrease the given range). "
            "Provide a JSON response with category names as keys and lists of tab indices as values. "
            "Be concise and thoughtful in creating categories.\n\n" + 
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
            "Categorize these browser tabs into 5-10 meaningful groups as per input data(groups and sub-groups may increase or decrease the given range). "
            "Provide a JSON response with category names as keys and lists of tab indices as values. "
            "Be concise and thoughtful in creating categories.\n\n" + 
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
    Save API keys to .env file
    """
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    
    # Read existing .env file
    existing_keys = {}
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if '=' in line:
                    key, value = line.strip().split('=', 1)
                    existing_keys[key] = value
    
    # Update keys
    if gemini_key:
        existing_keys['GEMINI_API_KEY'] = gemini_key
    if mistral_key:
        existing_keys['MISTRAL_API_KEY'] = mistral_key
    
    # Write updated .env file
    with open(env_path, 'w') as f:
        for key, value in existing_keys.items():
            f.write(f"{key}={value}\n")
    
    print("API keys updated successfully.")


def save_categorized_tabs(categorized_tabs: Dict[str, List[Dict]], output_dir: str):
    """
    Save categorized tabs to folder structure
    """
    os.makedirs(output_dir, exist_ok=True)

    for category, tabs in categorized_tabs.items():
        # Create safe directory name
        safe_category = re.sub(r'[^\w\-_\. ]', '_', category)
        category_dir = os.path.join(output_dir, safe_category)
        os.makedirs(category_dir, exist_ok=True)

        for tab in tabs:
            # Create a text file with tab details
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

    # Separate and filter tabs
    iframe_tabs = filter_iframe_tabs([tab for tab in fetched_tabs if tab.get("type") == "iframe"])
    page_tabs = [
        {"title": decode_title(tab.get("title", "")), "url": tab.get("url", "")}
        for tab in fetched_tabs if tab.get("type") == "page"
    ]

    # Combine tabs
    all_tabs = page_tabs + iframe_tabs

    # Categorize if requested
    if categorize:
        print("\nCategorizing tabs...\n")
        try:
            # Prioritize categorization methods based on availability
            if gemini_api_key and GEMINI_AVAILABLE:
                # Google Gemini categorization (default)
                categorized_tabs = generate_categories_with_gemini(all_tabs, gemini_api_key)
            elif model and OLLAMA_AVAILABLE:
                # User-specified Ollama model
                categorized_tabs = generate_categories_with_ollama(all_tabs, model)
            elif mistral_api_key and OPENAI_AVAILABLE:
                # Mistral AI categorization
                categorized_tabs = generate_categories_with_mistral(all_tabs, mistral_api_key)
            elif SPACY_AVAILABLE:
                # Lightweight spaCy categorization
                categorized_tabs = generate_categories_with_spacy(all_tabs)
            elif OLLAMA_AVAILABLE:
                # Fallback to default Ollama model
                categorized_tabs = generate_categories_with_ollama(all_tabs)
            else:
                print("No categorization method available. Using default.")
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
    parser = argparse.ArgumentParser(description="Brave Browser Tab Management Tool")
    parser.add_argument('-o', '--output', help='Output JSON file path')
    parser.add_argument('-c', '--categorize', action='store_true', 
                        help='Categorize tabs (default method will be Gemini)')
    parser.add_argument('-d', '--output-dir', 
                        help='Directory to save categorized tabs')
    parser.add_argument('-m', '--model', 
                        help='Specify Ollama model for categorization')
    parser.add_argument('-mk','--mistral-key', 
                        help='Mistral AI API key for categorization')
    parser.add_argument('-gk', '--gemini-key', 
                        help='Google Gemini API key for categorization (default)')
    parser.add_argument('--save-keys', action='store_true',
                        help='Save API keys to .env file')
    
    args = parser.parse_args()
    
    main(output_file=args.output, 
         categorize=args.categorize, 
         output_dir=args.output_dir,
         model=args.model,
         mistral_api_key=args.mistral_key,
         gemini_api_key=args.gemini_key,
         save_keys=args.save_keys)

if __name__ == "__main__":
    cli()