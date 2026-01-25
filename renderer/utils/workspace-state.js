/**
 * Workspace State Manager
 *
 * Manages workspace-specific persistence to .x0v3rt/workspace-state.json
 */

const WorkspaceState = {
    current: null,
    saveTimeout: null,

    /**
     * Load workspace state from backend
     */
    async load() {
        try {
            this.current = await window.IPC.invoke('workspace:load-state');
            return this.current;
        } catch (error) {
            console.error('Failed to load workspace state:', error);
            this.current = this.getDefaults();
            return this.current;
        }
    },

    /**
     * Save workspace state to backend
     */
    async save() {
        if (!this.current) return;

        try {
            await window.IPC.invoke('workspace:save-state', this.current);
        } catch (error) {
            console.error('Failed to save workspace state:', error);
        }
    },

    /**
     * Update workspace state and save (debounced)
     */
    update(updates) {
        if (!this.current) {
            this.current = this.getDefaults();
        }

        // Deep merge updates
        this.current = this.deepMerge(this.current, updates);
        this.saveDebounced();
    },

    /**
     * Debounced save (waits 500ms after last update)
     */
    saveDebounced() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        this.saveTimeout = setTimeout(() => {
            this.save();
        }, 500);
    },

    /**
     * Get a value from state
     */
    get(path) {
        if (!this.current) return null;

        const keys = path.split('.');
        let value = this.current;

        for (const key of keys) {
            if (value === null || value === undefined) return null;
            value = value[key];
        }

        return value;
    },

    /**
     * Deep merge objects
     */
    deepMerge(target, source) {
        const output = { ...target };

        for (const key in source) {
            if (source[key] instanceof Object && key in target) {
                output[key] = this.deepMerge(target[key], source[key]);
            } else {
                output[key] = source[key];
            }
        }

        return output;
    },

    /**
     * Get default state structure
     */
    getDefaults() {
        return {
            lastActiveFile: null,
            layout: {
                leftWidth: 250,
                rightWidth: 350,
                leftCollapsed: false,
                rightCollapsed: false,
                terminalHeight: 240,
                terminalVisible: false
            },
            editor: {
                wrapEnabled: true,
                previewEnabled: true,
                openTabs: [],
                activeTab: null
            },
            expandedFolders: [],
            chat: {
                agent: 'default',
                role: 'user',
                model: 'default'
            }
        };
    }
};

// Export globally
window.WorkspaceState = WorkspaceState;

export default WorkspaceState;
