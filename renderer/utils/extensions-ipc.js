/**
 * Extensions IPC Client
 *
 * Frontend wrapper for extensions IPC calls
 */

import IPC from './ipc-client.js';

const ExtensionsIPC = {
    /**
     * Initialize extensions for current workspace
     */
    async init() {
        return await IPC.invoke('extensions:init');
    },

    /**
     * Get extensions configuration
     */
    async getConfig() {
        return await IPC.invoke('extensions:get-config');
    },

    /**
     * Save extensions configuration
     */
    async saveConfig(config) {
        return await IPC.invoke('extensions:save-config', config);
    },

    /**
     * Toggle extension enabled state
     */
    async toggleExtension(extensionId, enabled) {
        return await IPC.invoke('extensions:toggle', extensionId, enabled);
    },

    /**
     * Get list of available extensions
     */
    async listAvailable() {
        return await IPC.invoke('extensions:list-available');
    },

    /**
     * Save artifact to .x0v3rt/artifacts
     */
    async saveArtifact(filename, content) {
        return await IPC.invoke('extensions:save-artifact', filename, content);
    },

    /**
     * Read artifact from .x0v3rt/artifacts
     */
    async readArtifact(filename) {
        return await IPC.invoke('extensions:read-artifact', filename);
    },

    /**
     * List all artifacts
     */
    async listArtifacts() {
        return await IPC.invoke('extensions:list-artifacts');
    }
};

window.ExtensionsIPC = ExtensionsIPC;

export default ExtensionsIPC;
