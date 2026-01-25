/**
 * File Manager
 *
 * Handles file system operations for notes and metadata.
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, ipcMain, BrowserWindow, shell } = require('electron');
const SearchIndexer = require('./search-indexer');
const yaml = require('js-yaml');

const DEFAULT_NOTES_DIR = path.join(process.cwd(), '.notes');
const SETTINGS_FILENAME = 'settings.json';
const META_DIRNAME = '.x0v3rt';
const PREVIOUS_DIRNAME = '.previous';
const INDEX_FILENAME = 'index.json';
const CHAT_DIRNAME = 'chat';
const WORKSPACE_STATE_FILENAME = 'workspace-state.json';

let notesDir = null;
let watcher = null;
let watcherTimer = null;
let cachedIndex = null;
let activeFilePath = null;
let searchIndexer = null;

function sanitizeFilename(input) {
    const cleaned = String(input || '')
        .replace(/[^a-z0-9-_]+/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^[-_]+|[-_]+$/g, '');
    return cleaned || 'image';
}

function buildTimestamp() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function formatFrontMatterTimestamp(date = new Date()) {
    const pad = (value) => String(value).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day} ${hours}${minutes}`;
}

async function getFrontMatterDefaults() {
    const settingsManager = require('./settings-manager');
    const system = await settingsManager.getSystemPreferences();
    const user = await settingsManager.getUserPreferences();
    return {
        systemDefaults: system?.frontMatter?.defaults || {},
        userDefaults: user?.frontMatter?.defaults || {}
    };
}

function parseFrontMatter(content) {
    const trimmed = content.startsWith('\uFEFF') ? content.slice(1) : content;
    if (!trimmed.startsWith('---')) {
        return { data: null, body: content, raw: null, hasFrontMatter: false };
    }

    const match = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    if (!match) {
        return { data: null, body: content, raw: null, hasFrontMatter: false };
    }

    let data = null;
    const raw = match[1];
    try {
        data = yaml.load(raw) || null;
    } catch (_error) {
        data = null;
    }

    return {
        data,
        body: trimmed.slice(match[0].length),
        raw,
        hasFrontMatter: true
    };
}

function buildFrontMatter(data) {
    const yamlText = yaml.dump(data, { lineWidth: 120, noRefs: true });
    return `---\n${yamlText}---\n\n`;
}

/**
 * Ensure notes directory exists
 */
async function ensureNotesDir(dir = notesDir) {
    if (!dir) return;
    try {
        await fs.access(dir);
    } catch {
        await fs.mkdir(dir, { recursive: true });
    }
}

async function ensureMetaDir() {
    if (!notesDir) return null;
    const metaDir = path.join(notesDir, META_DIRNAME);
    await fs.mkdir(metaDir, { recursive: true });
    return metaDir;
}

async function ensureChatDir() {
    const metaDir = await ensureMetaDir();
    if (!metaDir) return null;
    const chatDir = path.join(metaDir, CHAT_DIRNAME);
    await fs.mkdir(chatDir, { recursive: true });
    return chatDir;
}

function isMetaPath(targetPath) {
    const rel = path.relative(notesDir, targetPath);
    return rel.split(path.sep).includes(META_DIRNAME);
}

function resolveSafePath(filename, options = {}) {
    if (!notesDir) {
        throw new Error('No folder open');
    }
    const normalized = path.normalize(filename);
    const resolved = path.resolve(notesDir, normalized);
    if (!resolved.startsWith(notesDir)) {
        throw new Error('Invalid filename');
    }
    if (isMetaPath(resolved) && !options.allowMeta) {
        throw new Error('Access to metadata folder is restricted');
    }
    return resolved;
}

async function getPreviousDir(filename) {
    const metaDir = await ensureMetaDir();
    if (!metaDir) return null;
    const safeName = filename.replace(/[\\/]/g, '_');
    const previousDir = path.join(metaDir, PREVIOUS_DIRNAME, safeName);
    await fs.mkdir(previousDir, { recursive: true });
    return previousDir;
}

async function loadSettings() {
    try {
        const settingsPath = path.join(app.getPath('userData'), SETTINGS_FILENAME);
        const raw = await fs.readFile(settingsPath, 'utf-8');
        return JSON.parse(raw);
    } catch (error) {
        if (error.code === 'ENOENT') return {};
        console.error('Settings load error:', error);
        return {};
    }
}

