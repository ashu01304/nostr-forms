import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Card, Input, List, Space, Spin } from 'antd';
import { CloseOutlined, RobotOutlined, SendOutlined } from '@ant-design/icons';
import { AIAnalysisChatProps, Message } from './types';
import { ChatWrapper, MessageItem, MessageList } from './style';
import { ollamaService } from '../../../../services/ollamaService';
import ReactMarkdown from 'react-markdown';

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
You are a data analyst. so the step by step analyze like a programmer form responses data based on the user's question, and respond in human-like way.

INSTRUCTIONS:
- Review the provided questions to understand their intent (e.g., numeric, categorical, free-text).
- Analyze the form submissions to answer the user's query.
- Interpret 'null' as missing data and ignore for non-relevant submissions.
- For array responses (e.g., ["Mains", "Dessert"]), treat as multi-valued answers.
- Present answers in bullet points clarity, unless otherwise specified.
- Adapt to varying question sets and response formats.
- If the data or query is unclear, respond with: "The provided data or question is ambiguous. Please clarify the query or check the data."

LIST OF QUESTIONS:
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
  const initialAnalysisPerformed = useRef(false);

  const performAnalysis = useCallback(async (query: string, isAutomated: boolean = false) => {
    if (!isAutomated) {
      const userMessage: Message = { sender: 'user', text: query };
      setMessages(prev => [...prev, userMessage]);
    }
    setIsAnalyzing(true);
    
    const processedData = processResponsesForAI(responsesData);
    const fullPrompt = createAnalysisPrompt(query, processedData);
    const result = await ollamaService.generate({ prompt: fullPrompt });

    if (result.success && result.data?.response) {
      const aiResponse: Message = { sender: 'ai', text: result.data.response };
      setMessages(prev => [...prev, aiResponse]);
    } else {
      const errorResponse: Message = { sender: 'ai', text: `Sorry, I encountered an error: ${result.error || 'Unknown error'}` };
      setMessages(prev => [...prev, errorResponse]);
    }
    
    setIsAnalyzing(false);
  }, [responsesData]);

  const handleSend = async () => {
    if (!prompt.trim() || isAnalyzing) return;
    const userPrompt = prompt;
    setPrompt('');
    await performAnalysis(userPrompt);
  };

  useEffect(() => {
    if (isVisible && !initialAnalysisPerformed.current) {
      initialAnalysisPerformed.current = true;
      const initialPrompt = "Provide a general consise analysis of the responses data that might help the user.";
      performAnalysis(initialPrompt, true);
    }
  }, [isVisible, performAnalysis]);

  if (!isVisible) {
    return null;
  }

  return (
    <ChatWrapper>
      <Card
        title={
          <Space>
            <RobotOutlined />
            AI Analysis
          </Space>
        }
        extra={<Button type="text" icon={<CloseOutlined />} onClick={onClose} />}
      >
        <MessageList>
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
              <div className="message-bubble">
                <Spin size="small" /> Thinking...
              </div>
            </MessageItem>
          )}
        </MessageList>
        <div style={{ marginTop: 'auto' }}>
          <Space.Compact style={{ width: '100%' }}>
            <TextArea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask about the responses..."
              autoSize={{ minRows: 1, maxRows: 4 }}
              disabled={isAnalyzing}
              onPressEnter={(e) => {
                if (!e.shiftKey && !isAnalyzing) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button 
              type="primary" 
              icon={<SendOutlined />} 
              onClick={handleSend}
              loading={isAnalyzing}
            />
          </Space.Compact>
        </div>
      </Card>
    </ChatWrapper>
  );
};

export default AIAnalysisChat;