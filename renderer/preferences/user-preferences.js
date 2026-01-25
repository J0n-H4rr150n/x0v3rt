/**
 * User Preferences Dialog
 * Extends PreferencesDialog for user-level settings (fonts, editor, etc.)
 */

import PreferencesDialog from './preferences-dialog.js';

class UserPreferencesDialog extends PreferencesDialog {
    constructor() {
        super('user-preferences', 'User Preferences');
        this.preferences = null;
    }

    /**
     * Show dialog and load preferences
     */
    async show() {
        super.show();

        // Load current preferences
        await this.load();

        // Add tabs
        this.addTab('appearance', 'Appearance', () => this.renderAppearanceTab());
        this.addTab('editor', 'Editor', () => this.renderEditorTab());
        this.addTab('workspace', 'Workspace', () => this.renderWorkspaceTab());
        this.addTab('front-matter', 'Front Matter', () => this.renderFrontMatterTab());
    }

    /**
     * Load preferences from backend
     */
    async load() {
        try {
            this.preferences = await window.SettingsIPC.getUserPreferences();
        } catch (error) {
            console.error('Failed to load user preferences:', error);
            alert('Failed to load preferences');
        }
    }

    /**
     * Save preferences to backend
     */
    async save() {
        try {
            // Collect form data
            const formData = this.collectFormData();

            // Merge with current preferences
            const updated = {
                ...this.preferences,
                ...formData
            };

            // Save to backend
            await window.SettingsIPC.saveUserPreferences(updated);

            // Apply font/appearance changes immediately
            this.applyAppearance(updated.appearance);

            this.markClean();
            alert('User preferences saved successfully');
        } catch (error) {
            console.error('Failed to save user preferences:', error);
            alert(`Failed to save preferences: ${error.message}`);
        }
    }

    /**
     * Apply appearance changes to DOM
     */
    applyAppearance(appearance) {
        const root = document.documentElement;

        // Apply font settings
        root.style.setProperty('--user-font-family', appearance.fontFamily);
        root.style.setProperty('--user-font-size', `${appearance.fontSize}px`);
        root.style.setProperty('--user-editor-font', appearance.editorFontFamily);
        root.style.setProperty('--user-editor-font-size', `${appearance.editorFontSize}px`);
        root.style.setProperty('--user-line-height', appearance.lineHeight);

        // Apply theme if needed
        if (appearance.theme !== 'auto') {
            document.body.className = `${appearance.theme}-theme`;
        }
    }

    /**
     * Collect form data from current tab
     */
    collectFormData() {
        const content = this.dialog.querySelector('.preferences-content');
        const formData = {};

        // Appearance tab
        const theme = content.querySelector('#theme-select');
        if (theme) {
            formData.appearance = {
                theme: theme.value,
                fontFamily: content.querySelector('#font-family').value,
                fontSize: parseInt(content.querySelector('#font-size').value),
                editorFontFamily: content.querySelector('#editor-font-family').value,
                editorFontSize: parseInt(content.querySelector('#editor-font-size').value),
                lineHeight: parseFloat(content.querySelector('#line-height').value)
            };
        }

        // Editor tab
        const autoSave = content.querySelector('#auto-save');
        if (autoSave) {
            formData.editor = {
                autoSave: autoSave.checked,
                autoSaveDelay: parseInt(content.querySelector('#auto-save-delay').value),
                tabSize: parseInt(content.querySelector('#tab-size').value),
                indentWithTabs: content.querySelector('#indent-with-tabs').checked,
                wordWrap: content.querySelector('#word-wrap').checked,
                lineNumbers: content.querySelector('#line-numbers').checked,
                minimap: content.querySelector('#minimap').checked
            };
        }

        // Workspace tab
        const restoreWorkspace = content.querySelector('#restore-workspace');
        if (restoreWorkspace) {
            formData.workspace = {
                restoreLastWorkspace: restoreWorkspace.checked,
                autoLoadLastNote: content.querySelector('#auto-load-note').checked
            };
        }

        // Front Matter tab
        const frontMatterRows = content.querySelectorAll('.front-matter-row');
        if (frontMatterRows.length) {
            formData.frontMatter = {
                defaults: {}
            };
            frontMatterRows.forEach((row) => {
                const keyInput = row.querySelector('.front-matter-key');
                const valueInput = row.querySelector('.front-matter-value');
                const key = keyInput?.value?.trim();
                if (!key) return;
                const rawValue = valueInput?.value ?? '';
                if (key === 'tags') {
                    formData.frontMatter.defaults[key] = rawValue
                        .split(',')
                        .map((item) => item.trim())
                        .filter(Boolean);
                } else {
                    formData.frontMatter.defaults[key] = rawValue;
                }
            });
        }

        return formData;
    }