async function saveSettings(settings) {
    try {
        const settingsPath = path.join(app.getPath('userData'), SETTINGS_FILENAME);
        await fs.mkdir(path.dirname(settingsPath), { recursive: true });
        await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    } catch (error) {
        console.error('Settings save error:', error);
    }
}

async function initializeNotesDir() {
    const settings = await loadSettings();
    if (settings.notesDir) {
        await setNotesDir(settings.notesDir, false);
        return { notesDir: settings.notesDir };
    }

    try {
        await fs.access(DEFAULT_NOTES_DIR);
        await setNotesDir(DEFAULT_NOTES_DIR, false);
        return { notesDir: DEFAULT_NOTES_DIR };
    } catch {
        notesDir = null;
    }
}

function getNotesDir() {
    return notesDir;
}

async function setNotesDir(dir, persist = true) {
    notesDir = dir || null;
    if (notesDir) {
        await ensureNotesDir(notesDir);
        await buildIndex();
        startWatcher();

        await initializeSearchIndexer();

        // Notify extensions module of workspace change
        const extensions = require('./extensions');
        const settingsManager = require('./settings-manager');
        extensions.setWorkspaceDir(notesDir);
        settingsManager.setWorkspaceDir(notesDir);
        await extensions.initializeExtensions().catch(err =>
            console.error('[FileManager] Extensions init error:', err)
        );
    } else {
        stopWatcher();
        cachedIndex = null;
        searchIndexer = null;
    }
    if (persist) {
        const settings = await loadSettings();
        settings.notesDir = notesDir;
        await saveSettings(settings);
    }
}

async function initializeSearchIndexer() {
    if (!notesDir) return;

    try {
        searchIndexer = new SearchIndexer(notesDir);
        await searchIndexer.initialize();
        // Rebuild index in background
        setImmediate(async () => {
            await searchIndexer.rebuildIndex();
        });
    } catch (error) {
        console.error('[FileManager] Search indexer init error:', error);
    }
}

/**
 * Set the currently active file
 * @param {string} filename - Relative path to the file
 */
function setActiveFile(filename) {
    activeFilePath = filename || null;
}

/**
 * Get information about the currently active file
 * @returns {Promise<object>} Active file information
 */
async function getActiveFile() {
    if (!activeFilePath) {
        return {
            filename: null,
            path: null,
            content: null,
            exists: false,
            metadata: null
        };
    }

    try {
        const filepath = resolveSafePath(activeFilePath);
        const stats = await fs.stat(filepath);

        let content = null;
        try {
            // Only read text files (markdown, txt, etc.)
            if (activeFilePath.match(/\.(md|txt|json|js|py|html|css|yaml|yml)$/i)) {
                content = await fs.readFile(filepath, 'utf-8');
            }
        } catch (error) {
            // If we can't read content, just continue without it
            console.warn('Could not read active file content:', error.message);
        }

        return {
            filename: activeFilePath,
            path: filepath,
            content,
            exists: true,
            metadata: {
                size: stats.size,
                modified: stats.mtime.toISOString()
            }
        };
    } catch (error) {
        console.error('Get active file error:', error);
        return {
            filename: activeFilePath,
            path: null,
            content: null,
            exists: false,
            metadata: null,
            error: error.message
        };
    }
}

/**
 * List all files in notes directory
 */
async function listFiles(options = {}) {
    if (!notesDir) {
        return { files: [], tree: null, notesDir: null, indexUpdatedAt: null };
    }
    await ensureNotesDir(notesDir);
    const includeHidden = Boolean(options.includeHidden);
    const includeMeta = Boolean(options.includeMeta);

    if (!includeHidden && !includeMeta) {
        if (!cachedIndex) {
            await buildIndex();
        }
        return {
            files: cachedIndex?.files || [],
            tree: cachedIndex?.tree || null,
            notesDir,
            indexUpdatedAt: cachedIndex?.updatedAt || null
        };
    }

    const tree = await scanDir(notesDir, '', { includeHidden, includeMeta });
    const files = flattenFiles(tree);
    return {
        files,
        tree,
        notesDir,
        indexUpdatedAt: cachedIndex?.updatedAt || null
    };
}

/**
 * Read a file
 */
async function readFile(filename, options = {}) {
    const filepath = resolveSafePath(filename, options);
    return await fs.readFile(filepath, 'utf-8');
}

async function readFileBinary(filename, options = {}) {
    const filepath = resolveSafePath(filename, options);
    const buffer = await fs.readFile(filepath);
    const mime = getMimeType(filename);
    const base64 = buffer.toString('base64');
    return {
        dataUrl: `data:${mime};base64,${base64}`,
        mime
    };
}

