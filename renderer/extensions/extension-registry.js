/**
 * Extension Registry
 *
 * Manages extension lifecycle, configuration, and tool registration.
 * Central hub for all extension functionality in the frontend.
 */

import ExtensionsIPC from '../utils/extensions-ipc.js';

class ExtensionRegistry {
    constructor() {
        this.extensions = new Map(); // extensionId -> extension object
        this.tools = new Map(); // toolId -> tool definition
        this.config = null;
        this.initialized = false;
    }

    /**
     * Initialize the registry
     */
    async initialize() {
        if (this.initialized) {
            return;
        }

        console.log('[ExtensionRegistry] Initializing...');

        try {
            // Try to load config, but don't fail if workspace not set yet
            try {
                this.config = await ExtensionsIPC.getConfig();
            } catch (error) {
                if (error.message?.includes('No workspace directory')) {
                    console.log('[ExtensionRegistry] Workspace not set yet, will initialize later');
                    this.config = { enabled: [] };
                } else {
                    throw error;
                }
            }

            // Register built-in extensions
            await this.registerBuiltInExtensions();

            // Apply enabled state from config
            await this.applyConfig();

            this.initialized = true;
            console.log('[ExtensionRegistry] Initialized successfully');
        } catch (error) {
            console.error('[ExtensionRegistry] Initialization error:', error);
        }
    }

    /**
     * Re-initialize when workspace changes
     */
    async reinitialize() {
        console.log('[ExtensionRegistry] Re-initializing for new workspace...');
        this.initialized = false;
        this.extensions.clear();
        this.tools.clear();
        await this.initialize();

        // Re-render Extensions UI if it exists
        if (window.ExtensionsUI?.render) {
            await window.ExtensionsUI.render();
        }
    }

    /**
     * Register built-in extensions
     */
    async registerBuiltInExtensions() {
        let availableExtensions = [];

        try {
            availableExtensions = await ExtensionsIPC.listAvailable();
        } catch (error) {
            console.warn('[ExtensionRegistry] Failed to load available extensions:', error);
        }

        if (!Array.isArray(availableExtensions) || availableExtensions.length === 0) {
            availableExtensions = [
                {
                    id: 'ai-tools',
                    name: 'AI Tools',
                    description: 'Planning, implementation, task management, and documentation tools for AI assistance',
                    icon: '🛠️',
                    version: '1.0.0',
                    builtin: true,
                    tools: []
                }
            ];
        }

        availableExtensions.forEach(extension => {
            this.extensions.set(extension.id, {
                ...extension,
                activated: false,
                activateHandler: null,
                deactivateHandler: null
            });
        });
    }

    /**
     * Apply configuration to extensions
     */
    async applyConfig() {
        if (!this.config) {
            this.config = { enabled: [] };
        }

        if (!Array.isArray(this.config.enabled)) {
            this.config.enabled = [];
        }

        await this.activateEnabledExtensions();
    }

    /**
     * Activate all enabled extensions
     */
    async activateEnabledExtensions() {
        if (!this.config) return;

        for (const extensionId of this.config.enabled) {
            await this.activateExtension(extensionId);
        }
    }

    /**
     * Activate a single extension
     */
    async activateExtension(extensionId) {
        const extension = this.extensions.get(extensionId);
        if (!extension || extension.activated) return;

        console.log('[ExtensionRegistry] Activating extension:', extensionId);

        // For AI Tools extension, register its tools
        if (extensionId === 'ai-tools') {
            this.registerAITools();
        }

        extension.activated = true;
    }

    /**
     * Deactivate a single extension
     */
    async deactivateExtension(extensionId) {
        const extension = this.extensions.get(extensionId);
        if (!extension || !extension.activated) return;

        console.log('[ExtensionRegistry] Deactivating extension:', extensionId);

        // Unregister tools
        if (extensionId === 'ai-tools') {
            this.tools.clear();
        }

        extension.activated = false;
    }

