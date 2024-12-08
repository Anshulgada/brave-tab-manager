from setuptools import setup, find_packages

setup(
    name='brave-tab-sorter',
    version='0.1.0',
    packages=find_packages(where='brave_tab_sorter'),  # Correctly finds packages within subdirectory
    install_requires=[
        'requests',
        'ftfy',
        'ollama',
        'google-generativeai',
        'spacy',
        'openai',
        'python-dotenv',
        'argparse',
    ],
    entry_points={
        'console_scripts': [
            'brave-tabs = brave_tab_sorter.main:cli',  # Path to main function
        ],
    },
    author='Anshul Gada',
    description='CLI tool for managing and categorizing Brave browser tabs',
    long_description=open('README.md').read(),
    long_description_content_type='text/markdown',
)