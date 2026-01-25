/**
 * Vertex AI provider
 */

const { VertexAI } = require('@google-cloud/vertexai');
const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');
const path = require('path');
const { buildSystemPrompt, buildContextPrompt } = require('../prompts');

let vertexAI = null;
let model = null;
let baseConfig = null;
let cachedRegistry = null;

function loadModelRegistry() {
    if (Array.isArray(cachedRegistry)) {
        return cachedRegistry;
    }

    try {
        const registryPath = path.join(__dirname, '..', 'model-registry.json');
        const registryModels = loadRegistryModels(registryPath);
        const definitionModels = loadModelDefinitions();

        const merged = new Map();
        registryModels.forEach(model => {
            if (!model?.id || merged.has(model.id)) return;
            merged.set(model.id, model);
        });
        definitionModels.forEach(model => {
            if (!model?.id) return;
            merged.set(model.id, model);
        });

        cachedRegistry = Array.from(merged.values());
        return cachedRegistry;
    } catch (_error) {
        cachedRegistry = [];
        return cachedRegistry;
    }
}

function loadRegistryModels(registryPath) {
    try {
        const raw = fs.readFileSync(registryPath, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed?.models) ? parsed.models : [];
    } catch (_error) {
        return [];
    }
}

function loadModelDefinitions() {
    const root = path.join(__dirname, '..', 'model-definitions');
    if (!fs.existsSync(root)) return [];

    const results = [];
    const stack = [root];

    while (stack.length) {
        const current = stack.pop();
        let entries = [];
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch (_error) {
            continue;
        }

        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.json')) {
                try {
                    const raw = fs.readFileSync(fullPath, 'utf8');
                    const parsed = JSON.parse(raw);
                    const model = mapModelDefinition(parsed);
                    if (model) results.push(model);
                } catch (_error) {
                    // ignore invalid json
                }
            }
        }
    }

    return results;
}

function mapModelDefinition(config) {
    if (!config || typeof config !== 'object') return null;
    if (config.status && config.status !== 'enabled') return null;

    const id = config.model_id || config.id;
    if (!id) return null;

    const type = config.type || 'unknown';
    const provider = type === 'google-preview'
        ? 'google-ai-studio'
        : (type === 'google' || type === 'google-maas' || type === 'mistral-vertex')
            ? 'vertex'
            : null;

    return {
        id,
        label: config.label || id,
        provider,
        location: config.location,
        type,
        defaults: {
            temperature: config.temperature,
            topP: config.top_p,
            topK: config.top_k,
            maxTokens: config.max_tokens
        }
    };
}

function resolveModelId(modelId) {
    if (!modelId) return modelId;
    const trimmed = String(modelId).trim();
    if (!trimmed) return trimmed;

    const registry = loadModelRegistry();
    if (registry.length) {
        const lower = trimmed.toLowerCase();
        const match = registry.find(model =>
            (model.id && model.id.toLowerCase() === lower)
            || (model.label && model.label.toLowerCase() === lower)
        );
        if (match?.id) {
            return match.id;
        }
    }

    return trimmed;
}

function resolveModelEntry(modelId) {
    if (!modelId) return null;
    const registry = loadModelRegistry();
    if (!registry.length) return null;
    const lower = String(modelId).toLowerCase();
    return registry.find(model => model.id && model.id.toLowerCase() === lower) || null;
}

function isMaasModel(modelId) {
    const resolved = resolveModelId(modelId);
    const entry = resolveModelEntry(resolved);
    return entry?.type === 'google-maas';
}

