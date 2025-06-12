import { getItem, setItem, LOCAL_STORAGE_KEYS } from '../utils/localStorage';

const EXTENSION_ID = "nopcdaggijpnmjppjojpeoelfdjodkjd";

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

export interface GenerateParams {
    prompt: string;
    system?: string;
    format?: 'json';
}

export interface GenerateResult {
    success: boolean;
    data?: any;
    error?: string;
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
                    console.log('Formstr AI Response Received:', response);
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

    async generate(params: GenerateParams): Promise<GenerateResult> {
        const body: any = {
            model: this.config.modelName,
            prompt: params.prompt,
            stream: false,
        };

        if (params.system) {
            body.system = params.system;
        }
        if (params.format) {
            body.format = params.format;
        }
        
        console.log('Formstr AI Request Sent:', { model: this.config.modelName, ...body });
        
        const response = await this._request('/api/generate', {
            method: 'POST',
            body: JSON.stringify(body),
        });
        
        return {
            success: response.success,
            data: response.data,
            error: response.error,
        };
    }
}

export const ollamaService = new OllamaService();