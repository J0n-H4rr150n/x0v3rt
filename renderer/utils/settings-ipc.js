/**
 * Settings IPC Client
 * Frontend wrapper for settings-related IPC calls
 */

async function waitForWorkspaceReady(timeoutMs = 8000, pollIntervalMs = 250) {
    const hasWorkspace = async () => {
        try {
            const workspacePath = await window.IPC.getWorkspacePath();
            return Boolean(workspacePath);
        } catch (error) {
            return false;
        }
    };

    if (await hasWorkspace()) return;

    return await new Promise((resolve, reject) => {
        let settled = false;

        const finish = (error) => {
            if (settled) return;
            settled = true;
            clearInterval(pollTimer);
            clearTimeout(timeoutTimer);
            cleanup?.();
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        };

        const cleanup = window.IPC.onNotesFolderChanged(async () => {
            if (await hasWorkspace()) {
                finish();
            }
        });

        const pollTimer = setInterval(async () => {
            if (await hasWorkspace()) {
                finish();
            }
        }, pollIntervalMs);

        const timeoutTimer = setTimeout(() => {
            finish(new Error('Workspace directory not set'));
        }, timeoutMs);
    });
}

async function invokeWithWorkspace(channel, ...args) {
    try {
        return await window.IPC.invoke(channel, ...args);
    } catch (error) {
        if (error?.message?.includes('Workspace directory not set')) {
            await waitForWorkspaceReady();
            return await window.IPC.invoke(channel, ...args);
        }
        throw error;
    }
}

const SettingsIPC = {
    /**
     * Get system preferences
     */
    async getSystemPreferences() {
        return await invokeWithWorkspace('settings:get-system');
    },

    /**
     * Save system preferences
     */
    async saveSystemPreferences(prefs) {
        return await invokeWithWorkspace('settings:save-system', prefs);
    },

    /**
     * Get user preferences
     */
    async getUserPreferences() {
        return await invokeWithWorkspace('settings:get-user');
    },

    /**
     * Save user preferences
     */
    async saveUserPreferences(prefs) {
        return await invokeWithWorkspace('settings:save-user', prefs);
    }
};

// Expose globally
window.SettingsIPC = SettingsIPC;

export default SettingsIPC;
