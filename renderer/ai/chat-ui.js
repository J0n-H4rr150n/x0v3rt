/**
 * AI Chat UI
 *
 * Handles chat interface, message rendering, and AI communication
 */

const ChatUI = {
    messagesContainer: null,
    inputField: null,
    sendButton: null,
    modelSelect: null,
    modelLabel: null,
    sessionId: null,
    workspacePath: null,
    isLoadingHistory: false,
    sessionsContainer: null,
    newChatBtn: null,
    sessions: [],
    searchInput: null,
    searchResults: null,
    searchTimeout: null,
    messageCounter: 0,
    temperatureInput: null,
    topPInput: null,
    maxOutputTokensInput: null,
    contextWindowInput: null,
    modelRegistry: [],
    modelMap: new Map(),
    activeProviderId: 'vertex',

    /**
     * Initialize chat UI
     */
    init() {
        this.messagesContainer = document.getElementById('chat-messages');
        this.inputField = document.getElementById('chat-input');
        this.sendButton = document.getElementById('chat-send');
        this.modelSelect = document.getElementById('model-select');
        this.modelLabel = document.querySelector('.ai-model');
        this.aiConfigPanel = document.getElementById('ai-config-panel');
        this.aiSettingsToggle = document.getElementById('ai-settings-toggle');
        this.aiSettingsClose = document.getElementById('ai-config-close');
        this.sessionsContainer = document.getElementById('chat-sessions');
        this.newChatBtn = document.getElementById('new-chat-btn');
        this.searchInput = document.getElementById('chat-search');
        this.searchResults = document.getElementById('chat-search-results');
        this.temperatureInput = document.getElementById('temperature');
        this.topPInput = document.getElementById('top-p');
        this.maxOutputTokensInput = document.getElementById('max-output-tokens');
        this.contextWindowInput = document.getElementById('context-window');

        // Settings toggle logic
        if (this.aiSettingsToggle && this.aiConfigPanel) {
            this.aiSettingsToggle.addEventListener('click', () => {
                this.aiConfigPanel.classList.toggle('hidden');
            });
        }

        if (this.aiSettingsClose && this.aiConfigPanel) {
            this.aiSettingsClose.addEventListener('click', () => {
                this.aiConfigPanel.classList.add('hidden');
            });
        }

        // Safety check - exit if critical elements don't exist
        if (!this.messagesContainer || !this.inputField || !this.sendButton) {
            console.error('[ChatUI] Required elements not found - skipping initialization');
            return;
        }

        // Set up event listeners
        this.sendButton.addEventListener('click', () => this.sendMessage());

        this.inputField.addEventListener('keydown', (e) => {
            // Send on Enter, allow Shift+Enter for newline
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.inputField.addEventListener('input', () => this.autosizeInput());
        this.autosizeInput();

        this.loadModelRegistry().finally(() => {
            this.loadChatPreferences();
            this.updateModelLabel();
        });
        this.modelSelect?.addEventListener('change', () => {
            this.persistChatPreferences();
            this.updateModelLabel();
        });
        this.temperatureInput?.addEventListener('change', () => this.persistChatPreferences());
        this.topPInput?.addEventListener('change', () => this.persistChatPreferences());
        this.maxOutputTokensInput?.addEventListener('change', () => this.persistChatPreferences());
        this.contextWindowInput?.addEventListener('change', () => this.persistChatPreferences());

        // Session management
        if (this.newChatBtn) {
            this.newChatBtn.addEventListener('click', () => this.createNewChat());
        }

        this.initChatSearch();

        this.initializeSession();
        this.loadSessionList();

        if (window.IPC?.onNotesFolderChanged) {
            window.IPC.onNotesFolderChanged(() => {
                this.initializeSession(true);
                this.loadSessionList();
            });
        }

        console.log('Chat UI initialized');
    },

    async loadSessionList() {
        try {
            const result = await window.IPC.listChatSessions();
            this.sessions = result?.sessions || [];
            this.renderSessionList();
        } catch (error) {
            console.error('Failed to load session list:', error);
            this.sessions = [];
        }
    },

    async loadModelRegistry() {
        if (!this.modelSelect) return;

        try {
            const models = await window.IPC.listModels();
            this.modelRegistry = Array.isArray(models) ? models : [];
            this.modelMap = new Map(this.modelRegistry.map((model) => [model.id, model]));
            const activeProvider = await this.getActiveProviderId();
            this.activeProviderId = activeProvider;
            this.populateModelSelect(activeProvider);
        } catch (error) {
            console.warn('Failed to load model registry:', error);
            this.populateFallbackModels();
        }
    },

    async getActiveProviderId() {
        try {
            const prefs = await window.SettingsIPC?.getSystemPreferences?.();
            return prefs?.aiProvider?.activeProvider || 'vertex';
        } catch (error) {
            return 'vertex';
        }
    },

    populateModelSelect(activeProvider) {
        if (!this.modelSelect) return;

        const models = this.modelRegistry.length
            ? this.modelRegistry.filter((model) => !model.provider || model.provider === activeProvider)
            : [];

        models.sort((a, b) => {
            const aLabel = (a.label || a.id || '').toLowerCase();
            const bLabel = (b.label || b.id || '').toLowerCase();
            return aLabel.localeCompare(bLabel, undefined, { numeric: true });
        });

        if (!models.length) {
            this.populateFallbackModels(activeProvider);
            return;
        }

        this.modelSelect.innerHTML = '';
        models.forEach((model, index) => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.label || model.id;
            if (index === 0) option.selected = true;
            this.modelSelect.appendChild(option);
        });
    },

    populateFallbackModels(activeProvider = 'vertex') {
        if (!this.modelSelect || this.modelSelect.options.length) return;
        if (activeProvider !== 'vertex') return;
        const fallback = [
            { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
            { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }
        ];
        fallback.forEach((model, index) => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.label;
            if (index === 0) option.selected = true;
            this.modelSelect.appendChild(option);
        });
    },

    renderSessionList() {
        if (!this.sessionsContainer) return;

        this.sessionsContainer.innerHTML = '';

        if (!this.sessions.length) {
            return;
        }

        this.sessions.forEach(session => {
            const sessionItem = document.createElement('div');
            sessionItem.className = 'session-item';
            if (session.id === this.sessionId) {
                sessionItem.classList.add('active');
            }

            const sessionInfo = document.createElement('div');
            sessionInfo.className = 'session-info';

            const title = document.createElement('div');
            title.className = 'session-title';
            title.textContent = session.title || 'New Chat';
            title.title = session.title || 'New Chat';

            const meta = document.createElement('div');
            meta.className = 'session-meta';
            const timeStamp = this.formatTimestamp(session.createdAt || session.updatedAt);
            const count = session.messageCount || 0;
            meta.textContent = `${timeStamp} · ${count} message${count !== 1 ? 's' : ''}`;

            sessionInfo.appendChild(title);
            sessionInfo.appendChild(meta);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'session-delete';
            deleteBtn.textContent = '×';
            deleteBtn.title = 'Delete session';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteSession(session.id);
            });

            const renameBtn = document.createElement('button');
            renameBtn.className = 'session-rename';
            renameBtn.textContent = '✎';
            renameBtn.title = 'Rename session';
            renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.renameSession(session);
            });

            sessionItem.appendChild(sessionInfo);
            sessionItem.appendChild(renameBtn);
            sessionItem.appendChild(deleteBtn);

            sessionItem.addEventListener('click', () => {
                this.switchSession(session.id);
            });

            this.sessionsContainer.appendChild(sessionItem);
        });
    },

    async createNewChat() {
        try {
            const existingSessions = await window.IPC.listChatSessions();
            const existing = existingSessions?.sessions || [];
            const baseTitle = 'New Chat';
            const existingCount = existing.filter((item) =>
                String(item?.title || '').startsWith(baseTitle)
            ).length;

            const result = await window.IPC.createChatSession();
            const newSession = result?.session;
            if (!newSession) {
                console.error('Failed to create new session');
                return;
            }

            if (existingCount > 0 && window.IPC?.updateChatSession) {
                const suffix = existingCount + 1;
                await window.IPC.updateChatSession(newSession.id, {
                    title: `${baseTitle} (${suffix})`
                });
            }

            this.sessionId = newSession.id;
            const storageKey = `x0v3rt:chat:session:${this.workspacePath}`;
            if (this.workspacePath) {
                localStorage.setItem(storageKey, this.sessionId);
            }

            this.clearChat();
            await this.loadSessionList();
        } catch (error) {
            console.error('Error creating new chat:', error);
        }
    },

    async switchSession(sessionId) {
        if (sessionId === this.sessionId) return;

        this.sessionId = sessionId;
        const storageKey = `x0v3rt:chat:session:${this.workspacePath}`;
        if (this.workspacePath) {
            localStorage.setItem(storageKey, sessionId);
        }

        await this.loadSessionHistory();
        this.renderSessionList();
    },

    async deleteSession(sessionId) {
        const confirmed = confirm('Are you sure you want to delete this chat session?');
        if (!confirmed) return;

        try {
            await window.IPC.deleteChatSession(sessionId);

            // If we deleted the active session, create a new one
            if (sessionId === this.sessionId) {
                await this.createNewChat();
            } else {
                await this.loadSessionList();
            }
        } catch (error) {
            console.error('Error deleting session:', error);
            alert('Failed to delete session');
        }
    },

    async renameSession(session) {
        if (!session?.id) return;
        const currentTitle = session.title || 'New Chat';
        const nextTitle = await window.Dialog.showInput(
            'Rename Chat',
            'Chat title',
            currentTitle
        );
        if (!nextTitle || nextTitle === currentTitle) return;

        try {
            await window.IPC.updateChatSession(session.id, { title: nextTitle });
            await this.loadSessionList();
        } catch (error) {
            console.error('Rename session error:', error);
            alert('Failed to rename session');
        }
    },

    formatTimestamp(isoString) {
        if (!isoString) return 'Unknown';
        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) return isoString;
        return date.toLocaleString();
    },

    loadChatPreferences() {
        try {
            const model = localStorage.getItem('x0v3rt:chat:model');
            const temperature = localStorage.getItem('x0v3rt:chat:temperature');
            const topP = localStorage.getItem('x0v3rt:chat:topP');
            const maxOutputTokens = localStorage.getItem('x0v3rt:chat:maxOutputTokens');
            const contextWindow = localStorage.getItem('x0v3rt:chat:contextWindow');

            if (model && this.modelSelect) this.modelSelect.value = model;
            if (this.modelSelect && !this.modelSelect.value && this.modelSelect.options.length > 0) {
                this.modelSelect.selectedIndex = 0;
            }
            if (temperature && this.temperatureInput) this.temperatureInput.value = temperature;
            if (topP && this.topPInput) this.topPInput.value = topP;
            if (maxOutputTokens && this.maxOutputTokensInput) this.maxOutputTokensInput.value = maxOutputTokens;
            if (contextWindow && this.contextWindowInput) this.contextWindowInput.value = contextWindow;

            this.updateModelLabel();
        } catch (error) {
            console.warn('Failed to load chat preferences:', error);
        }
    },

    persistChatPreferences() {
        try {
            if (this.modelSelect) {
                localStorage.setItem('x0v3rt:chat:model', this.modelSelect.value);
            }
            if (this.temperatureInput) {
                localStorage.setItem('x0v3rt:chat:temperature', this.temperatureInput.value);
            }
            if (this.topPInput) {
                localStorage.setItem('x0v3rt:chat:topP', this.topPInput.value);
            }
            if (this.maxOutputTokensInput) {
                localStorage.setItem('x0v3rt:chat:maxOutputTokens', this.maxOutputTokensInput.value);
            }
            if (this.contextWindowInput) {
                localStorage.setItem('x0v3rt:chat:contextWindow', this.contextWindowInput.value);
            }
        } catch (error) {
            console.warn('Failed to persist chat preferences:', error);
        }
    },

    updateModelLabel() {
        if (!this.modelLabel) return;
        const label = this.getSelectedModelLabel();
        this.modelLabel.textContent = label || 'Default';
    },

    getSelectedModelLabel() {
        const option = this.modelSelect?.options?.[this.modelSelect.selectedIndex];
        if (!option) return '';
        return option.text.replace('Model: ', '');
    },

    getSelectedModelInfo() {
        const modelId = this.modelSelect?.value;
        if (!modelId) return null;
        const model = this.modelMap.get(modelId);
        if (!model) return { modelId };
        if (model.provider && model.provider !== this.activeProviderId) return null;
        return {
            modelId: model.id,
            location: model.location,
            provider: model.provider,
            type: model.type
        };
    },

    async initializeSession(forceNew = false) {
        try {
            const workspacePath = await window.IPC.getWorkspacePath();
            this.workspacePath = workspacePath || null;

            if (!workspacePath) {
                this.sessionId = null;
                this.clearChat();
                return;
            }

            const storageKey = `x0v3rt:chat:session:${workspacePath}`;
            let sessionId = !forceNew ? localStorage.getItem(storageKey) : null;

            if (!sessionId) {
                const result = await window.IPC.createChatSession();
                sessionId = result?.session?.id || null;
                if (sessionId) {
                    localStorage.setItem(storageKey, sessionId);
                }
            }

            this.sessionId = sessionId;
            await this.loadSessionHistory();
        } catch (error) {
            console.error('Chat session init error:', error);
        }
    },

    async loadSessionHistory() {
        if (!this.sessionId) return;
        this.isLoadingHistory = true;
        this.clearChat();

        try {
            const result = await window.IPC.getChatSession(this.sessionId);
            const session = result?.session;
            const messages = session?.messages || [];
            messages.forEach((message) => {
                this.addMessage(message.role, message.content, message.meta, true);
            });
        } catch (error) {
            console.error('Failed to load chat history:', error);
        } finally {
            this.isLoadingHistory = false;
        }
    },

    /**
     * Send message to AI
     */
    async sendMessage() {
        const message = this.inputField.value.trim();
        if (!message) return;

        // Clear input
        this.inputField.value = '';
        this.autosizeInput();

        // Add user message to UI
        this.addMessage('user', message);
        await this.persistMessage('user', message);

        // Build context
        const context = await window.ContextBuilder.buildContext();
        const generation = this.getGenerationSettings();
        if (generation) {
            context.generation = generation;
            this.applyContextWindow(context, generation.contextWindow);
        }
        const modelOverride = this.getSelectedModelInfo();
        if (modelOverride) {
            context.model = modelOverride;
        }

        try {
            // Show loading
            this.sendButton.disabled = true;
            this.sendButton.setAttribute('aria-busy', 'true');
            const idleLabel = this.sendButton.dataset.icon || this.sendButton.textContent || '➤';
            this.sendButton.dataset.icon = idleLabel;
            this.sendButton.textContent = '⟳';

            // Send to AI
            const response = await window.IPC.sendAIMessage(message, context);

            // Handle function calls
            if (response.type === 'function_call' && response.functionCalls) {
                await this.handleFunctionCalls(response);
            } else if (response.type === 'text') {
                // Normal text response
                const meta = this.buildMetaLine(response);
                this.addMessage('ai', response.text || '', meta);
                await this.persistMessage('ai', response.text || '', meta);
            } else {
                // Legacy format (backward compatibility)
                if (typeof response === 'string') {
                    this.addMessage('ai', response);
                    await this.persistMessage('ai', response);
                } else {
                    const meta = this.buildMetaLine(response);
                    this.addMessage('ai', response.text || '', meta);
                    await this.persistMessage('ai', response.text || '', meta);
                }
            }

        } catch (error) {
            console.error('AI message error:', error);
            this.addMessage('system', `Error: ${error.message}`);
            await this.persistMessage('system', `Error: ${error.message}`);
        } finally {
            this.sendButton.disabled = false;
            this.sendButton.removeAttribute('aria-busy');
            this.sendButton.textContent = this.sendButton.dataset.icon || '➤';
            // Refresh session list to update title and timestamp
            await this.loadSessionList();
        }
    },

    /**
     * Add message to chat
     * @param {string} role - 'user', 'ai', or 'system'
     * @param {string} content - Message content
     * @param {string} [meta] - Optional metadata line
     */
    addMessage(role, content, meta, skipPersist = false) {
        const messageDiv = document.createElement('details');
        messageDiv.className = `message message-collapsible ${role}`;
        messageDiv.open = true;
        messageDiv.setAttribute('open', '');
        messageDiv.dataset.role = role;
        messageDiv.dataset.content = content;
        messageDiv.dataset.messageId = `message-${++this.messageCounter}`;

        const summaryDiv = document.createElement('summary');
        summaryDiv.className = 'message-summary';

        const headerDiv = document.createElement('div');
        headerDiv.className = 'message-header';
        const modelLabel = this.getSelectedModelLabel();
        headerDiv.textContent = role === 'user'
            ? 'You'
            : role === 'ai'
                ? (modelLabel || 'AI')
                : 'System';

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'message-copy-btn';
        copyBtn.title = 'Copy message';
        copyBtn.textContent = '⧉';
        copyBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.copyMessageContent(content, copyBtn);
        });

        actionsDiv.appendChild(copyBtn);
        summaryDiv.appendChild(headerDiv);
        summaryDiv.appendChild(actionsDiv);

        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'message-body';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = content;
        bodyDiv.appendChild(contentDiv);

        if (meta && role === 'ai') {
            const metaDiv = document.createElement('div');
            metaDiv.className = 'message-meta';
            metaDiv.textContent = meta;
            bodyDiv.appendChild(metaDiv);
        }

        messageDiv.appendChild(summaryDiv);
        messageDiv.appendChild(bodyDiv);

        this.messagesContainer.appendChild(messageDiv);

        // Scroll to bottom
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    },

    getGenerationSettings() {
        const temperature = parseFloat(this.temperatureInput?.value);
        const topP = parseFloat(this.topPInput?.value);
        const maxOutputTokens = parseInt(this.maxOutputTokensInput?.value, 10);
        const contextWindow = parseInt(this.contextWindowInput?.value, 10);

        const generation = {};
        if (!Number.isNaN(temperature)) generation.temperature = temperature;
        if (!Number.isNaN(topP)) generation.topP = topP;
        if (!Number.isNaN(maxOutputTokens)) generation.maxOutputTokens = maxOutputTokens;
        if (!Number.isNaN(contextWindow)) generation.contextWindow = contextWindow;

        return Object.keys(generation).length ? generation : null;
    },

    applyContextWindow(context, contextWindow) {
        if (!contextWindow || !context?.currentNote) return;
        const maxChars = Math.max(0, Math.floor(contextWindow * 4));
        if (!maxChars || context.currentNote.length <= maxChars) return;

        const truncated = context.currentNote.slice(-maxChars);
        context.currentNote = `…(truncated to fit context window)\n${truncated}`;
    },

    async copyMessageContent(content, button) {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(content);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = content;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            if (button) {
                const original = button.textContent;
                button.textContent = '✓';
                button.classList.add('copied');
                setTimeout(() => {
                    button.textContent = original;
                    button.classList.remove('copied');
                }, 1200);
            }
        } catch (error) {
            console.error('Failed to copy message:', error);
        }
    },

    async persistMessage(role, content, meta) {
        if (this.isLoadingHistory) return;
        if (!this.sessionId) return;
        try {
            await window.IPC.appendChatMessage(this.sessionId, {
                role,
                content,
                meta
            });
        } catch (error) {
            console.error('Failed to persist chat message:', error);
        }
    },

    autosizeInput() {
        if (!this.inputField) return;
        const styles = window.getComputedStyle(this.inputField);
        const lineHeight = parseFloat(styles.lineHeight) || 20;
        const paddingTop = parseFloat(styles.paddingTop) || 0;
        const paddingBottom = parseFloat(styles.paddingBottom) || 0;
        const maxRows = 5;
        const maxHeight = (lineHeight * maxRows) + paddingTop + paddingBottom;

        this.inputField.style.height = 'auto';
        const nextHeight = Math.min(this.inputField.scrollHeight, maxHeight);
        this.inputField.style.height = `${nextHeight}px`;
        this.inputField.style.overflowY = this.inputField.scrollHeight > maxHeight ? 'auto' : 'hidden';
    },

    /**
     * Clear chat history
     */
    clearChat() {
        this.messagesContainer.innerHTML = '';
        this.messageCounter = 0;
        this.hideChatSearchResults();
    },

    initChatSearch() {
        if (!this.searchInput || !this.searchResults) return;

        this.searchInput.addEventListener('input', (event) => {
            const query = event.target.value.trim();
            if (this.searchTimeout) {
                clearTimeout(this.searchTimeout);
            }

            if (query.length < 2) {
                this.hideChatSearchResults();
                return;
            }

            this.searchTimeout = setTimeout(() => {
                this.performChatSearch(query);
            }, 150);
        });

        this.searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.searchInput.value = '';
                this.hideChatSearchResults();
            }
            if (event.key === 'Enter') {
                const first = this.searchResults.querySelector('.chat-search-result');
                if (first) {
                    first.click();
                }
            }
        });

        document.addEventListener('click', (event) => {
            if (!this.searchResults.contains(event.target) && event.target !== this.searchInput) {
                this.hideChatSearchResults();
            }
        });
    },

    performChatSearch(query) {
        if (!this.messagesContainer) return;

        const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
        const messages = Array.from(this.messagesContainer.querySelectorAll('.message'));
        const results = [];

        messages.forEach((message) => {
            const content = message.dataset.content || '';
            const role = message.dataset.role || 'system';
            const lower = content.toLowerCase();
            const isMatch = terms.every((term) => lower.includes(term));
            if (!isMatch) return;

            const matchIndex = this.findFirstMatchIndex(lower, terms);
            const snippet = this.buildSnippet(content, matchIndex, query);
            results.push({
                messageId: message.dataset.messageId,
                role,
                snippet
            });
        });

        this.renderChatSearchResults(results, query);
    },

    findFirstMatchIndex(text, terms) {
        let index = -1;
        terms.forEach((term) => {
            const found = text.indexOf(term);
            if (found >= 0 && (index === -1 || found < index)) {
                index = found;
            }
        });
        return index;
    },

    buildSnippet(content, matchIndex, query) {
        const snippetLength = 80;
        let start = 0;
        let end = Math.min(content.length, snippetLength);

        if (matchIndex >= 0) {
            start = Math.max(0, matchIndex - Math.floor(snippetLength / 2));
            end = Math.min(content.length, matchIndex + Math.floor(snippetLength / 2));
        }

        let snippet = content.slice(start, end);
        if (start > 0) snippet = `…${snippet}`;
        if (end < content.length) snippet = `${snippet}…`;

        return this.highlightQuery(snippet, query);
    },

    highlightQuery(text, query) {
        const escaped = this.escapeHtml(text);
        const terms = query.split(/\s+/).filter(Boolean).map((term) => this.escapeRegex(term));
        if (!terms.length) return escaped;
        const regex = new RegExp(`(${terms.join('|')})`, 'ig');
        return escaped.replace(regex, '<mark>$1</mark>');
    },

    escapeHtml(value) {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    escapeRegex(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },

    renderChatSearchResults(results, query) {
        if (!this.searchResults) return;
        this.searchResults.innerHTML = '';

        if (!results.length) {
            const empty = document.createElement('div');
            empty.className = 'chat-search-empty';
            empty.textContent = 'No results found';
            this.searchResults.appendChild(empty);
            this.showChatSearchResults();
            return;
        }

        results.forEach((result) => {
            const item = document.createElement('div');
            item.className = 'chat-search-result';
            item.dataset.messageId = result.messageId;

            const role = document.createElement('div');
            role.className = 'chat-search-role';
            role.textContent = result.role === 'user' ? 'You' : result.role === 'ai' ? 'AI' : 'System';

            const snippet = document.createElement('div');
            snippet.className = 'chat-search-snippet';
            snippet.innerHTML = result.snippet;

            item.appendChild(role);
            item.appendChild(snippet);

            item.addEventListener('click', () => {
                this.scrollToChatMessage(result.messageId);
            });

            this.searchResults.appendChild(item);
        });

        this.showChatSearchResults();
    },

    scrollToChatMessage(messageId) {
        if (!messageId) return;
        const message = this.messagesContainer?.querySelector(`[data-message-id="${messageId}"]`);
        if (!message) return;

        message.open = true;
        message.classList.add('search-highlight');
        message.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => message.classList.remove('search-highlight'), 1500);
        this.hideChatSearchResults();
    },

    showChatSearchResults() {
        this.searchResults.classList.remove('hidden');
    },

    hideChatSearchResults() {
        if (!this.searchResults) return;
        this.searchResults.classList.add('hidden');
        this.searchResults.innerHTML = '';
    },

    /**
     * Build metadata line for AI responses
     * @param {object} response
     * @returns {string}
     */
    buildMetaLine(response) {
        const timestamp = this.formatTimestamp(response.timestamp);
        const tokens = response?.usage?.totalTokens;
        const tokensLabel = typeof tokens === 'number' ? `${tokens} tokens` : 'tokens: n/a';
        const elapsedLabel = this.formatElapsed(response?.elapsedMs);

        return `${timestamp} | ${tokensLabel} | ${elapsedLabel}`;
    },

    /**
     * Handle function calls from AI
     */
    async handleFunctionCalls(response) {
        console.log('[ChatUI] Handling function calls:', response.functionCalls);

        for (const functionCall of response.functionCalls) {
            const { name, args } = functionCall;

            try {
                // Show tool execution status
                this.addMessage('system', `⚙️ Executing tool: ${name}...`);

                // Execute the tool via Extension Registry
                const result = await window.ExtensionRegistry.executeTool(name, args);

                if (result.success) {
                    let successMsg = `✅ ${result.message}`;

                    if (result.filename) {
                        successMsg += `\n\nArtifact: \`${result.filename}\``;
                    }

                    if (result.content) {
                        successMsg += `\n\n${result.content}`;
                    }

                    if (Array.isArray(result.artifacts)) {
                        const list = result.artifacts.map((item) => `- ${item.name}`).join('\n');
                        successMsg += `\n\nArtifacts:\n${list || 'None'}`;
                    }

                    if (Array.isArray(result.results)) {
                        const list = result.results.map((item) => {
                            if (typeof item === 'string') return `- ${item}`;
                            if (item?.name) return `- ${item.name}`;
                            if (item?.path) return `- ${item.path}`;
                            return `- ${JSON.stringify(item)}`;
                        }).join('\n');
                        successMsg += `\n\nResults:\n${list || 'None'}`;
                    }
                    this.addMessage('system', successMsg);
                    await this.persistMessage('system', successMsg);
                } else {
                    this.addMessage('system', `❌ Tool execution failed: ${result.error || 'Unknown error'}`);
                }
            } catch (error) {
                console.error('[ChatUI] Tool execution error:', error);
                this.addMessage('system', `❌ Failed to execute ${name}: ${error.message}`);
            }
        }
    },

    /**
     * Format timestamp as YYYY-MM-DD HH:MM:SS
     * @param {string} [iso]
     * @returns {string}
     */
    formatTimestamp(iso) {
        const date = iso ? new Date(iso) : new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const yyyy = date.getFullYear();
        const mm = pad(date.getMonth() + 1);
        const dd = pad(date.getDate());
        const hh = pad(date.getHours());
        const mi = pad(date.getMinutes());
        const ss = pad(date.getSeconds());
        return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
    },

    /**
     * Format elapsed time
     * @param {number} [ms]
     * @returns {string}
     */
    formatElapsed(ms) {
        if (typeof ms !== 'number') return 'elapsed: n/a';
        if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
        return `${ms}ms`;
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    ChatUI.init();
});

// Export globally
window.ChatUI = ChatUI;