/**
 * Write a file
 */
async function writeFile(filename, content) {
    await ensureNotesDir(notesDir);
    const filepath = resolveSafePath(filename);
    const ext = path.extname(filename).toLowerCase();

    let previousContent = null;
    try {
        previousContent = await fs.readFile(filepath, 'utf-8');
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }

    if (ext === '.md') {
        const { hasFrontMatter: newHasFrontMatter } = parseFrontMatter(content);
        if (!newHasFrontMatter) {
            const existing = previousContent ? parseFrontMatter(previousContent) : null;

            if (existing?.hasFrontMatter) {
                if (existing.data) {
                    content = `${buildFrontMatter(existing.data)}${content}`;
                } else if (existing.raw != null) {
                    content = `---\n${existing.raw}\n---\n\n${content}`;
                }
            } else {
                const { systemDefaults, userDefaults } = await getFrontMatterDefaults();
                const baseTitle = path.basename(filename, ext);
                const now = formatFrontMatterTimestamp();
                const frontMatter = {
                    title: baseTitle,
                    created_timestamp: now,
                    modified_timestamp: now,
                    ...systemDefaults,
                    ...userDefaults
                };
                content = `${buildFrontMatter(frontMatter)}${content}`;
            }
        }
    }

    if (previousContent !== null && previousContent !== content) {
        const previousDir = await getPreviousDir(filename);
        if (previousDir) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const snapshotPath = path.join(previousDir, `${timestamp}.md`);
            await fs.writeFile(snapshotPath, previousContent, 'utf-8');
        }
    }

    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, content, 'utf-8');

    // Update search index
    if (searchIndexer) {
        await searchIndexer.indexFile(filepath).catch(err =>
            console.error('[FileManager] Search index update failed:', err)
        );
    }

    await buildIndex();

    return { content };
}

/**
 * Create a new file
 */
async function createFile(filename) {
    if (!notesDir) {
        throw new Error('No folder open');
    }
    if (!filename.endsWith('.md')) {
        filename += '.md';
    }

    await ensureNotesDir(notesDir);
    const filepath = resolveSafePath(filename);

    try {
        await fs.access(filepath);
        throw new Error('File already exists');
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }

    await fs.mkdir(path.dirname(filepath), { recursive: true });

    const { systemDefaults, userDefaults } = await getFrontMatterDefaults();
    const ext = path.extname(filename).toLowerCase();
    const baseTitle = path.basename(filename, ext);
    const now = formatFrontMatterTimestamp();
    const frontMatter = {
        title: baseTitle,
        created_timestamp: now,
        modified_timestamp: now,
        ...systemDefaults,
        ...userDefaults
    };
    const content = `${buildFrontMatter(frontMatter)}`;

    await fs.writeFile(filepath, content, 'utf-8');
    await buildIndex();
    return filename;
}

/**
 * Create a new folder
 */
async function createFolder(folderName) {
    if (!notesDir) {
        throw new Error('No folder open');
    }
    if (!folderName) {
        throw new Error('Invalid folder name');
    }

    await ensureNotesDir(notesDir);
    const folderPath = resolveSafePath(folderName);

    try {
        await fs.access(folderPath);
        throw new Error('Folder already exists');
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }

    await fs.mkdir(folderPath, { recursive: true });
    await buildIndex();
    return folderName;
}

/**
 * Undo last saved version
 */
async function undoFile(filename) {
    const previousDir = await getPreviousDir(filename);
    if (!previousDir) {
        throw new Error('No previous versions');
    }

    const entries = await fs.readdir(previousDir);
    if (!entries.length) {
        throw new Error('No previous versions');
    }

    const sorted = entries.filter((e) => e.endsWith('.md')).sort().reverse();
    if (!sorted.length) {
        throw new Error('No previous versions');
    }

    const latestPath = path.join(previousDir, sorted[0]);
    const restoredContent = await fs.readFile(latestPath, 'utf-8');

    const filepath = resolveSafePath(filename);
    let currentContent = null;
    try {
        currentContent = await fs.readFile(filepath, 'utf-8');
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }

    if (currentContent !== null && currentContent !== restoredContent) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const snapshotPath = path.join(previousDir, `${timestamp}-redo.md`);
        await fs.writeFile(snapshotPath, currentContent, 'utf-8');
    }

    await fs.writeFile(filepath, restoredContent, 'utf-8');
    await buildIndex();
    return restoredContent;
}

