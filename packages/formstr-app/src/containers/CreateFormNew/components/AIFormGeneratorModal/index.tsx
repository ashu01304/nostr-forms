import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Divider, message, Space, Alert, Typography, Button } from 'antd';
import { ollamaService, OllamaModel, OllamaConfig } from '../../../../services/ollamaService'; 
import { processOllamaFormData, ProcessedFormData } from '../../../../utils/aiProcessor'; 
import { CREATE_FORM_TOOL_SCHEMA, CREATE_FORM_SYSTEM_PROMPT } from '../../../../constants/prompts'; 
import { AIFormGeneratorModalProps } from './types';
import OllamaSettings from './OllamaSettings';
import ModelSelector from './ModelSelector';
import GenerationPanel from './GenerationPanel';
import ConnectionStatusDisplay from './ConnectionStatusDisplay'; 

const AIFormGeneratorModal: React.FC<AIFormGeneratorModalProps> = ({ isOpen, onClose,onFormGenerated}) => {
    const [prompt, setPrompt] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<boolean | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [availableModels, setAvailableModels] = useState<OllamaModel[]>([]);
    const [fetchingModels, setFetchingModels] = useState(false);
    const [config, setConfig] = useState<OllamaConfig>(ollamaService.getConfig());


    const testConnection = useCallback(async () => {
        setLoading(true);
        setError(null);
        setConnectionStatus(null);
        console.log("Formstr: Testing Ollama connection...");
        const result = await ollamaService.testConnection();
        setLoading(false);
        if (result.success) {
            message.success('Successfully connected to Ollama!');
            setConnectionStatus(true);
            fetchModels();
        } else {
            setConnectionStatus(false);
            setError(result.error || 'Failed to connect.');
            console.error("Formstr: Connection test failed.", result.error);
            if (result.error === 'EXTENSION_NOT_FOUND') {
                message.error(
                    <>
                        Ollama extension not found. Please install our companion extension for a seamless experience.
                        <Button
                            type="link"
                            href="https://chromewebstore.google.com/" 
                            target="_blank"
                        >
                            Install Now
                        </Button>
                    </>,
                    10 
                );
            } else {
                message.error(`Connection failed: ${result.error}`);
            }
        }
    }, []);

    const fetchModels = useCallback(async () => {
        setFetchingModels(true);
        const result = await ollamaService.fetchModels();
        if (result.success && result.models) {
            setAvailableModels(result.models);
        } else {
            message.error(result.error || 'Failed to fetch models.');
        }
        setFetchingModels(false);
    }, []);

    useEffect(() => {
        if (isOpen) {
            testConnection();
        }
    }, [isOpen, testConnection]);


    const handleConfigChange = (newConfig: Partial<OllamaConfig>) => {
        const updatedConfig = { ...config, ...newConfig };
        setConfig(updatedConfig);
        ollamaService.setConfig(updatedConfig);
    };

    const handleModelChange = (newModel: string) => {
        handleConfigChange({ modelName: newModel });
    };

    const handleGenerate = async () => {
        if (!prompt.trim()) {
            message.error('Please enter a description for the form.');
            return;
        }
        setGenerating(true);
        setError(null);
        try {
            const result = await ollamaService.generateForm({
                prompt: prompt,
                systemPrompt: CREATE_FORM_SYSTEM_PROMPT,
                tools: [CREATE_FORM_TOOL_SCHEMA],
            });
            if (result.success && result.data) {
                const processedData = processOllamaFormData(result.data);
                onFormGenerated(processedData);
                message.success('Form generated successfully!');
                onClose();
            } else {
                setError(result.error || 'Failed to generate form.');
                message.error(result.error || 'An unexpected error occurred during generation.');
            }
        } catch (err: any) {
            setError(err.message || 'An unknown error occurred.');
            message.error(err.message || 'An unknown error occurred.');
        } finally {
            setGenerating(false);
        }
    };
    return (
        <Modal
            title="AI Form Generator"
            open={isOpen}
            onCancel={onClose}
            footer={null} 
            width={800}
        >
            <Typography.Text type="secondary">
                Powered by your local Ollama instance. Ensure Ollama is running.
            </Typography.Text>
            <Divider />
            <ConnectionStatusDisplay
                loading={loading}
                connectionStatus={connectionStatus}
                error={error}
                modelCount={availableModels.length}
                />
                <ModelSelector
                     model={config.modelName}
                     setModel={handleModelChange}
                     availableModels={availableModels}
                     fetchingModels={fetchingModels}
                     fetchModels={fetchModels}
                     disabled={!connectionStatus}
                 />
                <Divider />
                <GenerationPanel
                    prompt={prompt}
                    setPrompt={setPrompt}
                    onGenerate={handleGenerate}
                    loading={generating}
                    disabled={!connectionStatus || availableModels.length === 0}
                />
        </Modal>
    );
};

export default AIFormGeneratorModal;