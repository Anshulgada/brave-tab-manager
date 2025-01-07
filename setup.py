from setuptools import setup, find_packages

setup(
    name="tabman",
    author="Anshul Gada",
    version="0.1.0",
    url="https://github.com/Anshulgada/brave-tab-manager",
    packages=find_packages(),
    install_requires=[
        "playwright",
        "requests",
        "beautifulsoup4",
        "google-generativeai",
        "google-api-python-client",
        "tenacity",
        "openai",
        "python-dotenv",
        "ollama",
        "markdown",
    ],
    entry_points={
        "console_scripts": [
            "tabman = tabman.main:entry_point",
        ],
    },
)
