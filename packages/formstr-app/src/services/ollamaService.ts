import { getItem, setItem, LOCAL_STORAGE_KEYS } from '../utils/localStorage';

export interface OllamaConfig { baseUrl: string; modelName: string; }
export interface OllamaModel { name: string; modified_at: Date; size: number; digest: string; details: { parent_model: string; format: string; family: string; families: string[] | null; parameter_size: string; quantization_level: string; }; }
export interface GenerateParams { prompt: string; system?: string; format?: 'json'; }
export interface GenerateResult { success: boolean; data?: any; error?: string; }
export interface TestConnectionResult { success: boolean; error?: string; }
export interface FetchModelsResult { success: boolean; models?: OllamaModel[]; error?: string; }

class OllamaService {
    private config: OllamaConfig;
    private EXTENSION_IDS = {
        CHROME: "bdbifajbppomeiffjcgipolghhlipain",
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
        this.config = { ...this.config, ...newConfig };
        setItem(LOCAL_STORAGE_KEYS.OLLAMA_CONFIG, this.config);
    }

    private _sendMessage(payload: any): Promise<any> {
        // --- CHROME LOGIC ---
        // Checks for the Chrome-specific API first.
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            return new Promise((resolve) => {
                chrome.runtime.sendMessage(this.EXTENSION_IDS.CHROME, payload, (response) => {
                    if (chrome.runtime.lastError) {
                        resolve({ success: false, error: `Chrome Error: ${chrome.runtime.lastError.message}` });
                    } else {
                        resolve(response);
                    }
                });
            });
        }
        
        // --- FIREFOX LOGIC (and other browsers) ---
        // If not Chrome, it defaults to the content script bridge method.
        return new Promise((resolve) => {
            const listener = (event: MessageEvent) => {
                if (event.source === window && event.data && event.data.direction === "extension-to-formstr") {
                    window.removeEventListener("message", listener);
                    resolve(event.data.message);
                }
            };
            window.addEventListener("message", listener);
            window.postMessage({ direction: "formstr-to-extension", message: payload }, "*");
        });
    }

    private async _request(endpoint: string, options: RequestInit): Promise<any> {
        return this._sendMessage({
            type: "ollamaRequest",
            endpoint,
            options: {
                method: options.method,
                body: options.body,
                headers: options.headers,
            },
        });
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