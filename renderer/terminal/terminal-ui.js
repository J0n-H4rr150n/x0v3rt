/**
 * Terminal UI (xterm.js)
 *
 * Provides VS Code-style integrated terminal panel.
 */

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

const TerminalUI = {
    panel: null,
    editorContainer: null,
    hideBtn: null,
    newBtn: null,
    splitBtn: null,
    minBtn: null,
    maxBtn: null,
    resizer: null,
    isVisible: false,
    cleanupHandlers: [],
    panes: {},
    activePaneId: 'primary',
    sessionCounter: 0,
    sessionsById: new Map(),
    isClosingSplit: false,
    isResizing: false,
    startY: 0,
    startHeight: 0,
    lastHeight: 240,
    isMaximized: false,
    initialized: false,

    init() {
        if (this.initialized) {
            return;
        }

        // Clean up any previous handlers if init is retried
        if (this.cleanupHandlers.length > 0) {
            this.cleanupHandlers.forEach((dispose) => {
                try {
                    dispose?.();
                } catch (error) {
                    console.warn('[TerminalUI] Cleanup handler error:', error);
                }
            });
            this.cleanupHandlers = [];
        }

        this.panel = document.getElementById('terminal-panel');
        this.editorContainer = document.querySelector('.editor-container');
        this.hideBtn = document.getElementById('terminal-hide-btn') || document.getElementById('terminal-close');
        this.newBtn = document.getElementById('terminal-new-btn');
        this.splitBtn = document.getElementById('terminal-split-btn');
        this.minBtn = document.getElementById('terminal-min-btn');
        this.maxBtn = document.getElementById('terminal-max-btn');
        this.resizer = document.getElementById('terminal-resizer');

        const primaryPane = document.querySelector('[data-pane="primary"]');
        const secondaryPane = document.querySelector('[data-pane="secondary"]');

        if (!this.panel) {
            return;
        }

        const fallbackContent = document.getElementById('terminal-container');

        if (primaryPane) {
            this.panes.primary = {
                id: 'primary',
                paneEl: primaryPane,
                tabsEl: document.getElementById('terminal-tabs-primary'),
                contentEl: document.getElementById('terminal-content-primary'),
                terminals: new Map(),
                activeId: null,
                visible: true
            };

            this.panes.secondary = {
                id: 'secondary',
                paneEl: secondaryPane,
                tabsEl: document.getElementById('terminal-tabs-secondary'),
                contentEl: document.getElementById('terminal-content-secondary'),
                terminals: new Map(),
                activeId: null,
                visible: false
            };
        } else if (fallbackContent) {
            this.panes.primary = {
                id: 'primary',
                paneEl: this.panel,
                tabsEl: null,
                contentEl: fallbackContent,
                terminals: new Map(),
                activeId: null,
                visible: true
            };
            this.panes.secondary = {
                id: 'secondary',
                paneEl: null,
                tabsEl: null,
                contentEl: null,
                terminals: new Map(),
                activeId: null,
                visible: false
            };
        } else {
            return;
        }

        this.initialized = true;

        this.hideBtn?.addEventListener('click', () => this.hide());
        this.newBtn?.addEventListener('click', () => this.createTerminal(this.activePaneId));
        this.splitBtn?.addEventListener('click', () => this.toggleSplit());
        this.minBtn?.addEventListener('click', () => this.minimize());
        this.maxBtn?.addEventListener('click', () => this.maximize());

        this.resizer?.addEventListener('mousedown', (event) => this.onResizeStart(event));
        document.addEventListener('mousemove', (event) => this.onResizeMove(event));
        document.addEventListener('mouseup', () => this.onResizeEnd());

        primaryPane?.addEventListener('click', () => this.setActivePane('primary'));
        secondaryPane?.addEventListener('click', () => this.setActivePane('secondary'));

        this.cleanupHandlers.push(
            window.IPC.onTerminalToggle(() => this.toggle()),
            window.IPC.onTerminalData((payload) => this.write(payload)),
            window.IPC.onTerminalExit((terminalId) => this.onExit(terminalId))
        );

        window.addEventListener('resize', () => this.fitVisible());

        // Optional: toggle with Ctrl+`
        document.addEventListener('keydown', (event) => {
            if (event.key === '`' && event.ctrlKey) {
                event.preventDefault();
                this.toggle();
            }
        });
    },

    setActivePane(paneId) {
        if (!this.panes[paneId]) return;
        this.activePaneId = paneId;
    },

    toggleSplit() {
        const secondary = this.panes.secondary;
        if (!secondary?.paneEl) return;

        if (secondary.visible) {
            this.closeSplit();
        } else {
            secondary.paneEl.classList.remove('hidden');
            secondary.visible = true;
            this.setActivePane('secondary');
            if (secondary.terminals.size === 0) {
                this.createTerminal('secondary');
            }
            this.fitVisible();
        }
    },

    closeSplit() {
        const secondary = this.panes.secondary;
        if (!secondary?.paneEl) return;

        this.isClosingSplit = true;

        for (const terminalId of secondary.terminals.keys()) {
            this.closeTerminal(terminalId);
        }

        secondary.paneEl.classList.add('hidden');
        secondary.visible = false;
        this.setActivePane('primary');
        this.fitVisible();

        this.isClosingSplit = false;
    },

    async createTerminal(paneId) {
        const pane = this.panes[paneId];
        if (!pane) return;

        const response = await window.IPC.createTerminal();
        const terminalId = response?.terminalId;
        if (!terminalId) return;

        const terminal = new Terminal({
            fontFamily: "'Cascadia Mono', 'Consolas', 'Monaco', 'Courier New', monospace",
            fontSize: 13,
            cursorBlink: true,
            theme: {
                background: '#0a0a0a',
                foreground: '#e0e0e0',
                cursor: '#4a9eff',
                selection: '#1a1f2e'
            }
        });

        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);

        const instanceEl = document.createElement('div');
        instanceEl.className = 'terminal-instance';
        pane.contentEl.appendChild(instanceEl);
        terminal.open(instanceEl);

        const sessionNumber = ++this.sessionCounter;
        const title = `bash ${sessionNumber}`;

        const tabEl = document.createElement('div');
        tabEl.className = 'terminal-tab';
        tabEl.innerHTML = `<span>${title}</span>`;
        const closeBtn = document.createElement('button');
        closeBtn.className = 'terminal-tab-close';
        closeBtn.textContent = '×';
        tabEl.appendChild(closeBtn);

        tabEl.addEventListener('click', () => {
            this.setActivePane(paneId);
            this.activateTerminal(terminalId);
        });

        closeBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            this.closeTerminal(terminalId);
        });

        if (pane.tabsEl) {
            pane.tabsEl.appendChild(tabEl);
        }

        terminal.onData((data) => {
            window.IPC.sendTerminalInput(terminalId, data);
        });

        const session = {
            terminalId,
            title,
            terminal,
            fitAddon,
            paneId,
            tabEl,
            instanceEl
        };

        pane.terminals.set(terminalId, session);
        this.sessionsById.set(terminalId, session);
        this.activateTerminal(terminalId);
        this.fitSession(session);
    },

    async show() {
        if (!this.panel) return;
        this.panel.classList.remove('hidden');
        this.isVisible = true;
        if (this.panel.classList.contains('minimized')) {
            this.panel.classList.remove('minimized');
        }
        if (!this.panel.classList.contains('maximized')) {
            this.panel.style.height = `${this.lastHeight}px`;
        }
        if (this.panes.primary.terminals.size === 0) {
            await this.createTerminal('primary');
        }
        this.fitVisible();
        this.focusActiveTerminal();
    },

    hide() {
        if (!this.panel) return;
        this.panel.classList.add('hidden');
        this.panel.classList.remove('maximized');
        this.editorContainer?.classList.remove('terminal-maximized');
        this.isMaximized = false;
        this.updateMaxButton();
        this.isVisible = false;
    },

    minimize() {
        if (!this.panel) return;
        this.panel.classList.remove('maximized');
        this.panel.classList.add('minimized');
        this.editorContainer?.classList.remove('terminal-maximized');
        this.isMaximized = false;
        this.updateMaxButton();
        this.fitVisible();
    },

    maximize() {
        if (!this.panel) return;
        if (this.isMaximized) {
            this.panel.classList.remove('maximized');
            this.editorContainer?.classList.remove('terminal-maximized');
            this.panel.style.height = `${this.lastHeight}px`;
            this.isMaximized = false;
        } else {
            this.panel.classList.remove('minimized');
            this.panel.classList.add('maximized');
            this.editorContainer?.classList.add('terminal-maximized');
            this.panel.style.height = '100%';
            this.isMaximized = true;
        }
        this.updateMaxButton();
        this.fitVisible();
    },

    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    },

    focusActiveTerminal() {
        const pane = this.panes[this.activePaneId];
        if (!pane?.activeId) return;
        const session = this.sessionsById.get(pane.activeId);
        session?.terminal?.focus();
    },

    activateTerminal(terminalId) {
        const session = this.sessionsById.get(terminalId);
        if (!session) return;

        const pane = this.panes[session.paneId];
        if (!pane) return;

        pane.activeId = terminalId;

        for (const [id, item] of pane.terminals.entries()) {
            const isActive = id === terminalId;
            if (item.tabEl) {
                item.tabEl.classList.toggle('active', isActive);
            }
            item.instanceEl.style.display = isActive ? 'block' : 'none';
        }

        this.fitSession(session);
        session.terminal.focus();
    },

    closeTerminal(terminalId) {
        const session = this.sessionsById.get(terminalId);
        if (!session) return;

        window.IPC.disposeTerminal(terminalId);

        const pane = this.panes[session.paneId];
        pane?.terminals.delete(terminalId);
        this.sessionsById.delete(terminalId);

        session.tabEl?.remove();
        session.instanceEl.remove();

        if (pane) {
            if (pane.terminals.size > 0) {
                const [nextId] = pane.terminals.keys();
                this.activateTerminal(nextId);
            } else if (pane.id === 'primary') {
                this.createTerminal('primary');
            } else if (!this.isClosingSplit) {
                this.closeSplit();
            }
        }
    },

    fitSession(session) {
        if (!session || !this.isVisible) return;
        const pane = this.panes[session.paneId];
        if (!pane?.visible) return;
        session.fitAddon.fit();
        window.IPC.resizeTerminal(session.terminalId, session.terminal.cols, session.terminal.rows);
    },

    fitVisible() {
        if (!this.isVisible) return;
        for (const session of this.sessionsById.values()) {
            this.fitSession(session);
        }
    },

    onResizeStart(event) {
        if (!this.panel || !this.isVisible) return;
        this.isResizing = true;
        this.startY = event.clientY;
        this.startHeight = this.panel.getBoundingClientRect().height;
        this.panel.classList.remove('minimized');
        this.panel.classList.remove('maximized');
        this.editorContainer?.classList.remove('terminal-maximized');
        this.isMaximized = false;
        this.updateMaxButton();
        event.preventDefault();
    },

    onResizeMove(event) {
        if (!this.isResizing || !this.panel) return;
        const dy = this.startY - event.clientY;
        const newHeight = Math.min(Math.max(this.startHeight + dy, 120), window.innerHeight * 0.7);
        this.panel.style.height = `${newHeight}px`;
        this.lastHeight = newHeight;
        this.fitVisible();
    },

    onResizeEnd() {
        if (!this.isResizing || !this.panel) return;
        this.isResizing = false;
    },

    updateMaxButton() {
        if (!this.maxBtn) return;
        if (this.isMaximized) {
            this.maxBtn.textContent = '▣';
            this.maxBtn.title = 'Restore Terminal';
        } else {
            this.maxBtn.textContent = '▢';
            this.maxBtn.title = 'Maximize Terminal';
        }
    },

    write(payload) {
        const terminalId = payload?.terminalId;
        const data = payload?.data;
        if (!terminalId || typeof data !== 'string') return;
        const session = this.sessionsById.get(terminalId);
        if (!session) return;
        session.terminal.write(data);
    },

    onExit(terminalId) {
        const session = this.sessionsById.get(terminalId);
        if (!session) return;
        session.terminal.write('\r\n[process exited]\r\n');
    }
};

// Export globally
window.TerminalUI = TerminalUI;
