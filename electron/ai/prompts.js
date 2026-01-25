/**
 * Shared prompt builders for AI providers
 */

function buildSystemPrompt() {
    return `You are an expert security researcher and bug bounty hunter assistant.
You help analyze web applications, identify vulnerabilities, and document findings.

Your capabilities:
- Analyze recon data and suggest attack vectors
- Explain security vulnerabilities in detail
- Help write clear, professional bug bounty reports
- Suggest tools and techniques for testing
- Review and improve security documentation

Be concise, technical, and security-focused. Provide actionable advice.`;
}

function buildContextPrompt(context = {}) {
    let prompt = '';

    if (context.currentNote) {
        prompt += `\n--- Current Note Content ---\n${context.currentNote}\n`;
    }

    if (context.chat) {
        const { summary, recentMessages, olderMessageCount } = context.chat;

        if (summary) {
            prompt += `\n--- Chat Summary (earlier messages) ---\n${summary}\n`;
        }

        if (Array.isArray(recentMessages) && recentMessages.length) {
            prompt += `\n--- Recent Chat ---\n`;
            for (const message of recentMessages) {
                const role = message.role === 'ai' ? 'Assistant' : message.role === 'user' ? 'User' : 'System';
                prompt += `${role}: ${message.content}\n`;
            }
        }

        if (olderMessageCount > 0) {
            prompt += `\n(Older messages available via chat history tools.)\n`;
        }
    }

    return prompt;
}

module.exports = {
    buildSystemPrompt,
    buildContextPrompt
};
