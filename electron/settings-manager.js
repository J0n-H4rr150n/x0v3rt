/**
 * Settings Manager
 *
 * Manages system and user preferences
 * Persists to workspace .x0v3rt folder (per-workspace settings)
 */

const { ipcMain } = require('electron');
const fs = require('fs').promises;
const path = require('path');

let workspaceDir = null;

// Default settings
const DEFAULT_SYSTEM_PREFERENCES = {
    aiProvider: {
        activeProvider: 'vertex',
        providers: {
            vertex: {
                projectId: process.env.GCP_PROJECT_ID || '',
                location: process.env.GCP_REGION || 'us-central1',
                modelName: process.env.VERTEX_AI_MODEL || 'gemini-2.5-flash'
            },
            'openai-compatible': {
                baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL || '',
                apiKey: process.env.OPENAI_COMPATIBLE_API_KEY || '',
                model: process.env.OPENAI_COMPATIBLE_MODEL || 'default'
            },
            'google-ai-studio': {
                apiKey: process.env.GOOGLE_AI_STUDIO_API_KEY || '',
                model: process.env.GOOGLE_AI_STUDIO_MODEL || 'gemini-2.0-flash-exp'
            }
        }
    },
    extensions: {
        artifactsDirectory: '.x0v3rt/artifacts',
        autoEnableNewExtensions: false
    },
    advanced: {
        enableDeveloperTools: false,
        enableExperimentalFeatures: false,
        logLevel: 'info'
    },
    frontMatter: {
        defaults: {
            document_type: 'note'
        }
    },
    aiChat: {
        includeChatHistory: true,
        recentMessageCount: 20,
        summaryMaxChars: 2000
    }
};

const DEFAULT_USER_PREFERENCES = {
    appearance: {
        theme: 'dark',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 14,
        editorFontFamily: 'JetBrains Mono, Consolas, monospace',
        editorFontSize: 14,
        lineHeight: 1.5
    },
    editor: {
        autoSave: true,
        autoSaveDelay: 1000,
        tabSize: 2,
        indentWithTabs: false,
        wordWrap: true,
        lineNumbers: true,
        minimap: false
    },
    workspace: {
        restoreLastWorkspace: true,
        autoLoadLastNote: true
    },
    frontMatter: {
        defaults: {
            target_org: '',
            target_platform: '',
            target_name: '',
            tags: []
        }
    }
};

/**
 * Set workspace directory
 */
function setWorkspaceDir(dir) {
    workspaceDir = dir;
}

/**
 * Get settings file path
 */
function getSettingsPath(type) {
    if (!workspaceDir) {
        throw new Error('Workspace directory not set');
    }
    return path.join(workspaceDir, '.x0v3rt', `${type}-preferences.json`);
}

/**
 * Ensure .x0v3rt directory exists
 */
async function ensureSettingsDir() {
    if (!workspaceDir) {
        throw new Error('Workspace directory not set');
    }
    const settingsDir = path.join(workspaceDir, '.x0v3rt');
    await fs.mkdir(settingsDir, { recursive: true });
}

/**
 * Get system preferences
 */
async function getSystemPreferences() {
    await ensureSettingsDir();
    const settingsPath = getSettingsPath('system');

    try {
        const data = await fs.readFile(settingsPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // File doesn't exist - return defaults with env vars
        return DEFAULT_SYSTEM_PREFERENCES;
    }
}

/**
 * Save system preferences
 */
async function saveSystemPreferences(prefs) {
    await ensureSettingsDir();
    const settingsPath = getSettingsPath('system');

    // Merge with defaults to ensure all keys exist
    const merged = {
        ...DEFAULT_SYSTEM_PREFERENCES,
        ...prefs,
        aiProvider: {
            ...DEFAULT_SYSTEM_PREFERENCES.aiProvider,
            ...prefs.aiProvider
        },
        extensions: {
            ...DEFAULT_SYSTEM_PREFERENCES.extensions,
            ...prefs.extensions
        },
        advanced: {
            ...DEFAULT_SYSTEM_PREFERENCES.advanced,
            ...prefs.advanced
        },
        frontMatter: {
            ...DEFAULT_SYSTEM_PREFERENCES.frontMatter,
            ...prefs.frontMatter,
            defaults: {
                ...DEFAULT_SYSTEM_PREFERENCES.frontMatter.defaults,
                ...(prefs.frontMatter?.defaults || {})
            }
        },
        aiChat: {
            ...DEFAULT_SYSTEM_PREFERENCES.aiChat,
            ...prefs.aiChat
        }
    };

    await fs.writeFile(settingsPath, JSON.stringify(merged, null, 2));
    return merged;
}

/**
 * Get user preferences
 */
async function getUserPreferences() {
    await ensureSettingsDir();
    const settingsPath = getSettingsPath('user');

    try {
        const data = await fs.readFile(settingsPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // File doesn't exist - return defaults
        return DEFAULT_USER_PREFERENCES;
    }
}

/**
 * Save user preferences
 */
async function saveUserPreferences(prefs) {
    await ensureSettingsDir();
    const settingsPath = getSettingsPath('user');

    // Merge with defaults
    const merged = {
        ...DEFAULT_USER_PREFERENCES,
        ...prefs,
        appearance: {
            ...DEFAULT_USER_PREFERENCES.appearance,
            ...prefs.appearance
        },
        editor: {
            ...DEFAULT_USER_PREFERENCES.editor,
            ...prefs.editor
        },
        workspace: {
            ...DEFAULT_USER_PREFERENCES.workspace,
            ...prefs.workspace
        },
        frontMatter: {
            ...DEFAULT_USER_PREFERENCES.frontMatter,
            ...prefs.frontMatter,
            defaults: {
                ...DEFAULT_USER_PREFERENCES.frontMatter.defaults,
                ...(prefs.frontMatter?.defaults || {})
            }
        }
    };

    await fs.writeFile(settingsPath, JSON.stringify(merged, null, 2));
    return merged;
}

/**
 * Register IPC handlers
 */
function registerHandlers() {
    ipcMain.handle('settings:get-system', async () => {
        return await getSystemPreferences();
    });

    ipcMain.handle('settings:save-system', async (_event, prefs) => {
        return await saveSystemPreferences(prefs);
    });

    ipcMain.handle('settings:get-user', async () => {
        return await getUserPreferences();
    });

    ipcMain.handle('settings:save-user', async (_event, prefs) => {
        return await saveUserPreferences(prefs);
    });
}

module.exports = {
    setWorkspaceDir,
    getSystemPreferences,
    saveSystemPreferences,
    getUserPreferences,
    saveUserPreferences,
    registerHandlers,
    DEFAULT_SYSTEM_PREFERENCES,
    DEFAULT_USER_PREFERENCES
};