/**
 * Delete a file or folder
 */
async function deleteFile(filename) {
    const filepath = resolveSafePath(filename);
    const stat = await fs.lstat(filepath);
    if (stat.isDirectory()) {
        await fs.rm(filepath, { recursive: true, force: true });
    } else {
        await fs.unlink(filepath);
    }

    // Remove from search index
    if (searchIndexer) {
        await searchIndexer.removeFile(filepath).catch(err =>
            console.error('[FileManager] Search index removal failed:', err)
        );
    }

    await buildIndex();
}

async function importFile(sourcePath, targetDir = '') {
    if (!notesDir) {
        throw new Error('No folder open');
    }
    if (!sourcePath) {
        throw new Error('Invalid source path');
    }

    const safeTargetDir = targetDir ? resolveSafePath(targetDir) : notesDir;
    const baseName = path.basename(sourcePath);
    const targetPath = await getUniquePath(path.join(safeTargetDir, baseName));

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(sourcePath, targetPath);
    await buildIndex();
    return path.relative(notesDir, targetPath);
}

/**
 * Move or rename a file
 */
async function moveFile(sourcePath, targetPath) {
    if (!notesDir) {
        throw new Error('No folder open');
    }

    // Resolve paths relative to notesDir if they are relative
    const resolvedSource = path.isAbsolute(sourcePath) ? sourcePath : resolveSafePath(sourcePath);
    const resolvedTarget = path.isAbsolute(targetPath) ? targetPath : resolveSafePath(targetPath);

    // Validate existence
    try {
        await fs.access(resolvedSource);
    } catch {
        throw new Error('Source file does not exist');
    }

    // Check if target exists
    try {
        await fs.access(resolvedTarget);
        throw new Error('Target file already exists');
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }

    // Ensure target directory exists
    await fs.mkdir(path.dirname(resolvedTarget), { recursive: true });

    // Rename (move)
    await fs.rename(resolvedSource, resolvedTarget);

    // Update search index
    if (searchIndexer) {
        await searchIndexer.removeFile(resolvedSource).catch(() => { });
        await searchIndexer.indexFile(resolvedTarget).catch(() => { });
    }

    await buildIndex();
    return path.relative(notesDir, resolvedTarget);
}

/**
 * Get the workspace display name (folder name only, not full path)
 */
function getWorkspaceName() {
    if (!notesDir) return null;
    return path.basename(notesDir);
}

/**
 * Get default workspace state
 */
function getDefaultWorkspaceState() {
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
            previewEnabled: true
        },
        expandedFolders: [],
        chat: {
            agent: 'default',
            role: 'user',
            model: 'default'
        }
    };
}

/**
 * Load workspace state from .x0v3rt/workspace-state.json
 */
async function loadWorkspaceState() {
    if (!notesDir) return getDefaultWorkspaceState();

    const statePath = path.join(notesDir, META_DIRNAME, WORKSPACE_STATE_FILENAME);

    try {
        const data = await fs.readFile(statePath, 'utf-8');
        const state = JSON.parse(data);
        // Merge with defaults to handle schema updates
        return { ...getDefaultWorkspaceState(), ...state };
    } catch (error) {
        // File doesn't exist yet, return defaults
        return getDefaultWorkspaceState();
    }
}

/**
 * Save workspace state to .x0v3rt/workspace-state.json
 */
async function saveWorkspaceState(state) {
    if (!notesDir) {
        throw new Error('No workspace directory set');
    }

    await ensureMetaDir();
    const statePath = path.join(notesDir, META_DIRNAME, WORKSPACE_STATE_FILENAME);
    await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Save clipboard image data to an assets folder within the workspace
 * @param {object} payload
 * @param {string} payload.base64 - Base64-encoded image data
 * @param {string} payload.mimeType - Image MIME type (e.g. image/png)
 * @param {string} [payload.relativeDir] - Note-relative directory
 * @param {string} [payload.baseName] - Base filename stem
 */
async function saveClipboardImage(payload = {}) {
    if (!notesDir) {
        throw new Error('No workspace directory set');
    }

    const { base64, mimeType, relativeDir, baseName } = payload;
    if (!base64 || typeof base64 !== 'string') {
        throw new Error('No image data provided');
    }

    const extension = String(mimeType || 'image/png').split('/')[1] || 'png';
    const safeName = sanitizeFilename(baseName || 'screenshot');
    const suffix = crypto.randomBytes(4).toString('hex');
    const filename = `${safeName}-${buildTimestamp()}-${suffix}.${extension}`;

    const screenshotsDir = path.join(relativeDir || '', 'screenshots');
    const relativePath = path.join(screenshotsDir, filename);
    const targetPath = resolveSafePath(relativePath);

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, Buffer.from(base64, 'base64'));

    return {
        path: path.relative(notesDir, targetPath).replace(/\\/g, '/')
    };
}

