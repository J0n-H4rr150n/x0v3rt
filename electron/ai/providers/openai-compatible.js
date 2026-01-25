/**
 * OpenAI-Compatible API Provider
 *
 * Supports any OpenAI-compatible endpoint including:
 * - Local GGUF models (via llama.cpp, vLLM, etc.)
 * - LM Studio
 * - Ollama with OpenAI compatibility
 * - Any other OpenAI API-compatible service
 */

const fetch = require('node-fetch');
const { buildSystemPrompt, buildContextPrompt } = require('../prompts');

let config = null;

function init(providerConfig = {}) {
    try {
        const baseUrl = providerConfig.baseUrl ||
            process.env.OPENAI_COMPATIBLE_BASE_URL ||
            'http://localhost:8000/v1';

        const apiKey = providerConfig.apiKey ||
            process.env.OPENAI_COMPATIBLE_API_KEY ||
            '';

        const modelName = providerConfig.model ||
            process.env.OPENAI_COMPATIBLE_MODEL ||
            'default';

        if (!baseUrl) {
            console.warn('OpenAI-compatible base URL not set.');
            return false;
        }

        config = {
            baseUrl: baseUrl.replace(/\/$/, ''), // Remove trailing slash
            apiKey,
            model: modelName,
            temperature: providerConfig.temperature || 0.7,
            maxTokens: providerConfig.maxTokens || 8192
        };

        console.log(`✓ OpenAI-compatible provider initialized: ${baseUrl}`);
        return true;
    } catch (error) {
        console.error('OpenAI-compatible provider initialization error:', error);
        return false;
    }
}

/**
 * Format tools for OpenAI API format
 */
function formatToolsForOpenAI(tools) {
    if (!tools || !Array.isArray(tools) || tools.length === 0) {
        return null;
    }

    return tools.map(tool => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
        }
    }));
}

async function sendMessage(message, context = {}) {
    if (!config) {
        throw new Error('OpenAI-compatible provider not initialized.');
    }

    const startTime = Date.now();
    const systemPrompt = buildSystemPrompt();
    const contextPrompt = buildContextPrompt(context);

    // Build messages array
    const messages = [
        {
            role: 'system',
            content: `${systemPrompt}\n\n${contextPrompt}`
        },
        {
            role: 'user',
            content: message
        }
    ];

    // Prepare request body
    const generation = context?.generation || {};
    const modelOverride = context?.model?.modelId;
    const requestBody = {
        model: modelOverride || config.model,
        messages,
        temperature: typeof generation.temperature === 'number' ? generation.temperature : config.temperature,
        max_tokens: typeof generation.maxOutputTokens === 'number' ? generation.maxOutputTokens : config.maxTokens
    };

    if (typeof generation.topP === 'number') {
        requestBody.top_p = generation.topP;
    }

    // Add tools if available
    const tools = context.tools ? formatToolsForOpenAI(context.tools) : null;
    if (tools) {
        requestBody.tools = tools;
        requestBody.tool_choice = 'auto';
    }

    // Make API request
    const headers = {
        'Content-Type': 'application/json'
    };
    if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI-compatible API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    if (!choice) {
        throw new Error('No response from OpenAI-compatible API');
    }

    // Check for tool calls
    if (choice.message?.tool_calls && choice.message.tool_calls.length > 0) {
        const elapsedMs = Date.now() - startTime;
        return {
            type: 'function_call',
            functionCalls: choice.message.tool_calls.map(tc => ({
                name: tc.function.name,
                args: typeof tc.function.arguments === 'string'
                    ? JSON.parse(tc.function.arguments)
                    : tc.function.arguments
            })),
            usage: {
                totalTokens: data.usage?.total_tokens ?? null,
                promptTokens: data.usage?.prompt_tokens ?? null,
                responseTokens: data.usage?.completion_tokens ?? null
            },
            elapsedMs,
            timestamp: new Date().toISOString()
        };
    }

    // Normal text response
    const text = choice.message?.content || '';
    const elapsedMs = Date.now() - startTime;

    return {
        type: 'text',
        text,
        usage: {
            totalTokens: data.usage?.total_tokens ?? null,
            promptTokens: data.usage?.prompt_tokens ?? null,
            responseTokens: data.usage?.completion_tokens ?? null
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
                name: 'baseUrl',
                type: 'text',
                label: 'Base URL',
                placeholder: 'http://localhost:8000/v1',
                required: true,
                description: 'OpenAI-compatible endpoint (e.g., your GGUF server via Tailscale)'
            },
            {
                name: 'apiKey',
                type: 'password',
                label: 'API Key',
                placeholder: 'Optional',
                required: false,
                description: 'API key if required by your endpoint'
            },
            {
                name: 'model',
                type: 'text',
                label: 'Model Name',
                placeholder: 'default',
                required: false,
                description: 'Model name to use'
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
    id: 'openai-compatible',
    name: 'OpenAI-Compatible',
    description: 'Any OpenAI-compatible API endpoint (local GGUF, LM Studio, Ollama, etc.)',
    init,
    sendMessage,
    getConfigSchema
};
