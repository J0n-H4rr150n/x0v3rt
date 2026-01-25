/**
 * Notes Sidebar UI - ES Module
 */

import IPC from '../utils/ipc-client.js';
import Dialog from '../utils/dialog.js';

const NotesUI = {
    fileTree: null,
    newNoteBtn: null,
    sidebarHeader: null,
    currentNotesDir: null,
    searchInput: null,
    filterText: '',
    collapsedFolders: new Set(),
    hasCollapseState: false,
    lastTree: null,
    lastFiles: [],
    showHidden: false,
    settingsToggle: null,
    settingsPanel: null,
    showHiddenToggle: null,
    addMenu: null,
    addNoteItem: null,
    addFolderItem: null,
    folderContextMenu: null,
    folderContextTarget: null,

    init() {
        this.fileTree = document.getElementById('file-tree');
        this.newNoteBtn = document.getElementById('new-note-btn');
        this.sidebarHeader = document.getElementById('workspace-title');
        this.searchInput = document.getElementById('file-search');
        this.settingsToggle = document.getElementById('explorer-settings-toggle');
        this.settingsPanel = document.getElementById('explorer-settings-panel');
        this.showHiddenToggle = document.getElementById('explorer-show-hidden');
        this.addMenu = document.getElementById('explorer-add-menu');
        this.addNoteItem = document.getElementById('explorer-add-note');
        this.addFolderItem = document.getElementById('explorer-add-folder');

        if (!this.fileTree || !this.newNoteBtn) return;

        this.loadShowHidden();

        this.bindDragAndDrop();

        if (this.newNoteBtn) {
            this.newNoteBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                if (this.addMenu) {
                    this.addMenu.classList.toggle('hidden');
                } else {
                    this.handleNewNoteClick();
                }
            });
        }

        if (this.addNoteItem) {
            this.addNoteItem.addEventListener('click', () => {
                this.addMenu?.classList.add('hidden');
                this.handleNewNoteClick();
            });
        }

        if (this.addFolderItem) {
            this.addFolderItem.addEventListener('click', () => {
                this.addMenu?.classList.add('hidden');
                this.handleNewFolderClick();
            });
        }

        if (this.sidebarHeader) {
            this.sidebarHeader.addEventListener('click', () => this.openWorkspaceLocation());
        }

        if (this.searchInput) {
            this.searchInput.addEventListener('input', (event) => {
                this.filterText = event.target.value.trim().toLowerCase();
                this.renderFileTree(this.lastTree, this.lastFiles);
            });
        }

        if (this.settingsToggle && this.settingsPanel) {
            this.settingsToggle.addEventListener('click', (event) => {
                event.stopPropagation();
                this.settingsPanel.classList.toggle('hidden');
            });
        }

        if (this.showHiddenToggle) {
            this.showHiddenToggle.checked = this.showHidden;
            this.showHiddenToggle.addEventListener('change', () => {
                this.showHidden = this.showHiddenToggle.checked;
                this.persistShowHidden();
                this.refresh();
            });
        }

        document.addEventListener('click', (event) => {
            if (!this.settingsPanel || this.settingsPanel.classList.contains('hidden')) return;
            const target = event.target;
            if (this.settingsPanel.contains(target) || this.settingsToggle?.contains(target)) return;
            this.settingsPanel.classList.add('hidden');
        });

        document.addEventListener('click', (event) => {
            if (!this.addMenu || this.addMenu.classList.contains('hidden')) return;
            const target = event.target;
            if (this.addMenu.contains(target) || this.newNoteBtn?.contains(target)) return;
            this.addMenu.classList.add('hidden');
        });

        IPC.onNotesFolderChanged(() => {
            this.refresh();
        });

        // Listen for folder changes from watcher
        if (window.IPC) {
            window.IPC.onNotesIndexUpdated((_event, index) => {
                if (this.showHidden) {
                    this.refresh();
                    return;
                }
                if (index?.tree) {
                    this.renderFileTree(index.tree, index.files);
                }
            });
        }

        // Root Drop Zone (to move files to root folder)
        this.fileTree.addEventListener('dragover', (e) => {
            e.preventDefault();
            // Only if hovering over empty space or explicitly "root" area not covered by other items?
            // Actually, if we are NOT over a folder item (which stops propagation), this catches it.
            // So dragging over a file item (which doesn't handle drop) bubbles here?
            // Dragging over a file should probably NOT simply mean "move to root", that's confusing.
            // But dragging to "empty space" at bottom means root.

            // Checking target: if e.target is the container itself or empty space
            // But events bubble.
            // Strategy: We only highlight root if we are explicitly confident.
            // For now, let's enable root drop if dropping on the container background.

            e.dataTransfer.dropEffect = 'move';
            this.fileTree.classList.add('drag-over-root');
        });

        this.fileTree.addEventListener('dragleave', (e) => {
            this.fileTree.classList.remove('drag-over-root');
        });

        this.fileTree.addEventListener('drop', async (e) => {
            e.preventDefault();
            this.fileTree.classList.remove('drag-over-root');

            // If dropping on a specific folder, that handler stops prop.
            // So if we are here, we are dropping on root (or a file in root? or a file in subfolder bubbling up?)
            // If we drop on a file item in a subfolder, and it bubbles here, we might mistakenly move to root?
            // YES. We need to prevent drop on generic file items from bubbling to root move.
            // Fix: Handle 'drop' on file items and just stop propagation (logic: "can't drop into a file").

            const sourcePath = e.dataTransfer.getData('text/plain');
            if (!sourcePath) return;

            // Target is ROOT (empty string path logic usually, or just basename)
            const sourceBasename = sourcePath.split(/[/\\]/).pop();
            const targetPath = sourceBasename; // In root

            if (sourcePath === targetPath) return;

            if (this.isFolderPath(sourcePath) && this.isDescendantPath(sourcePath, targetPath)) {
                alert('Cannot move a folder into itself.');
                return;
            }

            try {
                await window.IPC.moveFile(sourcePath, targetPath);
                this.refresh();
            } catch (err) {
                console.error('Move failed:', err);
                alert(`Failed to move file: ${err.message}`);
            }
        });

        this.refresh();
    },

    ensureFolderContextMenu() {
        if (this.folderContextMenu) return;

        const menu = document.createElement('div');
        menu.className = 'folder-context-menu hidden';
        menu.innerHTML = `
            <button data-action="add-note">Add Note</button>
            <button data-action="add-folder">Add Folder</button>
            <button data-action="rename">Rename</button>
            <button data-action="delete" class="danger">Delete</button>
        `;

        menu.addEventListener('click', async (event) => {
            const action = event.target?.dataset?.action;
            if (!action || !this.folderContextTarget) return;

            const targetPath = this.folderContextTarget;
            if (action === 'add-note') {
                await this.handleAddNoteToFolder(targetPath);
            } else if (action === 'add-folder') {
                await this.handleAddFolderToFolder(targetPath);
            } else if (action === 'rename') {
                await this.handleRenameFolder(targetPath);
            } else if (action === 'delete') {
                await this.handleDeleteFolder(targetPath);
            }

            this.hideFolderContextMenu();
        });

        document.addEventListener('click', () => this.hideFolderContextMenu());
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.hideFolderContextMenu();
            }
        });

        document.body.appendChild(menu);
        this.folderContextMenu = menu;
    },

    showFolderContextMenu(x, y, folderPath) {
        this.ensureFolderContextMenu();
        if (!this.folderContextMenu) return;

        this.folderContextTarget = folderPath;
        this.folderContextMenu.style.left = `${x}px`;
        this.folderContextMenu.style.top = `${y}px`;
        this.folderContextMenu.classList.remove('hidden');
    },

    hideFolderContextMenu() {
        if (!this.folderContextMenu) return;
        this.folderContextMenu.classList.add('hidden');
        this.folderContextTarget = null;
    },

    async refresh() {
        try {
            const result = await IPC.listFiles({
                includeHidden: this.showHidden,
                includeMeta: this.showHidden
            });
            const files = Array.isArray(result) ? result : result?.files || [];
            const tree = Array.isArray(result) ? null : result?.tree || null;
            const notesDir = Array.isArray(result) ? null : result?.notesDir || null;

            this.currentNotesDir = notesDir;
            this.lastTree = tree;
            this.lastFiles = files;
            this.loadCollapsedFolders();

            if (!notesDir) {
                this.renderEmptyState();
                this.updateNewNoteButton(false);
                this.updateWorkspaceHeader(null);
                return;
            }

            this.renderFileTree(tree, files);
            this.updateNewNoteButton(true);
            await this.updateWorkspaceHeader(notesDir);
        } catch (error) {
            console.error('Failed to refresh file tree:', error);
            this.renderEmptyState('Unable to load folder.');
            this.updateNewNoteButton(false);
            this.updateWorkspaceHeader(null);
        }
    },

    async updateWorkspaceHeader(workspacePath) {
        if (!this.sidebarHeader) return;

        if (!workspacePath) {
            this.sidebarHeader.textContent = 'Notes';
            this.sidebarHeader.title = 'Open folder in file explorer';
            this.updateStatusBar(null);
            return;
        }

        try {
            const workspaceName = await IPC.getWorkspaceName();
            this.sidebarHeader.textContent = workspaceName || 'Notes';
            this.sidebarHeader.title = `Open folder: ${workspacePath}`;
            this.updateStatusBar(workspacePath, workspaceName || 'Notes');
        } catch (error) {
            console.error('Failed to get folder name:', error);
            this.sidebarHeader.textContent = 'Notes';
            this.sidebarHeader.title = `Open folder: ${workspacePath || ''}`;
            this.updateStatusBar(workspacePath, 'Notes');
        }
    },

    updateStatusBar(workspacePath, workspaceName = 'Notes') {
        const statusFolder = document.getElementById('status-folder');
        if (!statusFolder) return;
        statusFolder.textContent = workspacePath ? `${workspaceName}` : 'No folder open';
        statusFolder.title = workspacePath || '';
    },

    updateNewNoteButton(hasFolder) {
        if (!this.newNoteBtn) return;
        if (hasFolder) {
            this.newNoteBtn.title = 'New Note';
            this.newNoteBtn.innerHTML = '<span>+</span>';
        } else {
            this.newNoteBtn.title = 'Open Folder';
            this.newNoteBtn.innerHTML = '<span>📁</span>';
        }
    },

    renderEmptyState(message = 'No folder open') {
        this.fileTree.innerHTML = '';
        const container = document.createElement('div');
        container.className = 'notes-empty';

        const title = document.createElement('div');
        title.className = 'notes-empty-title';
        title.textContent = message;

        const subtitle = document.createElement('div');
        subtitle.className = 'notes-empty-subtitle';
        subtitle.textContent = 'Open a folder to start taking notes.';

        const button = document.createElement('button');
        button.className = 'btn-secondary notes-empty-button';
        button.textContent = 'Open Folder';
        button.addEventListener('click', () => this.openFolder());

        container.appendChild(title);
        container.appendChild(subtitle);
        container.appendChild(button);
        this.fileTree.appendChild(container);
    },

    renderFileTree(tree, files) {
        this.fileTree.innerHTML = '';

        const filteredFiles = this.showHidden ? files : files.filter((file) => !this.isHiddenPath(file));
        const baseTree = this.showHidden ? tree : this.filterHiddenTree(tree);

        if (!filteredFiles.length) {
            const empty = document.createElement('div');
            empty.className = 'notes-empty';
            empty.innerHTML = `
                <div class="notes-empty-title">No notes yet</div>
                <div class="notes-empty-subtitle">Create a new note or open a different folder.</div>
            `;
            const button = document.createElement('button');
            button.className = 'btn-secondary notes-empty-button';
            button.textContent = 'Open Folder';
            button.addEventListener('click', () => this.openFolder());
            empty.appendChild(button);
            this.fileTree.appendChild(empty);
            return;
        }

        if (baseTree && baseTree.children?.length) {
            const filteredTree = this.filterText ? this.filterTree(baseTree, this.filterText) : baseTree;
            if (!filteredTree || !filteredTree.children.length) {
                this.renderEmptyState('No matching files');
                return;
            }
            const container = document.createElement('div');
            container.className = 'file-tree-root';
            filteredTree.children.forEach((node) => {
                container.appendChild(this.renderTreeNode(node, 0));
            });
            this.fileTree.appendChild(container);
            return;
        }

        filteredFiles.forEach((filename) => {
            if (this.filterText && !filename.toLowerCase().includes(this.filterText)) {
                return;
            }
            this.fileTree.appendChild(this.renderFileItem(filename, filename, 0));
        });
    },

    loadShowHidden() {
        try {
            const stored = localStorage.getItem('x0v3rt:explorer:showHidden');
            this.showHidden = stored === 'true';
        } catch (error) {
            console.warn('Failed to load explorer setting:', error);
        }
    },

    persistShowHidden() {
        try {
            localStorage.setItem('x0v3rt:explorer:showHidden', String(this.showHidden));
        } catch (error) {
            console.warn('Failed to persist explorer setting:', error);
        }
    },

    isHiddenPath(input) {
        if (!input) return false;
        const normalized = String(input).replace(/\\/g, '/');
        const segments = normalized.split('/').filter(Boolean);
        return segments.some((segment) => segment.startsWith('.'));
    },

    filterHiddenTree(node) {
        if (!node) return null;

        if (node.type === 'file') {
            if (this.isHiddenPath(node.path || node.name)) return null;
            return node;
        }

        const children = node.children
            .map((child) => this.filterHiddenTree(child))
            .filter(Boolean);

        return {
            ...node,
            children
        };
    },

    isFolderPath(relativePath) {
        if (!relativePath) return false;
        if (!Array.isArray(this.lastFiles)) return false;
        return !this.lastFiles.includes(relativePath);
    },

    isDescendantPath(sourcePath, targetDir) {
        if (!sourcePath || !targetDir) return false;
        const normalizedSource = String(sourcePath).replace(/\\/g, '/');
        const normalizedTarget = String(targetDir).replace(/\\/g, '/');
        return normalizedTarget.startsWith(`${normalizedSource}/`);
    },

    bindDragAndDrop() {
        this.fileTree.addEventListener('dragover', (event) => {
            event.preventDefault();
            this.fileTree.classList.add('drag-over');
        });

        this.fileTree.addEventListener('dragleave', (event) => {
            if (event.target === this.fileTree) {
                this.fileTree.classList.remove('drag-over');
            }
        });

        this.fileTree.addEventListener('drop', async (event) => {
            event.preventDefault();
            this.fileTree.classList.remove('drag-over');

            const files = Array.from(event.dataTransfer?.files || []);
            if (!files.length) return;
            await this.importDroppedFiles(files, '');
        });
    },

    renderTreeNode(node, depth) {
        if (node.type === 'folder') {
            const wrapper = document.createElement('div');
            wrapper.className = 'folder-node';

            const header = document.createElement('div');
            header.className = 'file-item folder';
            header.style.paddingLeft = `${depth * 14 + 12}px`;
            header.dataset.path = node.path || node.name || '';
            header.setAttribute('draggable', 'true');

            const label = document.createElement('span');
            label.className = 'file-name';
            label.textContent = node.name || 'Root';

            const toggle = document.createElement('span');
            toggle.className = 'folder-toggle';
            toggle.textContent = '▾';

            header.appendChild(label);
            header.appendChild(toggle);

            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'file-children';

            node.children.forEach((child) => {
                childrenContainer.appendChild(this.renderTreeNode(child, depth + 1));
            });

            const folderKey = node.path || node.name || '';
            if (!this.hasCollapseState || this.collapsedFolders.has(folderKey)) {
                childrenContainer.classList.add('collapsed');
                toggle.textContent = '▸';
            }

            header.addEventListener('click', () => {
                const isCollapsed = childrenContainer.classList.toggle('collapsed');
                toggle.textContent = isCollapsed ? '▸' : '▾';
                this.updateCollapsedFolder(folderKey, isCollapsed);
            });

            header.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.showFolderContextMenu(event.clientX, event.clientY, folderKey);
            });

            header.addEventListener('dragstart', (event) => {
                event.stopPropagation();
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', folderKey);
                event.dataTransfer.setData('application/x-x0v3rt-node-type', 'folder');
                header.classList.add('dragging');
            });

            header.addEventListener('dragend', () => {
                header.classList.remove('dragging');
            });

            header.addEventListener('dragover', (event) => {
                event.preventDefault();
                header.classList.add('drag-over');
                event.dataTransfer.dropEffect = 'move';
            });

            header.addEventListener('dragleave', () => {
                header.classList.remove('drag-over');
            });

            header.addEventListener('drop', async (event) => {
                event.preventDefault();
                header.classList.remove('drag-over');

                const sourcePath = event.dataTransfer?.getData('text/plain');
                if (sourcePath) {
                    const sourceBasename = sourcePath.split(/[/\\]/).pop();
                    const targetDir = folderKey || '';
                    const targetPath = targetDir ? `${targetDir}/${sourceBasename}` : sourceBasename;

                    if (sourcePath === targetPath) return;

                    if (this.isFolderPath(sourcePath)) {
                        if (sourcePath === targetDir || this.isDescendantPath(sourcePath, targetDir)) {
                            alert('Cannot move a folder into itself.');
                            return;
                        }
                    }

                    try {
                        await window.IPC.moveFile(sourcePath, targetPath);
                        await this.refresh();
                    } catch (error) {
                        console.error('Move failed:', error);
                        alert(`Failed to move file: ${error.message}`);
                    }
                    return;
                }

                const files = Array.from(event.dataTransfer?.files || []);
                if (!files.length) return;
                await this.importDroppedFiles(files, folderKey);
            });

            wrapper.appendChild(header);
            wrapper.appendChild(childrenContainer);
            return wrapper;
        }

        return this.renderFileItem(node.name, node.path, depth);
    },

    async importDroppedFiles(files, targetDir) {
        try {
            for (const file of files) {
                if (!file?.path) continue;
                await window.IPC.importFile(file.path, targetDir);
            }
            await this.refresh();
        } catch (error) {
            console.error('Import files error:', error);
            alert('Failed to import file: ' + error.message);
        }
    },

    filterTree(node, query) {
        if (node.type === 'file') {
            const match = node.name.toLowerCase().includes(query) || node.path.toLowerCase().includes(query);
            return match ? node : null;
        }

        const children = node.children
            .map((child) => this.filterTree(child, query))
            .filter(Boolean);

        if (children.length) {
            return {
                ...node,
                children
            };
        }

        return null;
    },

    renderFileItem(labelText, filePath, depth) {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.style.paddingLeft = `${depth * 14 + 12}px`;
        item.dataset.path = filePath;

        // Make file items draggable
        item.setAttribute('draggable', 'true');

        item.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', filePath); // Data to transfer: the file's path
            e.dataTransfer.setData('application/x-x0v3rt-node-type', 'file');
            item.classList.add('dragging');
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
        });

        const label = document.createElement('span');
        label.className = 'file-name';
        label.textContent = labelText;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'file-delete';
        deleteBtn.type = 'button';
        deleteBtn.title = 'Delete file';
        deleteBtn.textContent = '×';

        deleteBtn.addEventListener('click', async (event) => {
            event.stopPropagation();
            await this.deleteFile(filePath);
        });

        item.appendChild(label);
        item.appendChild(deleteBtn);
        item.addEventListener('click', () => this.openFile(filePath, item));

        // File Drop Logic (Prevent bubbling to root)
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'none'; // Can't drop on file
        });
        item.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Do nothing, just consume event
        });

        return item;
    },

    async handleAddNoteToFolder(folderPath) {
        if (!this.currentNotesDir) {
            await this.openFolder();
            return;
        }

        const filename = await window.Dialog.showInput(
            'New Note',
            'Note name (without .md extension)'
        );
        if (!filename) return;

        const targetPath = folderPath ? `${folderPath}/${filename}` : filename;

        try {
            const result = await window.IPC.createFile(targetPath);
            const actualFilename = result?.filename || targetPath;
            await this.refresh();
            await this.openFile(actualFilename, this.findItemByName(actualFilename));
        } catch (error) {
            console.error('Create file error:', error);
            alert('Failed to create file: ' + error.message);
        }
    },

    async handleAddFolderToFolder(folderPath) {
        if (!this.currentNotesDir) {
            await this.openFolder();
            return;
        }

        const folderName = await window.Dialog.showInput(
            'New Folder',
            'Folder name'
        );
        if (!folderName) return;

        const targetPath = folderPath ? `${folderPath}/${folderName}` : folderName;

        try {
            await window.IPC.createFolder(targetPath);
            await this.refresh();
        } catch (error) {
            console.error('Create folder error:', error);
            alert('Failed to create folder: ' + error.message);
        }
    },

    async handleRenameFolder(folderPath) {
        if (!folderPath) return;

        const currentName = folderPath.split(/[/\\]/).pop();
        const newName = await window.Dialog.showInput(
            'Rename Folder',
            'Folder name',
            currentName
        );
        if (!newName || newName === currentName) return;

        const parentPath = folderPath.split(/[/\\]/).slice(0, -1).join('/');
        const targetPath = parentPath ? `${parentPath}/${newName}` : newName;

        try {
            await window.IPC.moveFile(folderPath, targetPath);
            await this.refresh();
        } catch (error) {
            console.error('Rename folder error:', error);
            alert('Failed to rename folder: ' + error.message);
        }
    },

    async handleDeleteFolder(folderPath) {
        if (!folderPath) return;

        const folderName = folderPath.split(/[/\\]/).pop();
        const firstConfirm = await window.Dialog.showConfirm(
            'Delete Folder',
            `Delete "${folderName}" and all of its contents?`,
            { confirmLabel: 'Delete', danger: true }
        );
        if (!firstConfirm) return;

        const secondConfirm = await window.Dialog.showConfirm(
            'Confirm Deletion',
            `This will permanently remove everything inside "${folderName}". This cannot be undone.`,
            { confirmLabel: 'Delete forever', danger: true }
        );
        if (!secondConfirm) return;

        try {
            await window.IPC.deleteFile(folderPath);
            await this.refresh();

            if (window.Editor?.tabs && window.Editor?.closeTab) {
                const prefix = `${folderPath.replace(/\\/g, '/')}/`;
                const tabsToClose = Array.from(window.Editor.tabs.keys()).filter((name) => {
                    const normalized = String(name).replace(/\\/g, '/');
                    return normalized.startsWith(prefix);
                });
                tabsToClose.forEach((tab) => window.Editor.closeTab(tab));
            }
        } catch (error) {
            console.error('Delete folder error:', error);
            alert('Failed to delete folder: ' + error.message);
        }
    },

    getCollapseStorageKey() {
        return this.currentNotesDir ? `x0v3rt:collapsed:${this.currentNotesDir}` : 'x0v3rt:collapsed:default';
    },

    loadCollapsedFolders() {
        const key = this.getCollapseStorageKey();
        try {
            const raw = localStorage.getItem(key);
            if (!raw) {
                this.collapsedFolders = new Set();
                this.hasCollapseState = false;
                return;
            }
            const parsed = JSON.parse(raw);
            this.collapsedFolders = new Set(Array.isArray(parsed) ? parsed : []);
            this.hasCollapseState = true;
        } catch (error) {
            console.warn('Failed to load collapsed folders:', error);
            this.collapsedFolders = new Set();
            this.hasCollapseState = false;
        }
    },

    updateCollapsedFolder(folderKey, isCollapsed) {
        if (!folderKey) return;
        if (isCollapsed) {
            this.collapsedFolders.add(folderKey);
        } else {
            this.collapsedFolders.delete(folderKey);
        }
        try {
            const key = this.getCollapseStorageKey();
            localStorage.setItem(key, JSON.stringify(Array.from(this.collapsedFolders)));
        } catch (error) {
            console.warn('Failed to persist collapsed folders:', error);
        }
    },

    async openFile(filename, itemEl) {
        try {
            if (this.isImageFile(filename)) {
                const result = await window.IPC.readFileBinary(filename, {
                    allowMeta: this.showHidden
                });
                const dataUrl = result?.dataUrl || '';
                window.Editor.showImage(filename, dataUrl);
            } else {
                const content = await window.IPC.readFile(filename, {
                    allowMeta: this.showHidden
                });
                if (content === null) {
                    alert('File no longer exists.');
                    this.refresh();
                    return;
                }
                window.Editor.loadFile(filename, content);
            }

            this.clearActiveItems();
            if (itemEl) {
                itemEl.classList.add('active');
            }
        } catch (error) {
            console.error('Failed to open file:', error);
            alert('Failed to open file: ' + error.message);
        }
    },

    isImageFile(filename) {
        return /\.(png|jpe?g|gif|webp|svg)$/i.test(filename);
    },

    clearActiveItems() {
        const activeItems = this.fileTree.querySelectorAll('.file-item.active');
        activeItems.forEach((item) => item.classList.remove('active'));
    },

    async handleNewNoteClick() {
        if (!this.currentNotesDir) {
            await this.openFolder();
            return;
        }

        const filename = await window.Dialog.showInput(
            'New Note',
            'Note name (without .md extension)'
        );
        if (!filename) return;

        try {
            const result = await window.IPC.createFile(filename);
            const actualFilename = result?.filename || filename;
            await this.refresh();
            await this.openFile(actualFilename, this.findItemByName(actualFilename));
        } catch (error) {
            console.error('Create file error:', error);
            alert('Failed to create file: ' + error.message);
        }
    },

    async handleNewFolderClick() {
        if (!this.currentNotesDir) {
            await this.openFolder();
            return;
        }

        const folderName = await window.Dialog.showInput(
            'New Folder',
            'Folder name'
        );
        if (!folderName) return;

        try {
            await window.IPC.createFolder(folderName);
            await this.refresh();
        } catch (error) {
            console.error('Create folder error:', error);
            alert('Failed to create folder: ' + error.message);
        }
    },

    async deleteFile(filename) {
        const confirmDelete = window.confirm(`Delete ${filename}? This cannot be undone.`);
        if (!confirmDelete) return;

        try {
            await window.IPC.deleteFile(filename);
            await this.refresh();

            if (window.Editor?.tabs?.has(filename)) {
                window.Editor.closeTab(filename);
            }

            if (window.Editor?.currentFile === filename) {
                window.Editor.currentFile = null;
                window.Editor.isDirty = false;
                window.Editor.setContent('');
                if (window.Editor.updateSaveButton) {
                    window.Editor.updateSaveButton();
                }
                const currentFileEl = document.getElementById('current-file');
                if (currentFileEl) {
                    currentFileEl.textContent = 'No file open';
                }
            }
        } catch (error) {
            console.error('Delete file error:', error);
            alert('Failed to delete file: ' + error.message);
        }
    },

    findItemByName(filename) {
        const items = this.fileTree.querySelectorAll('.file-item');
        return Array.from(items).find((item) => item.textContent === filename);
    },

    resolveFilePath(filename) {
        if (!this.lastFiles || !filename) return filename;

        // 1. Try exact match
        if (this.lastFiles.includes(filename)) return filename;

        // 2. Try adding .md if missing
        const withExt = filename.endsWith('.md') ? filename : `${filename}.md`;
        if (this.lastFiles.includes(withExt)) return withExt;

        // 3. Search for file with matching basename in any folder
        // "folder/file.md" -> "file.md" or "file"
        const targetBasename = filename.split(/[/\\]/).pop();
        const targetBasenameNoExt = targetBasename.replace(/\.md$/i, '');

        const match = this.lastFiles.find(path => {
            const pathBasename = path.split(/[/\\]/).pop();
            const pathBasenameNoExt = pathBasename.replace(/\.md$/i, '');
            return pathBasename === targetBasename ||
                pathBasenameNoExt === targetBasenameNoExt;
        });

        return match || filename;
    },

    async openFolder() {
        try {
            const result = await window.IPC.chooseFolder();
            if (result?.canceled) return;
            await this.refresh();
        } catch (error) {
            console.error('Open folder error:', error);
            alert('Failed to open folder: ' + error.message);
        }
    },

    async openWorkspaceLocation() {
        if (!this.currentNotesDir) {
            await this.openFolder();
            return;
        }
        try {
            await window.IPC.openWorkspaceInExplorer();
        } catch (error) {
            console.error('Open workspace location error:', error);
            alert('Failed to open folder: ' + error.message);
        }
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    NotesUI.init();
});

// Export globally and as module
window.NotesUI = NotesUI;

export default NotesUI;
