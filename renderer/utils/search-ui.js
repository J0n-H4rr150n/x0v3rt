/**
 * Search UI
 *
 * Full-text search interface with Ctrl+P shortcut
 */

const SearchUI = {
    input: null,
    resultsContainer: null,
    isOpen: false,
    searchTimeout: null,
    selectedIndex: 0,

    init() {
        this.input = document.getElementById('command-center');
        if (!this.input) {
            console.error('[SearchUI] Command center input not found - skipping initialization');
            return;
        }

        this.createResultsContainer();
        this.attachEventListeners();
        console.log('[SearchUI] Initialized');
    },

    createResultsContainer() {
        if (!this.input) return; // Safety check

        this.resultsContainer = document.createElement('div');
        this.resultsContainer.className = 'search-results';
        this.resultsContainer.style.display = 'none';

        // Insert after the command center input
        const parent = this.input.parentElement;
        parent.style.position = 'relative';
        parent.appendChild(this.resultsContainer);
    },

    attachEventListeners() {
        if (!this.input || !this.resultsContainer) return; // Safety check

        // Ctrl+P to open search
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
                e.preventDefault();
                this.open();
            }

            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }

            // Arrow key navigation
            if (this.isOpen && this.resultsContainer.children.length > 0) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.selectNext();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.selectPrevious();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    this.openSelected();
                }
            }
        });

        // Search on input
        this.input.addEventListener('input', (e) => {
            const query = e.target.value.trim();

            if (this.searchTimeout) {
                clearTimeout(this.searchTimeout);
            }

            if (query.length < 2) {
                this.hideResults();
                return;
            }

            // Debounce search
            this.searchTimeout = setTimeout(async () => {
                await this.performSearch(query);
            }, 150);
        });

        // Close on click outside
        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.input.contains(e.target) && !this.resultsContainer.contains(e.target)) {
                this.close();
            }
        });
    },

    async performSearch(query) {
        try {
            const results = await window.IPC.invoke('search:query', query);
            this.displayResults(results);
        } catch (error) {
            console.error('[SearchUI] Search error:', error);
            this.hideResults();
        }
    },

    displayResults(results) {
        this.resultsContainer.innerHTML = '';
        this.selectedIndex = 0;

        if (!results || results.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'search-no-results';
            noResults.textContent = 'No results found';
            this.resultsContainer.appendChild(noResults);
            this.showResults();
            return;
        }

        results.forEach((result, index) => {
            const item = document.createElement('div');
            item.className = 'search-result';
            if (index === 0) item.classList.add('selected');
            item.dataset.path = result.path;
            item.dataset.index = index;

            const filename = document.createElement('div');
            filename.className = 'search-result-filename';
            filename.textContent = result.filename;

            const path = document.createElement('div');
            path.className = 'search-result-path';
            path.textContent = result.path;

            item.appendChild(filename);
            item.appendChild(path);

            if (result.snippet) {
                const snippet = document.createElement('div');
                snippet.className = 'search-result-snippet';
                snippet.innerHTML = result.snippet;
                item.appendChild(snippet);
            }

            item.addEventListener('click', () => {
                this.openFile(result.path);
            });

            item.addEventListener('mouseenter', () => {
                this.selectResult(index);
            });

            this.resultsContainer.appendChild(item);
        });

        this.showResults();
    },

    selectResult(index) {
        const items = this.resultsContainer.querySelectorAll('.search-result');
        items.forEach((item, i) => {
            item.classList.toggle('selected', i === index);
        });
        this.selectedIndex = index;
    },

    selectNext() {
        const items = this.resultsContainer.querySelectorAll('.search-result');
        if (items.length === 0) return;

        this.selectedIndex = (this.selectedIndex + 1) % items.length;
        this.selectResult(this.selectedIndex);
        items[this.selectedIndex].scrollIntoView({ block: 'nearest' });
    },

    selectPrevious() {
        const items = this.resultsContainer.querySelectorAll('.search-result');
        if (items.length === 0) return;

        this.selectedIndex = (this.selectedIndex - 1 + items.length) % items.length;
        this.selectResult(this.selectedIndex);
        items[this.selectedIndex].scrollIntoView({ block: 'nearest' });
    },

    openSelected() {
        const items = this.resultsContainer.querySelectorAll('.search-result');
        if (items.length === 0) return;

        const selected = items[this.selectedIndex];
        if (selected) {
            const filepath = selected.dataset.path;
            this.openFile(filepath);
        }
    },

    async openFile(filepath) {
        try {
            if (window.NotesUI && typeof window.NotesUI.loadFile === 'function') {
                await window.NotesUI.loadFile(filepath);
            }
            this.close();
        } catch (error) {
            console.error('[SearchUI] Error opening file:', error);
        }
    },

    open() {
        this.input.focus();
        this.input.select();
        this.input.placeholder = 'Search files... (Ctrl+P)';
        this.isOpen = true;

        // Trigger search if there's existing text
        if (this.input.value.trim().length >= 2) {
            this.performSearch(this.input.value.trim());
        }
    },

    close() {
        this.input.blur();
        this.input.placeholder = '';
        this.hideResults();
        this.isOpen = false;
    },

    showResults() {
        this.resultsContainer.style.display = 'block';
    },

    hideResults() {
        this.resultsContainer.style.display = 'none';
        this.resultsContainer.innerHTML = '';
    }
};

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SearchUI.init());
} else {
    SearchUI.init();
}

// Export globally
window.SearchUI = SearchUI;

export default SearchUI;
