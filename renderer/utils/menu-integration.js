/**
 * Menu event listeners
 * Handles IPC events from the application menu
 */

import PreferencesManager from '../preferences-manager.js';

// Listen for menu events
window.IPC.on('menu:open-system-preferences', async () => {
    await PreferencesManager.openSystemPreferences();
});

window.IPC.on('menu:open-user-preferences', async () => {
    await PreferencesManager.openUserPreferences();
});

console.log('[Menu Integration] Registered menu event listeners');
