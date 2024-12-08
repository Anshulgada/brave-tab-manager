import os
import json
import pytest
import tempfile
import requests
from unittest.mock import patch, MagicMock


# Import the main functions from the module 'brave_tab_sorter.main'
from brave_tab_sorter.main import (
    fetch_all_tabs,  # Fetch tabs from the browser
    decode_title,    # Decode special characters in the tab titles
    filter_iframe_tabs,  # Filter out iframe tabs
    save_api_keys,   # Save API keys to a file
    save_categorized_tabs,  # Save categorized tabs to a directory structure
    main,            # Main function to orchestrate tab sorting and categorization
    generate_categories_with_spacy,  # Categorize tabs using spaCy
    generate_categories_with_gemini,  # Categorize tabs using Gemini
    generate_categories_with_mistral,  # Categorize tabs using Mistral
    generate_categories_with_ollama   # Categorize tabs using Ollama
)


# Test data fixture that provides sample tab data for the tests
@pytest.fixture
def sample_tabs():
    return [
        {
            "type": "page",
            "title": "Test Page &amp; Title",  # Title with HTML entity
            "url": "https://example.com"
        },
        {
            "type": "iframe",  # Iframe tab
            "title": "Embedded Content",
            "url": "https://embedded.com"
        },
        {
            "type": "page",
            "title": "",  # Empty title
            "url": "chrome-extension://test"
        },
        {
            "type": "iframe",  # Another iframe tab
            "title": "YouTube Video",
            "url": "https://youtube.com/embed/test"
        }
    ]


