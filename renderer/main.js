/**
 * Main entry point for the renderer process
 * Imports and initializes all modules
 */

import CodeMirrorEditor from './editor/codemirror-editor.js';
import './notes/notes-ui.js';
import './utils/dialog.js';
import './utils/ipc-client.js';
import './utils/layout.js';
import './utils/search-ui.js';
import './utils/menu-integration.js';
import './utils/settings-ipc.js';
import './utils/extensions-ipc.js';
import './utils/workspace-state.js';
import './utils/view-manager.js';
import './extensions/extension-registry.js';
import './extensions/extensions-ui.js';
import './ai/chat-ui.js';
import './ai/context-builder.js';
import './terminal/terminal-ui.js';
import PreferencesManager from './preferences-manager.js';

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Main] DOM loaded, initializing...');

    // Test IPC connection
    try {
        const pong = await window.electronAPI.invoke('ping');
        console.log('IPC connection:', pong);

        const version = await window.electronAPI.invoke('get-app-version');
        console.log('App version:', version);
    } catch (error) {
        console.error('IPC test failed:', error);
    }

    // Load workspace state
    await window.WorkspaceState.load();

    // Initialize layout
    window.Layout.init();

    // Initialize notes UI
    window.NotesUI.init();

    // Initialize CodeMirror editor
    CodeMirrorEditor.init();
    await CodeMirrorEditor.restoreTabsFromWorkspaceState?.();

    // Initialize AI chat UI
    window.ChatUI.init();

    // Initialize terminal UI
    window.TerminalUI.init();

    // Initialize Extension Registry
    await window.ExtensionRegistry.initialize().catch(error => {
        console.error('Extension Registry initialization error:', error);
    });

    // Initialize Extensions UI
    window.ExtensionsUI.init();

    // Load and apply user preferences
    await PreferencesManager.initializePreferences();

    console.log('[Main] Initialization complete');

    const topToggleLeft = document.getElementById('top-toggle-left');
    const topToggleRight = document.getElementById('top-toggle-right');
    const topToggleTerminal = document.getElementById('top-toggle-terminal');
    const explorerSettingsToggle = document.getElementById('explorer-settings-toggle');
    const explorerSettingsPanel = document.getElementById('explorer-settings-panel');
    const explorerAddBtn = document.getElementById('new-note-btn');
    const explorerAddMenu = document.getElementById('explorer-add-menu');
    const aiSettingsToggle = document.getElementById('ai-settings-toggle');
    const aiConfigPanel = document.getElementById('ai-config-panel');
    const aiConfigClose = document.getElementById('ai-config-close');

    topToggleLeft?.addEventListener('click', () => window.Layout?.toggleSidebar('left'));
    topToggleRight?.addEventListener('click', () => window.Layout?.toggleSidebar('right'));
    topToggleTerminal?.addEventListener('click', () => window.TerminalUI?.toggle());

    if (explorerAddBtn && explorerAddMenu) {
        explorerAddBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            explorerAddMenu.classList.toggle('hidden');
        });

        document.addEventListener('click', (event) => {
            if (explorerAddMenu.classList.contains('hidden')) return;
            const target = event.target;
            if (explorerAddMenu.contains(target) || explorerAddBtn.contains(target)) return;
            explorerAddMenu.classList.add('hidden');
        });
    }

    if (explorerSettingsToggle && explorerSettingsPanel) {
        explorerSettingsToggle.addEventListener('click', (event) => {
            event.stopPropagation();
            explorerSettingsPanel.classList.toggle('hidden');
        });
        document.addEventListener('click', (event) => {
            if (explorerSettingsPanel.classList.contains('hidden')) return;
            const target = event.target;
            if (explorerSettingsPanel.contains(target) || explorerSettingsToggle.contains(target)) return;
            explorerSettingsPanel.classList.add('hidden');
        });
    }

    if (aiSettingsToggle && aiConfigPanel) {
        aiSettingsToggle.addEventListener('click', (event) => {
            event.stopPropagation();
            aiConfigPanel.classList.toggle('hidden');
        });
    }

    if (aiConfigClose && aiConfigPanel) {
        aiConfigClose.addEventListener('click', () => {
            aiConfigPanel.classList.add('hidden');
        });
    }
});
