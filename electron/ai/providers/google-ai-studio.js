/**
 * Google AI Studio Provider
 *
 * Uses Google's Generative Language API (free Gemini access)
 * Alternative to Vertex AI - requires only an API key from aistudio.google.com
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { buildSystemPrompt, buildContextPrompt } = require('../prompts');

let genAI = null;
let model = null;
let config = null;
let baseConfig = null;

function init(providerConfig = {}) {
    try {
        const apiKey = providerConfig.apiKey ||
            process.env.GOOGLE_AI_STUDIO_API_KEY;

        const modelName = providerConfig.model ||
            process.env.GOOGLE_AI_STUDIO_MODEL ||
            'gemini-2.0-flash-exp';

        if (!apiKey) {
            console.warn('Google AI Studio API key not set. Get one at aistudio.google.com');
            return false;
        }

        genAI = new GoogleGenerativeAI(apiKey);

        model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                maxOutputTokens: providerConfig.maxTokens || 8192,
                temperature: providerConfig.temperature || 0.7,
                topP: providerConfig.topP || 0.95
            }
        });

        config = {
            apiKey,
            model: modelName
        };

        baseConfig = {
            apiKey,
            modelName
        };

        console.log(`✓ Google AI Studio initialized: ${modelName}`);
        return true;
    } catch (error) {
        console.error('Google AI Studio initialization error:', error);
        return false;
    }
}

/**
 * Format tools for Gemini API
 * Same format as Vertex AI
 */
function formatToolsForGemini(tools) {
    if (!tools || !Array.isArray(tools) || tools.length === 0) {
        return null;
    }

    return [{
        functionDeclarations: tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
        }))
    }];
}

async function sendMessage(message, context = {}) {
    if (!model) {
        throw new Error('Google AI Studio not initialized. Check your API key.');
    }

    const startTime = Date.now();
    const systemPrompt = buildSystemPrompt();
    const contextPrompt = buildContextPrompt(context);

    // Build initial message
    const contents = [
        {
            role: 'user',
            parts: [{ text: `${systemPrompt}\\n\\n${contextPrompt}\\n\\n${message}` }]
        }
    ];

    // Format tools if available
    const tools = context.tools ? formatToolsForGemini(context.tools) : null;

    // Make API call with optional tools
    const requestConfig = { contents };
    const generation = context?.generation || {};
    const generationConfig = {};

    if (typeof generation.temperature === 'number') {
        generationConfig.temperature = generation.temperature;
    }
    if (typeof generation.topP === 'number') {
        generationConfig.topP = generation.topP;
    }
    if (typeof generation.maxOutputTokens === 'number') {
        generationConfig.maxOutputTokens = generation.maxOutputTokens;
    }

    if (Object.keys(generationConfig).length > 0) {
        requestConfig.generationConfig = generationConfig;
    }
    if (tools) {
        requestConfig.tools = tools;
    }

    const modelOverride = context?.model?.modelId;
    let requestModel = model;
    if (modelOverride && modelOverride !== baseConfig?.modelName) {
        requestModel = genAI.getGenerativeModel({
            model: modelOverride,
            generationConfig: Object.keys(generationConfig).length ? generationConfig : {
                maxOutputTokens: 8192,
                temperature: 0.7,
                topP: 0.95
            }
        });
    }

    const result = await requestModel.generateContent(requestConfig);
    const response = result.response;

    // Check if response contains function calls
    const firstCandidate = response.candidates?.[0];
    const functionCalls = firstCandidate?.content?.parts?.filter(part => part.functionCall);

    if (functionCalls && functionCalls.length > 0) {
        // AI wants to use tools - return function call info
        const usage = response.usageMetadata || response.usage || null;
        const elapsedMs = Date.now() - startTime;

        return {
            type: 'function_call',
            functionCalls: functionCalls.map(part => ({
                name: part.functionCall.name,
                args: part.functionCall.args
            })),
            usage: {
                totalTokens: usage?.totalTokenCount ?? null,
                promptTokens: usage?.promptTokenCount ?? null,
                responseTokens: usage?.candidatesTokenCount ?? null
            },
            elapsedMs,
            timestamp: new Date().toISOString()
        };
    }

    // Normal text response
    const text = firstCandidate?.content?.parts?.[0]?.text || '';
    const usage = response.usageMetadata || response.usage || null;
    const elapsedMs = Date.now() - startTime;

    return {
        type: 'text',
        text,
        usage: {
            totalTokens: usage?.totalTokenCount ?? null,
            promptTokens: usage?.promptTokenCount ?? null,
            responseTokens: usage?.candidatesTokenCount ?? null
        },
        elapsedMs,
        timestamp: new Date().toISOString()
    };
}

/**
 * Get config schema for UI
 */
function getConfigSchema() {
    return {
        fields: [
            {
                name: 'apiKey',
                type: 'password',
                label: 'API Key',
                placeholder: 'Get from aistudio.google.com',
                required: true,
                description: 'Free API key from Google AI Studio'
            },
            {
                name: 'model',
                type: 'text',
                label: 'Model',
                placeholder: 'gemini-2.0-flash-exp',
                required: false,
                description: 'Gemini model to use'
            },
            {
                name: 'temperature',
                type: 'number',
                label: 'Temperature',
                placeholder: '0.7',
                required: false,
                min: 0,
                max: 2,
                step: 0.1,
                description: 'Sampling temperature (0-2)'
            },
            {
                name: 'topP',
                type: 'number',
                label: 'Top P',
                placeholder: '0.95',
                required: false,
                min: 0,
                max: 1,
                step: 0.05,
                description: 'Nucleus sampling threshold'
            },
            {
                name: 'maxTokens',
                type: 'number',
                label: 'Max Tokens',
                placeholder: '8192',
                required: false,
                description: 'Maximum tokens in response'
            }
        ]
    };
}

module.exports = {
    id: 'google-ai-studio',
    name: 'Google AI Studio',
    description: 'Free Gemini API access via Google AI Studio (aistudio.google.com)',
    init,
    sendMessage,
    getConfigSchema
};
