import React, { useState } from 'react';
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
    const submission: { [key: string]: string | number } = {
      submission: index + 1
    };
    questions.forEach((question, i) => {
      const key = `Q${i + 1}`;
      submission[key] = (String(response[question]) || "N/A").trim();
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
You are friendly, smartest data analyst. Your analyze form responses based on the user's question, using only the provided data, and respond in a natural, human-like way.

INSTRUCTIONS:
- Understand the context by reviewing the questions
- Keep answers accurate, concise, and free of extra text.
- Write as if talking to a friend, making the response easy to understand.
- give straightforward answer to the user's question.

LIST OF QUESTIONS:
${questionsString}


USER'S QUESTION:
"${query}"

FORM SUBMISSIONS DATA:
\`\`\`json
${responsesString}

YOUR ANALYSIS:
`;
};


const AIAnalysisChat: React.FC<AIAnalysisChatProps> = ({ isVisible, onClose, responsesData }) => {
  const [messages, setMessages] = useState<Message[]>([
    { sender: 'ai', text: 'Hello! How can I help you analyze these responses?' }
  ]);
  const [prompt, setPrompt] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleSend = async () => {
    if (!prompt.trim() || isAnalyzing) return;

    const newUserMessage: Message = { sender: 'user', text: prompt };
    setMessages(prev => [...prev, newUserMessage]);
    setPrompt('');
    setIsAnalyzing(true);
    
    const processedData = processResponsesForAI(responsesData);
    const fullPrompt = createAnalysisPrompt(prompt, processedData);
    const result = await ollamaService.generate({ prompt: fullPrompt });

    if (result.success && result.data?.response) {
        const aiResponse: Message = { sender: 'ai', text: result.data.response };
        setMessages(prev => [...prev, aiResponse]);
    } else {
        const errorResponse: Message = { sender: 'ai', text: `Sorry, I encountered an error: ${result.error || 'Unknown error'}` };
        setMessages(prev => [...prev, errorResponse]);
    }
    
    setIsAnalyzing(false);
  };

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