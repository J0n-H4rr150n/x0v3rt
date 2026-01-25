/**
 * Extensions Manager
 *
 * Handles extension configuration, activation, and artifact management.
 * Extensions are stored per-workspace in .x0v3rt/extensions.json
 */

const fs = require('fs').promises;
const path = require('path');
const { ipcMain } = require('electron');

const META_DIRNAME = '.x0v3rt';
const EXTENSIONS_CONFIG_FILE = 'extensions.json';
const ARTIFACTS_DIRNAME = 'artifacts';

let notesDir = null;

/**
 * Set the current workspace directory
 */
function setWorkspaceDir(dir) {
    notesDir = dir;
}

/**
 * Get the extensions config file path
 */
function getExtensionsConfigPath() {
    if (!notesDir) return null;
    return path.join(notesDir, META_DIRNAME, EXTENSIONS_CONFIG_FILE);
}

/**
 * Get the artifacts directory path
 */
function getArtifactsDir() {
    if (!notesDir) return null;
    return path.join(notesDir, META_DIRNAME, ARTIFACTS_DIRNAME);
}

/**
 * Get default extensions configuration
 */
function getDefaultConfig() {
    return {
        enabled: ['ai-tools'], // AI Tools enabled by default
        settings: {
            'ai-tools': {
                artifactsPath: 'artifacts',
                enabledTools: ['planning', 'implementation', 'tasks', 'walkthrough', 'changelog']
            }
        }
    };
}

/**
 * Ensure extensions config file exists
 */
async function ensureExtensionsConfig() {
    if (!notesDir) {
        throw new Error('No workspace directory set');
    }

    const configPath = getExtensionsConfigPath();
    const metaDir = path.dirname(configPath);

    // Ensure .x0v3rt directory exists
    await fs.mkdir(metaDir, { recursive: true });

    // Check if config file exists
    try {
        await fs.access(configPath);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // Create default config
            const defaultConfig = getDefaultConfig();
            await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
        } else {
            throw error;
        }
    }

    // Ensure artifacts directory exists
    const artifactsDir = getArtifactsDir();
    await fs.mkdir(artifactsDir, { recursive: true });

    // Create .gitignore in artifacts directory to ignore by default
    const gitignorePath = path.join(artifactsDir, '.gitignore');
    try {
        await fs.access(gitignorePath);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.writeFile(gitignorePath, '# AI-generated artifacts\n*\n', 'utf-8');
        }
    }
}

/**
 * Initialize extensions for a workspace
 */
async function initializeExtensions() {
    if (!notesDir) return null;

    await ensureExtensionsConfig();
    return {
        success: true,
        configPath: getExtensionsConfigPath(),
        artifactsPath: getArtifactsDir()
    };
}

/**
 * Load extensions configuration
 */
async function loadExtensionsConfig() {
    if (!notesDir) {
        throw new Error('No workspace directory set');
    }

    await ensureExtensionsConfig();
    const configPath = getExtensionsConfigPath();

    try {
        const data = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(data);
        // Merge with defaults to handle schema updates
        return { ...getDefaultConfig(), ...config };
    } catch (error) {
        console.error('Load extensions config error:', error);
        return getDefaultConfig();
    }
}

/**
 * Save extensions configuration
 */