# Test class for the BraveTabManager
class TestBraveTabManager:

    def test_fetch_all_tabs(self):
        """Test fetching tabs from Brave browser"""
        # Patch the 'requests.get' method to mock the API call
        with patch('requests.get') as mock_get:
            
            # Test a successful API response
            mock_get.return_value.status_code = 200
            mock_get.return_value.json.return_value = [{"title": "Test", "url": "https://test.com"}]
            tabs = fetch_all_tabs()  # Call the function
            assert len(tabs) == 1  # Check if one tab was returned
            
            # Test failed connection (e.g., network issues)
            mock_get.side_effect = requests.exceptions.RequestException
            tabs = fetch_all_tabs()  # Call the function again
            assert tabs == []  # Ensure it returns an empty list in case of failure


    def test_decode_title(self):
        """Test title decoding functionality"""
        # Test different cases of decoding HTML entities and special characters
        assert decode_title("Test &amp; Title") == "Test & Title"  # Decoding HTML entities
        assert decode_title("\u0041\u030A") == "Å"  # Combining characters
        assert decode_title("Test\x00Title") == "TestTitle"  # Null character
        assert decode_title("Test\u200bTitle") == "TestTitle"  # Zero-width space
        assert decode_title("") == ""  # Edge case with an empty string


    def test_filter_iframe_tabs(self, sample_tabs):
        """Test filtering of iframe tabs from the list of tabs"""
        # Only page tabs should remain after filtering
        filtered_tabs = filter_iframe_tabs(sample_tabs)
        assert len(filtered_tabs) == 1  # Should only be one regular page tab left
        assert filtered_tabs[0]["url"] == "https://example.com"  # Ensure the correct tab is kept


    def test_save_api_keys(self):
        """Test saving API keys to a .env file"""
        with tempfile.TemporaryDirectory() as temp_dir:  # Create a temporary directory
            with patch('os.path.dirname', return_value=temp_dir):  # Mock the os.path.dirname function
                env_path = os.path.join(temp_dir, '.env')  # Define the path for the .env file
                
                # Test saving new API keys
                save_api_keys(gemini_key="test_gemini", mistral_key="test_mistral")
                
                # Verify the keys were saved in the .env file
                with open(env_path, 'r') as f:
                    content = f.read()
                    assert "GEMINI_API_KEY=test_gemini" in content
                    assert "MISTRAL_API_KEY=test_mistral" in content
                
                # Test updating the existing keys (only Gemini key should be updated)
                save_api_keys(gemini_key="new_gemini")
                with open(env_path, 'r') as f:
                    content = f.read()
                    assert "GEMINI_API_KEY=new_gemini" in content
                    assert "MISTRAL_API_KEY=test_mistral" in content


    def test_save_categorized_tabs(self):
        """Test saving categorized tabs to a directory structure"""
        # Sample categorized tabs with corrected names (using underscores)
        categorized_tabs = {
            "Development_GitHub": [
                {"title": "Test Repo", "url": "https://github.com/test"}
            ],
            "Research_Papers": [
                {"title": "Test Paper", "url": "https://example.edu/paper"}
            ]
        }
        
        with tempfile.TemporaryDirectory() as temp_dir:
            save_categorized_tabs(categorized_tabs, temp_dir)  # Save categorized tabs in temp dir
            
            # Verify the directory structure is created with the correct names
            assert os.path.exists(os.path.join(temp_dir, "Development_GitHub"))
            assert os.path.exists(os.path.join(temp_dir, "Research_Papers"))
            
            # Check the contents of the files
            dev_path = os.path.join(temp_dir, "Development_GitHub")
            files = os.listdir(dev_path)
            assert len(files) > 0  # Ensure there's at least one file in the directory
            with open(os.path.join(dev_path, files[0]), 'r') as f:
                content = f.read()
                assert "Test Repo" in content
                assert "https://github.com/test" in content


    @patch('brave_tab_sorter.main.fetch_all_tabs')
    def test_main_function(self, mock_fetch, sample_tabs):
        """Test the main function of the application"""
        mock_fetch.return_value = sample_tabs  # Mock fetch_all_tabs to return the sample_tabs

        # Test the main function when outputting to a file
        with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as tf:
            result = main(output_file=tf.name)  # Call the main function
            assert isinstance(result, list)  # Ensure the result is a list
            assert len(result) == 1  # Only one regular page tab should be included
            with open(tf.name, 'r') as f:
                saved_data = json.load(f)
                assert len(saved_data) == 1  # Only one tab in the saved data
                assert saved_data[0]["url"] == "https://example.com"  # Check the URL


    @pytest.mark.asyncio
    async def test_categorization_methods(self, sample_tabs):
        """Test all available categorization methods"""
        # Test spaCy categorization method
        with patch('spacy.load') as mock_spacy:
            mock_nlp = MagicMock()
            mock_nlp.return_value.ents = []
            mock_spacy.return_value = mock_nlp
            categories = generate_categories_with_spacy(sample_tabs[:2])
            assert isinstance(categories, dict)  # Ensure the result is a dictionary
            assert len(categories) > 0  # Ensure categories are generated

        # Test Gemini categorization method
        with patch('google.generativeai.GenerativeModel') as mock_gemini:
            mock_model = MagicMock()
            mock_model.generate_content.return_value.text = '{"Category": [0, 1]}'
            mock_gemini.return_value = mock_model
            categories = generate_categories_with_gemini(sample_tabs[:2], "test_key")
            assert isinstance(categories, dict)
            assert len(categories) > 0

        # Test Mistral categorization method
        with patch('openai.ChatCompletion.create') as mock_mistral:
            mock_mistral.return_value.choices = [
                MagicMock(message=MagicMock(content='{"Category": [0, 1]}'))
            ]
            categories = generate_categories_with_mistral(sample_tabs[:2], "test_key")
            assert isinstance(categories, dict)
            assert len(categories) > 0

        # Test Ollama categorization method
        with patch('ollama.chat') as mock_ollama:
            mock_ollama.return_value = {
                'message': {'content': '{"Category": [0, 1]}'}
            }
            categories = generate_categories_with_ollama(sample_tabs[:2])
            assert isinstance(categories, dict)
            assert len(categories) > 0


# Run pytest when the script is executed directly
if __name__ == '__main__':
    pytest.main(['-v -s'])
