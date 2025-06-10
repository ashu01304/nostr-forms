import { getItem, setItem, LOCAL_STORAGE_KEYS } from '../utils/localStorage';
const EXTENSION_ID = "djmliheoabooicndndcbgblcpcobjcbc"; 

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
        const systemPrompt = (params.systemPrompt || '') + "\n\nYou must use the 'create_form' tool to generate the form based on the user's prompt.";

        const body = {
            model: this.config.modelName,
            prompt: params.prompt,
            system: systemPrompt,
            tools: params.tools,
            stream: false,
        };

        const response = await this._request('/api/chat', {
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
            const toolCall = response.data?.message?.tool_calls?.[0];
            if (toolCall && toolCall.function && toolCall.function.arguments) {
                console.log("Formstr: Successfully found and parsed tool call in response.");
                return { success: true, data: toolCall.function.arguments };
            }
            
            console.error('Formstr: Ollama response did not include a tool call.', response.data);
            return { success: false, error: 'Ollama did not use the required tool. The model might not support tool calling or the prompt was ambiguous.' };

        } catch (e) {
            console.error('Formstr: Error parsing response from Ollama', e);
            return { success: false, error: 'Failed to parse form structure from Ollama.' };
        }
    }
}

export const ollamaService = new OllamaService();