    /**
     * Render Appearance tab
     */
    renderAppearanceTab() {
        const container = document.createElement('div');
        container.className = 'pref-tab-content';

        const appearance = this.preferences.appearance;

        container.innerHTML = `
            <div class="pref-section">
                <h3>Theme</h3>
                <div class="pref-field">
                    <label for="theme-select">Color Theme</label>
                    <select id="theme-select">
                        <option value="dark" ${appearance.theme === 'dark' ? 'selected' : ''}>Dark</option>
                        <option value="light" ${appearance.theme === 'light' ? 'selected' : ''}>Light</option>
                        <option value="auto" ${appearance.theme === 'auto' ? 'selected' : ''}>Auto (System)</option>
                    </select>
                    <span class="field-description">Color theme for the application</span>
                </div>
            </div>

            <div class="pref-section">
                <h3>Fonts</h3>
                <div class="pref-field">
                    <label for="font-family">Font Family</label>
                    <input
                        type="text"
                        id="font-family"
                        value="${appearance.fontFamily}"
                        placeholder="Inter, system-ui, sans-serif"
                    >
                    <span class="field-description">Font for general UI text</span>
                </div>

                <div class="pref-field">
                    <label for="font-size">Font Size: <span id="font-size-value">${appearance.fontSize}px</span></label>
                    <input
                        type="range"
                        id="font-size"
                        min="10"
                        max="24"
                        step="1"
                        value="${appearance.fontSize}"
                    >
                    <span class="field-description">Base font size for UI (10-24px)</span>
                </div>

                <div class="pref-field">
                    <label for="editor-font-family">Editor Font Family</label>
                    <input
                        type="text"
                        id="editor-font-family"
                        value="${appearance.editorFontFamily}"
                        placeholder="JetBrains Mono, Consolas, monospace"
                    >
                    <span class="field-description">Monospace font for editor and code</span>
                </div>

                <div class="pref-field">
                    <label for="editor-font-size">Editor Font Size: <span id="editor-font-size-value">${appearance.editorFontSize}px</span></label>
                    <input
                        type="range"
                        id="editor-font-size"
                        min="10"
                        max="24"
                        step="1"
                        value="${appearance.editorFontSize}"
                    >
                    <span class="field-description">Font size for editor (10-24px)</span>
                </div>

                <div class="pref-field">
                    <label for="line-height">Line Height: <span id="line-height-value">${appearance.lineHeight}</span></label>
                    <input
                        type="range"
                        id="line-height"
                        min="1.0"
                        max="2.0"
                        step="0.1"
                        value="${appearance.lineHeight}"
                    >
                    <span class="field-description">Spacing between lines (1.0-2.0)</span>
                </div>
            </div>

            <div class="pref-section">
                <h3>Preview</h3>
                <div class="preview-box">
                    <div class="preview-text" id="font-preview">
                        The quick brown fox jumps over the lazy dog.<br>
                        <code style="font-family: var(--user-editor-font); font-size: var(--user-editor-font-size);">
                            const hello = "world";
                        </code>
                    </div>
                </div>
            </div>
        `;

        // Live preview updates
        const updatePreview = () => {
            const root = document.documentElement;
            root.style.setProperty('--user-font-family', container.querySelector('#font-family').value);
            root.style.setProperty('--user-font-size', `${container.querySelector('#font-size').value}px`);
            root.style.setProperty('--user-editor-font', container.querySelector('#editor-font-family').value);
            root.style.setProperty('--user-editor-font-size', `${container.querySelector('#editor-font-size').value}px`);
            root.style.setProperty('--user-line-height', container.querySelector('#line-height').value);

            this.markDirty();
        };

        // Font size slider display update
        container.querySelector('#font-size').addEventListener('input', (e) => {
            container.querySelector('#font-size-value').textContent = e.target.value + 'px';
            updatePreview();
        });

        container.querySelector('#editor-font-size').addEventListener('input', (e) => {
            container.querySelector('#editor-font-size-value').textContent = e.target.value + 'px';
            updatePreview();
        });

        container.querySelector('#line-height').addEventListener('input', (e) => {
            container.querySelector('#line-height-value').textContent = e.target.value;
            updatePreview();
        });

        container.querySelectorAll('input[type="text"]').forEach(input => {
            input.addEventListener('input', updatePreview);
        });

        container.querySelector('#theme-select').addEventListener('change', () => this.markDirty());

        return container;
    }

