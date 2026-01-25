/**
 * Electron Main Process - Entry Point
 *
 * Handles app lifecycle, window management, and IPC handlers.
 * Follows Electron security best practices:
 * - Context isolation enabled
 * - Node integration disabled in renderer
 * - Preload script for controlled IPC access
 */

const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fileManager = require('./file-manager');
const ai = require('./ai');
const terminal = require('./terminal');
const extensions = require('./extensions');
const settingsManager = require('./settings-manager');

// Enable development mode if --dev flag is passed
const isDev = process.argv.includes('--dev');

let mainWindow;

async function openNotesFolder() {
    if (!mainWindow) return { canceled: true };

    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Open Folder',
        properties: ['openDirectory']
    });

    if (result.canceled || !result.filePaths?.length) {
        return { canceled: true };
    }

    const selectedPath = result.filePaths[0];
    await fileManager.setNotesDir(selectedPath);

    mainWindow.webContents.send('notes:folder-changed', {
        notesDir: fileManager.getNotesDir()
    });

    return { canceled: false, notesDir: selectedPath };
}

function createAppMenu() {
    const isMac = process.platform === 'darwin';

    const template = [
        ...(isMac
            ? [{
                label: app.name,
                submenu: [
                    { role: 'about' },
                    { type: 'separator' },
                    { role: 'services' },
                    { type: 'separator' },
                    { role: 'hide' },
                    { role: 'hideOthers' },
                    { role: 'unhide' },
                    { type: 'separator' },
                    { role: 'quit' }
                ]
            }]
            : []),
        {
            label: 'File',
            submenu: [
                {
                    label: 'Open Folder...',
                    accelerator: 'Ctrl+O',
                    click: async () => {
                        await openNotesFolder();
                    }
                },
                { type: 'separator' },
                {
                    label: 'System Preferences...',
                    accelerator: isMac ? 'Cmd+,' : 'Ctrl+,',
                    click: () => {
                        // Send IPC to renderer to open System Preferences
                        if (mainWindow) {
                            mainWindow.webContents.send('menu:open-system-preferences');
                        }
                    }
                },
                {
                    label: 'User Preferences...',
                    accelerator: isMac ? 'Cmd+Shift+,' : 'Ctrl+Shift+,',
                    click: () => {
                        // Send IPC to renderer to open User Preferences
                        if (mainWindow) {
                            mainWindow.webContents.send('menu:open-user-preferences');
                        }
                    }
                },
                { type: 'separator' },
                { role: isMac ? 'close' : 'quit' }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Terminal',
            submenu: [
                {
                    label: 'Toggle Terminal',
                    accelerator: 'Ctrl+`',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.webContents.send('terminal:toggle');
                        }
                    }
                }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(isMac
                    ? [{ type: 'separator' }, { role: 'front' }, { type: 'separator' }, { role: 'window' }]
                    : [{ role: 'close' }])
            ]
        },
        {
            role: 'help',
            submenu: [
                {
                    label: 'About',
                    click: async () => {
                        const { shell } = require('electron');
                        await shell.openExternal('https://github.com/J0n-H4rr150n/x0v3rt');
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

/**
 * Create the main application window
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        title: 'x0v3rt',
        backgroundColor: '#0a0a0a', // Dark background
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        },
        icon: path.join(__dirname, '../build/icon.png')
    });

    // Load the built renderer
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));

    // Open DevTools in development mode
    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

/**
 * App Lifecycle Events
 */

app.whenReady().then(async () => {
    // Initialize modules
    fileManager.registerHandlers();
    ai.registerHandlers();
    ai.initializeAI();
    terminal.registerHandlers();
    extensions.registerHandlers();
    settingsManager.registerHandlers();

    // Load last notes folder (if any)
    await fileManager.initializeNotesDir();

    createWindow();
    createAppMenu();

    // macOS: Re-create window when dock icon is clicked
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Quit when all windows are closed (except macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

/**
 * IPC Handlers
 * These will be expanded as features are added
 */

// Health check
ipcMain.handle('ping', async () => {
    return 'pong';
});

// Get app version
ipcMain.handle('get-app-version', async () => {
    return app.getVersion();
});

ipcMain.handle('file:choose-folder', async () => {
    return await openNotesFolder();
});

// Graceful shutdown
process.on('SIGTERM', () => {
    app.quit();
});
