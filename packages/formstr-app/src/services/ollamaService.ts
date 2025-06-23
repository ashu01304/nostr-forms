import { getItem, setItem, LOCAL_STORAGE_KEYS } from '../utils/localStorage';

export interface OllamaConfig { baseUrl: string; modelName: string; }
export interface OllamaModel { name: string; modified_at: Date; size: number; digest: string; details: { parent_model: string; format: string; family: string; families: string[] | null; parameter_size: string; quantization_level: string; }; }
export interface GenerateParams { prompt: string; system?: string; format?: 'json'; modelName?: string; }
export interface GenerateResult { success: boolean; data?: any; error?: string; }
export interface TestConnectionResult { success: boolean; error?: string; }
export interface FetchModelsResult { success: boolean; models?: OllamaModel[]; error?: string; }

declare global {
    interface Window {
        ollama?: {
            request: (endpoint: string, options: RequestInit) => Promise<any>;
            getModels: () => Promise<any>;
            generate: (params: any) => Promise<any>;
            testConnection: () => Promise<any>;
        };
    }
}

class OllamaService {
    private config: OllamaConfig;

    constructor() {
        this.config = this.getConfig();
        console.log("DEBUG : Formstr: OllamaService initialized.");
    }

    getConfig(): OllamaConfig {
        const savedConfig = getItem<OllamaConfig>(LOCAL_STORAGE_KEYS.OLLAMA_CONFIG);
        return savedConfig || { baseUrl: 'http://localhost:11434', modelName: 'llama3.1' };
    }

    setConfig(newConfig: Partial<OllamaConfig>) {
        this.config = { ...this.config, ...newConfig };
        setItem(LOCAL_STORAGE_KEYS.OLLAMA_CONFIG, this.config);
    }

    async testConnection(): Promise<TestConnectionResult> {
        if (!window.ollama) {
            return { success: false, error: 'EXTENSION_NOT_FOUND' };
        }
        return window.ollama.testConnection();
    }

    async fetchModels(): Promise<FetchModelsResult> {
       if (!window.ollama) {
            return { success: false, error: 'EXTENSION_NOT_FOUND' };
       }
       const response = await window.ollama.getModels();
       return {
            success: response.success,
            models: response.data?.models,
            error: response.error,
       };
    }

    async generate(params: GenerateParams): Promise<GenerateResult> {
        if (!window.ollama) {
            return { success: false, error: 'EXTENSION_NOT_FOUND' };
        }
        const body = {
            model: params.modelName || this.config.modelName,
            prompt: params.prompt,
            stream: false,
            system: params.system,
            format: params.format,
        };
        console.log("DEBUG : [OllamaService] Input to Ollama:", body);
        const response = await window.ollama.generate(body);
        console.log("DEBUG : [OllamaService] Output from Ollama:", response);
        return { success: response.success, data: response.data, error: response.error };
    }
}

export const ollamaService = new OllamaService();