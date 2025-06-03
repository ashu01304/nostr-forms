// packages/formstr-app/src/containers/ResponsesNew/components/AiAnalysisChatbox/index.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Typography, Input, Button, Spin, Alert } from 'antd'; // Removed AntCard if not used elsewhere
import {
    ChatboxContainer,
    MessagesArea,
    InputArea,
    MessageBubble
} from './AiAnalysisChatbox.style';
import { Tag } from '../../../../nostr/types';
import { Event } from 'nostr-tools';
import {
    extractFormDetails,
    processUserQuery, // We will use this for both automated and user queries
    type FormDetailsForLLM,
    type ProcessedUserQueryOutput,
    // getFieldsAndDirectQueryService, // No longer directly called from here
    // prepareDataForAnalysisService, // No longer directly called from here
    // executeDirectAnalysisService, // No longer directly called from here
} from '../../../../services/aiAnalysisService';

const { Title, Text, Paragraph } = Typography;

interface ChatMessage {
    id: string;
    sender: 'user' | 'ai' | 'systemInfo';
    content: string | JSX.Element;
    timestamp: Date;
}

interface AiAnalysisChatboxProps {
  formSpec: Tag[] | null | undefined;
  responses: Event[] | undefined;
  editKey?: string | null | undefined;
}

export const AiAnalysisChatbox: React.FC<AiAnalysisChatboxProps> = ({ formSpec, responses, editKey }) => {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState<string>('');
  const [isAiRespondingToUserQuery, setIsAiRespondingToUserQuery] = useState<boolean>(false); // Used for user queries
  const [loadingInitialAnalysis, setLoadingInitialAnalysis] = useState(false); // Specific for initial load
  const [currentStepMessage, setCurrentStepMessage] = useState<string | null>(null); // General loading message
  const [error, setError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const messageIdCounter = useRef(0); 
  const initialAnalysisDone = useRef(false); 

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); };
  useEffect(scrollToBottom, [chatMessages]);

  const addMessage = useCallback((sender: ChatMessage['sender'], content: ChatMessage['content']) => {
    messageIdCounter.current += 1;
    const newId = `msg-${Date.now()}-${messageIdCounter.current}`;
    setChatMessages(prev => [...prev, {id: newId, sender, content, timestamp: new Date()}]);
  }, []);
  
  const performFullAutomatedAnalysis = useCallback(async () => {
    if (initialAnalysisDone.current) return;
    if (!formSpec || formSpec.length === 0 || !responses) {
        if (chatMessages.length === 0 && !loadingInitialAnalysis && !error) {
             if (!formSpec || formSpec.length === 0) { addMessage('systemInfo', "Waiting for form structure to load for AI analysis..."); }
             else if (!responses) { addMessage('systemInfo', "Form loaded. Waiting for responses to perform automated analysis..."); }
        }
        return;
    }
    
    initialAnalysisDone.current = true;
    setLoadingInitialAnalysis(true);
    setError(null);
    addMessage('systemInfo', '⏳ Performing initial automated AI analysis...');
    setCurrentStepMessage("AI is analyzing responses for an initial overview...");

    try {
        const formDetails = extractFormDetails(formSpec);
        if ((!formDetails.fields || formDetails.fields.length === 0) && (!responses || responses.length === 0)) {
            addMessage('systemInfo', `Form has no user-defined fields and no responses yet. Automated analysis cannot provide specific insights.`);
            addMessage('systemInfo', "Ask a general question if you'd like, or wait for responses.");
            setLoadingInitialAnalysis(false);
            setCurrentStepMessage(null);
            return;
        }
        
        const automatedAnalysisContextPrompt = `Perform a general qualitative analysis and overview of this form's responses. Identify key themes, overall sentiment, or any notable patterns. If specific fields seem particularly insightful for a general overview (like open-ended feedback fields), focus on those. If not, provide a broad summary based on all available data. The goal is an initial understanding of the response data. Be concise and user-friendly in your output.`;

        // Use processUserQuery for the automated analysis
        const aiResponse: ProcessedUserQueryOutput = await processUserQuery(
            automatedAnalysisContextPrompt,
            formDetails,
            formSpec,
            responses,
            editKey
        );
        
        addMessage('ai', aiResponse.aiResponseText);
        
        if (aiResponse.issuesOrNotes) {
            addMessage('systemInfo', (
                <Text type="secondary" style={{ fontSize: '0.9em', fontStyle: 'italic' }}>
                    AI Note: {aiResponse.issuesOrNotes}
                </Text>
            ));
        }
        addMessage('systemInfo', "✅ Automated analysis complete. You can now ask follow-up questions.");

    } catch (err: any) {
        const errorMessage = err.message || "An error occurred during automated AI analysis.";
        setError(errorMessage);
        addMessage('systemInfo', <Alert message={`Automated Analysis Error: ${errorMessage}`} type="error" showIcon />);
    } finally {
        setLoadingInitialAnalysis(false); 
        setCurrentStepMessage(null);
    }
  }, [formSpec, responses, editKey, addMessage, chatMessages.length, loadingInitialAnalysis, error]); // Added dependencies

  useEffect(() => {
    if (!initialAnalysisDone.current && formSpec && responses) {
        performFullAutomatedAnalysis();
    } else if (!initialAnalysisDone.current && chatMessages.filter(m => m.sender === 'systemInfo').length < 2) {
          if (!formSpec && !loadingInitialAnalysis && !error) {
               addMessage('systemInfo', "Waiting for form structure to load for AI analysis...");
           } else if (formSpec && !responses && !loadingInitialAnalysis && !error) {
               addMessage('systemInfo', "Form loaded. Waiting for responses to perform automated analysis...");
           }
    }
  }, [formSpec, responses, performFullAutomatedAnalysis, chatMessages.length, loadingInitialAnalysis, error, addMessage]);


  const handleUserInputSubmit = async () => {
    if (!userInput.trim()) return;
    if (!formSpec || formSpec.length === 0 || !responses) { 
        addMessage('systemInfo', "Cannot process question: Form data or responses are not fully loaded.");
        return;
    }
    const userQuestion = userInput;
    addMessage('user', userQuestion);
    setUserInput('');
    setIsAiRespondingToUserQuery(true); // This state is for user-initiated queries
    setCurrentStepMessage("AI is thinking...");
    setError(null);
    try {
        const formDetails: FormDetailsForLLM = extractFormDetails(formSpec); 
        const aiResponse: ProcessedUserQueryOutput = await processUserQuery(
            userQuestion,
            formDetails,
            formSpec, 
            responses,
            editKey
        );
        
        addMessage('ai', aiResponse.aiResponseText); 
        
        if (aiResponse.issuesOrNotes) {
            addMessage('systemInfo', (
                <Text type="secondary" style={{ fontSize: '0.9em', fontStyle: 'italic' }}>
                    AI Note: {aiResponse.issuesOrNotes}
                </Text>
            ));
        }

    } catch (err: any) {
        const errorMessage = err.message || "An error occurred while processing your question.";
        setError(errorMessage); // Set general error state
        addMessage('systemInfo', <Alert message={`Query Error: ${errorMessage}`} type="error" showIcon />);
    } finally {
        setIsAiRespondingToUserQuery(false);
        setCurrentStepMessage(null);
    }
  };

  return (
    <ChatboxContainer>
      <Title level={4} style={{ marginBottom: '10px', textAlign: 'center' }}>AI Analysis</Title>
      {/* Combined loading indicator */}
      {(loadingInitialAnalysis || isAiRespondingToUserQuery) && 
        <div style={{textAlign: 'center', marginBottom: '10px'}}>
            <Spin tip={currentStepMessage || "AI is processing..."} />
        </div>
      }
      {/* Display general error if not loading */}
      {error && !loadingInitialAnalysis && !isAiRespondingToUserQuery && (
        <Alert message={`Error: ${error}`} type="error" showIcon style={{marginBottom: '10px'}} />
      )}
      
      <MessagesArea>
        {chatMessages.map(msg => (
            <MessageBubble key={msg.id} sender={msg.sender}>
                {typeof msg.content === 'string' 
                    ? <Paragraph style={{margin: 0, color: msg.sender === 'user' ? 'white' : 'inherit', whiteSpace: 'pre-wrap'}}>{msg.content}</Paragraph> 
                    : msg.content}
            </MessageBubble>
        ))}
        {!initialAnalysisDone.current && chatMessages.length === 0 && !loadingInitialAnalysis && !error && (
             <Text type="secondary" style={{textAlign: 'center', marginTop: '20px'}}>Initializing AI Analysis module...</Text>
        )}
        <div ref={messagesEndRef} />
      </MessagesArea>

      <InputArea>
        <Input.TextArea
          rows={2}
          placeholder="Ask a follow-up question about the responses..."
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          // Disable input if initial analysis isn't done OR if AI is actively responding to a user query
          disabled={!initialAnalysisDone.current || isAiRespondingToUserQuery || loadingInitialAnalysis} 
          onPressEnter={(e) => { 
              if (!e.shiftKey && initialAnalysisDone.current && !isAiRespondingToUserQuery && !loadingInitialAnalysis) { 
                  e.preventDefault(); 
                  handleUserInputSubmit(); 
              }
          }}
        />
        <Button 
            type="primary" 
            onClick={handleUserInputSubmit}
            loading={isAiRespondingToUserQuery} // Loading state specifically for user submit button
             // Disable button if initial analysis isn't done OR if AI is actively responding OR initial loading
            disabled={!initialAnalysisDone.current || isAiRespondingToUserQuery || loadingInitialAnalysis}
        >
          Ask
        </Button>
      </InputArea>
    </ChatboxContainer>
  );
};