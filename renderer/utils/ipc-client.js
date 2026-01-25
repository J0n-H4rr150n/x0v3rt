/**
 * IPC Client Utility
 *
 * Type-safe wrapper around window.electronAPI
 * Provides error handling and convenience methods
 */

const IPC = {
    /**
     * Invoke an IPC handler
     * @param {string} channel - IPC channel name
     * @param  {...any} args - Arguments
     * @returns {Promise<any>}
     */
    async invoke(channel, ...args) {
        if (!window.electronAPI) {
            console.warn(`[Mock IPC] invoke: ${channel}`, args);
            // Return defaults for common calls to prevent crashes
            if (channel === 'file:list') return [];
            if (channel === 'chat:list') return [];
            if (channel === 'extensions:get-config') return { enabled: [] };
            if (channel === 'settings:get-user') return {
                appearance: {
                    fontFamily: 'inherit',
                    fontSize: 13,
                    editorFontFamily: 'monospace',
                    editorFontSize: 14,
                    lineHeight: 1.5,
                    theme: 'auto'
                }
            };
            if (channel === 'file:get-workspace-path') return '';
            return null;
        }
        try {
            return await window.electronAPI.invoke(channel, ...args);
        } catch (error) {
            console.error(`IPC invoke error [${channel}]:`, error);
            throw error;
        }
    },

    /**
     * Send a one-way message
     * @param {string} channel - IPC channel name
     * @param  {...any} args - Arguments
     */
    send(channel, ...args) {
        if (!window.electronAPI) {
            console.warn(`[Mock IPC] send: ${channel}`, args);
            return;
        }
        try {
            window.electronAPI.send(channel, ...args);
        } catch (error) {
            console.error(`IPC send error [${channel}]:`, error);
        }
    },

    /**
     * Listen for messages from main process
     * @param {string} channel - IPC channel name
     * @param {Function} callback - Callback function
     * @returns {Function} Cleanup function
     */
    on(channel, callback) {
        if (!window.electronAPI) {
            console.warn(`[Mock IPC] on: ${channel}`);
            return () => { };
        }
        try {
            return window.electronAPI.on(channel, callback);
        } catch (error) {
            console.error(`IPC on error [${channel}]:`, error);
            return () => { }; // No-op cleanup
        }
    },

    // Convenience methods for specific operations

    async ping() {
        return this.invoke('ping');
    },

    async getAppVersion() {
        return this.invoke('get-app-version');
    },

    async readFile(filename, options = {}) {
        const result = await this.invoke('file:read', filename, options);
        if (result && typeof result === 'object' && result.missing) {
            return null;
        }
        return result;
    },

    async readFileBinary(filename, options = {}) {
        return this.invoke('file:read-binary', filename, options);
    },

    async writeFile(filename, content) {
        return this.invoke('file:write', filename, content);
    },

    async listFiles(options = {}) {
        return this.invoke('file:list', options);
    },

    async chooseFolder() {
        return this.invoke('file:choose-folder');
    },

    async createFile(filename) {
        return this.invoke('file:create', filename);
    },

    async createFolder(folderName) {
        return this.invoke('file:create-folder', folderName);
    },

    async deleteFile(filename) {
        return this.invoke('file:delete', filename);
    },

    async undoFile(filename) {
        return this.invoke('file:undo', filename);
    },

    async importFile(sourcePath, targetDir) {
        return this.invoke('file:import', sourcePath, targetDir);
    },

    async moveFile(sourcePath, targetPath) {
        return this.invoke('file:move', sourcePath, targetPath);
    },

    async getWorkspaceName() {
        return this.invoke('file:get-workspace-name');
    },

    async getWorkspacePath() {
        return this.invoke('file:get-workspace-path');
    },

    async openWorkspaceInExplorer() {
        return this.invoke('file:open-workspace');
    },

    async createChatSession() {
        return this.invoke('chat:new');
    },

    async appendChatMessage(sessionId, message) {
        return this.invoke('chat:append', sessionId, message);
    },

    async getChatSession(sessionId) {
        return this.invoke('chat:get', sessionId);
    },

    async listChatSessions() {
        return this.invoke('chat:list');
    },

    async deleteChatSession(sessionId) {
        return this.invoke('chat:delete', sessionId);
    },

    async updateChatSession(sessionId, updates) {
        return this.invoke('chat:update', sessionId, updates);
    },

    async searchChatHistory(sessionId, query, limit) {
        return this.invoke('chat:search', sessionId, query, limit);
    },

    async readChatHistory(sessionId, options = {}) {
        return this.invoke('chat:read', sessionId, options);
    },

    async sendAIMessage(message, context) {
        return this.invoke('ai:send-message', message, context);
    },

    async listModels() {
        return this.invoke('ai:list-models');
    },

    async createTerminal() {
        return this.invoke('terminal:create');
    },

    async disposeTerminal(terminalId) {
        return this.invoke('terminal:dispose', terminalId);
    },

    sendTerminalInput(terminalId, data) {
        return this.send('terminal:input', terminalId, data);
    },

    resizeTerminal(terminalId, cols, rows) {
        return this.send('terminal:resize', terminalId, cols, rows);
    },

    onTerminalData(callback) {
        return this.on('terminal:data', callback);
    },

    onTerminalExit(callback) {
        return this.on('terminal:exit', callback);
    },

    onTerminalToggle(callback) {
        return this.on('terminal:toggle', callback);
    },

    onNotesFolderChanged(callback) {
        return this.on('notes:folder-changed', callback);
    },

    onNotesIndexUpdated(callback) {
        return this.on('notes:index-updated', callback);
    },

    async setActiveFile(filename) {
        return this.invoke('file:set-active', filename);
    },

    async getActiveFile() {
        return this.invoke('file:get-active');
    },
    async saveClipboardImage(payload) {
        return this.invoke('clipboard:save-image', payload);
    }
};

// Export for use in other modules
window.IPC = IPC;

export default IPC;
