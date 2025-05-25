import { Ollama } from 'ollama/browser';
import type { ChatRequest, ModelResponse, ChatResponse } from 'ollama'; // Added ChatResponse and 'from'
import { getItem, setItem, LOCAL_STORAGE_KEYS } from '../utils/localStorage';

export interface OllamaConfig {
    baseUrl: string;
    modelName: string;
    apiKey?: string;
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
    systemPrompt?: string;
    tools?: any[]; 
}
export interface GenerateResult {
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
const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
const DEFAULT_MODEL_NAME = 'llama3'; 

class OllamaService {
    private config: OllamaConfig;
    private ollamaInstance: Ollama;
    constructor() {
        const storedUrl = getItem<string>(LOCAL_STORAGE_KEYS.OLLAMA_URL, { parseAsJson: false });
        const storedModel = getItem<string>(LOCAL_STORAGE_KEYS.OLLAMA_MODEL, { parseAsJson: false });
        this.config = {
            baseUrl: storedUrl || DEFAULT_OLLAMA_URL,
            modelName: storedModel || DEFAULT_MODEL_NAME,
            apiKey: "",
        };
        this.ollamaInstance = new Ollama({ host: this.config.baseUrl });
        console.log('OllamaService initialized with config:', this.config);
    }

    getConfig(): OllamaConfig {
        return { ...this.config };
    }

