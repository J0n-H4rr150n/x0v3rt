/**
 * Electron Preload Script
 *
 * Exposes a controlled API to the renderer process via contextBridge.
 * This is the ONLY way for the renderer to communicate with the main process.
 */

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Exposed API available as window.electronAPI in renderer
 */
contextBridge.exposeInMainWorld('electronAPI', {
    /**
     * Invoke an IPC handler and wait for response
     * @param {string} channel - IPC channel name
     * @param {any[]} args - Arguments to pass
     * @returns {Promise<any>} Response from main process
     */
    invoke: (channel, ...args) => {
        // Whitelist of allowed channels
        const validChannels = [
            'open-notes-folder',
            'menu:open-system-preferences',
            'menu:open-user-preferences',
            'ping',
            'get-app-version',
            'file:read',
            'file:read-binary',
            'file:write',
            'file:list',
            'file:create',
            'file:create-folder',
            'file:delete',
            'file:undo',
            'file:import',
            'file:move',
            'file:choose-folder',
            'file:get-workspace-name',
            'file:get-workspace-path',
            'file:open-workspace',
            'file:set-active',
            'file:get-active',
            'clipboard:save-image',
            'workspace:load-state',
            'workspace:save-state',
            'search:query',
            'search:reindex',
            'shell:open-external',
            'chat:new',
            'chat:append',
            'chat:get',
            'chat:list',
            'chat:delete',
            'chat:update',
            'chat:search',
            'chat:read',
            'ai:send-message',
            'terminal:create',
            'terminal:dispose',
            'extensions:init',
            'extensions:get-config',
            'extensions:save-config',
            'extensions:toggle',
            'extensions:list-available',
            'extensions:save-artifact',
            'extensions:read-artifact',
            'extensions:list-artifacts',
            // Settings
            'settings:get-system',
            'settings:save-system',
            'settings:get-user',
            'settings:save-user',
            // AI Provider
            'ai:list-providers',
            'ai:get-provider-info',
            'ai:switch-provider',
            'ai:list-models'
        ];

        if (validChannels.includes(channel)) {
            return ipcRenderer.invoke(channel, ...args);
        } else {
            throw new Error(`Invalid IPC channel: ${channel}`);
        }
    },

    /**
     * Send a one-way message to main process
     * @param {string} channel - IPC channel name
     * @param {any[]} args - Arguments to pass
     */
    send: (channel, ...args) => {
        const validChannels = ['log', 'error', 'terminal:input', 'terminal:resize'];

        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, ...args);
        } else {
            throw new Error(`Invalid IPC channel: ${channel}`);
        }
    },

    /**
     * Listen for messages from main process
     * @param {string} channel - IPC channel name
     * @param {Function} callback - Callback function
     * @returns {Function} Cleanup function to remove listener
     */
    on: (channel, callback) => {
        const validChannels = [
            'ai:message-chunk',
            'file:changed',
            'notes:folder-changed',
            'notes:index-updated',
            'terminal:data',
            'terminal:exit',
            'terminal:toggle',
            'menu:open-system-preferences',
            'menu:open-user-preferences'
        ];

        if (validChannels.includes(channel)) {
            const subscription = (_event, ...args) => callback(...args);
            ipcRenderer.on(channel, subscription);

            // Return cleanup function
            return () => {
                ipcRenderer.removeListener(channel, subscription);
            };
        } else {
            throw new Error(`Invalid IPC channel: ${channel}`);
        }
    }
});
