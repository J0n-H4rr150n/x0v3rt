/**
 * Extensions UI
 *
 * Manages the extensions sidebar view, displaying available and enabled extensions
 */

const ExtensionsUI = {
    container: null,
    initialized: false,

    /**
     * Initialize the extensions UI
     */
    init() {
        this.container = document.getElementById('extensions-container');

        if (!this.container) {
            console.error('[ExtensionsUI] Container not found');
            return;
        }

        this.initialized = true;
        this.render();

        console.log('[ExtensionsUI] Initialized');
    },

    /**
     * Render the extensions list
     */
    async render() {
        if (!this.container) return;

        try {
            // Wait for Extension Registry to be ready
            if (!window.ExtensionRegistry.initialized) {
                await window.ExtensionRegistry.initialize();
            }

            const extensions = window.ExtensionRegistry.getExtensions();

            // Clear container
            this.container.innerHTML = '';

            // Create enabled and available sections
            const enabled = extensions.filter(ext => ext.enabled);
            const available = extensions.filter(ext => !ext.enabled);

            // Render enabled extensions
            if (enabled.length > 0) {
                const enabledSection = this.createSection('Enabled', enabled);
                this.container.appendChild(enabledSection);
            }

            // Render available extensions
            if (available.length > 0) {
                const availableSection = this.createSection('Available', available);
                this.container.appendChild(availableSection);
            }

            // Add placeholder if no extensions
            if (extensions.length === 0) {
                const placeholder = document.createElement('div');
                placeholder.className = 'extensions-placeholder';
                placeholder.textContent = 'No extensions available';
                this.container.appendChild(placeholder);
            }

        } catch (error) {
            console.error('[ExtensionsUI] Render error:', error);
        }
    },

    /**
     * Create a section of extensions
     */
    createSection(title, extensions) {
        const section = document.createElement('div');
        section.className = 'extensions-section';

        const header = document.createElement('h3');
        header.className = 'extensions-section-title';
        header.textContent = title;
        section.appendChild(header);

        extensions.forEach(extension => {
            const item = this.createExtensionItem(extension);
            section.appendChild(item);
        });

        return section;
    },

    /**
     * Create an extension list item
     */
    createExtensionItem(extension) {
        const item = document.createElement('div');
        item.className = 'extension-item';

        // Icon and info
        const info = document.createElement('div');
        info.className = 'extension-info';

        const icon = document.createElement('span');
        icon.className = 'extension-icon';
        icon.textContent = extension.icon || '🔌';

        const details = document.createElement('div');
        details.className = 'extension-details';

        const name = document.createElement('div');
        name.className = 'extension-name';
        name.textContent = extension.name;

        const description = document.createElement('div');
        description.className = 'extension-description';
        description.textContent = extension.description;

        details.appendChild(name);
        details.appendChild(description);

        info.appendChild(icon);
        info.appendChild(details);

        // Toggle switch
        const toggle = this.createToggleSwitch(extension);

        item.appendChild(info);
        item.appendChild(toggle);

        // Click to expand/show details (future enhancement)
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.toggle-switch')) {
                this.showExtensionDetails(extension);
            }
        });

        return item;
    },

    /**
     * Create a toggle switch for an extension
     */
    createToggleSwitch(extension) {
        const label = document.createElement('label');
        label.className = 'toggle-switch';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = extension.enabled;
        checkbox.addEventListener('change', async (e) => {
            e.stopPropagation();
            await this.toggleExtension(extension.id, checkbox.checked);
        });

        const slider = document.createElement('span');
        slider.className = 'slider';

        label.appendChild(checkbox);
        label.appendChild(slider);

        return label;
    },

    /**
     * Toggle an extension on/off
     */
    async toggleExtension(extensionId, enabled) {
        try {
            await window.ExtensionRegistry.toggleExtension(extensionId, enabled);
            await this.render(); // Re-render to move between sections
            console.log(`[ExtensionsUI] Extension ${extensionId} ${enabled ? 'enabled' : 'disabled'}`);
        } catch (error) {
            console.error('[ExtensionsUI] Toggle error:', error);
            alert(`Failed to ${enabled ? 'enable' : 'disable'} extension`);
            await this.render(); // Re-render to revert UI state
        }
    },

    /**
     * Show extension details (future enhancement)
     */
    showExtensionDetails(extension) {
        console.log('[ExtensionsUI] Show details for:', extension.id);

        if (window.ViewManager?.showExtensions) {
            window.ViewManager.showExtensions(extension);
            return;
        }

        // Future: Show a modal or expanded view with:
        // - Full description
        // - Version info
        // - Settings (if any)
        // - Tools list (for ai-tools extension)
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    ExtensionsUI.init();
});

window.ExtensionsUI = ExtensionsUI;

export default ExtensionsUI;
