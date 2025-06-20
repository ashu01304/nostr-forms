import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Card, Divider, Input, List, Space, Spin, message, Collapse } from 'antd';
import { CloseOutlined, RobotOutlined, SendOutlined } from '@ant-design/icons';
import { AIAnalysisChatProps, Message } from './types';
import { ChatWrapper, MessageItem, MessageList } from './style';
import { ollamaService, OllamaModel } from '../../../../services/ollamaService';
import ReactMarkdown from 'react-markdown';
import ModelSelector from '../../../../components/ModelSelector';
import OllamaSettings from '../../../../components/OllamaSettings';

const { TextArea } = Input;

const processResponsesForAI = (responsesData: Array<{ [key: string]: string }>) => {
  if (!responsesData || responsesData.length === 0) {
    return { questions: [], responses: [] };
  }
  const metadataKeys = ['key', 'createdAt', 'authorPubkey', 'responsesCount'];
  const questions = Object.keys(responsesData[0]).filter(key => !metadataKeys.includes(key));
  const responses = responsesData.map((response, index) => {
    const submission: { [key: string]: string | number | string[] | null } = {
      submission: index + 1
    };
    questions.forEach((question, i) => {
      const key = `Q${i + 1}`;
      const value = response[question];
      if (typeof value === 'string' && value.includes(',')) {
        submission[key] = value.split(',').map(item => item.trim());
      } else {
        submission[key] = value ? String(value).trim() : null;
      }
    });
    return submission;
  });
  return { questions, responses };
};

const createAnalysisPrompt = (query: string, processedData: { questions: string[], responses: object[] }): string => {
  const { questions, responses } = processedData;
  if (questions.length === 0 || responses.length === 0) {
    return "There is no data to analyze. Please inform the user.";
  }
  const questionsString = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
  const responsesString = JSON.stringify(responses, null, 2);
  return `
You are a data analyst...
${questionsString}
USER'S QUESTION:
"${query}"
FORM SUBMISSIONS DATA:
\`\`\`json
${responsesString}
\`\`\`
YOUR ANALYSIS:
`;
};

const AIAnalysisChat: React.FC<AIAnalysisChatProps> = ({ isVisible, onClose, responsesData }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [availableModels, setAvailableModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<boolean | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const initialAnalysisPerformed = useRef(false);
  const messageListRef = useRef<HTMLDivElement>(null);
  const initialConnectionDone = useRef(false);

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages, isAnalyzing]);
  
  const fetchModels = useCallback(async () => {
    setFetchingModels(true);
    const result = await ollamaService.fetchModels();
    if (result.success && result.models && result.models.length > 0) {
        setAvailableModels(result.models);
        setSelectedModel(result.models[0].name);
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

  const performAnalysis = useCallback(async (query: string, isAutomated: boolean = false) => {
    if (!selectedModel) {
      const errorResponse: Message = { sender: 'ai', text: 'Please select a model to begin.' };
      setMessages(prev => [...prev, errorResponse]);
      setIsAnalyzing(false);
      return;
    }
    if (!isAutomated) {
      const userMessage: Message = { sender: 'user', text: query };
      setMessages(prev => [...prev, userMessage]);
    }
    setIsAnalyzing(true);
    
    const processedData = processResponsesForAI(responsesData);
    const fullPrompt = createAnalysisPrompt(query, processedData);
    const result = await ollamaService.generate({ prompt: fullPrompt, modelName: selectedModel });

    if (result.success && result.data?.response) {
      const aiResponse: Message = { sender: 'ai', text: result.data.response };
      setMessages(prev => [...prev, aiResponse]);
    } else {
      const errorResponse: Message = { sender: 'ai', text: `Sorry, I encountered an error: ${result.error || 'Unknown error'}` };
      setMessages(prev => [...prev, errorResponse]);
    }
    setIsAnalyzing(false);
  }, [responsesData, selectedModel]);

  const handleSend = async () => {
    if (!prompt.trim() || isAnalyzing) return;
    const userPrompt = prompt;
    setPrompt('');
    await performAnalysis(userPrompt);
  };

  useEffect(() => {
    if (isVisible && !initialConnectionDone.current) {
        initialConnectionDone.current = true;
        testConnection(false);
    }
  }, [isVisible, testConnection]);

  useEffect(() => {
    if (isVisible && !initialAnalysisPerformed.current && selectedModel && connectionStatus) {
      initialAnalysisPerformed.current = true;
      const initialPrompt = "Provide a general consise analysis of the responses data that might help the user.";
      performAnalysis(initialPrompt, true);
    }
  }, [isVisible, selectedModel, connectionStatus, performAnalysis]);
  
  const getButtonProps = () => {
    if (connectionStatus === true) {
        return { className: 'ai-chat-button-success' };
    }
    if (connectionStatus === false) {
        return { className: 'ai-chat-button-danger' };
    }
    return {};
  };

  if (!isVisible) {
    return null;
  }

  const controlsDisabled = !connectionStatus || isAnalyzing;

  return (
    <ChatWrapper>
      <Card
        title={
          <Space>
            <RobotOutlined />
            AI Analysis
          </Space>
        }
        extra={
            <Button type="text" icon={<CloseOutlined />} onClick={onClose} />
        }
        bodyStyle={{ paddingTop: 4, paddingBottom: 0 }}
      >
        <MessageList ref={messageListRef}>
          {isAnalyzing && messages.length === 0 ? (
            <MessageItem sender="ai">
              <div className="message-bubble"><Spin size="small" /> Thinking...</div>
            </MessageItem>
          ) : (
            <>
              <List
                dataSource={messages}
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
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
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
              disabled={controlsDisabled}
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
                    setModel={setSelectedModel}
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