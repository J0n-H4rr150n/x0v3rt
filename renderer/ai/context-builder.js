/**
 * Context Builder
 *
 * Builds context for AI from current note and environment
 */

const ContextBuilder = {
    /**
     * Current editor content (set by editor-init.js)
     */
    currentContent: '',

    /**
     * Build context for AI message
     * @returns {Promise<object>} Context object
     */
    async buildContext() {
        // Get active file information
        let activeFile = null;
        try {
            if (window.IPC?.getActiveFile) {
                activeFile = await window.IPC.getActiveFile();
            }
        } catch (error) {
            console.warn('Could not get active file for context:', error);
        }

        let chatContext = null;
        try {
            chatContext = await this.buildChatContext();
        } catch (error) {
            console.warn('Could not build chat context:', error);
        }

        const context = {
            currentNote: this.currentContent,
            activeFile: activeFile,
            timestamp: new Date().toISOString(),
            chat: chatContext,
            // Future: Add terminal output, screenshot metadata, etc.
        };

        // Add enabled extension tools
        try {
            if (window.ExtensionRegistry && window.ExtensionRegistry.initialized) {
                const tools = await window.ExtensionRegistry.getEnabledTools();
                if (tools.length > 0) {
                    context.tools = tools;
                }
            }
        } catch (error) {
            console.warn('Could not load extension tools:', error);
        }

        return context;
    },

    async buildChatContext() {
        if (!window.ChatUI?.sessionId || !window.IPC?.getChatSession) return null;

        let chatPrefs = null;
        try {
            chatPrefs = await window.SettingsIPC?.getSystemPreferences?.();
        } catch (error) {
            console.warn('Failed to load AI chat preferences:', error);
        }

        const aiChat = chatPrefs?.aiChat || {};
        if (aiChat.includeChatHistory === false) return null;

        const sessionId = window.ChatUI.sessionId;
        const result = await window.IPC.getChatSession(sessionId);
        const session = result?.session;
        if (!session?.messages || !Array.isArray(session.messages)) return null;

        const messages = session.messages;
        const maxRecent = Number.isFinite(aiChat.recentMessageCount)
            ? Math.max(0, aiChat.recentMessageCount)
            : 20;
        const recentMessages = maxRecent > 0 ? messages.slice(-maxRecent) : [];
        const olderMessages = maxRecent > 0
            ? messages.slice(0, Math.max(0, messages.length - maxRecent))
            : messages;

        const summaryMaxChars = Number.isFinite(aiChat.summaryMaxChars)
            ? Math.max(0, aiChat.summaryMaxChars)
            : 2000;
        const summary = summaryMaxChars > 0
            ? this.buildChatSummary(olderMessages, summaryMaxChars)
            : '';

        return {
            sessionId,
            summary,
            recentMessages: recentMessages.map((msg) => ({
                role: msg.role,
                content: msg.content,
                timestamp: msg.timestamp
            })),
            totalMessages: messages.length,
            olderMessageCount: olderMessages.length
        };
    },

    buildChatSummary(messages, maxChars = 2000) {
        if (!messages || messages.length === 0) return '';

        const lines = messages.map((msg) => {
            const role = msg.role === 'ai' ? 'Assistant' : msg.role === 'user' ? 'User' : 'System';
            const content = String(msg.content || '').replace(/\s+/g, ' ').trim();
            return `${role}: ${content}`;
        });

        let summary = lines.join('\n');
        if (summary.length > maxChars) {
            summary = `…${summary.slice(-maxChars)}`;
        }
        return summary;
    },

    /**
     * Update current note content
     * @param {string} content - Editor content
     */
    updateContent(content) {
        this.currentContent = content;
    },

    /**
     * Get current note content
     * @returns {string}
     */
    getContent() {
        return this.currentContent;
    }
};

// Export globally
window.ContextBuilder = ContextBuilder;