    setConfig(newConfig: Partial<OllamaConfig>) {
        const originalConfig = { ...this.config };
        const updatedConfig = { ...this.config, ...newConfig };
        let configChanged = false;

        if (newConfig.baseUrl && newConfig.baseUrl !== originalConfig.baseUrl) {
            updatedConfig.baseUrl = newConfig.baseUrl;
            setItem(LOCAL_STORAGE_KEYS.OLLAMA_URL, updatedConfig.baseUrl, { parseAsJson: false }); 
            this.ollamaInstance = new Ollama({ host: updatedConfig.baseUrl });
            configChanged = true;
            console.log('OllamaService baseUrl updated:', updatedConfig.baseUrl);
        }
        if (newConfig.modelName && newConfig.modelName !== originalConfig.modelName) {
            updatedConfig.modelName = newConfig.modelName;
            setItem(LOCAL_STORAGE_KEYS.OLLAMA_MODEL, updatedConfig.modelName, { parseAsJson: false });
            configChanged = true;
            console.log('OllamaService modelName updated:', updatedConfig.modelName);
        }
        if (newConfig.apiKey !== undefined && newConfig.apiKey !== originalConfig.apiKey) {
            updatedConfig.apiKey = newConfig.apiKey;
            configChanged = true;
            console.log('OllamaService apiKey updated.');
        }
        this.config = updatedConfig;
        if(configChanged){
             console.log('OllamaService config effectively changed to:', this.config);
        }
    }
    async testConnection(): Promise<TestConnectionResult> {
        console.log(`Testing connection to Ollama at ${this.config.baseUrl}...`);
        try {
            const response = await fetch(`${this.config.baseUrl}/api/tags`, { method: 'GET' });
            if (response.ok) {
                 console.log('Ollama connection test successful.');
                return { success: true };
            } else {
                 console.warn(`Ollama connection test failed: Status ${response.status}`);
                return { success: false, error: `Server responded with status ${response.status}` };
            }
        } catch (error: any) {
            console.error('Ollama connection test error:', error);
            let errorMessage = 'Failed to connect to Ollama server.';
            if (error.message?.includes('Failed to fetch')) {
                errorMessage += ` Is the server running at ${this.config.baseUrl} and CORS configured correctly?`;
            } else if (error.message) {
                 errorMessage += ` (${error.message})`
            }
            return { success: false, error: errorMessage };
        }
    }
    async fetchModels(): Promise<FetchModelsResult> {
        console.log(`Fetching models from ${this.config.baseUrl}...`);
        try {
            const response = await this.ollamaInstance.list();
            const models: OllamaModel[] = response.models || [];
            console.log(`Fetched ${models.length} models.`);
             if (models.length > 0 && !models.some(m => m.name === this.config.modelName)) {
                console.log(`Current model '${this.config.modelName}' not found. Setting to default: '${models[0].name}'`);
                this.setConfig({ modelName: models[0].name });
             } else if (models.length === 0) {
                 console.warn("No models found on the server.");
             }
            return { success: true, models };
        } catch (error: any) {
            console.error('Failed to fetch Ollama models:', error);
             let errorMessage = 'Failed to fetch models.';
             if (error.message?.includes('fetch')) {
                 errorMessage += ` Could not reach ${this.config.baseUrl}.`;
             } else if (error.message) {
                 errorMessage += ` (${error.message})`;
             }
            return { success: false, error: errorMessage };
        }
    }
    async generateContent(params: GenerateParams): Promise<GenerateResult> {
        console.log(`Generating content with model: ${this.config.modelName} @ ${this.config.baseUrl}`);
        const chatRequest: ChatRequest = {
            model: this.config.modelName,
            messages: [
                ...(params.systemPrompt ? [{ role: 'system' as const, content: params.systemPrompt }] : []),
                { role: 'user' as const, content: params.prompt }
            ],
            tools: params.tools,
            stream: false,
        };
        try {
            const response = await this.ollamaInstance.chat(chatRequest as ChatRequest & { stream: false });
            console.log("Raw response from Ollama library:", response);
            const toolCalls = response.message?.tool_calls;
            if (params.tools && params.tools.length > 0) {
            if (!toolCalls || toolCalls.length === 0) {
                console.warn("Ollama response did not contain expected tool calls.", response.message?.content);
                return {
                    success: false,
                    error: "AI response received, but no function/tool call was made as expected. Try rephrasing your request or check the model's capabilities.",
                    rawResponse: response.message?.content
                };
            }
            const firstToolCall = toolCalls[0];
                const expectedToolName = params.tools[0].function.name;
            if (firstToolCall.function?.name !== expectedToolName) {
                 console.warn(`Expected tool '${expectedToolName}' not found. AI used: '${firstToolCall.function?.name}'`);
                 return {
                      success: false,
                      error: `AI used an unexpected tool: '${firstToolCall.function?.name}'. Expected '${expectedToolName}'.`,
                      rawResponse: response.message?.content
                 };
            }
            try {
                let parsedArgs = firstToolCall.function.arguments;
                if (typeof parsedArgs === 'string') {
                    try {
                         parsedArgs = JSON.parse(parsedArgs);
                    } catch (jsonParseError: any) {
                         console.error("Failed to parse tool arguments string:", jsonParseError, "String was:", parsedArgs);
                         return { success: false, error: `Failed to parse AI tool arguments: ${jsonParseError.message}` };
                        }
                    }
                    if (expectedToolName === 'create_form_structure' && parsedArgs && typeof parsedArgs.fields === 'string') {
                    try {
                        parsedArgs.fields = JSON.parse(parsedArgs.fields);
                    } catch (fieldParseError: any) {
                        console.error("Failed to parse 'fields' string for create_form_structure:", fieldParseError, "Fields string was:", parsedArgs.fields);
                            return { success: false, error: "AI provided 'fields' as a malformed JSON string for form creation." };
                        }
                    } 
                    console.log("Successfully parsed tool arguments:", parsedArgs);
                    return { success: true, data: parsedArgs };

                } catch (parseError: any) {
                    console.error("Error processing tool call arguments:", parseError, "Raw args:", firstToolCall.function.arguments);
                    return { success: false, error: `Failed to process AI tool arguments: ${parseError.message}` };
                }

            } else { // No tools were requested, so return the direct message content
                console.log("No tools requested. Returning direct AI message content.");
                return {
                    success: true,
                    data: response.message?.content, // Or just data: response.message for the whole message object
                    rawResponse: response.message?.content
                };
            }

        } catch (error: any) {
            console.error("Error during Ollama chat call:", error);
            let userMessage = "An unknown error occurred while communicating with the AI.";
            if (error.message?.includes('fetch') || error.message?.includes('Network') || error.message?.includes('ECONNREFUSED')) {
                userMessage = `Network Error: Could not connect to Ollama server at ${this.config.baseUrl}. Is it running and CORS configured?`;
            } else if (error.message?.includes('404') && error.message?.includes('model not found')) {
                 userMessage = `Error: Model '${this.config.modelName}' not found on the Ollama server.`;
            } else if (error.message) {
                 userMessage = error.message;
            }
            return { success: false, error: userMessage };
        }
    }

    // Keep generateForm if it's widely used and specifically for form creation with its original logic
    // For this new feature, it's better to use the more generic generateContent
    async generateForm(params: GenerateParams): Promise<GenerateResult> {
        // This method is now a wrapper for generateContent if the tool is 'create_form_structure'
        // Or it can be deprecated in favor of calling generateContent directly with the correct tool params.
        // For now, let's assume it calls generateContent:
        return this.generateContent(params);
    }
}
export const ollamaService = new OllamaService();