    /**
     * Render Editor tab
     */
    renderEditorTab() {
        const container = document.createElement('div');
        container.className = 'pref-tab-content';

        const editor = this.preferences.editor;

        container.innerHTML = `
            <div class="pref-section">
                <h3>Auto-Save</h3>
                <div class="pref-field">
                    <label>
                        <input
                            type="checkbox"
                            id="auto-save"
                            ${editor.autoSave ? 'checked' : ''}
                        >
                        Enable auto-save
                    </label>
                    <span class="field-description">Automatically save changes</span>
                </div>
                <div class="pref-field">
                    <label for="auto-save-delay">Auto-save delay (ms)</label>
                    <input
                        type="number"
                        id="auto-save-delay"
                        value="${editor.autoSaveDelay}"
                        min="100"
                        max="5000"
                        step="100"
                    >
                    <span class="field-description">Delay before auto-saving (milliseconds)</span>
                </div>
            </div>

            <div class="pref-section">
                <h3>Formatting</h3>
                <div class="pref-field">
                    <label for="tab-size">Tab Size</label>
                    <input
                        type="number"
                        id="tab-size"
                        value="${editor.tabSize}"
                        min="1"
                        max="8"
                    >
                    <span class="field-description">Number of spaces per tab</span>
                </div>
                <div class="pref-field">
                    <label>
                        <input
                            type="checkbox"
                            id="indent-with-tabs"
                            ${editor.indentWithTabs ? 'checked' : ''}
                        >
                        Indent with tabs (instead of spaces)
                    </label>
                </div>
            </div>

            <div class="pref-section">
                <h3>Display</h3>
                <div class="pref-field">
                    <label>
                        <input
                            type="checkbox"
                            id="word-wrap"
                            ${editor.wordWrap ? 'checked' : ''}
                        >
                        Enable word wrap
                    </label>
                </div>
                <div class="pref-field">
                    <label>
                        <input
                            type="checkbox"
                            id="line-numbers"
                            ${editor.lineNumbers ? 'checked' : ''}
                        >
                        Show line numbers
                    </label>
                </div>
                <div class="pref-field">
                    <label>
                        <input
                            type="checkbox"
                            id="minimap"
                            ${editor.minimap ? 'checked' : ''}
                        >
                        Show minimap
                    </label>
                </div>
            </div>
        `;

        // Mark dirty on any change
        container.querySelectorAll('input').forEach(input => {
            input.addEventListener('change', () => this.markDirty());
            input.addEventListener('input', () => this.markDirty());
        });

        return container;
    }

    /**
     * Render Workspace tab
     */
    renderWorkspaceTab() {
        const container = document.createElement('div');
        container.className = 'pref-tab-content';

        const workspace = this.preferences.workspace;

        container.innerHTML = `
            <div class="pref-section">
                <h3>Session</h3>
                <div class="pref-field">
                    <label>
                        <input
                            type="checkbox"
                            id="restore-workspace"
                            ${workspace.restoreLastWorkspace ? 'checked' : ''}
                        >
                        Restore last workspace on startup
                    </label>
                    <span class="field-description">Automatically reopen your last workspace</span>
                </div>
                <div class="pref-field">
                    <label>
                        <input
                            type="checkbox"
                            id="auto-load-note"
                            ${workspace.autoLoadLastNote ? 'checked' : ''}
                        >
                        Auto-load last opened note
                    </label>
                    <span class="field-description">Automatically open the note you were editing</span>
                </div>
            </div>
        `;

        // Mark dirty on any change
        container.querySelectorAll('input').forEach(input => {
            input.addEventListener('change', () => this.markDirty());
        });

        return container;
    }

    /**
     * Render Front Matter tab
     */
    renderFrontMatterTab() {
        const container = document.createElement('div');
        container.className = 'pref-tab-content';

        const frontMatter = this.preferences.frontMatter || { defaults: {} };
        const defaults = frontMatter.defaults || {};

        container.innerHTML = `
            <div class="pref-section">
                <h3>User Defaults</h3>
                <div id="front-matter-list"></div>
                <button id="front-matter-add" class="btn-secondary">Add Field</button>
                <span class="field-description">These keys are added to new markdown files alongside system defaults.</span>
            </div>
        `;

        const list = container.querySelector('#front-matter-list');
        const addBtn = container.querySelector('#front-matter-add');

        const renderRow = (key = '', value = '') => {
            const row = document.createElement('div');
            row.className = 'front-matter-row';
            const displayValue = Array.isArray(value) ? value.join(', ') : value;
            row.innerHTML = `
                <input class="front-matter-key" type="text" placeholder="key" value="${key}">
                <input class="front-matter-value" type="text" placeholder="value" value="${displayValue}">
                <button class="front-matter-remove" type="button">×</button>
            `;
            row.querySelector('.front-matter-remove').addEventListener('click', () => {
                row.remove();
                this.markDirty();
            });
            row.querySelectorAll('input').forEach((input) => {
                input.addEventListener('input', () => this.markDirty());
            });
            list.appendChild(row);
        };

        Object.entries(defaults).forEach(([key, value]) => renderRow(key, value));

        addBtn.addEventListener('click', () => {
            renderRow();
            this.markDirty();
        });

        return container;
    }
}

// Export and expose globally
window.UserPreferencesDialog = UserPreferencesDialog;
export default UserPreferencesDialog;