async function callMaasOpenApi({
    projectId,
    location,
    modelId,
    messages,
    generationConfig
}) {
    const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    const accessToken = typeof token === 'string' ? token : token?.token;

    if (!accessToken) {
        throw new Error('Failed to obtain Google Cloud access token for MAAS request.');
    }

    const endpoint = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/endpoints/openapi/chat/completions`;
    const payload = {
        model: modelId,
        messages
    };

    if (typeof generationConfig?.temperature === 'number') {
        payload.temperature = generationConfig.temperature;
    }
    if (typeof generationConfig?.topP === 'number') {
        payload.top_p = generationConfig.topP;
    }
    if (typeof generationConfig?.maxOutputTokens === 'number') {
        payload.max_tokens = generationConfig.maxOutputTokens;
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(`MAAS request failed (${response.status}): ${bodyText.slice(0, 300)}`);
    }

    const data = await response.json();
    return data;
}

function getVertexModelId(modelId, projectId, location) {
    const resolved = resolveModelId(modelId);
    const entry = resolveModelEntry(resolved);
    const isMaas = entry?.type === 'google-maas';
    const normalized = normalizeModelId(resolved);

    if (isMaas && projectId && location) {
        const base = normalized.replace(/^publishers\//, '');
        return `projects/${projectId}/locations/${location}/publishers/${base}`;
    }

    const shouldNormalize = Boolean(
        resolved?.startsWith('publishers/')
        || resolved?.startsWith('projects/')
        || resolved?.startsWith('models/')
        || resolved?.includes('/')
    );

    return shouldNormalize ? normalized : resolved;
}

function normalizeModelId(modelId) {
    if (!modelId) return modelId;
    if (modelId.startsWith('publishers/')
        || modelId.startsWith('projects/')
        || modelId.startsWith('models/')) {
        return modelId;
    }

    if (modelId.includes('/')) {
        const [publisher, name] = modelId.split('/');
        if (publisher && name) {
            return `publishers/${publisher}/models/${name}`;
        }
    }

    return `publishers/google/models/${modelId}`;
}

function init(config = {}) {
    try {
        const projectId = config.projectId || process.env.GCP_PROJECT_ID;
        const location = config.location || process.env.GCP_REGION || 'us-central1';
        let modelName = config.modelName || process.env.VERTEX_AI_MODEL || 'gemini-2.5-flash';
        const rawModelName = modelName;
        const resolvedModelName = resolveModelId(modelName);
        const effectiveModelName = getVertexModelId(resolvedModelName, projectId, location);
        console.log('[VertexAI:init] config:', {
            projectId: projectId ? '[set]' : '[missing]',
            location,
            rawModelName,
            resolvedModelName,
            effectiveModelName
        });
        if (/\s/.test(resolvedModelName || '')) {
            console.warn(`Vertex model name contains whitespace. Falling back to gemini-2.5-flash (was: ${resolvedModelName}).`);
            modelName = 'gemini-2.5-flash';
        }

        if (!projectId) {
            console.warn('GCP_PROJECT_ID not set. AI features will be disabled.');
            return false;
        }

        vertexAI = new VertexAI({
            project: projectId,
            location
        });

        baseConfig = {
            projectId,
            location,
            modelName
        };

        const initModelId = getVertexModelId(modelName, projectId, location);
        model = vertexAI.getGenerativeModel({
            model: initModelId,
            generationConfig: {
                maxOutputTokens: 8192,
                temperature: 0.7,
                topP: 0.95
            }
        });

        console.log(`✓ Vertex AI initialized: ${modelName}`);
        return true;
    } catch (error) {
        console.error('[VertexAI:init] initialization error:', error);
        return false;
    }
}

/**
 * Format tools for Gemini API
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
        throw new Error('Vertex AI not initialized. Check your GCP credentials.');
    }

    const startTime = Date.now();
    const systemPrompt = buildSystemPrompt();
    const contextPrompt = buildContextPrompt(context);

    // Build initial message
    const contents = [
        {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${contextPrompt}\n\n${message}` }]
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
    const locationOverride = context?.model?.location;
    let requestModel = model;

    const isMaasOverride = isMaasModel(modelOverride || baseConfig?.modelName || process.env.VERTEX_AI_MODEL);

    if (modelOverride || locationOverride) {
        const projectId = baseConfig?.projectId || process.env.GCP_PROJECT_ID;
        const location = locationOverride || baseConfig?.location || process.env.GCP_REGION || 'us-central1';
        let modelName = modelOverride || baseConfig?.modelName || process.env.VERTEX_AI_MODEL || 'gemini-2.5-flash';
        const rawModelName = modelName;
        const resolvedModelName = resolveModelId(modelName);
        const effectiveModelName = getVertexModelId(resolvedModelName, projectId, location);
        console.log('[VertexAI:request] model resolution:', {
            projectId: projectId ? '[set]' : '[missing]',
            location,
            rawModelName,
            resolvedModelName,
            effectiveModelName
        });
        if (/\s/.test(resolvedModelName || '')) {
            console.warn(`Vertex model override contains whitespace. Falling back to gemini-2.5-flash (was: ${resolvedModelName}).`);
            modelName = 'gemini-2.5-flash';
        }

        if (isMaasModel(modelName) && location === 'global') {
            const messages = [{
                role: 'user',
                content: `${systemPrompt}\n\n${contextPrompt}\n\n${message}`
            }];

            const maasResponse = await callMaasOpenApi({
                projectId,
                location,
                modelId: modelName,
                messages,
                generationConfig
            });

            const choice = maasResponse?.choices?.[0]?.message?.content || '';
            const usage = maasResponse?.usage || null;
            const elapsedMs = Date.now() - startTime;

            return {
                type: 'text',
                text: choice,
                usage: {
                    totalTokens: usage?.total_tokens ?? null,
                    promptTokens: usage?.prompt_tokens ?? null,
                    responseTokens: usage?.completion_tokens ?? null
                },
                elapsedMs,
                timestamp: new Date().toISOString()
            };
        }
        const vertexClient = location === baseConfig?.location ? vertexAI : new VertexAI({ project: projectId, location });
        requestModel = vertexClient.getGenerativeModel({
            model: getVertexModelId(modelName, projectId, location),
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
                name: 'projectId',
                type: 'text',
                label: 'GCP Project ID',
                placeholder: 'your-project-id',
                required: true,
                description: 'Google Cloud project ID'
            },
            {
                name: 'location',
                type: 'text',
                label: 'Region',
                placeholder: 'us-central1',
                required: false,
                description: 'GCP region for Vertex AI'
            },
            {
                name: 'modelName',
                type: 'text',
                label: 'Model',
                placeholder: 'gemini-2.5-flash',
                required: false,
                description: 'Vertex AI model name'
            }
        ]
    };
}

module.exports = {
    id: 'vertex',
    name: 'Vertex AI',
    description: 'Google Cloud Vertex AI (requires GCP credentials)',
    init,
    sendMessage,
    getConfigSchema
};
