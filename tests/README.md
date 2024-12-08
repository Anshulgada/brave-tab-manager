# Brave Tab Manager Test Suite

## Setup

1. Ensure you have the required dependencies installed:
   ```bash
   pip install pytest 
   pip install -r requirements.txt  # Include all project dependencies
   ```

2. Environment Requirements:
   - Python 3.8+
   - pytest
   - All dependencies from the main project

## Running Tests

### Basic Test Execution
```bash
pytest tests/
```

### Running Specific Tests
```bash
# Run a specific test file
pytest tests/test_brave_tab_manager.py

# Run tests with a specific marker
pytest -m slow
```

## Notes
- Some tests are marked as `@pytest.mark.skip` and require manual configuration 
  (e.g., external API keys for Gemini, Mistral)
- Ensure you have the necessary API keys and services configured 
  before running external service tests

## Troubleshooting
- Make sure all project dependencies are installed
- Check that you're running the tests from the project root directory
- Verify Python and pytest versions are compatible