/**
 * Register IPC handlers
 */
function registerHandlers() {
    ipcMain.handle('file:list', async (_event, options = {}) => {
        try {
            return await listFiles(options);
        } catch (error) {
            console.error('List files error:', error);
            throw error;
        }
    });

    ipcMain.handle('file:read', async (_event, filename, options = {}) => {
        try {
            return await readFile(filename, options);
        } catch (error) {
            if (error?.code === 'ENOENT') {
                return { missing: true };
            }
            console.error('Read file error:', error);
            throw error;
        }
    });

    ipcMain.handle('file:read-binary', async (_event, filename, options = {}) => {
        try {
            return await readFileBinary(filename, options);
        } catch (error) {
            console.error('Read binary error:', error);
            throw error;
        }
    });

    ipcMain.handle('file:write', async (_event, filename, content) => {
        try {
            const result = await writeFile(filename, content);
            return { success: true, content: result?.content };
        } catch (error) {
            console.error('Write file error:', error);
            throw error;
        }
    });

    ipcMain.handle('file:create', async (_event, filename) => {
        try {
            const actualFilename = await createFile(filename);
            return { success: true, filename: actualFilename };
        } catch (error) {
            console.error('Create file error:', error);
            throw error;
        }
    });

    ipcMain.handle('file:create-folder', async (_event, folderName) => {
        try {
            const actualName = await createFolder(folderName);
            return { success: true, folder: actualName };
        } catch (error) {
            console.error('Create folder error:', error);
            throw error;
        }
    });

    ipcMain.handle('file:undo', async (_event, filename) => {
        try {
            const content = await undoFile(filename);
            return { success: true, content };
        } catch (error) {
            console.error('Undo file error:', error);
            throw error;
        }
    });

    ipcMain.handle('file:delete', async (_event, filename) => {
        try {
            await deleteFile(filename);
            return { success: true };
        } catch (error) {
            console.error('Delete file error:', error);
            throw error;
        }
    });

    ipcMain.handle('file:import', async (_event, sourcePath, targetDir) => {
        try {
            const relativePath = await importFile(sourcePath, targetDir);
            return { success: true, path: relativePath };
        } catch (error) {
            console.error('Import file error:', error);
            throw error;
        }
    });

    ipcMain.handle('file:move', async (_event, sourcePath, targetPath) => {
        try {
            const newPath = await moveFile(sourcePath, targetPath);
            return { success: true, path: newPath };
        } catch (error) {
            console.error('Move file error:', error);
            throw error;
        }
    });

    ipcMain.handle('file:get-workspace-name', async () => {
        try {
            return getWorkspaceName();
        } catch (error) {
            console.error('Get workspace name error:', error);
            throw error;
        }
    });

    ipcMain.handle('file:get-workspace-path', async () => {
        try {
            return getNotesDir();
        } catch (error) {
            console.error('Get workspace path error:', error);
            throw error;
        }
    });

    ipcMain.handle('file:open-workspace', async () => {
        try {
            const dir = getNotesDir();
            if (!dir) {
                throw new Error('No folder open');
            }
            const result = await shell.openPath(dir);
            if (result) {
                throw new Error(result);
            }
            return { success: true };
        } catch (error) {
            console.error('Open workspace error:', error);
            throw error;
        }
    });

    ipcMain.handle('workspace:load-state', async () => {
        try {
            return await loadWorkspaceState();
        } catch (error) {
            console.error('Load workspace state error:', error);
            throw error;
        }
    });

    ipcMain.handle('workspace:save-state', async (_event, state) => {
        try {
            await saveWorkspaceState(state);
            return { success: true };
        } catch (error) {
            console.error('Save workspace state error:', error);
            throw error;
        }
    });

    ipcMain.handle('chat:new', async () => {
        try {
            const session = await createChatSession();
            return { success: true, session };
        } catch (error) {
            console.error('Chat new error:', error);
            throw error;
        }
    });

    ipcMain.handle('chat:append', async (_event, sessionId, message) => {
        try {
            await appendChatMessage(sessionId, message);
            return { success: true };
        } catch (error) {
            console.error('Chat append error:', error);
            throw error;
        }
    });

    ipcMain.handle('chat:get', async (_event, sessionId) => {
        try {
            const session = await getChatHistory(sessionId);
            return { success: true, session };
        } catch (error) {
            console.error('Chat get error:', error);
            throw error;
        }
    });

    ipcMain.handle('chat:list', async () => {
        try {
            const sessions = await listChatSessions();
            return { success: true, sessions };
        } catch (error) {
            console.error('Chat list error:', error);
            throw error;
        }
    });

    ipcMain.handle('chat:delete', async (_event, sessionId) => {
        try {
            await deleteChatSession(sessionId);
            return { success: true };
        } catch (error) {
            console.error('Chat delete error:', error);
            throw error;
        }
    });

    ipcMain.handle('chat:update', async (_event, sessionId, updates) => {
        try {
            const session = await updateChatSession(sessionId, updates || {});
            return { success: true, session };
        } catch (error) {
            console.error('Chat update error:', error);
            throw error;
        }
    });

    ipcMain.handle('chat:search', async (_event, sessionId, query, limit) => {
        try {
            return await searchChatHistory(sessionId, query, limit);
        } catch (error) {
            console.error('Chat search error:', error);
            throw error;
        }
    });

    ipcMain.handle('chat:read', async (_event, sessionId, options) => {
        try {
            return await readChatHistory(sessionId, options);
        } catch (error) {
            console.error('Chat read error:', error);
            throw error;
        }
    });

    ipcMain.handle('file:set-active', async (_event, filename) => {
        try {
            setActiveFile(filename);
            return { success: true };
        } catch (error) {
            console.error('Set active file error:', error);
            throw error;
        }
    });

    ipcMain.handle('file:get-active', async () => {
        try {
            return await getActiveFile();
        } catch (error) {
            console.error('Get active file error:', error);
            throw error;
        }
    });

    ipcMain.handle('clipboard:save-image', async (_event, payload) => {
        try {
            return await saveClipboardImage(payload);
        } catch (error) {
            console.error('Clipboard image save error:', error);
            throw error;
        }
    });

    ipcMain.handle('search:query', async (_event, query) => {
        try {
            if (!searchIndexer) {
                return [];
            }
            const results = searchIndexer.search(query);
            return results || [];
        } catch (error) {
            console.error('Search query error:', error);
            return [];
        }
    });

    ipcMain.handle('search:reindex', async () => {
        try {
            if (!searchIndexer) {
                throw new Error('Search indexer not initialized');
            }
            await searchIndexer.rebuildIndex();
            return { success: true };
        } catch (error) {
            console.error('Search reindex error:', error);
            throw error;
        }
    });

    ipcMain.handle('shell:open-external', async (_event, url) => {
        try {
            await shell.openExternal(url);
            return { success: true };
        } catch (error) {
            console.error('Open external error:', error);
            throw error;
        }
    });
}

