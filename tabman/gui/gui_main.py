import sys
import asyncio
import webbrowser
import os
from typing import List, Dict, Optional
from PyQt5.QtWidgets import (
    QApplication,
    QMainWindow,
    QWidget,
    QLineEdit,
    QPushButton,
    QVBoxLayout,
    QHBoxLayout,
    QListWidget,
    QListWidgetItem,
    QLabel,
    QComboBox,
    QSpacerItem,
    QSizePolicy,
    QGridLayout,
    QFormLayout,
    QToolButton,
)
from PyQt5.QtCore import Qt
from tabman.search import search_tabs, load_tabs_from_markdown


class MainWindow(QMainWindow):
    """Main window for the GUI"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.setWindowTitle("Tabman")
        self.setGeometry(100, 100, 800, 600)

        self.central_widget = QWidget()
        self.setCentralWidget(self.central_widget)
        self.setStyleSheet(
            "QMainWindow { background-color: #111; color: #eee}"
        )  # setting the background for the main window

        self.main_layout = QVBoxLayout()
        self.central_widget.setLayout(self.main_layout)

        # Search Bar with styling
        self.search_bar = QLineEdit()
        self.search_bar.setPlaceholderText("Search Tabs")
        self.search_bar.setStyleSheet(
            "QLineEdit { background-color: #333; color: #eee; border: 1px solid #555; padding: 8px; border-radius: 4px;}"
        )
        self.search_bar.returnPressed.connect(self._search)
        self.main_layout.addWidget(self.search_bar)

        # Filter section
        filter_layout = QFormLayout()
        self.category_filter = QComboBox()
        self.category_filter.setPlaceholderText("Filter Category")
        self.category_filter.setStyleSheet(
            "QComboBox { background-color: #333; color: #eee; border: 1px solid #555; padding: 8px; border-radius: 4px;}"
        )
        self.category_filter.setEditable(True)  # Enable editing on the combobox
        self.category_filter.lineEdit().returnPressed.connect(self._search)
        filter_layout.addRow(
            QLabel("Category:", styleSheet="QLabel {color: #eee;}"),
            self.category_filter,
        )

        self.tag_filter = QLineEdit()
        self.tag_filter.setPlaceholderText("Filter Tags")
        self.tag_filter.setStyleSheet(
            "QLineEdit { background-color: #333; color: #eee; border: 1px solid #555; padding: 8px; border-radius: 4px;}"
        )
        self.tag_filter.returnPressed.connect(self._search)
        filter_layout.addRow(
            QLabel("Tag:", styleSheet="QLabel {color: #eee;}"), self.tag_filter
        )

        self.main_layout.addLayout(filter_layout)

        # List View with styling
        self.search_results_label = QLabel("Search Results")
        self.search_results_label.setStyleSheet(
            "QLabel {font-weight: bold; color: #eee}"
        )
        self.main_layout.addWidget(self.search_results_label)

        self.tab_list = QListWidget()
        self.tab_list.setStyleSheet(
            "QListWidget { background-color: #222; color: #eee; border: 1px solid #555;}"
        )
        self.tab_list.itemDoubleClicked.connect(self._open_tab)
        self.main_layout.addWidget(self.tab_list)

        clear_button_layout = QHBoxLayout()

        # Clear Button
        self.clear_button = QPushButton("Clear", clicked=self._clear_all)
        self.clear_button.setStyleSheet(
            "QPushButton { background-color: #333; color: #eee; border: 1px solid #555; padding: 8px; border-radius: 4px;}"
        )
        clear_button_layout.addStretch()
        clear_button_layout.addWidget(self.clear_button)
        clear_button_layout.addStretch()
        self.main_layout.addLayout(clear_button_layout)

        # Search Button
        search_button_layout = QHBoxLayout()
        self.search_button = QPushButton("Search", clicked=self._search)
        self.search_button.setStyleSheet(
            "QPushButton { background-color: #333; color: #eee; border: 1px solid #555; padding: 8px; border-radius: 4px;}"
        )
        search_button_layout.addStretch()
        search_button_layout.addWidget(self.search_button)
        search_button_layout.addStretch()
        self.main_layout.addLayout(search_button_layout)

        # Category Clear Button
        self.clear_category_button = QPushButton("X", clicked=self._clear_category)
        self.clear_category_button.setStyleSheet(
            "QPushButton { background-color: #333; color: #eee; border: 1px solid #555; padding: 2px; border-radius: 4px;}"
        )
        filter_layout.addWidget(self.clear_category_button)

        # Loading Label
        self.loading_label = QLabel("")
        self.loading_label.setStyleSheet("QLabel { color: #eee; }")
        self.main_layout.addWidget(self.loading_label)
        self._populate_categories()
        self.keyPressEvent = self._key_press_event  # set a custom keyboard handler

    def _populate_categories(self):
        """
        Populates the categories dropdown
        """
        print("Populating Categories...")
        all_tabs_file = os.path.join("data", "all_tabs.md")
        if not os.path.exists(all_tabs_file):
            print("No tab data available. Please categorize tabs first.")
            return
        tabs = load_tabs_from_markdown(all_tabs_file)
        unique_categories = set()
        for tab in tabs:
            unique_categories.add(tab.get("main_category", "Other"))
        self.category_filter.addItems(list(unique_categories))
        print(f"Categories Populated: {unique_categories}")

    def _clear_all(self):
        """Clears the search bar and filters"""
        print("Clearing all fields...")
        self.search_bar.clear()
        self.tag_filter.clear()
        self.category_filter.setCurrentIndex(-1)
        self.tab_list.clear()
        print("All fields cleared.")

    def _clear_category(self):
        """Clears category filter only"""
        print("Clearing Category filter")
        self.category_filter.setCurrentIndex(-1)

    def _search(self):
        """Handles the search functionality."""
        print("Triggering search...")
        self._perform_search()

    def _key_press_event(self, event):
        """
        Handles keyboard event
        """
        if event.key() == Qt.Key_Return:
            print(f"Enter key press detected.")
            self._search()

    def _perform_search(self):
        """
        Performs the search using the filters and displays the results
        """
        self.loading_label.setText("Searching...")
        print("Fetching tabs and applying filters.")
        search_term = self.search_bar.text()
        search_tag = self.tag_filter.text()
        search_category = self.category_filter.currentText()
        tabs = search_tabs(search_term, search_tag, search_category)
        print(f"Tabs found: {len(tabs)}")
        self.tab_list.clear()
        for tab in tabs:
            item = QListWidgetItem()
            item.setText(
                f"{tab.get('title', 'No Title')}\nURL: {tab.get('url', 'No URL')}\nTags: {', '.join(tab.get('tags', []) if tab.get('tags') else [])}, Category: {tab.get('main_category', 'Other')}"
            )
            item.setData(Qt.UserRole, tab)  # Store the tab data
            self.tab_list.addItem(item)
        self.loading_label.setText("")
        print("Search completed and results loaded.")

    def _open_tab(self, item):
        """Opens the given url in the browser"""
        tab_data = item.data(Qt.UserRole)
        if tab_data:
            try:
                webbrowser.open(tab_data["url"])
            except Exception as e:
                print(f"Could not open url: {tab_data['url']} with error: {e}")


def entry_point():
    app = QApplication(sys.argv)
    main_window = MainWindow()
    main_window.show()
    sys.exit(app.exec_())
