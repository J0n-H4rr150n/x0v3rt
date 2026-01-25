/**
 * Vertex AI Client
 *
 * Handles communication with GCP Vertex AI (Gemini 2.5 Flash)
 * Requires GCP credentials to be configured
 */

const { VertexAI } = require('@google-cloud/vertexai');
const { ipcMain } = require('electron');
require('dotenv').config();

let vertexAI = null;
let model = null;

/**
 * Initialize Vertex AI client
 */
function initializeVertexAI() {
    try {
        const projectId = process.env.GCP_PROJECT_ID;
        const location = process.env.GCP_REGION || 'us-central1';
        const modelName = process.env.VERTEX_AI_MODEL || 'gemini-2.5-flash';

        if (!projectId) {
            console.warn('GCP_PROJECT_ID not set. AI features will be disabled.');
            console.warn('Set up credentials in .env file');
            return false;
        }

        // Initialize Vertex AI
        vertexAI = new VertexAI({
            project: projectId,
            location: location
        });

        // Get generative model
        model = vertexAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                maxOutputTokens: 8192,
                temperature: 0.7,
                topP: 0.95
            }
        });

        console.log(`✓ Vertex AI initialized: ${modelName}`);
        return true;

    } catch (error) {
        console.error('Vertex AI initialization error:', error);
        console.error('Make sure GOOGLE_APPLICATION_CREDENTIALS is set');
        return false;
    }
}

/**
 * Send message to Gemini
 * @param {string} message - User message
 * @param {object} context - Context object (current note, etc.)
 * @returns {Promise<object>} AI response with metadata
 */
async function sendMessage(message, context = {}) {
    if (!model) {
        throw new Error('Vertex AI not initialized. Check your GCP credentials.');
    }

    try {
        const startTime = Date.now();

        // Build prompt with context
        const systemPrompt = buildSystemPrompt();
        const contextPrompt = buildContextPrompt(context);
        const fullPrompt = `${systemPrompt}\n\n${contextPrompt}\n\nUser: ${message}\n\nAssistant:`;

        // Send request
        const result = await model.generateContent(fullPrompt);
        const response = result.response;
        const text = response.candidates[0].content.parts[0].text;

        const usage = response.usageMetadata || response.usage || null;
        const totalTokens = usage?.totalTokenCount ?? usage?.totalTokens ?? null;
        const promptTokens = usage?.promptTokenCount ?? usage?.promptTokens ?? null;
        const responseTokens = usage?.candidatesTokenCount ?? usage?.responseTokenCount ?? usage?.responseTokens ?? null;
        const elapsedMs = Date.now() - startTime;

        return {
            text,
            usage: {
                totalTokens,
                promptTokens,
                responseTokens
            },
            elapsedMs,
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        console.error('Vertex AI error:', error);
        throw new Error(`AI request failed: ${error.message}`);
    }
}

/**
 * Build system prompt
 * @returns {string}
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

/**
 * Build context prompt from current state
 * @param {object} context - Context object
 * @returns {string}
 */
function buildContextPrompt(context) {
    let prompt = '';

    if (context.currentNote) {
        prompt += `\n--- Current Note Content ---\n${context.currentNote}\n`;
    }

    // Future: Add terminal output, screenshot metadata, etc.

    return prompt;
}

/**
 * Register IPC handlers
 */
function registerHandlers() {
    ipcMain.handle('ai:send-message', async (_event, message, context) => {
        try {
            return await sendMessage(message, context);
        } catch (error) {
            console.error('AI message error:', error);
            throw error;
        }
    });
}

module.exports = {
    initializeVertexAI,
    registerHandlers
};
