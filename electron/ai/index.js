/**
 * Provider-agnostic AI manager
 */

const { ipcMain } = require('electron');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

let activeProvider = null;
let activeProviderId = null;

function loadProvider(providerId) {
    try {
        // Allow drop-in providers in ./providers
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const provider = require(`./providers/${providerId}`);
        if (!provider?.sendMessage || !provider?.init) {
            throw new Error(`Provider ${providerId} missing required interface`);
        }
        return provider;
    } catch (error) {
        console.error(`Failed to load provider: ${providerId}`, error.message);
        return null;
    }
}

function initializeAI(config = {}) {
    let resolvedConfig = config;
    let providerId = config.providerId;

    if (!providerId) {
        const saved = loadProviderSettingsSync();
        if (saved?.activeProvider) {
            providerId = saved.activeProvider;
            resolvedConfig = saved.providers?.[providerId] || {};
        }
    }

    providerId = providerId || process.env.AI_PROVIDER || 'vertex';
    console.log('[AI:init] provider selection:', {
        providerId,
        resolvedConfigKeys: Object.keys(resolvedConfig || {}),
        hasSavedConfig: Boolean(config?.providerId) || Boolean(config)
    });
    const provider = loadProvider(providerId) || loadProvider('vertex');

    if (!provider) {
        console.warn('No AI provider available.');
        activeProvider = null;
        return false;
    }

    const initialized = provider.init(resolvedConfig);
    console.log('[AI:init] provider initialized:', { providerId, initialized });
    activeProvider = initialized ? provider : null;
    activeProviderId = initialized ? providerId : null;
    return Boolean(activeProvider);
}

async function sendMessage(message, context = {}) {
    if (!activeProvider) {
        throw new Error('AI provider not initialized.');
    }

    try {
        return await activeProvider.sendMessage(message, context);
    } catch (error) {
        console.error('AI provider error:', error);
        throw new Error(`AI request failed: ${error.message}`);
    }
}

function registerHandlers() {
    ipcMain.handle('ai:send-message', async (_event, message, context) => {
        return await sendMessage(message, context);
    });

    ipcMain.handle('ai:list-providers', async () => {
        return listProviders();
    });

    ipcMain.handle('ai:get-provider-info', async (_event, providerId) => {
        return getProviderInfo(providerId);
    });

    ipcMain.handle('ai:switch-provider', async (_event, providerId, config) => {
        return await switchProvider(providerId, config);
    });

    ipcMain.handle('ai:list-models', async () => {
        return listModels();
    });
}

module.exports = {
    initializeAI,
    registerHandlers,
    listProviders,
    getProviderInfo,
    switchProvider,
    listModels,
    get activeProviderId() { return activeProviderId; }
};

/**
 * List all available providers
 */
function listProviders() {
    const fs = require('fs');
    const path = require('path');
    const providersDir = path.join(__dirname, 'providers');

    try {
        const files = fs.readdirSync(providersDir);
        const providers = [];

        for (const file of files) {
            if (!file.endsWith('.js')) continue;

            const providerId = file.replace('.js', '');
            try {
                const provider = loadProvider(providerId);
                if (provider) {
                    providers.push({
                        id: provider.id || providerId,
                        name: provider.name || providerId,
                        description: provider.description || '',
                        active: activeProviderId === providerId
                    });
                }
            } catch (error) {
                console.warn(`Skipping invalid provider: ${providerId}`);
            }
        }

        return providers;
    } catch (error) {
        console.error('Error listing providers:', error);
        return [];
    }
}

/**
 * List all available models from registry
 */
function listModels() {
    try {
        const registryPath = path.join(__dirname, 'model-registry.json');
        const registryModels = loadRegistryModels(registryPath);
        const definitionModels = loadModelDefinitions();

        const merged = new Map();
        registryModels.forEach(model => {
            if (!model?.id || merged.has(model.id)) return;
            merged.set(model.id, model);
        });

        definitionModels.forEach(model => {
            if (!model?.id) return;
            merged.set(model.id, model);
        });

        return Array.from(merged.values());
    } catch (error) {
        console.error('Error listing models:', error);
        return [];
    }
}

function loadRegistryModels(registryPath) {
    try {
        if (!fs.existsSync(registryPath)) return [];
        const raw = fs.readFileSync(registryPath, 'utf-8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed?.models) ? parsed.models : [];
    } catch (error) {
        console.warn('Failed to read model registry:', error.message);
        return [];
    }
}

function loadModelDefinitions() {
    const root = path.join(__dirname, 'model-definitions');
    if (!fs.existsSync(root)) return [];

    const results = [];
    const stack = [root];

    while (stack.length) {
        const current = stack.pop();
        let entries = [];
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch (_error) {
            continue;
        }

        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.json')) {
                try {
                    const raw = fs.readFileSync(fullPath, 'utf-8');
                    const parsed = JSON.parse(raw);
                    const model = mapModelDefinition(parsed);
                    if (model) results.push(model);
                } catch (_error) {
                    // ignore invalid json
                }
            }
        }
    }

    return results;
}

function mapModelDefinition(config) {
    if (!config || typeof config !== 'object') return null;
    if (config.status && config.status !== 'enabled') return null;

    const id = config.model_id || config.id;
    if (!id) return null;

    const type = config.type || 'unknown';
    const provider = type === 'google-preview'
        ? 'google-ai-studio'
        : (type === 'google' || type === 'google-maas' || type === 'mistral-vertex')
            ? 'vertex'
            : null;

    return {
        id,
        label: config.label || id,
        provider,
        location: config.location,
        type,
        defaults: {
            temperature: config.temperature,
            topP: config.top_p,
            topK: config.top_k,
            maxTokens: config.max_tokens
        }
    };
}

/**
 * Get provider info including config schema
 */
function getProviderInfo(providerId) {
    const provider = loadProvider(providerId);
    if (!provider) {
        return null;
    }

    return {
        id: provider.id || providerId,
        name: provider.name || providerId,
        description: provider.description || '',
        configSchema: provider.getConfigSchema ? provider.getConfigSchema() : null,
        active: activeProviderId === providerId
    };
}

/**
 * Switch active provider
 */
async function switchProvider(providerId, config = {}) {
    const provider = loadProvider(providerId);

    if (!provider) {
        throw new Error(`Provider not found: ${providerId}`);
    }

    const initialized = provider.init(config);
    if (!initialized) {
        throw new Error(`Failed to initialize provider: ${providerId}`);
    }

    activeProvider = provider;
    activeProviderId = providerId;

    // Persist to settings
    await saveProviderSettings(providerId, config);

    return {
        providerId,
        name: provider.name || providerId,
        success: true
    };
}

/**
 * Save provider settings
 */
async function saveProviderSettings(providerId, config) {
    const fs = require('fs').promises;
    const path = require('path');
    const { app } = require('electron');

    const settingsPath = path.join(app.getPath('userData'), 'ai-provider-settings.json');

    const settings = {
        activeProvider: providerId,
        providers: {
            [providerId]: config
        }
    };

    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
}

/**
 * Load provider settings
 */
async function loadProviderSettings() {
    const fs = require('fs').promises;
    const path = require('path');
    const { app } = require('electron');

    const settingsPath = path.join(app.getPath('userData'), 'ai-provider-settings.json');

    try {
        const data = await fs.readFile(settingsPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return null;
    }
}

function loadProviderSettingsSync() {
    const { app } = require('electron');
    const settingsPath = path.join(app.getPath('userData'), 'ai-provider-settings.json');

    try {
        const data = fs.readFileSync(settingsPath, 'utf8');
        return JSON.parse(data);
    } catch (_error) {
        return null;
    }
}
