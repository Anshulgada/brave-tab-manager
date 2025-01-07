from setuptools import setup, find_packages

import os

def get_long_description():
    with open(os.path.join(os.path.dirname(__file__), 'README.md'), encoding='utf-8') as f:
        return f.read()


setup(
    name='tabman',
    version='0.3.0',
    url="https://github.com/Anshulgada/brave-tab-manager",
    packages=find_packages(),
    install_requires=[
        'playwright',
        'requests',
        'beautifulsoup4',
        'google-generativeai',
        'google-api-python-client',
        'tenacity',
        'openai',
        'python-dotenv',
        'ollama',
        'markdown',
        'pytest-asyncio',
    ],
    long_description=get_long_description(),
    long_description_content_type='text/markdown',
    entry_points={
        'console_scripts': [
            'tabman = tabman.main:entry_point',
        ],
    },
)