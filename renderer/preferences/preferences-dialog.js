/**
 * Preferences Dialog - Base Component
 * Handles common dialog behavior for both System and User preferences
 */

class PreferencesDialog {
    constructor(dialogId, title) {
        this.dialogId = dialogId;
        this.title = title;
        this.dialog = null;
        this.currentTab = null;
        this.isDirty = false;
    }

    /**
     * Create and show dialog
     */
    show() {
        // Create dialog HTML
        this.dialog = document.createElement('div');
        this.dialog.className = 'preferences-dialog-overlay';
        this.dialog.innerHTML = `
            <div class="preferences-dialog">
                <div class="preferences-header">
                    <h2>${this.title}</h2>
                    <button class="close-btn" title="Close">×</button>
                </div>
                <div class="preferences-body">
                    <div class="preferences-sidebar">
                        <!-- Tabs inserted here -->
                    </div>
                    <div class="preferences-content">
                        <!-- Content inserted here -->
                    </div>
                </div>
                <div class="preferences-footer">
                    <button class="btn-cancel">Cancel</button>
                    <button class="btn-save" disabled>Save</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.dialog);
        this.attachEventListeners();
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Close button
        this.dialog.querySelector('.close-btn').addEventListener('click', () => {
            if (this.confirmClose()) {
                this.close();
            }
        });

        // Cancel button
        this.dialog.querySelector('.btn-cancel').addEventListener('click', () => {
            if (this.confirmClose()) {
                this.close();
            }
        });

        // Save button
        this.dialog.querySelector('.btn-save').addEventListener('click', async () => {
            await this.save();
        });

        // Click outside to close
        this.dialog.addEventListener('click', (e) => {
            if (e.target === this.dialog && this.confirmClose()) {
                this.close();
            }
        });

        // Escape key
        document.addEventListener('keydown', this.handleEscape = (e) => {
            if (e.key === 'Escape' && this.confirmClose()) {
                this.close();
            }
        });
    }

    /**
     * Add a tab
     */
    addTab(id, label, contentGenerator) {
        const sidebar = this.dialog.querySelector('.preferences-sidebar');
        const tabBtn = document.createElement('button');
        tabBtn.className = 'preferences-tab';
        tabBtn.dataset.tab = id;
        tabBtn.textContent = label;

        tabBtn.addEventListener('click', () => {
            this.switchTab(id, contentGenerator);
        });

        sidebar.appendChild(tabBtn);

        // Activate first tab
        if (!this.currentTab) {
            this.switchTab(id, contentGenerator);
        }
    }

    /**
     * Switch active tab
     */
    switchTab(tabId, contentGenerator) {
        // Update tab buttons
        this.dialog.querySelectorAll('.preferences-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        // Update content
        const content = this.dialog.querySelector('.preferences-content');
        content.innerHTML = '';
        content.appendChild(contentGenerator());

        this.currentTab = tabId;
    }

    /**
     * Mark as dirty (unsaved changes)
     */
    markDirty() {
        this.isDirty = true;
        this.dialog.querySelector('.btn-save').disabled = false;
    }

    /**
     * Mark as clean (saved)
     */
    markClean() {
        this.isDirty = false;
        this.dialog.querySelector('.btn-save').disabled = true;
    }

    /**
     * Confirm close if dirty
     */
    confirmClose() {
        if (!this.isDirty) return true;
        return confirm('You have unsaved changes. Discard them?');
    }

    /**
     * Close dialog
     */
    close() {
        document.removeEventListener('keydown', this.handleEscape);
        this.dialog.remove();
        this.dialog = null;
    }

    /**
     * Save preferences (override in subclass)
     */
    async save() {
        throw new Error('save() must be implemented by subclass');
    }

    /**
     * Load preferences (override in subclass)
     */
    async load() {
        throw new Error('load() must be implemented by subclass');
    }
}

window.PreferencesDialog = PreferencesDialog;
export default PreferencesDialog;