async function saveExtensionsConfig(config) {
    if (!notesDir) {
        throw new Error('No workspace directory set');
    }

    await ensureExtensionsConfig();
    const configPath = getExtensionsConfigPath();
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Update extension enabled state
 */
async function toggleExtension(extensionId, enabled) {
    const config = await loadExtensionsConfig();

    if (enabled) {
        if (!config.enabled.includes(extensionId)) {
            config.enabled.push(extensionId);
        }
    } else {
        config.enabled = config.enabled.filter(id => id !== extensionId);
    }

    await saveExtensionsConfig(config);
    return config;
}

/**
 * Get all available extensions (builtin extensions)
 */
function getAvailableExtensions() {
    return [
        {
            id: 'ai-tools',
            name: 'AI Tools',
            description: 'Planning, implementation, task management, and documentation tools for AI assistance',
            icon: '🛠️',
            version: '1.0.0',
            builtin: true,
            tools: [
                {
                    id: 'planning',
                    name: 'Planning Document',
                    description: 'Create architectural and design planning documents'
                },
                {
                    id: 'implementation',
                    name: 'Implementation Guide',
                    description: 'Create step-by-step implementation guides'
                },
                {
                    id: 'tasks',
                    name: 'Task Checklist',
                    description: 'Create and track task checklists'
                },
                {
                    id: 'walkthrough',
                    name: 'Walkthrough Summary',
                    description: 'Create summaries of completed work'
                },
                {
                    id: 'changelog',
                    name: 'Changelog',
                    description: 'Update project changelog'
                }
            ]
        }
        // Future extensions can be added here
        // {
        //     id: 'browser-automation',
        //     name: 'Browser Automation',
        //     description: 'Playwright integration for web automation',
        //     icon: '🌐',
        //     version: '1.0.0',
        //     builtin: true
        // }
    ];
}

/**
 * Save artifact file to .x0v3rt/artifacts
 */
async function saveArtifact(filename, content) {
    if (!notesDir) {
        throw new Error('No workspace directory set');
    }

    await ensureExtensionsConfig();
    const artifactsDir = getArtifactsDir();

    // Ensure filename is safe (no path traversal)
    const basename = path.basename(filename);
    const artifactPath = path.join(artifactsDir, basename);

    await fs.writeFile(artifactPath, content, 'utf-8');

    return {
        success: true,
        path: artifactPath,
        relativePath: path.join(META_DIRNAME, ARTIFACTS_DIRNAME, basename)
    };
}

/**
 * Read artifact file from .x0v3rt/artifacts
 */
async function readArtifact(filename) {
    if (!notesDir) {
        throw new Error('No workspace directory set');
    }

    const artifactsDir = getArtifactsDir();
    const basename = path.basename(filename);
    const artifactPath = path.join(artifactsDir, basename);

    try {
        const content = await fs.readFile(artifactPath, 'utf-8');
        return {
            success: true,
            content,
            path: artifactPath
        };
    } catch (error) {
        if (error.code === 'ENOENT') {
            return {
                success: false,
                error: 'Artifact not found'
            };
        }
        throw error;
    }
}

/**
 * List all artifacts
 */
async function listArtifacts() {
    if (!notesDir) {
        throw new Error('No workspace directory set');
    }

    await ensureExtensionsConfig();
    const artifactsDir = getArtifactsDir();

    try {
        const files = await fs.readdir(artifactsDir);
        const artifacts = [];

        for (const file of files) {
            if (file === '.gitignore') continue; // Skip .gitignore

            const filePath = path.join(artifactsDir, file);
            const stats = await fs.stat(filePath);

            if (stats.isFile()) {
                artifacts.push({
                    name: file,
                    path: path.join(META_DIRNAME, ARTIFACTS_DIRNAME, file),
                    size: stats.size,
                    modified: stats.mtime.toISOString()
                });
            }
        }

        return artifacts;
    } catch (error) {
        console.error('List artifacts error:', error);
        return [];
    }
}

/**
 * Register IPC handlers for extensions
 */
function registerHandlers() {
    ipcMain.handle('extensions:init', async () => {
        try {
            return await initializeExtensions();
        } catch (error) {
            console.error('Extensions init error:', error);
            throw error;
        }
    });

    ipcMain.handle('extensions:get-config', async () => {
        try {
            return await loadExtensionsConfig();
        } catch (error) {
            console.error('Get extensions config error:', error);
            throw error;
        }
    });

    ipcMain.handle('extensions:save-config', async (_event, config) => {
        try {
            await saveExtensionsConfig(config);
            return { success: true };
        } catch (error) {
            console.error('Save extensions config error:', error);
            throw error;
        }
    });

    ipcMain.handle('extensions:toggle', async (_event, extensionId, enabled) => {
        try {
            const config = await toggleExtension(extensionId, enabled);
            return { success: true, config };
        } catch (error) {
            console.error('Toggle extension error:', error);
            throw error;
        }
    });

    ipcMain.handle('extensions:list-available', async () => {
        try {
            return getAvailableExtensions();
        } catch (error) {
            console.error('List available extensions error:', error);
            throw error;
        }
    });

    ipcMain.handle('extensions:save-artifact', async (_event, filename, content) => {
        try {
            return await saveArtifact(filename, content);
        } catch (error) {
            console.error('Save artifact error:', error);
            throw error;
        }
    });

    ipcMain.handle('extensions:read-artifact', async (_event, filename) => {
        try {
            return await readArtifact(filename);
        } catch (error) {
            console.error('Read artifact error:', error);
            throw error;
        }
    });

    ipcMain.handle('extensions:list-artifacts', async () => {
        try {
            return await listArtifacts();
        } catch (error) {
            console.error('List artifacts error:', error);
            throw error;
        }
    });
}

module.exports = {
    registerHandlers,
    setWorkspaceDir,
    initializeExtensions,
    loadExtensionsConfig,
    saveExtensionsConfig,
    saveArtifact,
    readArtifact,
    listArtifacts,
    getAvailableExtensions
};
