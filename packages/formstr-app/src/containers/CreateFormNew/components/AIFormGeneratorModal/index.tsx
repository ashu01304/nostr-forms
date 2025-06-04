import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Divider, message, Space, Alert, Typography } from 'antd';
import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Divider, message, Space, Alert, Typography } from 'antd';
import { ollamaService, OllamaModel } from '../../../../services/ollamaService'; // OllamaConfig removed
import { processOllamaFormData, ProcessedFormData } from '../../../../utils/aiProcessor'; 
import { CREATE_FORM_TOOL_SCHEMA, CREATE_FORM_SYSTEM_PROMPT } from '../../../../constants/prompts'; 
import { AIFormGeneratorModalProps } from './types';
// OllamaSettings import removed
import ModelSelector from './ModelSelector';
import GenerationPanel from './GenerationPanel';
import ConnectionStatusDisplay from './ConnectionStatusDisplay'; 

const AIFormGeneratorModal: React.FC<AIFormGeneratorModalProps> = ({
    isOpen,
    onClose,
    onFormGenerated,
}) => {
    // config state removed
    const [availableModels, setAvailableModels] = useState<OllamaModel[]>([]);
    const [connectionStatus, setConnectionStatus] = useState<boolean | null>(null);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [fetchModelsLoading, setFetchModelsLoading] = useState<boolean>(false);
    const [testConnectionLoading, setTestConnectionLoading] = useState<boolean>(false);
    const [prompt, setPrompt] = useState<string>('');
    const [generationLoading, setGenerationLoading] = useState<boolean>(false);
    const [generationError, setGenerationError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            // const currentConfig = ollamaService.getConfig(); // No longer need to set local config
            // setConfig(currentConfig);
            setConnectionStatus(null);
            setConnectionError(null);
            setAvailableModels([]); 
            setGenerationError(null);
            handleTestAndFetch(); // Will use global config
        }
    }, [isOpen]);

    // handleUrlChange removed

    const handleModelChange = (newModel: string) => {
        // setConfig(prev => ({ ...prev, modelName: newModel })); // Removed: No local config state
        ollamaService.setConfig({ modelName: newModel }); 
        // Optionally, re-fetch or re-validate if model change implies capability change
        // For now, just setting the global model is fine as per requirements.
    };

    const handleTestAndFetch = useCallback(async () => { // urlToTest parameter removed
        const currentGlobalConfig = ollamaService.getConfig();
        const effectiveUrl = currentGlobalConfig.baseUrl;
        console.log(`Testing and fetching for URL: ${effectiveUrl}`);
        setTestConnectionLoading(true);
        setFetchModelsLoading(true); 
        setConnectionStatus(null);
        setConnectionError(null);
        setAvailableModels([]);
        // if (urlToTest) { // Removed: URL is set globally
        //      ollamaService.setConfig({ baseUrl: urlToTest });
        // }
        const connectionResult = await ollamaService.testConnection(); // Uses global config
        setConnectionStatus(connectionResult.success);
        setConnectionError(connectionResult.error || null);
        setTestConnectionLoading(false);
        
        if (connectionResult.success) {
            const modelsResult = await ollamaService.fetchModels(); // Uses global config
            if (modelsResult.success && modelsResult.models) {
                setAvailableModels(modelsResult.models);
                const updatedGlobalConfig = ollamaService.getConfig(); // Get potentially updated model from fetchModels
                // setConfig(updatedGlobalConfig); // No local config to set
                if (modelsResult.models.length > 0 && !modelsResult.models.some(m => m.name === updatedGlobalConfig.modelName)) {
                     message.info(`Current model ${updatedGlobalConfig.modelName} (or previous selection) unavailable or not listed. Defaulting or keeping as is based on fetchModels logic.`);
                } else if (modelsResult.models.length === 0) {
                     message.warning("Connected to Ollama, but no models were found.");
                }
            } else {
                setConnectionError(modelsResult.error || "Failed to fetch models after successful connection.");
                setAvailableModels([]); 
            }
        } else {
            setAvailableModels([]); 
        }
        setFetchModelsLoading(false);
    }, []); // config.baseUrl removed from dependencies as it's now global

    // handleUrlBlur removed

    const handleGenerate = async () => {
        if (!prompt.trim()) {
            message.error('Please enter a description for the form.');
            return;
        }
        if (!connectionStatus) {
             message.error('Cannot generate form. Please ensure connection to Ollama server.');
             return;
        }
        const currentGlobalConfig = ollamaService.getConfig();
        if (!currentGlobalConfig.modelName || availableModels.length === 0) {
             message.error('Cannot generate form. Please select a valid model from AI Settings and ensure it is available.');
             return;
        }

        setGenerationLoading(true);
        setGenerationError(null);
        const generationParams = {
            prompt: prompt,
            systemPrompt: CREATE_FORM_SYSTEM_PROMPT, 
            tools: [
                {
                    type: 'function' as const,
                    function: {
                        name: 'create_form_structure',
                        description: 'Generates the JSON structure for a web form based on a description.',
                        parameters: CREATE_FORM_TOOL_SCHEMA, 
                    },
                }
            ]
        };

        const result = await ollamaService.generateForm(generationParams);
        if (result.success && result.data) {
            try {
                const processedData = processOllamaFormData(result.data);
                onFormGenerated(processedData); 
                message.success('Form generated successfully!');
                onClose(); 
            } catch (processingError: any) {
                 console.error("Error processing AI response:", processingError);
                 setGenerationError(`Failed to process AI response: ${processingError.message}`);
                 message.error('Failed to process the generated form data.');
            }
        } else {
            setGenerationError(result.error || 'An unknown error occurred during generation.');
            message.error(result.error || 'Failed to generate form.');
        }
        setGenerationLoading(false);
    };

    return (
        <Modal
            title={
                <Typography.Title level={4} style={{ textAlign: 'center', margin: 0 }}>
                    Create Form with AI
                </Typography.Title>
            }
            open={isOpen}
            onCancel={onClose}
            footer={null} 
            width={700}
            destroyOnClose 
            maskClosable={!generationLoading} 
        >
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
                {/* OllamaSettings component removed */}
                <Typography.Text>
                    Using Ollama URL: <Typography.Text strong>{ollamaService.getConfig().baseUrl}</Typography.Text>
                </Typography.Text>
                <Typography.Text>
                    AI Settings can be configured in the Dashboard.
                </Typography.Text>
                <ModelSelector
                     model={ollamaService.getConfig().modelName} // Use global config
                     setModel={handleModelChange}
                     availableModels={availableModels}
                     fetchingModels={fetchModelsLoading}
                     fetchModels={handleTestAndFetch} // Pass directly, no args needed
                     disabled={!connectionStatus} 
                 />
                 <ConnectionStatusDisplay
                      loading={testConnectionLoading || fetchModelsLoading} // Keep this loading state
                      connectionStatus={connectionStatus}
                      error={connectionError}
                      modelCount={availableModels.length}
                 />
                <Divider style={{ margin: '0' }}/>
                <GenerationPanel
                    prompt={prompt}
                    setPrompt={setPrompt}
                    onGenerate={handleGenerate}
                    loading={generationLoading}
                    disabled={!connectionStatus || availableModels.length === 0 || generationLoading || !ollamaService.getConfig().modelName} // Check global modelName
                />
                 {generationError && (
                      <Alert message={`Generation Error: ${generationError}`} type="error" showIcon />
                 )}
            </Space>
        </Modal>
    );
};

export default AIFormGeneratorModal;