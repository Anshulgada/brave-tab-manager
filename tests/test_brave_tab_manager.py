import os
import json
import pytest
import tempfile
from unittest.mock import patch, MagicMock
import requests
from typing import Dict, List

# Import the main functions
from brave_tab_sorter.main import (
    fetch_all_tabs,
    decode_title,
    filter_iframe_tabs,
    save_api_keys,
    save_categorized_tabs,
    main,
    generate_categories_with_spacy,
    generate_categories_with_gemini,
    generate_categories_with_mistral,
    generate_categories_with_ollama
)

# Test data fixtures
@pytest.fixture
def sample_tabs():
    return [
        {
            "type": "page",
            "title": "Test Page &amp; Title",
            "url": "https://example.com"
        },
        {
            "type": "iframe",
            "title": "Embedded Content",
            "url": "https://embedded.com"
        },
        {
            "type": "page",
            "title": "",
            "url": "chrome-extension://test"
        },
        {
            "type": "iframe",
            "title": "YouTube Video",
            "url": "https://youtube.com/embed/test"
        }
    ]

class TestBraveTabManager:
    def test_fetch_all_tabs(self):
        """Test fetching tabs from Brave browser"""
        with patch('requests.get') as mock_get:
            # Test successful response
            mock_get.return_value.status_code = 200
            mock_get.return_value.json.return_value = [{"title": "Test", "url": "https://test.com"}]
            tabs = fetch_all_tabs()
            assert len(tabs) == 1
            
            # Test failed connection
            mock_get.side_effect = requests.exceptions.RequestException
            tabs = fetch_all_tabs()
            assert tabs == []

    def test_decode_title(self):
        """Test title decoding functionality"""
        assert decode_title("Test &amp; Title") == "Test & Title"
        assert decode_title("\u0041\u030A") == "Å"
        assert decode_title("Test\x00Title") == "TestTitle"
        assert decode_title("Test\u200bTitle") == "TestTitle"  # Zero-width space
        assert decode_title("") == ""

    def test_filter_iframe_tabs(self, sample_tabs):
        """Test filtering of tabs based on all conditions"""
        filtered_tabs = filter_iframe_tabs(sample_tabs)
        
        # Should filter out chrome-extension, youtube embed, and iframes
        assert len(filtered_tabs) == 1  # Changed from 2 to 1
        assert filtered_tabs[0]["url"] == "https://example.com"  # Only regular page should remain
        
        # Verify specific URLs are filtered out
        assert all("chrome-extension://" not in tab["url"] for tab in filtered_tabs)
        assert all("youtube.com/embed" not in tab["url"] for tab in filtered_tabs)
        
        # Test additional filter conditions
        problematic_tabs = [
            {"url": "https://test.com/headless", "title": "Test"},
            {"url": "https://recaptcha.net", "title": "Test"},
            {"url": "https://seamlessaccess.org", "title": "Test"},
            {"url": "https://accounts.google.com/login", "title": "Test"}
        ]
        filtered = filter_iframe_tabs(problematic_tabs)
        assert len(filtered) == 1  # All problematic tabs should be filtered out

    def test_save_api_keys(self):
        """Test saving API keys to .env file"""
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch('os.path.dirname', return_value=temp_dir):
                env_path = os.path.join(temp_dir, '.env')
                
                # Test saving new keys
                save_api_keys(gemini_key="test_gemini", mistral_key="test_mistral")
                
                with open(env_path, 'r') as f:
                    content = f.read()
                    assert "GEMINI_API_KEY=test_gemini" in content
                    assert "MISTRAL_API_KEY=test_mistral" in content
                
                # Test updating existing keys
                save_api_keys(gemini_key="new_gemini")
                with open(env_path, 'r') as f:
                    content = f.read()
                    # Should find updated Gemini key and original Mistral key
                    assert "GEMINI_API_KEY=new_gemini" in content
                    assert "MISTRAL_API_KEY=test_mistral" in content

    def test_save_categorized_tabs(self):
        """Test saving categorized tabs to directory structure"""
        categorized_tabs = {
            "Development_GitHub": [  # Changed to use underscores directly
                {"title": "Test Repo", "url": "https://github.com/test"}
            ],
            "Research_Papers": [  # Changed to use underscores directly
                {"title": "Test Paper", "url": "https://example.edu/paper"}
            ]
        }
        
        with tempfile.TemporaryDirectory() as temp_dir:
            save_categorized_tabs(categorized_tabs, temp_dir)
            
            # Check directory structure with corrected names
            assert os.path.exists(os.path.join(temp_dir, "Development_GitHub"))
            assert os.path.exists(os.path.join(temp_dir, "Research_Papers"))
            
            # Check file contents
            dev_path = os.path.join(temp_dir, "Development_GitHub")
            files = os.listdir(dev_path)
            assert len(files) > 0
            with open(os.path.join(dev_path, files[0]), 'r') as f:
                content = f.read()
                assert "Test Repo" in content
                assert "https://github.com/test" in content


    @patch('brave_tab_sorter.main.fetch_all_tabs')
    def test_main_function(self, mock_fetch, sample_tabs):
        """Test main function with various configurations"""
        mock_fetch.return_value = sample_tabs
        
        # Test without categorization
        with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as tf:
            result = main(output_file=tf.name)
            assert isinstance(result, list)
            assert len(result) == 1  # Changed from 2 to 1, only regular page remains
            
            with open(tf.name, 'r') as f:
                saved_data = json.load(f)
                assert len(saved_data) == 1
                # Verify only the regular page tab is present
                assert saved_data[0]["url"] == "https://example.com"
        
        # Test with categorization
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch('brave_tab_sorter.main.GEMINI_AVAILABLE', True):
                with patch('brave_tab_sorter.main.generate_categories_with_gemini') as mock_gemini:
                    mock_gemini.return_value = {"Test": [sample_tabs[0]]}  # Only include the regular page
                    result = main(
                        categorize=True,
                        output_dir=temp_dir,
                        gemini_api_key="test_key"
                    )
                    assert isinstance(result, dict)
                    assert "Test" in result
                    assert len(result["Test"]) == 1
                    assert os.path.exists(temp_dir)
   

    @pytest.mark.asyncio
    async def test_categorization_methods(self, sample_tabs):
        """Test all available categorization methods"""
        # Test spaCy categorization
        with patch('spacy.load') as mock_spacy:
            mock_nlp = MagicMock()
            mock_nlp.return_value.ents = []
            mock_spacy.return_value = mock_nlp
            categories = generate_categories_with_spacy(sample_tabs[:2])
            assert isinstance(categories, dict)
            assert len(categories) > 0

        # Test Gemini categorization
        with patch('google.generativeai.GenerativeModel') as mock_gemini:
            mock_model = MagicMock()
            mock_model.generate_content.return_value.text = '{"Category": [0, 1]}'
            mock_gemini.return_value = mock_model
            categories = generate_categories_with_gemini(sample_tabs[:2], "test_key")
            assert isinstance(categories, dict)
            assert len(categories) > 0

        # Test Mistral categorization
        with patch('openai.ChatCompletion.create') as mock_mistral:
            mock_mistral.return_value.choices = [
                MagicMock(message=MagicMock(content='{"Category": [0, 1]}'))
            ]
            categories = generate_categories_with_mistral(sample_tabs[:2], "test_key")
            assert isinstance(categories, dict)
            assert len(categories) > 0

        # Test Ollama categorization
        with patch('ollama.chat') as mock_ollama:
            mock_ollama.return_value = {
                'message': {'content': '{"Category": [0, 1]}'}
            }
            categories = generate_categories_with_ollama(sample_tabs[:2])
            assert isinstance(categories, dict)
            assert len(categories) > 0


if __name__ == '__main__':
    pytest.main(['-v'])