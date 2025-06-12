import { getItem, setItem, LOCAL_STORAGE_KEYS } from '../utils/localStorage';
const EXTENSION_ID ="nopcdaggijpnmjppjojpeoelfdjodkjd";

export interface OllamaConfig {
    baseUrl: string;
    modelName: string;
}
export interface OllamaModel {
    name: string;
    modified_at: Date;
    size: number;
    digest: string;
    details: {
        parent_model: string;
        format: string;
        family: string;
        families: string[] | null;
        parameter_size: string;
        quantization_level: string;
    };
}
export interface GenerateFormParams {
    prompt: string;
    systemPrompt?: string; 
    tools?: any[];
}
export interface GenerateFormResult {
    success: boolean;
    data?: any;
    error?: string;
    rawResponse?: string;
}
export interface TestConnectionResult {
    success: boolean;
    error?: string;
}
export interface FetchModelsResult {
    success: boolean;
    models?: OllamaModel[];
    error?: string;
}


class OllamaService {
    private config: OllamaConfig;

    constructor() {
        this.config = this.getConfig();
        console.log("Formstr: OllamaService initialized.");
    }

    getConfig(): OllamaConfig {
        const savedConfig = getItem<OllamaConfig>(LOCAL_STORAGE_KEYS.OLLAMA_CONFIG);
        return savedConfig || { baseUrl: 'http://localhost:11434', modelName: 'llama3.1' };
    }

    setConfig(newConfig: Partial<OllamaConfig>) {
        this.config = { ...this.config, ...newConfig };
        setItem(LOCAL_STORAGE_KEYS.OLLAMA_CONFIG, this.config);
        console.log("Formstr: Ollama config updated.", this.config);
    }

    private async _request(endpoint: string, options: RequestInit): Promise<any> {
        console.log(`Formstr: Attempting request to Ollama endpoint: ${endpoint} via extension.`);

        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
            console.warn("Formstr: Chrome extension runtime not available.");
            return { success: false, error: 'EXTENSION_NOT_FOUND' };
        }

        return new Promise((resolve) => {
            chrome.runtime.sendMessage(
                EXTENSION_ID,
                {
                    type: "ollamaRequest",
                    endpoint: endpoint,
                    options: {
                        method: options.method,
                        body: options.body,
                        headers: options.headers,
                    },
                },
                (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("Formstr: Extension communication error:", chrome.runtime.lastError.message);
                        resolve({ success: false, error: "EXTENSION_NOT_FOUND" });
                    } else {
                        console.log("Formstr: Received response from extension.", response);
                        resolve(response);
                    }
                }
            );
        });
    }

    async testConnection(): Promise<TestConnectionResult> {
        const response = await this._request('/', { method: 'GET' });
        if (response.error === 'EXTENSION_NOT_FOUND') {
            return response;
        }
        return { success: response.success, error: response.error };
    }
    
    async fetchModels(): Promise<FetchModelsResult> {
        const response = await this._request('/api/tags', { method: 'GET' });
        if (response.error === 'EXTENSION_NOT_FOUND') {
            return response;
        }
        return {
            success: response.success,
            models: response.data?.models,
            error: response.error,
        };
    }

    async generateForm(params: GenerateFormParams): Promise<GenerateFormResult> {
        const fullPrompt = `You are an expert JSON generator. Based on the user's request, create a form structure.
        
Here is the required JSON schema for the form:
{
    "type": "object",
    "properties": {
        "title": { "type": "string" },
        "description": { "type": "string" },
        "fields": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "type": { "type": "string", "enum": ["ShortText", "LongText", "Email", "Number", "MultipleChoice", "SingleChoice", "Checkbox", "Dropdown", "Date", "Time", "Label"] },
                    "label": { "type": "string" },
                    "required": { "type": "boolean" },
                    "options": { "type": "array", "items": { "type": "string" } }
                },
                "required": ["type", "label"]
            }
        }
    },
    "required": ["title", "fields"]
}

CRITICAL RULES:
- Your response MUST be ONLY the JSON object that validates against the schema above.
- Do NOT include any extra text, explanations, or markdown formatting like \`\`\`json.
- For choice-based fields ('MultipleChoice', 'SingleChoice', 'Checkbox', 'Dropdown'), you MUST include the 'options' property.

USER REQUEST: "${params.prompt}"

YOUR JSON RESPONSE:
`;

        const body = {
            model: this.config.modelName,
            prompt: fullPrompt,
            stream: false,
            format: 'json',
        };

        const response = await this._request('/api/generate', {
            method: 'POST',
            body: JSON.stringify(body),
        });

        if (response.error === 'EXTENSION_NOT_FOUND') {
            return response;
        }
        
        if (!response.success) {
            return { success: false, error: response.error };
        }

        try {
            const responseData = JSON.parse(response.data.response);
            console.log("Formstr: Successfully parsed JSON from model response content.");
            return { success: true, data: responseData };
        } catch (e) {
            console.error('Formstr: Error parsing JSON content from Ollama', e, "Raw Content:", response.data.response);
            return { success: false, error: 'Failed to parse form structure from Ollama.' };
        }
    }
}

export const ollamaService = new OllamaService();