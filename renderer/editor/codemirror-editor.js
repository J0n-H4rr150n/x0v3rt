/**
 * CodeMirror 6 Editor with Live Preview
 * Markdown editing experience
 */

import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, bracketMatching, foldGutter, foldKeymap, HighlightStyle } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { sql } from '@codemirror/lang-sql';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { search, searchKeymap } from '@codemirror/search';
import { tags as t } from '@lezer/highlight';
import IPC from '../utils/ipc-client.js';
import Dialog from '../utils/dialog.js';
import MarkdownLivePreview from './markdown-live-preview.js';

const customTheme = EditorView.theme({
    '&': {
        color: 'var(--text-primary)',
        backgroundColor: 'var(--bg-primary)'
    },
    '.cm-content': {
        caretColor: 'var(--accent-primary)'
    },
    '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--accent-primary)'
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'rgba(74, 158, 255, 0.25)'
    },
    '.cm-gutters': {
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-muted)',
        border: 'none'
    },
    '.cm-activeLine': {
        backgroundColor: 'rgba(74, 158, 255, 0.08)'
    },
    '.cm-activeLineGutter': {
        backgroundColor: 'var(--bg-tertiary)'
    },
    '.cm-foldPlaceholder': {
        backgroundColor: 'transparent',
        border: 'none',
        color: 'var(--text-muted)'
    },
    '.cm-tooltip': {
        border: 'none',
        backgroundColor: 'var(--bg-tertiary)',
        color: 'var(--text-primary)'
    },
    '.cm-tooltip-autocomplete': {
        '& > ul > li[aria-selected]': {
            backgroundColor: 'var(--bg-hover)',
            color: 'var(--text-primary)'
        }
    }
}, { dark: true });

const markdownHighlightStyle = HighlightStyle.define([
    { tag: t.heading1, color: 'var(--text-primary)', fontWeight: '700' },
    { tag: t.heading2, color: 'var(--accent-primary)', fontWeight: '600' },
    { tag: t.heading3, color: 'var(--text-secondary)', fontWeight: '600' },
    { tag: t.heading, color: 'var(--text-primary)', fontWeight: '600' },
    { tag: t.meta, color: 'var(--text-secondary)' },
    { tag: t.processingInstruction, color: 'var(--text-muted)' },
    { tag: t.punctuation, color: 'var(--text-muted)' },
    { tag: t.monospace, color: 'var(--text-primary)' },
    { tag: t.keyword, color: '#569cd6' },
    { tag: t.string, color: '#ce9178' },
    { tag: t.number, color: '#b5cea8' },
    { tag: t.comment, color: '#6a9955' },
    { tag: t.variableName, color: 'var(--text-primary)' }
]);

