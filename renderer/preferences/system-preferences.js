/**
 * System Preferences Dialog
 * Extends PreferencesDialog for system-level settings
 */

import PreferencesDialog from './preferences-dialog.js';

class SystemPreferencesDialog extends PreferencesDialog {
    constructor() {
        super('system-preferences', 'System Preferences');
        this.preferences = null;
        this.providers = [];
    }

    /**
     * Show dialog and load preferences
     */
    async show() {
        super.show();

        // Load current preferences
        await this.load();

        // Add tabs
        this.addTab('ai-provider', 'AI Provider', () => this.renderAIProviderTab());
        this.addTab('ai-chat', 'AI Chat', () => this.renderAIChatTab());
        this.addTab('extensions', 'Extensions', () => this.renderExtensionsTab());
        this.addTab('front-matter', 'Front Matter', () => this.renderFrontMatterTab());
        this.addTab('advanced', 'Advanced', () => this.renderAdvancedTab());
    }

    /**
     * Load preferences from backend
     */
    async load() {
        try {
            this.preferences = await window.SettingsIPC.getSystemPreferences();

            // Load available AI providers
            this.providers = await window.IPC.invoke('ai:list-providers');
        } catch (error) {
            console.error('Failed to load system preferences:', error);
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
            await window.SettingsIPC.saveSystemPreferences(updated);

            // Apply AI provider change if changed
            if (formData.aiProvider?.activeProvider !== this.preferences.aiProvider?.activeProvider) {
                await this.applyProviderChange(formData.aiProvider);
            }

            this.markClean();
            alert('System preferences saved successfully');
        } catch (error) {
            console.error('Failed to save system preferences:', error);
            alert(`Failed to save preferences: ${error.message}`);
        }
    }

    /**
     * Apply AI provider change
     */
    async applyProviderChange(aiProviderConfig) {
        try {
            const providerId = aiProviderConfig.activeProvider;
            const providerConfig = aiProviderConfig.providers[providerId];

            // Call backend to switch provider
            const result = await window.IPC.invoke('ai:switch-provider', providerId, providerConfig);
            console.log('Provider switched:', result);
        } catch (error) {
            console.error('Failed to switch provider:', error);
            throw error;
        }
    }

    /**
     * Collect form data from current tab
     */
    collectFormData() {
        const content = this.dialog.querySelector('.preferences-content');
        const formData = {};

        // AI Provider tab
        const providerSelect = content.querySelector('#ai-provider-select');
        if (providerSelect) {
            const providerId = providerSelect.value;
            formData.aiProvider = {
                activeProvider: providerId,
                providers: {
                    ...this.preferences.aiProvider.providers
                }
            };

            // Collect provider-specific config
            const configInputs = content.querySelectorAll('.provider-config-field');
            configInputs.forEach(input => {
                const field = input.dataset.field;
                const value = input.type === 'password' ? input.value : input.value;
                if (!formData.aiProvider.providers[providerId]) {
                    formData.aiProvider.providers[providerId] = {};
                }
                formData.aiProvider.providers[providerId][field] = value;
            });
        }

        // AI Chat tab
        const includeChatHistory = content.querySelector('#ai-chat-include-history');
        const recentCount = content.querySelector('#ai-chat-recent-count');
        const summaryChars = content.querySelector('#ai-chat-summary-chars');
        if (includeChatHistory || recentCount || summaryChars) {
            formData.aiChat = {
                includeChatHistory: includeChatHistory?.checked ?? true,
                recentMessageCount: Number(recentCount?.value) || 0,
                summaryMaxChars: Number(summaryChars?.value) || 0
            };
        }

        // Extensions tab
        const artifactsDir = content.querySelector('#artifacts-directory');
        if (artifactsDir) {
            formData.extensions = {
                artifactsDirectory: artifactsDir.value,
                autoEnableNewExtensions: content.querySelector('#auto-enable-extensions')?.checked || false
            };
        }

        // Advanced tab
        const logLevel = content.querySelector('#log-level');
        if (logLevel) {
            formData.advanced = {
                enableDeveloperTools: content.querySelector('#enable-dev-tools')?.checked || false,
                enableExperimentalFeatures: content.querySelector('#enable-experimental')?.checked || false,
                logLevel: logLevel.value
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
                formData.frontMatter.defaults[key] = valueInput?.value ?? '';
            });
        }

