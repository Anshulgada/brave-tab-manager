from setuptools import setup, find_packages

setup(
    name='brave-tab-sorter',
    version='0.1.0',
    packages=find_packages(where='brave_tab_sorter'),  # Correctly finds packages within subdirectory
    install_requires=[
        'ftfy',
        'spacy',
        'openai',
        'ollama',
        'requests',
        'argparse',
        'python-dotenv',
        'google-generativeai',
    ],
    entry_points={
        'console_scripts': [
            'tab-man = brave_tab_sorter.main:cli',  # Path to main function
        ],
    },
    author='Anshul Gada',
    description='CLI tool for managing and categorizing Brave browser tabs',
    long_description=open('README.md').read(),
    long_description_content_type='text/markdown',
)