const CodeMirrorEditor = {
    view: null,
    currentFile: null,
    currentFileType: 'text',
    imageViewer: null,
    imagePreview: null,
    wrapCompartment: new Compartment(),
    languageCompartment: new Compartment(),
    previewCompartment: new Compartment(),
    wrapEnabled: true,
    previewEnabled: true,
    isDirty: false,
    autoSaveTimer: null,
    onChangeCallback: null,

    /**
     * Initialize CodeMirror 6 editor
     */
    init() {
        const editorContainer = document.getElementById('editor');
        if (!editorContainer) {
            console.error('Editor container not found');
            return;
        }

        this.imageViewer = document.getElementById('image-viewer');
        this.imagePreview = document.getElementById('image-preview');

        // Clear container
        editorContainer.innerHTML = '';

        // Create CodeMirror extensions
        const extensions = [
            lineNumbers(),
            highlightActiveLineGutter(),
            foldGutter(),
            history(),
            search(),
            bracketMatching(),
            markdown(),
            customTheme,
            syntaxHighlighting(markdownHighlightStyle, { fallback: true }),
            this.previewCompartment.of(MarkdownLivePreview.extension),
            this.languageCompartment.of([]),
            this.wrapCompartment.of(EditorView.lineWrapping),
            keymap.of([
                {
                    key: 'Enter',
                    run: (view) => {
                        const { state } = view;
                        const range = state.selection.main;
                        if (!range.empty) return false;

                        const line = state.doc.lineAt(range.head);
                        const lineText = line.text;
                        const beforeCursor = lineText.slice(0, range.head - line.from);

                        const unorderedMatch = beforeCursor.match(/^(\s*)([-*+])\s+(.+)?$/);
                        const orderedMatch = beforeCursor.match(/^(\s*)(\d+)\.\s+(.+)?$/);

                        if (unorderedMatch || orderedMatch) {
                            const indent = (unorderedMatch || orderedMatch)[1] || '';
                            const hasContent = Boolean((unorderedMatch || orderedMatch)[3]);

                            if (!hasContent) {
                                view.dispatch({
                                    changes: { from: range.head, to: range.head, insert: `\n${indent}` },
                                    selection: { anchor: range.head + 1 + indent.length }
                                });
                                return true;
                            }

                            if (unorderedMatch) {
                                const marker = unorderedMatch[2];
                                view.dispatch({
                                    changes: { from: range.head, to: range.head, insert: `\n${indent}${marker} ` },
                                    selection: { anchor: range.head + 2 + indent.length }
                                });
                                return true;
                            }

                            if (orderedMatch) {
                                const number = Number(orderedMatch[2]) + 1;
                                const marker = `${number}. `;
                                view.dispatch({
                                    changes: { from: range.head, to: range.head, insert: `\n${indent}${marker}` },
                                    selection: { anchor: range.head + 1 + indent.length + marker.length }
                                });
                                return true;
                            }
                        }

                        return false;
                    }
                },
                ...foldKeymap,
                ...searchKeymap,
                ...defaultKeymap,
                ...historyKeymap,
                {
                    key: 'Mod-s',
                    run: () => {
                        this.saveFile();
                        return true;
                    }
                }
            ]),
            EditorView.updateListener.of((update) => {
                if (update.docChanged) {
                    this.isDirty = true;
                    this.updateSaveButton();
                    this.scheduleAutoSave();

                    // Notify context builder
                    if (window.ContextBuilder) {
                        window.ContextBuilder.updateContent(this.getContent());
                    }
                }
            }),
            EditorView.domEventHandlers({
                paste: (event, view) => this.handlePaste(event, view)
            }),
            // Styling for the editor
            EditorView.theme({
                '&': {
                    height: '100%',
                    fontSize: '14px'
                },
                '.cm-scroller': {
                    overflow: 'auto',
                    fontFamily: 'var(--user-editor-font, var(--font-mono))',
                    fontSize: 'var(--user-editor-font-size, 14px)',
                    lineHeight: 'var(--user-line-height, 1.6)'
                },
                '.cm-content': {
                    padding: '24px',
                    lineHeight: '1.7'
                },
                '.cm-line': {
                    padding: '0 4px'
                },
                '.cm-inline-code, .cm-formatting-code': {
                    fontFamily: 'var(--font-mono)'
                }
            })
        ];

        // Initialize live preview helpers
        MarkdownLivePreview.init();

        // Create editor state
        const state = EditorState.create({
            doc: '',
            extensions
        });

        // Create editor view
        this.view = new EditorView({
            state,
            parent: editorContainer
        });

        // Set up save button
        const saveBtn = document.getElementById('save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveFile());
        }

        const undoBtn = document.getElementById('undo-btn');
        if (undoBtn) {
            undoBtn.addEventListener('click', () => this.undoLastSave());
        }

        const wrapBtn = document.getElementById('wrap-btn');
        if (wrapBtn) {
            wrapBtn.addEventListener('click', () => this.toggleWrap());
            this.updateWrapButton();
        }

        const previewBtn = document.getElementById('preview-btn');
        if (previewBtn) {
            previewBtn.addEventListener('click', () => this.togglePreview());
            this.updatePreviewButton();
        }

        console.log('CodeMirror 6 initialized with markdown support');

        // Load preview preference
        const savedPreview = localStorage.getItem('editorPreviewEnabled');
        if (savedPreview !== null) {
            this.previewEnabled = savedPreview === 'true';
            this.updatePreviewMode();
            this.updatePreviewButton();
        }
    },

    /**
     * Get current editor content
     */
    getContent() {
        return this.view ? this.view.state.doc.toString() : '';
    },

    /**
     * Set editor content
     */
    setContent(content) {
        if (!this.view) return;

        this.view.dispatch({
            changes: {
                from: 0,
                to: this.view.state.doc.length,
                insert: content
            }
        });
    },

    tabs: new Map(), // filename -> { state, viewState? }
    orderedTabs: [], // filename[]
    tabScroll: new Map(), // filename -> scrollTop
    tabContextMenu: null,
    tabContextTarget: null,

    /**
     * Load file into editor (Tabbed)
     */
    loadFile(filename, content) {
        this.currentFileType = 'text';
        this.showEditorView();

        // 1. If tab exists, switch to it
        if (this.tabs.has(filename)) {
            // Update content if provided (e.g. from reload)
            // But be careful not to overwrite unsaved changes if we trust local state more?
            // For now, if content is explicitly passed, let's update it or rely on existing state.
            // If it's a "load", we usually assume we want to read from disk.
            // But if we have dirty state, we might want to prompt?
            // For simple "open", we just switch.

            // If we are just switching back, content might be stale here if we don't reload.
            // The caller usually passes content from IPC.readFile.

            this.switchTab(filename);

            // If content is provided and different (e.g. external update), we might want to update the doc
            // But checking differences is expensive. Let's assume passed content is authoritative for "loadFile"
            if (content !== undefined) {
                const view = this.view;
                if (view) {
                    const length = view.state.doc.length;
                    view.dispatch({ changes: { from: 0, to: length, insert: content } });
                }
            }
        }
        // 2. New Tab
        else {
            // Save state of current tab before switching away
            if (this.currentFile && this.view) {
                const currentState = this.view.state;
                this.tabs.set(this.currentFile, { state: currentState });
                // We don't remove it, just update state
            }

            // Create new state for new file
            // We need to use existing extensions
            // Be careful: some extensions might be instance specific?
            // Extensions like 'EditorView.updateListener' close over 'this'.
            // That's fine as 'this' is the singleton CodeMirrorEditor.

            // Helper to get extensions (recreate or reuse?)
            // We can reuse the same extensions array from init() if we stored it?
            // But we didn't store it. Let's extract extensions creation or just grab current state's extensions?
            // State.create({ extensions: [...] })
            // Better to factor out extension creation.
            // For now, let's grab them from current view if possible, or re-create simple ones.
            // Actually, best to just update key fields and doc.

            // Logic:
            // 1. Add to orderedTabs
            this.orderedTabs.push(filename);
            this.tabs.set(filename, { state: null }); // Placeholder

            // 2. Set current file
            this.currentFile = filename;

            // 3. Update editor content (this will effectively "create" the state in the view)
            if (this.view) {
                this.setContent(content);
                // Now capture this new state
                this.tabs.set(filename, { state: this.view.state });
            }

            this.isDirty = false;
        }

        // Notify backend of active file
        if (IPC?.setActiveFile) {
            IPC.setActiveFile(filename).catch(err =>
                console.warn('Failed to set active file:', err)
            );
        }

        this.updateSaveButton();
        this.updateUndoButton();

        // Update UI
        const currentFileEl = document.getElementById('current-file');
        if (currentFileEl) {
            currentFileEl.textContent = filename;
        }

        // Update context
        if (window.ContextBuilder) {
            window.ContextBuilder.updateContent(content || this.getContent());
        }

        // Focus editor
        if (this.view) {
            this.view.focus();
        }

        this.renderTabs();
        this.persistTabsState();
    },

    switchTab(filename) {
        if (filename === this.currentFile) return;

        // Save current tab state
        if (this.currentFile && this.view) {
            this.tabs.set(this.currentFile, { state: this.view.state });
        }

        // Restore new tab state
        const tabData = this.tabs.get(filename);
        if (tabData && tabData.state && this.view) {
            this.view.setState(tabData.state);
        } else {
            // Should not happen if logic is correct, but safe fallback
            this.setContent('');
        }

        this.currentFile = filename;
        this.isDirty = false; // TODO: Track dirty state per tab?
        // Ideally we check if doc version > saved version.
        // For now, simple tab switch might reset dirty indicator if we don't track it per tab.
        // Let's assume for MVP we lose "dirty" status visibility on switch, or we validly restore it from state?
        // EditorView state preserves doc history, so undo works.
        // Dirty flag handling needs improvement for multi-tab.

        this.updateSaveButton();
        this.renderTabs();

        // Notify backend
        if (IPC?.setActiveFile) {
            IPC.setActiveFile(filename).catch(() => { });
        }

        // Update header
        const currentFileEl = document.getElementById('current-file');
        if (currentFileEl) currentFileEl.textContent = filename;
        this.persistTabsState();
    },

    closeTab(filename) {
        // Remove from data
        this.tabs.delete(filename);
        const idx = this.orderedTabs.indexOf(filename);
        if (idx !== -1) {
            this.orderedTabs.splice(idx, 1);
        }

        // If closing active tab, switch to another
        if (filename === this.currentFile) {
            if (this.orderedTabs.length > 0) {
                // Switch to previous or first
                const newTab = this.orderedTabs[Math.max(0, idx - 1)];
                this.switchTab(newTab);
            } else {
                // No tabs left
                this.currentFile = null;
                this.setContent('');
                const currentFileEl = document.getElementById('current-file');
                if (currentFileEl) currentFileEl.textContent = 'No file open';
                this.renderTabs();
            }
        } else {
            this.renderTabs();
        }
        this.persistTabsState();
    },

    closeAllTabs() {
        this.tabs.clear();
        this.orderedTabs = [];
        this.currentFile = null;
        this.setContent('');
        const currentFileEl = document.getElementById('current-file');
        if (currentFileEl) currentFileEl.textContent = 'No file open';
        this.renderTabs();
        this.persistTabsState();
    },

    closeOtherTabs(filename) {
        const keep = new Set([filename]);
        for (const key of Array.from(this.tabs.keys())) {
            if (!keep.has(key)) this.tabs.delete(key);
        }
        this.orderedTabs = this.orderedTabs.filter((tab) => keep.has(tab));
        if (this.currentFile !== filename) {
            this.switchTab(filename);
        } else {
            this.renderTabs();
            this.persistTabsState();
        }
    },

    persistTabsState() {
        if (!window.WorkspaceState?.update) return;
        window.WorkspaceState.update({
            editor: {
                openTabs: [...this.orderedTabs],
                activeTab: this.currentFile || null
            },
            lastActiveFile: this.currentFile || null
        });
    },

    async restoreTabsFromWorkspaceState() {
        const openTabs = window.WorkspaceState?.get?.('editor.openTabs') || [];
        const activeTab = window.WorkspaceState?.get?.('editor.activeTab') || null;
        if (!Array.isArray(openTabs) || openTabs.length === 0) return;

        const uniqueTabs = openTabs.filter((tab, idx) => openTabs.indexOf(tab) === idx);
        const missingTabs = [];
        for (const filename of uniqueTabs) {
            try {
                const content = await IPC.readFile(filename);
                if (content === null) {
                    missingTabs.push(filename);
                    continue;
                }
                this.loadFile(filename, content);
            } catch (error) {
                console.warn('Failed to restore tab:', filename, error);
                missingTabs.push(filename);
            }
        }

        const restoredTabs = uniqueTabs.filter((tab) => !missingTabs.includes(tab));
        if (missingTabs.length && window.WorkspaceState?.update) {
            const nextActive = restoredTabs.includes(activeTab) ? activeTab : restoredTabs[0] || null;
            window.WorkspaceState.update({
                editor: {
                    openTabs: restoredTabs,
                    activeTab: nextActive
                },
                lastActiveFile: nextActive
            });
        }

        if (activeTab && restoredTabs.includes(activeTab)) {
            this.switchTab(activeTab);
        }
    },

    renderTabs() {
        const container = document.getElementById('editor-tabs');
        if (!container) return;

        container.innerHTML = '';

        this.orderedTabs.forEach(filename => {
            const tab = document.createElement('div');
            tab.className = `editor-tab ${filename === this.currentFile ? 'active' : ''}`;
            tab.title = filename;

            const label = document.createElement('span');
            label.className = 'editor-tab-label';
            // Show only basename
            label.textContent = filename.split(/[/\\]/).pop();

            const closeBtn = document.createElement('button');
            closeBtn.className = 'editor-tab-close';
            closeBtn.textContent = '×';
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                this.closeTab(filename);
            };

            tab.appendChild(label);
            tab.appendChild(closeBtn);

            tab.onclick = () => this.switchTab(filename);
            tab.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                this.showTabContextMenu(event.clientX, event.clientY, filename);
            });

            container.appendChild(tab);
        });

        this.ensureTabContextMenu();
    },

    ensureTabContextMenu() {
        if (this.tabContextMenu) return;

        const menu = document.createElement('div');
        menu.className = 'editor-tab-context-menu hidden';
        menu.innerHTML = `
            <button data-action="close">Close</button>
            <button data-action="close-others">Close Others</button>
            <button data-action="close-all">Close All</button>
        `;

        menu.addEventListener('click', (event) => {
            const action = event.target?.dataset?.action;
            if (!action) return;
            const target = this.tabContextTarget;
            if (!target) return;

            if (action === 'close') {
                this.closeTab(target);
            } else if (action === 'close-others') {
                this.closeOtherTabs(target);
            } else if (action === 'close-all') {
                this.closeAllTabs();
            }

            this.hideTabContextMenu();
        });

        document.addEventListener('click', () => this.hideTabContextMenu());
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.hideTabContextMenu();
            }
        });

        document.body.appendChild(menu);
        this.tabContextMenu = menu;
    },

    showTabContextMenu(x, y, filename) {
        this.ensureTabContextMenu();
        this.tabContextTarget = filename;
        if (!this.tabContextMenu) return;

        this.tabContextMenu.style.left = `${x}px`;
        this.tabContextMenu.style.top = `${y}px`;
        this.tabContextMenu.classList.remove('hidden');
    },

    hideTabContextMenu() {
        if (!this.tabContextMenu) return;
        this.tabContextMenu.classList.add('hidden');
        this.tabContextTarget = null;
    },

    showImage(filename, dataUrl) {
        this.currentFileType = 'image';
        this.currentFile = filename;

        // Notify backend of active file
        if (IPC?.setActiveFile) {
            IPC.setActiveFile(filename).catch(err =>
                console.warn('Failed to set active file:', err)
            );
        }

        this.isDirty = false;
        this.updateSaveButton();
        this.updateUndoButton();

        if (this.imagePreview) {
            this.imagePreview.src = dataUrl;
        }

        const currentFileEl = document.getElementById('current-file');
        if (currentFileEl) {
            currentFileEl.textContent = filename;
        }

        if (window.ContextBuilder) {
            window.ContextBuilder.updateContent('');
        }

        this.showImageView();
    },

    showImageView() {
        if (window.ViewManager?.showImage) {
            window.ViewManager.showImage();
            return;
        }
        const editorContainer = document.getElementById('editor');
        if (editorContainer) {
            editorContainer.classList.add('hidden');
        }
        if (this.imageViewer) {
            this.imageViewer.classList.remove('hidden');
        }
    },

    showEditorView() {
        if (window.ViewManager?.showEditor) {
            window.ViewManager.showEditor();
            return;
        }
        const editorContainer = document.getElementById('editor');
        if (editorContainer) {
            editorContainer.classList.remove('hidden');
        }
        if (this.imageViewer) {
            this.imageViewer.classList.add('hidden');
        }
    },

    toggleWrap() {
        this.wrapEnabled = !this.wrapEnabled;
        if (this.view) {
            this.view.dispatch({
                effects: this.wrapCompartment.reconfigure(this.wrapEnabled ? EditorView.lineWrapping : [])
            });
        }
        this.updateWrapButton();
    },

    handlePaste(event, view) {
        const items = event?.clipboardData?.items;
        if (!items || items.length === 0) return false;

        const imageItem = Array.from(items).find((item) => item.type?.startsWith('image/'));
        if (!imageItem) return false;

        if (!this.currentFile) {
            alert('Open a note before pasting an image.');
            event.preventDefault();
            return true;
        }

        const file = imageItem.getAsFile();
        if (!file) return false;

        event.preventDefault();

        file.arrayBuffer()
            .then((buffer) => this.arrayBufferToBase64(buffer))
            .then(async (base64) => {
                const relativeDir = this.getActiveRelativeDir();
                const baseName = this.getActiveBaseName();
                const result = await window.IPC.saveClipboardImage({
                    base64,
                    mimeType: file.type || 'image/png',
                    relativeDir,
                    baseName
                });

                const relativePath = result?.path;
                if (!relativePath) {
                    throw new Error('Image save failed');
                }

                const markdown = `![](${relativePath})`;
                this.insertTextAtCursor(view, markdown);
            })
            .catch((error) => {
                console.error('[Editor] Paste image error:', error);
                alert('Failed to paste image from clipboard.');
            });

        return true;
    },

    insertTextAtCursor(view, text) {
        const range = view.state.selection.main;
        const changes = { from: range.from, to: range.to, insert: text };
        view.dispatch({ changes, selection: { anchor: range.from + text.length } });
        view.focus();
    },

    getActiveRelativeDir() {
        if (!this.currentFile) return '';
        const parts = String(this.currentFile).split(/[/\\]/);
        if (parts.length <= 1) return '';
        parts.pop();
        return parts.join('/');
    },

    getActiveBaseName() {
        if (!this.currentFile) return 'screenshot';
        const parts = String(this.currentFile).split(/[/\\]/);
        const filename = parts[parts.length - 1] || 'screenshot';
        return filename.replace(/\.[^/.]+$/, '') || 'screenshot';
    },

    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
        }
        return btoa(binary);
    },

    updateWrapButton() {
        const wrapBtn = document.getElementById('wrap-btn');
        if (!wrapBtn) return;
        wrapBtn.textContent = this.wrapEnabled ? 'Wrap: On' : 'Wrap: Off';
    },

    togglePreview() {
        this.previewEnabled = !this.previewEnabled;
        localStorage.setItem('editorPreviewEnabled', this.previewEnabled.toString());
        this.updatePreviewMode();
        this.updatePreviewButton();
    },

    updatePreviewMode() {
        if (this.view) {
            this.view.dispatch({
                effects: this.previewCompartment.reconfigure(
                    this.previewEnabled ? MarkdownLivePreview.extension : []
                )
            });
        }
    },

    updatePreviewButton() {
        const previewBtn = document.getElementById('preview-btn');
        if (!previewBtn) return;
        previewBtn.textContent = this.previewEnabled ? 'Preview: On' : 'Preview: Off';
    },

    /**
     * Undo last saved version (file history)
     */
    async undoLastSave() {
        if (!this.currentFile) return;

        try {
            const result = await IPC.undoFile(this.currentFile);
            if (result?.content != null) {
                this.loadFile(this.currentFile, result.content);
                this.showSaveStatus('Reverted', 2000);
            }
        } catch (error) {
            console.error('Undo save error:', error);
            alert('No previous version available.');
        }
    },

    /**
     * Schedule auto-save after 1 second of inactivity
     */
    scheduleAutoSave() {
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }

        this.autoSaveTimer = setTimeout(() => {
            if (this.isDirty && this.currentFile) {
                this.autoSave();
            }
        }, 1000);
    },

    /**
     * Auto-save the current file
     */
    async autoSave() {
        if (!this.currentFile || !this.isDirty) return;

        try {
            this.showSaveStatus('Saving...');
            const result = await IPC.writeFile(this.currentFile, this.getContent());
            if (result?.content && result.content !== this.getContent()) {
                this.setContent(result.content);
            }
            this.isDirty = false;
            this.updateSaveButton();
            this.showSaveStatus('Saved', 2000);
            console.log('Auto-saved:', this.currentFile);
        } catch (error) {
            console.error('Auto-save error:', error);
            this.showSaveStatus('Error', 2000);
        }
    },

    /**
     * Manual save
     */
    async saveFile() {
        if (!this.isDirty || this.currentFileType !== 'text') return;

        if (!this.currentFile) {
            const filename = await Dialog.showInput(
                'Save Note As',
                'Note name (without .md extension)'
            );
            if (!filename) return;

            try {
                const listResult = await IPC.listFiles();
                const hasFolder = Array.isArray(listResult) ? false : Boolean(listResult?.notesDir);
                if (!hasFolder) {
                    const folderResult = await IPC.chooseFolder();
                    if (folderResult?.canceled) return;
                }

                const createResult = await IPC.createFile(filename);
                const actualFilename = createResult?.filename || filename;
                const writeResult = await IPC.writeFile(actualFilename, this.getContent());
                const finalContent = writeResult?.content ?? this.getContent();
                this.loadFile(actualFilename, finalContent);

                if (window.NotesUI?.refresh) {
                    window.NotesUI.refresh();
                }
            } catch (error) {
                console.error('Save error:', error);
                alert('Failed to save file: ' + error.message);
            }
            return;
        }

        try {
            const result = await IPC.writeFile(this.currentFile, this.getContent());
            if (result?.content && result.content !== this.getContent()) {
                this.setContent(result.content);
            }
            this.isDirty = false;
            this.updateSaveButton();
            console.log('File saved:', this.currentFile);
        } catch (error) {
            console.error('Save error:', error);
            alert('Failed to save file: ' + error.message);
        }
    },

    /**
     * Update save button state
     */
    updateSaveButton() {
        const saveBtn = document.getElementById('save-btn');
        if (!saveBtn) return;

        saveBtn.disabled = !this.isDirty || this.currentFileType !== 'text';
        saveBtn.textContent = this.isDirty ? 'Save *' : 'Save';
    },

    updateUndoButton() {
        const undoBtn = document.getElementById('undo-btn');
        if (!undoBtn) return;
        undoBtn.disabled = !this.currentFile || this.currentFileType !== 'text';
    },

    /**
     * Show save status indicator
     */
    showSaveStatus(message, hideAfter = 0) {
        const saveBtn = document.getElementById('save-btn');
        if (!saveBtn) return;

        saveBtn.textContent = message;
        saveBtn.style.opacity = '0.7';

        if (hideAfter > 0) {
            setTimeout(() => {
                saveBtn.textContent = this.isDirty ? 'Save *' : 'Save';
                saveBtn.style.opacity = '1';
            }, hideAfter);
        } else {
            saveBtn.style.opacity = '1';
        }
    }
};

// Export globally IMMEDIATELY (before DOMContentLoaded)
window.Editor = CodeMirrorEditor;

export default CodeMirrorEditor;
