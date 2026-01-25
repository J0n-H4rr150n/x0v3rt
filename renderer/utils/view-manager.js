/**
 * Main content view manager
 * Controls which center view is visible (editor, image, extensions).
 */

const ViewManager = {
    editorHeader: null,
    editorTabs: null,
    editor: null,
    imageViewer: null,
    extensionsView: null,
    extensionsTitle: null,
    extensionsContent: null,

    init() {
        this.editorHeader = document.querySelector('.editor-header');
        this.editorTabs = document.getElementById('editor-tabs');
        this.editor = document.getElementById('editor');
        this.imageViewer = document.getElementById('image-viewer');
        this.extensionsView = document.getElementById('extensions-main-view');
        this.extensionsTitle = document.getElementById('extensions-main-title');
        this.extensionsContent = document.getElementById('extensions-main-content');

        console.info('[ViewManager] Initialized', {
            editorHeader: Boolean(this.editorHeader),
            editorTabs: Boolean(this.editorTabs),
            editor: Boolean(this.editor),
            imageViewer: Boolean(this.imageViewer),
            extensionsView: Boolean(this.extensionsView)
        });
    },

    showEditor() {
        this.editorHeader?.classList.remove('hidden');
        this.editorTabs?.classList.remove('hidden');
        this.editor?.classList.remove('hidden');
        this.imageViewer?.classList.add('hidden');
        this.extensionsView?.classList.add('hidden');
    },

    showImage() {
        this.editorHeader?.classList.remove('hidden');
        this.editorTabs?.classList.remove('hidden');
        this.editor?.classList.add('hidden');
        this.imageViewer?.classList.remove('hidden');
        this.extensionsView?.classList.add('hidden');
    },

    showExtensions(extension) {
        this.editorHeader?.classList.add('hidden');
        this.editorTabs?.classList.add('hidden');
        this.editor?.classList.add('hidden');
        this.imageViewer?.classList.add('hidden');
        this.extensionsView?.classList.remove('hidden');

        const title = extension?.name ? `Extensions: ${extension.name}` : 'Extensions';
        if (this.extensionsTitle) {
            this.extensionsTitle.textContent = title;
        }

        const currentFileEl = document.getElementById('current-file');
        if (currentFileEl) {
            currentFileEl.textContent = title;
        }

        if (this.extensionsContent) {
            this.extensionsContent.innerHTML = '';

            if (extension) {
                const header = document.createElement('div');
                header.className = 'extensions-detail-header';

                const name = document.createElement('div');
                name.className = 'extensions-detail-name';
                name.textContent = extension.name || extension.id || 'Extension';

                const description = document.createElement('div');
                description.className = 'extensions-detail-description';
                description.textContent = extension.description || 'No description available.';

                header.appendChild(name);
                header.appendChild(description);
                this.extensionsContent.appendChild(header);

                if (Array.isArray(extension.tools) && extension.tools.length > 0) {
                    const toolsHeader = document.createElement('div');
                    toolsHeader.className = 'extensions-detail-section-title';
                    toolsHeader.textContent = 'Tools';
                    this.extensionsContent.appendChild(toolsHeader);

                    const list = document.createElement('div');
                    list.className = 'extensions-detail-list';

                    extension.tools.forEach((tool) => {
                        const item = document.createElement('div');
                        item.className = 'extensions-detail-item';
                        item.textContent = `${tool.name || tool.id} — ${tool.description || ''}`.trim();
                        list.appendChild(item);
                    });

                    this.extensionsContent.appendChild(list);
                }
            } else {
                const empty = document.createElement('div');
                empty.textContent = 'Select an extension to view details.';
                this.extensionsContent.appendChild(empty);
            }
        }
    }
};

window.ViewManager = ViewManager;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ViewManager.init());
} else {
    ViewManager.init();
}

export default ViewManager;