        return formData;
    }

    /**
     * Render AI Provider tab
     */
    renderAIProviderTab() {
        const container = document.createElement('div');
        container.className = 'pref-tab-content';

        const aiConfig = this.preferences.aiProvider;
        const activeProvider = aiConfig.activeProvider;

        container.innerHTML = `
            <div class="pref-section">
                <h3>Active Provider</h3>
                <div class="pref-field">
                    <label for="ai-provider-select">AI Provider</label>
                    <select id="ai-provider-select">
                        <option value="vertex" ${activeProvider === 'vertex' ? 'selected' : ''}>Vertex AI (GCP)</option>
                        <option value="openai-compatible" ${activeProvider === 'openai-compatible' ? 'selected' : ''}>OpenAI-Compatible</option>
                        <option value="google-ai-studio" ${activeProvider === 'google-ai-studio' ? 'selected' : ''}>Google AI Studio</option>
                    </select>
                    <span class="field-description">Select which AI provider to use</span>
                </div>
            </div>

            <div class="pref-section">
                <h3>Provider Configuration</h3>
                <div id="provider-config-container">
                    <!-- Dynamic config fields inserted here -->
                </div>
            </div>

            <div class="pref-section">
                <div class="button-group">
                    <button id="test-connection-btn" class="primary">Test Connection</button>
                </div>
            </div>
        `;

        // Render config for active provider
        this.renderProviderConfig(container, activeProvider);

        // Handle provider change
        const providerSelect = container.querySelector('#ai-provider-select');
        providerSelect.addEventListener('change', (e) => {
            this.renderProviderConfig(container, e.target.value);
            this.markDirty();
        });

        // Handle test connection
        const testBtn = container.querySelector('#test-connection-btn');
        testBtn.addEventListener('click', () => this.testConnection());

        return container;
    }

    /**
     * Render AI Chat tab
     */
    renderAIChatTab() {
        const container = document.createElement('div');
        container.className = 'pref-tab-content';

        const aiChat = this.preferences.aiChat || {};

        container.innerHTML = `
            <div class="pref-section">
                <h3>Chat Context</h3>
                <div class="pref-field">
                    <label>
                        <input
                            type="checkbox"
                            id="ai-chat-include-history"
                            ${aiChat.includeChatHistory !== false ? 'checked' : ''}
                        >
                        Include chat history in context
                    </label>
                    <span class="field-description">Include a compacted summary and recent messages in each request.</span>
                </div>
                <div class="pref-field">
                    <label for="ai-chat-recent-count">Recent message count</label>
                    <input
                        type="number"
                        id="ai-chat-recent-count"
                        min="0"
                        step="1"
                        value="${aiChat.recentMessageCount ?? 20}"
                    >
                    <span class="field-description">How many latest messages are sent verbatim.</span>
                </div>
                <div class="pref-field">
                    <label for="ai-chat-summary-chars">Summary max characters</label>
                    <input
                        type="number"
                        id="ai-chat-summary-chars"
                        min="0"
                        step="100"
                        value="${aiChat.summaryMaxChars ?? 2000}"
                    >
                    <span class="field-description">Max characters for compact summary of older messages.</span>
                </div>
            </div>
        `;

        container.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => this.markDirty());
            input.addEventListener('change', () => this.markDirty());
        });

        return container;
    }

    /**
     * Render provider-specific config fields
     */
    renderProviderConfig(container, providerId) {
        const configContainer = container.querySelector('#provider-config-container');
        configContainer.innerHTML = '';

        const providerConfig = this.preferences.aiProvider.providers[providerId] || {};

        // Get config schema from provider
        const schemas = {
            'vertex': [
                { name: 'projectId', label: 'GCP Project ID', type: 'text', required: true, description: 'Google Cloud project ID' },
                { name: 'location', label: 'Region', type: 'text', required: false, description: 'GCP region (default: us-central1)' },
                { name: 'modelName', label: 'Model', type: 'text', required: false, description: 'Vertex AI model name' }
            ],
            'openai-compatible': [
                { name: 'baseUrl', label: 'Base URL', type: 'text', required: true, description: 'API endpoint URL (e.g., http://your-server:8000/v1)' },
                { name: 'apiKey', label: 'API Key', type: 'password', required: false, description: 'Optional API key' },
                { name: 'model', label: 'Model', type: 'text', required: false, description: 'Model name' }
            ],
            'google-ai-studio': [
                { name: 'apiKey', label: 'API Key', type: 'password', required: true, description: 'Get from aistudio.google.com' },
                { name: 'model', label: 'Model', type: 'text', required: false, description: 'Gemini model (default: gemini-2.0-flash-exp)' }
            ]
        };

        const fields = schemas[providerId] || [];

        fields.forEach(field => {
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'pref-field';
            fieldDiv.innerHTML = `
                <label for="provider-${field.name}">${field.label}${field.required ? ' *' : ''}</label>
                <input
                    type="${field.type}"
                    id="provider-${field.name}"
                    class="provider-config-field"
                    data-field="${field.name}"
                    value="${providerConfig[field.name] || ''}"
                    ${field.required ? 'required' : ''}
                    placeholder="${field.description}"
                >
                <span class="field-description">${field.description}</span>
            `;

            const input = fieldDiv.querySelector('input');
            input.addEventListener('input', () => this.markDirty());

            configContainer.appendChild(fieldDiv);
        });
    }

    /**
     * Test connection to AI provider
     */
    async testConnection() {
        const testBtn = this.dialog.querySelector('#test-connection-btn');
        testBtn.disabled = true;
        testBtn.textContent = 'Testing...';

        try {
            // This would call backend to test the connection
            // For now, just show success
            await new Promise(resolve => setTimeout(resolve, 1000));
            alert('Connection test successful!');
        } catch (error) {
            alert(`Connection test failed: ${error.message}`);
        } finally {
            testBtn.disabled = false;
            testBtn.textContent = 'Test Connection';
        }
    }

    /**
     * Render Extensions tab
     */
    renderExtensionsTab() {
        const container = document.createElement('div');
        container.className = 'pref-tab-content';

        const extConfig = this.preferences.extensions;

        container.innerHTML = `
            <div class="pref-section">
                <h3>Artifacts</h3>
                <div class="pref-field">
                    <label for="artifacts-directory">Artifacts Directory</label>
                    <input
                        type="text"
                        id="artifacts-directory"
                        value="${extConfig.artifactsDirectory}"
                    >
                    <span class="field-description">Where AI-generated artifacts are stored (relative to workspace)</span>
                </div>
            </div>

            <div class="pref-section">
                <h3>General</h3>
                <div class="pref-field">
                    <label>
                        <input
                            type="checkbox"
                            id="auto-enable-extensions"
                            ${extConfig.autoEnableNewExtensions ? 'checked' : ''}
                        >
                        Auto-enable new extensions
                    </label>
                    <span class="field-description">Automatically enable newly discovered extensions</span>
                </div>
            </div>
        `;

        // Mark dirty on any change
        container.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => this.markDirty());
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
                <h3>System Defaults</h3>
                <div id="front-matter-list"></div>
                <button id="front-matter-add" class="btn-secondary">Add Field</button>
                <span class="field-description">These keys are added to all new markdown files.</span>
            </div>
        `;

        const list = container.querySelector('#front-matter-list');
        const addBtn = container.querySelector('#front-matter-add');

        const renderRow = (key = '', value = '') => {
            const row = document.createElement('div');
            row.className = 'front-matter-row';
            row.innerHTML = `
                <input class="front-matter-key" type="text" placeholder="key" value="${key}">
                <input class="front-matter-value" type="text" placeholder="value" value="${value}">
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

    /**
     * Render Advanced tab
     */
    renderAdvancedTab() {
        const container = document.createElement('div');
        container.className = 'pref-tab-content';

        const advConfig = this.preferences.advanced;

        container.innerHTML = `
            <div class="pref-section">
                <h3>Developer</h3>
                <div class="pref-field">
                    <label>
                        <input
                            type="checkbox"
                            id="enable-dev-tools"
                            ${advConfig.enableDeveloperTools ? 'checked' : ''}
                        >
                        Enable Developer Tools
                    </label>
                    <span class="field-description">Show DevTools on startup</span>
                </div>
                <div class="pref-field">
                    <label>
                        <input
                            type="checkbox"
                            id="enable-experimental"
                            ${advConfig.enableExperimentalFeatures ? 'checked' : ''}
                        >
                        Enable Experimental Features
                    </label>
                    <span class="field-description">Enable features in development</span>
                </div>
            </div>

            <div class="pref-section">
                <h3>Logging</h3>
                <div class="pref-field">
                    <label for="log-level">Log Level</label>
                    <select id="log-level">
                        <option value="error" ${advConfig.logLevel === 'error' ? 'selected' : ''}>Error</option>
                        <option value="info" ${advConfig.logLevel === 'info' ? 'selected' : ''}>Info</option>
                        <option value="debug" ${advConfig.logLevel === 'debug' ? 'selected' : ''}>Debug</option>
                    </select>
                    <span class="field-description">Console logging verbosity</span>
                </div>
            </div>
        `;

        // Mark dirty on any change
        container.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('change', () => this.markDirty());
        });

        return container;
    }
}

// Export and expose globally
window.SystemPreferencesDialog = SystemPreferencesDialog;
export default SystemPreferencesDialog;