async function createChatSession() {
    const chatDir = await ensureChatDir();
    if (!chatDir) {
        throw new Error('No folder open');
    }

    const sessionId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();
    const session = {
        id: sessionId,
        title: 'New Chat',
        createdAt: now,
        updatedAt: now,
        workspacePath: notesDir,
        messages: []
    };
    const sessionPath = path.join(chatDir, `${sessionId}.json`);
    await fs.writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
    return session;
}

async function appendChatMessage(sessionId, message) {
    if (!sessionId) {
        throw new Error('Invalid session id');
    }
    const chatDir = await ensureChatDir();
    if (!chatDir) {
        throw new Error('No folder open');
    }
    const sessionPath = path.join(chatDir, `${sessionId}.json`);

    let session = null;
    try {
        const raw = await fs.readFile(sessionPath, 'utf-8');
        session = JSON.parse(raw);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }

    if (!session) {
        const now = new Date().toISOString();
        session = {
            id: sessionId,
            title: 'New Chat',
            createdAt: now,
            updatedAt: now,
            workspacePath: notesDir,
            messages: []
        };
    }

    session.messages.push({
        ...message,
        id: message.id || `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        timestamp: message.timestamp || new Date().toISOString()
    });

    // Update session metadata
    session.updatedAt = new Date().toISOString();

    // Auto-generate title from first user message if still default
    if (message.role === 'user'
        && session.messages.filter(m => m.role === 'user').length === 1
        && (!session.title || session.title === 'New Chat')) {
        const content = message.content || '';
        session.title = content.slice(0, 50).trim();
        if (content.length > 50) {
            session.title += '...';
        }
    }

    await fs.writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
}

async function getChatHistory(sessionId) {
    if (!sessionId) {
        throw new Error('Invalid session id');
    }
    const chatDir = await ensureChatDir();
    if (!chatDir) {
        throw new Error('No folder open');
    }
    const sessionPath = path.join(chatDir, `${sessionId}.json`);
    const raw = await fs.readFile(sessionPath, 'utf-8');
    return JSON.parse(raw);
}

async function listChatSessions() {
    const chatDir = await ensureChatDir();
    if (!chatDir) {
        throw new Error('No folder open');
    }
    const entries = await fs.readdir(chatDir);
    const sessions = [];
    for (const entry of entries) {
        if (!entry.endsWith('.json')) continue;
        try {
            const raw = await fs.readFile(path.join(chatDir, entry), 'utf-8');
            const session = JSON.parse(raw);

            // Auto-generate title for legacy sessions
            let title = session.title || 'New Chat';
            if (!session.title && session.messages && session.messages.length > 0) {
                const firstUserMsg = session.messages.find(m => m.role === 'user');
                if (firstUserMsg) {
                    const content = firstUserMsg.content || '';
                    title = content.slice(0, 50).trim();
                    if (content.length > 50) {
                        title += '...';
                    }
                }
            }

            sessions.push({
                id: session.id,
                title,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt || session.createdAt,
                messageCount: session.messages?.length || 0
            });
        } catch (error) {
            console.warn('Failed to read chat session:', entry, error.message);
        }
    }
    // Sort by updatedAt DESC (most recent first)
    sessions.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return sessions;

}

async function deleteChatSession(sessionId) {
    if (!sessionId) {
        throw new Error('Invalid session id');
    }
    const chatDir = await ensureChatDir();
    if (!chatDir) {
        throw new Error('No folder open');
    }
    const sessionPath = path.join(chatDir, `${sessionId}.json`);

    try {
        await fs.access(sessionPath);
        await fs.unlink(sessionPath);
        return { success: true };
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error('Session not found');
        }
        throw error;
    }
}

async function searchChatHistory(sessionId, query, limit = 10) {
    if (!sessionId) {
        throw new Error('Invalid session id');
    }
    const chatDir = await ensureChatDir();
    if (!chatDir) {
        throw new Error('No folder open');
    }
    const sessionPath = path.join(chatDir, `${sessionId}.json`);
    const raw = await fs.readFile(sessionPath, 'utf-8');
    const session = JSON.parse(raw);
    const q = String(query || '').toLowerCase().trim();
    if (!q) return [];

    const results = [];
    const messages = Array.isArray(session.messages) ? session.messages : [];
    for (let i = 0; i < messages.length; i += 1) {
        const msg = messages[i];
        const content = String(msg.content || '');
        const lower = content.toLowerCase();
        if (!lower.includes(q)) continue;

        const idx = lower.indexOf(q);
        const start = Math.max(0, idx - 60);
        const end = Math.min(content.length, idx + q.length + 60);
        let snippet = content.slice(start, end);
        if (start > 0) snippet = `…${snippet}`;
        if (end < content.length) snippet = `${snippet}…`;

        results.push({
            id: msg.id,
            role: msg.role,
            timestamp: msg.timestamp,
            snippet,
            index: i
        });

        if (results.length >= limit) break;
    }

    return results;
}

async function readChatHistory(sessionId, options = {}) {
    if (!sessionId) {
        throw new Error('Invalid session id');
    }
    const chatDir = await ensureChatDir();
    if (!chatDir) {
        throw new Error('No folder open');
    }
    const sessionPath = path.join(chatDir, `${sessionId}.json`);
    const raw = await fs.readFile(sessionPath, 'utf-8');
    const session = JSON.parse(raw);
    const messages = Array.isArray(session.messages) ? session.messages : [];

    const offset = Number.isFinite(options.offset) ? Number(options.offset) : 0;
    const limit = Number.isFinite(options.limit) ? Number(options.limit) : 20;
    const fromEnd = Boolean(options.fromEnd);

    let start = offset;
    if (fromEnd) {
        start = Math.max(0, messages.length - offset - limit);
    }

    const slice = messages.slice(start, start + limit).map((msg, idx) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        index: start + idx
    }));

    return {
        sessionId,
        total: messages.length,
        messages: slice
    };
}

async function updateChatSession(sessionId, updates = {}) {
    if (!sessionId) {
        throw new Error('Invalid session id');
    }
    const chatDir = await ensureChatDir();
    if (!chatDir) {
        throw new Error('No folder open');
    }
    const sessionPath = path.join(chatDir, `${sessionId}.json`);
    const raw = await fs.readFile(sessionPath, 'utf-8');
    const session = JSON.parse(raw);

    if (!session) {
        throw new Error('Session not found');
    }

    if (typeof updates.title === 'string') {
        session.title = updates.title.trim() || session.title || 'New Chat';
    }

    session.updatedAt = new Date().toISOString();

    await fs.writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
    return session;
}

async function getUniquePath(targetPath) {
    let candidate = targetPath;
    const dir = path.dirname(targetPath);
    const ext = path.extname(targetPath);
    const base = path.basename(targetPath, ext);

    let counter = 1;
    while (true) {
        try {
            await fs.access(candidate);
            candidate = path.join(dir, `${base} (${counter})${ext}`);
            counter += 1;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return candidate;
            }
            throw error;
        }
    }
}

function getMimeType(filename) {
    const lower = String(filename).toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.svg')) return 'image/svg+xml';
    return 'application/octet-stream';
}

async function buildIndex() {
    if (!notesDir) return null;
    await ensureNotesDir(notesDir);
    const tree = await scanDir(notesDir, '', { includeHidden: false, includeMeta: false });
    const files = flattenFiles(tree);
    const updatedAt = new Date().toISOString();
    cachedIndex = { updatedAt, tree, files };

    const metaDir = await ensureMetaDir();
    if (metaDir) {
        const indexPath = path.join(metaDir, INDEX_FILENAME);
        await fs.writeFile(indexPath, JSON.stringify(cachedIndex, null, 2), 'utf-8');
    }

    notifyIndexUpdated(cachedIndex);
    return cachedIndex;
}

async function scanDir(dirPath, relativePath, options = {}) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const children = [];
    const includeHidden = Boolean(options.includeHidden);
    const includeMeta = Boolean(options.includeMeta);

    for (const entry of entries) {
        if (entry.name === META_DIRNAME && !includeMeta) {
            continue;
        }
        if (!includeHidden && entry.name.startsWith('.')) {
            continue;
        }

        const relPath = relativePath ? path.join(relativePath, entry.name) : entry.name;
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
            const child = await scanDir(fullPath, relPath, options);
            children.push(child);
        } else {
            children.push({
                type: 'file',
                name: entry.name,
                path: relPath
            });
        }
    }

    children.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true });
    });

    return {
        type: 'folder',
        name: relativePath ? path.basename(relativePath) : '',
        path: relativePath,
        children
    };
}

function flattenFiles(tree) {
    const result = [];
    if (!tree) return result;
    for (const child of tree.children) {
        if (child.type === 'file') {
            result.push(child.path);
        } else if (child.type === 'folder') {
            result.push(...flattenFiles(child));
        }
    }
    return result;
}

function notifyIndexUpdated(index) {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
        win.webContents.send('notes:index-updated', index);
    });
}

function startWatcher() {
    if (!notesDir) return;
    stopWatcher();

    try {
        watcher = fsSync.watch(notesDir, { recursive: true }, (_eventType, filename) => {
            if (!filename) return;
            const targetPath = path.join(notesDir, filename.toString());
            if (isMetaPath(targetPath)) return;

            if (watcherTimer) clearTimeout(watcherTimer);
            watcherTimer = setTimeout(() => {
                buildIndex().catch((error) => console.error('Index rebuild error:', error));
            }, 250);
        });
    } catch (error) {
        console.error('Failed to start watcher:', error);
    }
}

function stopWatcher() {
    if (watcher) {
        watcher.close();
        watcher = null;
    }
    if (watcherTimer) {
        clearTimeout(watcherTimer);
        watcherTimer = null;
    }
}

module.exports = {
    registerHandlers,
    ensureNotesDir,
    initializeNotesDir,
    getNotesDir,
    setNotesDir,
    getWorkspaceName,
    deleteFile,
    moveFile,
    undoFile,
    setActiveFile,
    getActiveFile,
    loadWorkspaceState,
    saveWorkspaceState,
    DEFAULT_NOTES_DIR
};
