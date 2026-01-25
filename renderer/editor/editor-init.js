/**
 * Editor Initialization
 *
 * Basic textarea editor for MVP
 * TODO: Replace with CodeMirror 6 in next phase
 */

const Editor = {
    editorElement: null,
    currentFile: null,
    isDirty: false,
    autoSaveTimer: null,

    /**
     * Initialize editor
     */
    init() {
        const editorContainer = document.getElementById('editor');

        // Create textarea for MVP
        const textarea = document.createElement('textarea');
        textarea.id = 'editor-textarea';
        textarea.style.cssText = `
      width: 100%;
      height: 100%;
      padding: 24px;
      background-color: #0a0a0a;
      color: #e0e0e0;
      border: none;
      outline: none;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 14px;
      line-height: 1.8;
      resize: none;
    `;
        textarea.placeholder = 'Open a note or create a new one...';

        editorContainer.appendChild(textarea);
        this.editorElement = textarea;

        // Listen for changes
        textarea.addEventListener('input', () => {
            this.isDirty = true;
            this.updateSaveButton();

            // Update context builder
            window.ContextBuilder.updateContent(textarea.value);

            // Auto-save after 1 second of inactivity
            this.scheduleAutoSave();
        });

        // Save with Ctrl+S
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.saveFile();
            }
        });

        // Set up save button
        const saveBtn = document.getElementById('save-btn');
        saveBtn.addEventListener('click', () => this.saveFile());

        console.log('Editor initialized (basic mode)');
    },

    /**
     * Schedule auto-save after 1 second of inactivity
     */
    scheduleAutoSave() {
        // Clear existing timer
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }

        // Set new timer for 1 second
        this.autoSaveTimer = setTimeout(() => {
            if (this.isDirty && this.currentFile) {
                this.autoSave();
            }
        }, 1000);
    },

    /**
     * Auto-save the current file
     */
    async autoSave() {
        if (!this.currentFile || !this.isDirty) return;

        try {
            this.showSaveStatus('Saving...');
            await window.IPC.writeFile(this.currentFile, this.editorElement.value);
            this.isDirty = false;
            this.updateSaveButton();
            this.showSaveStatus('Saved', 2000);
            console.log('Auto-saved:', this.currentFile);
        } catch (error) {
            console.error('Auto-save error:', error);
            this.showSaveStatus('Error', 2000);
        }
    },

    /**
     * Show save status indicator
     */
    showSaveStatus(message, hideAfter = 0) {
        const saveBtn = document.getElementById('save-btn');
        const originalText = saveBtn.textContent;

        saveBtn.textContent = message;
        saveBtn.style.opacity = '0.7';

        if (hideAfter > 0) {
            setTimeout(() => {
                saveBtn.textContent = this.isDirty ? 'Save *' : 'Save';
                saveBtn.style.opacity = '1';
            }, hideAfter);
        } else {
            saveBtn.style.opacity = '1';
        }
    },

    /**
     * Load content into editor
     * @param {string} filename - File to load
     * @param {string} content - File content
     */
    loadFile(filename, content) {
        this.currentFile = filename;
        this.editorElement.value = content;
        this.isDirty = false;
        this.updateSaveButton();

        // Update UI
        document.getElementById('current-file').textContent = filename;

        // Update context
        window.ContextBuilder.updateContent(content);
    },

    /**
     * Save current file
     */
    async saveFile() {
        if (!this.isDirty) return;

        if (!this.currentFile) {
            const filename = await window.Dialog.showInput(
                'Save Note As',
                'Note name (without .md extension)'
            );
            if (!filename) return;

            try {
                const listResult = await window.IPC.listFiles();
                const hasFolder = Array.isArray(listResult) ? false : Boolean(listResult?.notesDir);
                if (!hasFolder) {
                    const folderResult = await window.IPC.chooseFolder();
                    if (folderResult?.canceled) return;
                }

                const createResult = await window.IPC.createFile(filename);
                const actualFilename = createResult?.filename || filename;
                const writeResult = await window.IPC.writeFile(actualFilename, this.editorElement.value);
                const finalContent = writeResult?.content ?? this.editorElement.value;
                this.loadFile(actualFilename, finalContent);

                window.NotesUI?.refresh?.();
            } catch (error) {
                console.error('Save error:', error);
                alert('Failed to save file: ' + error.message);
            }
            return;
        }

        try {
            const result = await window.IPC.writeFile(this.currentFile, this.editorElement.value);
            if (result?.content && result.content !== this.editorElement.value) {
                this.editorElement.value = result.content;
                window.ContextBuilder?.updateContent(result.content);
            }
            this.isDirty = false;
            this.updateSaveButton();
            console.log('File saved:', this.currentFile);
        } catch (error) {
            console.error('Save error:', error);
            alert('Failed to save file: ' + error.message);
        }
    },

    /**
     * Update save button state
     */
    updateSaveButton() {
        const saveBtn = document.getElementById('save-btn');
        saveBtn.disabled = !this.isDirty;
        saveBtn.textContent = this.isDirty ? 'Save *' : 'Save';
    },

    /**
     * Create new file
     * @param {string} filename - New file name
     */
    async createNewFile(filename) {
        try {
            await window.IPC.createFile(filename);
            this.loadFile(filename, '');
            console.log('Created new file:', filename);
        } catch (error) {
            console.error('Create file error:', error);
            alert('Failed to create file: ' + error.message);
        }
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    Editor.init();
});

// Export globally
window.Editor = Editor;
