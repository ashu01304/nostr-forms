import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Card, Input, List, Space, Spin, message, Collapse } from 'antd';
import { CloseOutlined, RobotOutlined, SendOutlined } from '@ant-design/icons';
import { AIAnalysisChatProps, Message } from './types';
import { ChatWrapper, MessageItem, MessageList } from './style';
import { ollamaService, OllamaModel } from '../../../../services/ollamaService';
import ReactMarkdown from 'react-markdown';
import ModelSelector from '../../../../components/ModelSelector';
import OllamaSettings from '../../../../components/OllamaSettings';
import { createAnalysisReport, generateDirectAnswer, generateDraftAnswer, refineAndCorrectAnswer } from './analysisHelper';

const { TextArea } = Input;

const formatChatHistory = (history: Message[]): string => {
    return history.map(msg => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`).join('\n');
}

const AIAnalysisChat: React.FC<AIAnalysisChatProps> = ({ isVisible, onClose, responsesData, formSpec }) => {
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [activePrompt, setActivePrompt] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [availableModels, setAvailableModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(() => ollamaService.getConfig().modelName);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<boolean | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  
  const initialAnalysisPerformed = useRef(false);
  const messageListRef = useRef<HTMLDivElement>(null);
  const trueDataRef = useRef<string>('');
  const initialConnectionDone = useRef(false);

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [chatHistory, isAnalyzing]);
  
  const fetchModels = useCallback(async () => {
    setFetchingModels(true);
    const result = await ollamaService.fetchModels();
    if (result.success && result.models && result.models.length > 0) {
        setAvailableModels(result.models);
        // Respect existing selection if it's still available, otherwise default
        const currentConfig = ollamaService.getConfig();
        const modelStillExists = result.models.some(m => m.name === currentConfig.modelName);
        if (modelStillExists) {
            setSelectedModel(currentConfig.modelName);
        } else {
            setSelectedModel(result.models[0].name);
            ollamaService.setConfig({ modelName: result.models[0].name });
        }
    } else {
        setAvailableModels([]);
    }
    setFetchingModels(false);
  }, []);

  const testConnection = useCallback(async (showAlerts: boolean = false) => {
      setIsConnecting(true);
      const result = await ollamaService.testConnection();
      if (result.success) {
          if (showAlerts) message.success('Successfully connected to Ollama!');
          setConnectionStatus(true);
          fetchModels();
      } else {
          setConnectionStatus(false);
          if (showAlerts) message.error(`Connection failed: ${result.error || 'Unknown error'}`);
      }
      setIsConnecting(false);
  }, [fetchModels]);

  const handleSend = () => {
    if (!activePrompt.trim() || isAnalyzing) return;
    setChatHistory(prev => [...prev, { sender: 'user', text: activePrompt }]);
    setActivePrompt('');
  };

  useEffect(() => {
    if (isVisible) {
      if (!initialConnectionDone.current) {
        console.log("Chat visible. Raw data received:", responsesData);
        trueDataRef.current = createAnalysisReport(responsesData, formSpec);
        console.log("Processed True_data (Analysis Report) for AI:\n", trueDataRef.current);
        // Set initial model from storage before testing connection
        setSelectedModel(ollamaService.getConfig().modelName);
        testConnection(false);
        initialConnectionDone.current = true;
      }
    } else {
        initialAnalysisPerformed.current = false;
        initialConnectionDone.current = false;
        setChatHistory([]);
    }
  }, [isVisible, responsesData, formSpec, testConnection]);

  useEffect(() => {
    const lastMessage = chatHistory[chatHistory.length - 1];
    if (!lastMessage || lastMessage.sender !== 'user') {
        return;
    }

    const runDirectAnalysis = async () => {
        setIsAnalyzing(true);
        const query = lastMessage.text;
        const historyForPrompt = chatHistory.slice(0, -1);
        const historyText = formatChatHistory(historyForPrompt);

        console.group(`[AI Flow] Handling User Query: "${query}"`);
        try {
            const finalAnswer = await generateDirectAnswer({ query, historyText, trueData: trueDataRef.current, modelName: selectedModel });
            setChatHistory(prev => [...prev, { sender: 'ai', text: finalAnswer }]);
        } catch (e: any) {
            console.error('[AI Flow] Error during direct answer generation:', e);
            message.error(e.message);
            setChatHistory(prev => [...prev, { sender: 'ai', text: `Sorry, an error occurred: ${e.message}` }]);
        } finally {
            setIsAnalyzing(false);
            console.groupEnd();
        }
    };
    
    runDirectAnalysis();
  }, [chatHistory, selectedModel]);

  useEffect(() => {
    const runInitialAnalysis = async () => {
        if (isVisible && !initialAnalysisPerformed.current && selectedModel && connectionStatus) {
            initialAnalysisPerformed.current = true;
            setIsAnalyzing(true);
            const query = "Provide a general, concise analysis of the entire dataset. Start with the pre-computed summary and option breakdowns.";
            console.group(`[AI Flow] Performing Initial Automated Analysis`);
            try {
                const draft = await generateDraftAnswer({ query, historyText: "", trueData: trueDataRef.current, modelName: selectedModel });
                const final = await refineAndCorrectAnswer({ query, historyText: "", trueData: trueDataRef.current, modelName: selectedModel, draftAnswer: draft });
                setChatHistory([{ sender: 'ai', text: final }]);
            } catch (e: any) {
                console.error('[AI Flow] Error during initial analysis:', e);
                message.error(e.message);
                setChatHistory([{sender: 'ai', text: `Sorry, an error occurred during initial analysis: ${e.message}`}]);
            } finally {
                setIsAnalyzing(false);
                console.groupEnd();
            }
        }
    };
    runInitialAnalysis();
  }, [isVisible, selectedModel, connectionStatus]);
  
  const getButtonProps = () => {
    if (connectionStatus === true) {
        return { className: 'ai-chat-button-success' };
    }
    if (connectionStatus === false) {
        return { className: 'ai-chat-button-danger' };
    }
    return {};
  };

  if (!isVisible) return null;

  const controlsDisabled = !connectionStatus || isAnalyzing;

  return (
    <ChatWrapper>
      <Card
        title={<Space><RobotOutlined /> AI Analysis</Space>}
        extra={<Button type="text" icon={<CloseOutlined />} onClick={onClose} />}
        bodyStyle={{ paddingTop: 4, paddingBottom: 0 }}
      >
        <MessageList ref={messageListRef}>
          {isAnalyzing && chatHistory.length === 0 ? (
            <MessageItem sender="ai">
              <div className="message-bubble"><Spin size="small" /> Thinking...</div>
            </MessageItem>
          ) : (
            <>
              <List
                dataSource={chatHistory}
                renderItem={(item) => (
                    <MessageItem sender={item.sender}>
                    <div className="message-bubble"><ReactMarkdown>{item.text}</ReactMarkdown></div>
                    </MessageItem>
                )}
              />
              {isAnalyzing && (
                <MessageItem sender="ai">
                  <div className="message-bubble"><Spin size="small" /> Thinking...</div>
                </MessageItem>
              )}
            </>
          )}
        </MessageList>
        <div style={{ marginTop: 'auto' }}>
          <Space.Compact style={{ width: '100%' }}>
            <TextArea 
              value={activePrompt}
              onChange={(e) => setActivePrompt(e.target.value)}
              placeholder="Ask about the responses..."
              autoSize={{ minRows: 1, maxRows: 4 }}
              disabled={controlsDisabled}
              onPressEnter={(e) => {
                if (!e.shiftKey && !isAnalyzing) { e.preventDefault(); handleSend(); }
              }}
            />
            <Button 
              type="primary" 
              icon={<SendOutlined />} 
              onClick={handleSend}
              loading={isAnalyzing}
              disabled={controlsDisabled || !activePrompt.trim()}
            />
          </Space.Compact>
        </div>
        <div className="chat-footer-controls">
            <div className="footer-help-section">
                <OllamaSettings />
            </div>
            <Space>
                <ModelSelector
                    model={selectedModel}
                    setModel={(model) => {
                        setSelectedModel(model);
                        ollamaService.setConfig({ modelName: model });
                    }}
                    availableModels={availableModels}
                    fetching={fetchingModels}
                    disabled={!connectionStatus || fetchingModels}
                    style={{ width: 180 }}
                    placeholder="Select model"
                />
                <Button
                    onClick={() => testConnection(true)}
                    disabled={isConnecting}
                    {...getButtonProps()}
                >
                    Test Connection
                </Button>
            </Space>
        </div>
      </Card>
    </ChatWrapper>
  );
};

export default AIAnalysisChat;