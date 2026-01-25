/**
 * Preferences Manager
 * Handles opening preference dialogs and applying user preferences
 */

import SystemPreferencesDialog from './preferences/system-preferences.js';
import UserPreferencesDialog from './preferences/user-preferences.js';

class PreferencesManager {
    constructor() {
        this.systemDialog = null;
        this.userDialog = null;
    }

    /**
     * Open System Preferences dialog
     */
    async openSystemPreferences() {
        if (this.systemDialog) {
            return; // Already open
        }

        this.systemDialog = new SystemPreferencesDialog();
        await this.systemDialog.show();

        // Clean up reference when dialog closes
        const originalClose = this.systemDialog.close.bind(this.systemDialog);
        this.systemDialog.close = () => {
            originalClose();
            this.systemDialog = null;
        };
    }

    /**
     * Open User Preferences dialog
     */
    async openUserPreferences() {
        if (this.userDialog) {
            return; // Already open
        }

        this.userDialog = new UserPreferencesDialog();
        await this.userDialog.show();

        // Clean up reference when dialog closes
        const originalClose = this.userDialog.close.bind(this.userDialog);
        this.userDialog.close = () => {
            originalClose();
            this.userDialog = null;
        };
    }

    /**
     * Load and apply user preferences on startup
     */
    async initializePreferences() {
        try {
            const userPrefs = await window.SettingsIPC.getUserPreferences();
            this.applyUserPreferences(userPrefs);
        } catch (error) {
            console.error('Failed to load user preferences:', error);
        }
    }

    /**
     * Apply user preferences to DOM
     */
    applyUserPreferences(prefs) {
        const root = document.documentElement;
        const appearance = prefs.appearance;

        // Apply font settings via CSS variables
        root.style.setProperty('--user-font-family', appearance.fontFamily);
        root.style.setProperty('--user-font-size', `${appearance.fontSize}px`);
        root.style.setProperty('--user-editor-font', appearance.editorFontFamily);
        root.style.setProperty('--user-editor-font-size', `${appearance.editorFontSize}px`);
        root.style.setProperty('--user-line-height', appearance.lineHeight);

        // Apply theme
        if (appearance.theme !== 'auto') {
            document.body.className = `${appearance.theme}-theme`;
        }
    }
}

// Create singleton instance
const preferencesManager = new PreferencesManager();

// Expose globally
window.PreferencesManager = preferencesManager;

export default preferencesManager;