    /**
     * Register AI Tools extension tools
     */
    registerAITools() {
        const tools = [
            {
                name: 'create_plan',
                description: 'Create a planning document with architecture and design decisions. Supports multiple plans with unique names.',
                parameters: {
                    type: 'object',
                    properties: {
                        title: {
                            type: 'string',
                            description: 'Title of the plan'
                        },
                        content: {
                            type: 'string',
                            description: 'Markdown content of the plan'
                        },
                        name: {
                            type: 'string',
                            description: 'Optional slug/name for the file (e.g., "authentication"). If omitted, uses timestamp.'
                        }
                    },
                    required: ['title', 'content']
                }
            },
            {
                name: 'write_plan',
                description: 'Write a planning document (alias of create_plan).',
                parameters: {
                    type: 'object',
                    properties: {
                        title: {
                            type: 'string',
                            description: 'Title of the plan'
                        },
                        content: {
                            type: 'string',
                            description: 'Markdown content of the plan'
                        },
                        name: {
                            type: 'string',
                            description: 'Optional slug/name for the file (e.g., "authentication"). If omitted, uses timestamp.'
                        }
                    },
                    required: ['title', 'content']
                }
            },
            {
                name: 'create_implementation',
                description: 'Create an implementation guide with step-by-step instructions. Supports multiple implementations with unique names.',
                parameters: {
                    type: 'object',
                    properties: {
                        title: {
                            type: 'string',
                            description: 'Title of the implementation guide'
                        },
                        content: {
                            type: 'string',
                            description: 'Markdown content with implementation steps'
                        },
                        name: {
                            type: 'string',
                            description: 'Optional slug/name for the file (e.g., "phase-1"). If omitted, uses timestamp.'
                        }
                    },
                    required: ['title', 'content']
                }
            },
            {
                name: 'write_implementation',
                description: 'Write an implementation guide (alias of create_implementation).',
                parameters: {
                    type: 'object',
                    properties: {
                        title: {
                            type: 'string',
                            description: 'Title of the implementation guide'
                        },
                        content: {
                            type: 'string',
                            description: 'Markdown content with implementation steps'
                        },
                        name: {
                            type: 'string',
                            description: 'Optional slug/name for the file (e.g., "phase-1"). If omitted, uses timestamp.'
                        }
                    },
                    required: ['title', 'content']
                }
            },
            {
                name: 'create_task_list',
                description: 'Create a task checklist to track work items. Supports multiple task lists with unique names.',
                parameters: {
                    type: 'object',
                    properties: {
                        title: {
                            type: 'string',
                            description: 'Title of the task list'
                        },
                        content: {
                            type: 'string',
                            description: 'Markdown content with checklist items (use - [ ] format)'
                        },
                        name: {
                            type: 'string',
                            description: 'Optional slug/name for the file (e.g., "sprint-1"). If omitted, uses timestamp.'
                        }
                    },
                    required: ['title', 'content']
                }
            },
            {
                name: 'write_task_list',
                description: 'Write a task checklist (alias of create_task_list).',
                parameters: {
                    type: 'object',
                    properties: {
                        title: {
                            type: 'string',
                            description: 'Title of the task list'
                        },
                        content: {
                            type: 'string',
                            description: 'Markdown content with checklist items (use - [ ] format)'
                        },
                        name: {
                            type: 'string',
                            description: 'Optional slug/name for the file (e.g., "sprint-1"). If omitted, uses timestamp.'
                        }
                    },
                    required: ['title', 'content']
                }
            },
            {
                name: 'create_walkthrough',
                description: 'Create a walkthrough summary documenting completed work. Supports multiple walkthroughs with unique names.',
                parameters: {
                    type: 'object',
                    properties: {
                        title: {
                            type: 'string',
                            description: 'Title of the walkthrough'
                        },
                        content: {
                            type: 'string',
                            description: 'Markdown content summarizing the work done'
                        },
                        name: {
                            type: 'string',
                            description: 'Optional slug/name for the file (e.g., "week-1"). If omitted, uses timestamp.'
                        }
                    },
                    required: ['title', 'content']
                }
            },
            {
                name: 'write_walkthrough',
                description: 'Write a walkthrough summary (alias of create_walkthrough).',
                parameters: {
                    type: 'object',
                    properties: {
                        title: {
                            type: 'string',
                            description: 'Title of the walkthrough'
                        },
                        content: {
                            type: 'string',
                            description: 'Markdown content summarizing the work done'
                        },
                        name: {
                            type: 'string',
                            description: 'Optional slug/name for the file (e.g., "week-1"). If omitted, uses timestamp.'
                        }
                    },
                    required: ['title', 'content']
                }
            },
            {
                name: 'update_changelog',
                description: 'Update the changelog file with new entries',
                parameters: {
                    type: 'object',
                    properties: {
                        entry: {
                            type: 'string',
                            description: 'New changelog entry to add'
                        }
                    },
                    required: ['entry']
                }
            },
            {
                name: 'write_changelog',
                description: 'Write to the changelog file (alias of update_changelog).',
                parameters: {
                    type: 'object',
                    properties: {
                        entry: {
                            type: 'string',
                            description: 'New changelog entry to add'
                        }
                    },
                    required: ['entry']
                }
            },
            {
                name: 'read_artifact',
                description: 'Read an artifact file created by AI tools (from workspace artifacts).',
                parameters: {
                    type: 'object',
                    properties: {
                        filename: {
                            type: 'string',
                            description: 'Artifact filename to read (e.g., plan-initial-reconnaissance.md)'
                        }
                    },
                    required: ['filename']
                }
            },
            {
                name: 'read_task',
                description: 'Read a task list artifact by filename (wrapper around read_artifact).',
                parameters: {
                    type: 'object',
                    properties: {
                        filename: {
                            type: 'string',
                            description: 'Task list filename (e.g., task-nmap-installation-usage.md)'
                        }
                    },
                    required: ['filename']
                }
            },
            {
                name: 'read_plan',
                description: 'Read a plan artifact by filename (wrapper around read_artifact).',
                parameters: {
                    type: 'object',
                    properties: {
                        filename: {
                            type: 'string',
                            description: 'Plan filename (e.g., plan-initial-reconnaissance.md)'
                        }
                    },
                    required: ['filename']
                }
            },
            {
                name: 'read_implementation',
                description: 'Read an implementation guide artifact by filename (wrapper around read_artifact).',
                parameters: {
                    type: 'object',
                    properties: {
                        filename: {
                            type: 'string',
                            description: 'Implementation filename (e.g., implementation-phase-1.md)'
                        }
                    },
                    required: ['filename']
                }
            },
            {
                name: 'read_walkthrough',
                description: 'Read a walkthrough artifact by filename (wrapper around read_artifact).',
                parameters: {
                    type: 'object',
                    properties: {
                        filename: {
                            type: 'string',
                            description: 'Walkthrough filename (e.g., walkthrough-week-1.md)'
                        }
                    },
                    required: ['filename']
                }
            },
            {
                name: 'read_changelog',
                description: 'Read changelog artifact by filename (wrapper around read_artifact).',
                parameters: {
                    type: 'object',
                    properties: {
                        filename: {
                            type: 'string',
                            description: 'Changelog filename (e.g., changelog.md)'
                        }
                    },
                    required: ['filename']
                }
            },
            {
                name: 'list_plans',
                description: 'List plan artifacts.',
                parameters: { type: 'object', properties: {}, required: [] }
            },
            {
                name: 'list_tasks',
                description: 'List task list artifacts.',
                parameters: { type: 'object', properties: {}, required: [] }
            },
            {
                name: 'list_implementations',
                description: 'List implementation guide artifacts.',
                parameters: { type: 'object', properties: {}, required: [] }
            },
            {
                name: 'list_walkthroughs',
                description: 'List walkthrough artifacts.',
                parameters: { type: 'object', properties: {}, required: [] }
            },
            {
                name: 'list_changelogs',
                description: 'List changelog artifacts.',
                parameters: { type: 'object', properties: {}, required: [] }
            },
            {
                name: 'list_artifacts',
                description: 'List available artifact files created by AI tools.',
                parameters: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            {
                name: 'search_artifacts',
                description: 'Search artifact filenames by query string.',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'Search query to match artifact filenames'
                        }
                    },
                    required: ['query']
                }
            },
            {
                name: 'search_workspace',
                description: 'Search workspace index for files matching a query string.',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'Search query to match workspace files'
                        }
                    },
                    required: ['query']
                }
            },
            {
                name: 'search_chat_history',
                description: 'Search the current chat history by keyword(s).',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'Search terms'
                        },
                        limit: {
                            type: 'number',
                            description: 'Max results to return'
                        },
                        sessionId: {
                            type: 'string',
                            description: 'Optional chat session id (defaults to active session)'
                        }
                    },
                    required: ['query']
                }
            },
            {
                name: 'read_chat_history',
                description: 'Read messages from the current chat history.',
                parameters: {
                    type: 'object',
                    properties: {
                        offset: {
                            type: 'number',
                            description: 'Start index (0-based)'
                        },
                        limit: {
                            type: 'number',
                            description: 'Max messages to return'
                        },
                        fromEnd: {
                            type: 'boolean',
                            description: 'If true, count offset from the end'
                        },
                        sessionId: {
                            type: 'string',
                            description: 'Optional chat session id (defaults to active session)'
                        }
                    }
                }
            }
        ];

        tools.forEach(tool => {
            this.tools.set(tool.name, tool);
        });

        console.log('[ExtensionRegistry] Registered AI Tools:', tools.map(t => t.name));
    }

    /**
     * Generate unique filename for artifact
     */
    generateFilename(baseName, userSlug) {
        if (userSlug) {
            // Sanitize user slug (remove special chars, convert to lowercase)
            const sanitized = userSlug
                .toLowerCase()
                .replace(/[^a-z0-9-_]/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '');
            return `${baseName}-${sanitized}.md`;
        }

        // Use timestamp as fallback
        const now = new Date();
        const timestamp = now.toISOString()
            .replace(/[:.]/g, '-')
            .replace('T', '-')
            .split('.')[0]; // Remove milliseconds
        return `${baseName}-${timestamp}.md`;
    }

    /**
     * Execute a tool
     */
    async executeTool(toolName, parameters) {
        const tool = this.tools.get(toolName);
        if (!tool) {
            throw new Error(`Tool not found: ${toolName}`);
        }

        console.log('[ExtensionRegistry] Executing tool:', toolName, parameters);

        const aliasMap = {
            write_plan: 'create_plan',
            write_implementation: 'create_implementation',
            write_task_list: 'create_task_list',
            write_walkthrough: 'create_walkthrough',
            write_changelog: 'update_changelog'
        };

        if (aliasMap[toolName]) {
            toolName = aliasMap[toolName];
        }

        if (toolName === 'read_artifact'
            || toolName === 'read_task'
            || toolName === 'read_plan'
            || toolName === 'read_implementation'
            || toolName === 'read_walkthrough'
            || toolName === 'read_changelog') {
            const result = await ExtensionsIPC.readArtifact(parameters.filename);
            return {
                success: Boolean(result?.success),
                tool: toolName,
                filename: parameters.filename,
                content: result?.content || null,
                message: result?.success ? `Read ${parameters.filename}` : (result?.error || 'Artifact not found')
            };
        }

        if (toolName === 'list_artifacts') {
            const artifacts = await ExtensionsIPC.listArtifacts();
            return {
                success: true,
                tool: toolName,
                artifacts: artifacts || [],
                message: `Found ${artifacts?.length || 0} artifacts`
            };
        }

        if (toolName === 'list_plans'
            || toolName === 'list_tasks'
            || toolName === 'list_implementations'
            || toolName === 'list_walkthroughs'
            || toolName === 'list_changelogs') {
            const artifacts = await ExtensionsIPC.listArtifacts();
            const prefixMap = {
                list_plans: 'plan-',
                list_tasks: 'task-',
                list_implementations: 'implementation-',
                list_walkthroughs: 'walkthrough-',
                list_changelogs: 'changelog'
            };
            const prefix = prefixMap[toolName];
            const filtered = (artifacts || []).filter((item) => {
                if (!item?.name) return false;
                return prefix === 'changelog'
                    ? item.name === 'changelog.md'
                    : item.name.startsWith(prefix);
            });
            return {
                success: true,
                tool: toolName,
                artifacts: filtered,
                message: `Found ${filtered.length} artifacts`
            };
        }

        if (toolName === 'search_artifacts') {
            const query = String(parameters.query || '').toLowerCase();
            const artifacts = await ExtensionsIPC.listArtifacts();
            const results = (artifacts || []).filter((item) =>
                item?.name?.toLowerCase().includes(query)
            );
            return {
                success: true,
                tool: toolName,
                results,
                message: `Found ${results.length} artifact matches`
            };
        }

        if (toolName === 'search_workspace') {
            const query = String(parameters.query || '').trim();
            const results = await window.IPC.invoke('search:query', query);
            return {
                success: true,
                tool: toolName,
                results: results || [],
                message: `Found ${results?.length || 0} workspace matches`
            };
        }

        if (toolName === 'search_chat_history') {
            const query = String(parameters.query || '').trim();
            const limit = Number.isFinite(parameters.limit) ? Number(parameters.limit) : 8;
            const sessionId = parameters.sessionId || window.ChatUI?.sessionId || null;
            const results = await window.IPC.invoke('chat:search', sessionId, query, limit);
            return {
                success: true,
                tool: toolName,
                results: results || [],
                message: `Found ${results?.length || 0} chat matches`
            };
        }

        if (toolName === 'read_chat_history') {
            const sessionId = parameters.sessionId || window.ChatUI?.sessionId || null;
            const payload = {
                offset: Number.isFinite(parameters.offset) ? Number(parameters.offset) : 0,
                limit: Number.isFinite(parameters.limit) ? Number(parameters.limit) : 20,
                fromEnd: Boolean(parameters.fromEnd)
            };
            const result = await window.IPC.invoke('chat:read', sessionId, payload);
            return {
                success: true,
                tool: toolName,
                results: result?.messages || [],
                message: `Loaded ${result?.messages?.length || 0} chat messages`
            };
        }

        // Map tool names to base filenames
        const baseNameMap = {
            'create_plan': 'plan',
            'create_implementation': 'implementation',
            'create_task_list': 'task',
            'create_walkthrough': 'walkthrough',
            'update_changelog': 'changelog'
        };

        const baseName = baseNameMap[toolName];
        if (!baseName) {
            throw new Error(`Unknown tool: ${toolName}`);
        }

        // Generate unique filename (except for changelog which always appends)
        let filename;
        if (toolName === 'update_changelog') {
            filename = 'changelog.md';
        } else {
            filename = this.generateFilename(baseName, parameters.name);
        }

        // Build markdown content
        let content = `# ${parameters.title}\n\n`;
        content += parameters.content || parameters.entry || '';

        // Save artifact
        const result = await ExtensionsIPC.saveArtifact(filename, content);

        return {
            success: true,
            tool: toolName,
            artifact: result.relativePath,
            filename: filename,
            message: `Created ${filename} in workspace artifacts`
        };
    }

    /**
     * Get all enabled tools (for AI context)
     */
    async getEnabledTools() {
        if (!this.config || !this.initialized) {
            await this.initialize();
        }

        const enabledTools = [];

        for (const extensionId of this.config.enabled) {
            const extension = this.extensions.get(extensionId);
            if (!extension || !extension.activated) continue;

            // Get tools from this extension
            for (const [toolName, tool] of this.tools.entries()) {
                enabledTools.push(tool);
            }
        }

        return enabledTools;
    }

    /**
     * Toggle extension on/off
     */
    async toggleExtension(extensionId, enabled) {
        const result = await ExtensionsIPC.toggleExtension(extensionId, enabled);
        this.config = result.config;

        if (enabled) {
            await this.activateExtension(extensionId);
        } else {
            await this.deactivateExtension(extensionId);
        }

        return result;
    }

    /**
     * Get all extensions with their status
     */
    getExtensions() {
        const extensions = [];

        for (const [id, ext] of this.extensions.entries()) {
            const isEnabled = this.config.enabled.includes(id);
            extensions.push({
                ...ext,
                enabled: isEnabled
            });
        }

        return extensions;
    }

    /**
     * Check if extension is enabled
     */
    isEnabled(extensionId) {
        return this.config && this.config.enabled.includes(extensionId);
    }
}

// Create singleton instance
const registry = new ExtensionRegistry();

// Export and expose globally
window.ExtensionRegistry = registry;

// Listen for workspace changes to reinitialize
window.IPC.on('notes:folder-changed', async () => {
    console.log('[ExtensionRegistry] Workspace changed, reinitializing...');
    await registry.reinitialize();
});

export default registry;
