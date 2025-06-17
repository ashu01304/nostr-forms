import { getItem, setItem, LOCAL_STORAGE_KEYS } from '../utils/localStorage';

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
    private EXTENSION_IDS = {
        CHROME: "fniocoloapgjeahkendjimlbannfnjoc",
        FIREFOX: "ollama-llm-extension@firefox.user"
    };

    constructor() {
        this.config = this.getConfig();
        console.log("Formstr: OllamaService initialized.");
    }

    getConfig(): OllamaConfig {
        const savedConfig = getItem<OllamaConfig>(LOCAL_STORAGE_KEYS.OLLAMA_CONFIG);
        return savedConfig || { baseUrl: 'http://localhost:11434', modelName: 'llama3.1' };
    }

    setConfig(newConfig: Partial<OllamaConfig>) {
        this.config = {
            baseUrl: newConfig.baseUrl ?? this.config.baseUrl,
            modelName: newConfig.modelName ?? this.config.modelName,
        };
        setItem(LOCAL_STORAGE_KEYS.OLLAMA_CONFIG, this.config);
        console.log("Formstr: Ollama config updated.", this.config);
    }

    private _sendMessage(payload: any): Promise<any> {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            return new Promise((resolve) => {
                chrome.runtime.sendMessage(this.EXTENSION_IDS.CHROME, payload, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("Formstr: Chrome extension error:", chrome.runtime.lastError.message);
                        resolve({ success: false, error: `Chrome Error: ${chrome.runtime.lastError.message}` });
                    } else {
                        console.log("[OllamaService] Received response via Chrome API:", response);
                        resolve(response);
                    }
                });
            });
        } else if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
            return browser.runtime.sendMessage(this.EXTENSION_IDS.FIREFOX, payload).catch((error) => {
                console.error("[OllamaService] Firefox extension error:", error);
                return { success: false, error: `Firefox Error: ${error.message}` };
            });
        } else {
            console.warn("[OllamaService] No extension runtime available, falling back to postMessage.");
            return new Promise((resolve) => {
                const listener = (event: MessageEvent) => {
                    if (event.source === window && event.data && event.data.direction === "extension-to-formstr") {
                        window.removeEventListener("message", listener);
                        console.log("[OllamaService] Received response via postMessage:", event.data.message);
                        resolve(event.data.message);
                    }
                };
                window.addEventListener("message", listener);
                window.postMessage({ direction: "formstr-to-extension", message: payload }, "*");
            });
        }
    }

    private async _request(endpoint: string, options: RequestInit): Promise<any> {
        console.log(`[OllamaService] Sending request to endpoint: ${endpoint}`);
        const response = await this._sendMessage({
            type: "ollamaRequest",
            endpoint,
            options: {
                method: options.method,
                body: options.body,
                headers: options.headers,
            },
        });
        if (response.error === 'Chrome Error: No extension runtime available' || response.error === 'Firefox Error: No extension runtime available') {
            return { success: false, error: 'EXTENSION_NOT_FOUND' };
        }
        return response;
    }

    async testConnection(): Promise<TestConnectionResult> {
        const response = await this._request('/', { method: 'GET' });
        return { success: response.success, error: response.error };
    }

    async fetchModels(): Promise<FetchModelsResult> {
        const response = await this._request('/api/tags', { method: 'GET' });
        return {
            success: response.success,
            models: response.data?.models,
            error: response.error,
        };
    }

    async generate(params: GenerateParams): Promise<GenerateResult> {
        const body = {
            model: this.config.modelName,
            prompt: params.prompt,
            stream: false,
            system: params.system,
            format: params.format,
        };
            console.log("[OllamaService] Input to Ollama:", body);
        const response = await this._request('/api/generate', {
            method: 'POST',
            body: JSON.stringify(body),
        });
        console.log("[OllamaService] Output from Ollama:", response);
        return { success: response.success, data: response.data, error: response.error };
    }
}

export const ollamaService = new OllamaService();