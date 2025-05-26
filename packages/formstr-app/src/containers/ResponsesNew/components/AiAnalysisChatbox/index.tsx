// packages/formstr-app/src/containers/ResponsesNew/components/AiAnalysisChatbox/index.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Typography, Input, Button, Spin, Alert, Card as AntCard } from 'antd';
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
    generateRelevanceUserPrompt,
    getRelevantFieldsFromLLMService,
    determineInitialAnalysisStrategyService,
    prepareDataForAnalysisService,
    executeAutomatedAnalysisService,
    // We'll add the new service function for user queries here later
    processUserQuery, 
    type RelevantFieldInfo,
    type AnalysisStrategy,
    type StructuredAnalysisOutput,
    type FormDetailsForLLM, // Ensure this is exported from aiAnalysisService
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
  const [isAiRespondingToUserQuery, setIsAiRespondingToUserQuery] = useState<boolean>(false); // New state

  const [loadingInitialAnalysis, setLoadingInitialAnalysis] = useState(false);
  const [currentStepMessage, setCurrentStepMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const messageIdCounter = useRef(0); 
  const initialAnalysisDone = useRef(false); 
  const currentRelevantFieldsRef = useRef<RelevantFieldInfo[]>([]); // To store relevant fields for user queries

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [chatMessages]);

  const addMessage = (sender: ChatMessage['sender'], content: ChatMessage['content']) => {
    messageIdCounter.current += 1;
    const newId = `msg-${Date.now()}-${messageIdCounter.current}`;
    setChatMessages(prev => [...prev, {id: newId, sender, content, timestamp: new Date()}]);
  };
  
   useEffect(() => {
    const performFullAutomatedAnalysis = async () => {
        if (initialAnalysisDone.current) return; 
        if (!formSpec || formSpec.length === 0) {
            return;
        }
        if (!responses) {
            return;
        }
        
        initialAnalysisDone.current = true; 

        setLoadingInitialAnalysis(true);
        setError(null);
        setChatMessages([{id: `sys-start-${Date.now()}`, sender: 'systemInfo', content: '🚀 AI analysis pipeline initiated...', timestamp: new Date()}]);

        try {
            setCurrentStepMessage("Extracting form structure...");
            const formDetails = extractFormDetails(formSpec);
            if (formDetails.fields.length === 0) {
                addMessage('systemInfo', `No actionable fields found in the form to analyze.`);
                setLoadingInitialAnalysis(false);
                return;
            }

            setCurrentStepMessage("Identifying relevant fields...");
            const relevanceUserPrompt = generateRelevanceUserPrompt(formDetails);
            const { fieldIds: relevantIds } = await getRelevantFieldsFromLLMService(relevanceUserPrompt, formDetails.fields);
            
            console.log("AI Relevant Field IDs:", relevantIds);

            if (relevantIds.length === 0) {
                addMessage('systemInfo', "AI did not identify any specific fields as particularly relevant for an automated overview.");
                currentRelevantFieldsRef.current = formDetails.fields; // Default to all fields if none specifically relevant
                addMessage('systemInfo', "Automated analysis will proceed considering all form fields for potential insights.");
            } else {
                 currentRelevantFieldsRef.current = relevantIds.map(id => {
                    const field = formDetails.fields.find(f => f.id === id);
                    return { id, label: field ? field.label : id };
                });
            }
setCurrentStepMessage("Defining an analysis strategy...");
const strategy: AnalysisStrategy = await determineInitialAnalysisStrategyService(
    currentRelevantFieldsRef.current, 
    formDetails, // <<< NEW: passing the whole formDetails object
    // userQuestion is undefined here for automated analysis, which is correct
);
console.log("AI Determined Strategy:", strategy);


            if (!responses || responses.length === 0) { // Check responses again, might have changed
                addMessage('systemInfo', "No response data available to analyze for the automated strategy.");
                setLoadingInitialAnalysis(false);
                return;
            }
            setCurrentStepMessage(`Preparing data for '${strategy.suggestedAnalysisType}'...`);
            const preparedData = prepareDataForAnalysisService(strategy.fieldsForAnalysis, responses, formSpec, editKey);
            
            if (!preparedData.trim()) {
                addMessage('systemInfo', `No data found in the field(s) chosen for analysis: ${strategy.fieldsForAnalysis.map(id => currentRelevantFieldsRef.current.find(f=>f.id===id)?.label || id).join(', ')}.`);
                 setLoadingInitialAnalysis(false);
                return;
            }

            setCurrentStepMessage(`Performing '${strategy.suggestedAnalysisType}'...`);
            const analysisOutput = await executeAutomatedAnalysisService(strategy, preparedData);

            addMessage('ai', 
                <AntCard type="inner" size="small" title={analysisOutput.analysisTitle || "Automated Analysis Result"}>
                    {renderAnalysisResult(analysisOutput.analysisResult)}
                    {analysisOutput.issuesOrNotes && <Paragraph style={{marginTop: '10px', fontSize: '0.9em', color: '#888', borderTop: '1px dashed #eee', paddingTop: '5px'}}><Text strong>AI Notes:</Text> {analysisOutput.issuesOrNotes}</Paragraph>}
                </AntCard>
            );
            addMessage('systemInfo', "✅ Automated analysis complete. You can now ask follow-up questions below.");

        } catch (err: any) {
            const errorMessage = err.message || "An error occurred during AI analysis.";
            setError(errorMessage);
            addMessage('systemInfo', <Alert message={`Pipeline Error: ${errorMessage}`} type="error" showIcon />);
        } finally {
            setLoadingInitialAnalysis(false); 
            setCurrentStepMessage(null);
        }
    };

    if (formSpec && responses && !initialAnalysisDone.current) { 
        performFullAutomatedAnalysis();
    } else if (formSpec && !responses && !initialAnalysisDone.current) { 
        if (chatMessages.length === 0 || !chatMessages.some(msg => typeof msg.content === 'string' && msg.content.includes("Waiting for responses"))) {
             setChatMessages([{id: `sys-wait-${Date.now()}`, sender: 'systemInfo', content: "Form loaded. Waiting for responses to perform analysis...", timestamp: new Date()}]);
        }
    } else if (!formSpec && !initialAnalysisDone.current && chatMessages.length === 0) {
        setChatMessages([{id: `sys-init-${Date.now()}`, sender: 'systemInfo', content: "Initializing AI Analysis module...", timestamp: new Date()}]);
    }
    
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formSpec, responses, editKey]); 
    
  const renderAnalysisResult = (resultData: string | object | null) => {
    if (resultData === null || resultData === undefined) return <Text type="secondary">No specific result content provided by AI.</Text>;
    
    if (typeof resultData === 'string') {
        try {
            const parsedJson = JSON.parse(resultData);
            return <pre style={{ whiteSpace: 'pre-wrap', marginTop: '5px', background: '#fafafa', padding: '10px', border: '1px solid #eee', borderRadius: '4px', fontSize: '0.9em' }}>{JSON.stringify(parsedJson, null, 2)}</pre>;
        } catch (e) {
            return <Paragraph style={{ whiteSpace: 'pre-wrap', marginTop: '5px', background: '#fafafa', padding: '10px', border: '1px solid #eee', borderRadius: '4px' }}>{resultData}</Paragraph>;
        }
    }
    return <pre style={{ whiteSpace: 'pre-wrap', marginTop: '5px', background: '#fafafa', padding: '10px', border: '1px solid #eee', borderRadius: '4px', fontSize: '0.9em' }}>{JSON.stringify(resultData, null, 2)}</pre>;
  };

  const handleUserInputSubmit = async () => {
    if (!userInput.trim()) return;
    // Ensure formSpec and responses are available
    if (!formSpec || formSpec.length === 0 || !responses) { 
        addMessage('systemInfo', "Cannot process question: Form data or responses are not fully loaded.");
        return;
    }

    const userQuestion = userInput;
    addMessage('user', userQuestion);
    setUserInput('');
    setIsAiRespondingToUserQuery(true);
    setError(null);

    try {
        // Extract form details (needed by processUserQuery)
        const formDetails: FormDetailsForLLM = extractFormDetails(formSpec); 
        
        // Call the actual service function
        const aiResponse: StructuredAnalysisOutput = await processUserQuery(
            userQuestion,
            formDetails,
            formSpec, // Pass the original full Tag[] formSpec
            responses,
            // currentRelevantFieldsRef.current, // <<< REMOVE THIS ARGUMENT
            editKey
        );

        addMessage('ai', 
            <AntCard type="inner" size="small" title={aiResponse.analysisTitle || "AI Response"}>
                {renderAnalysisResult(aiResponse.analysisResult)}
                {aiResponse.issuesOrNotes && <Paragraph style={{marginTop: '10px', fontSize: '0.9em', color: '#888', borderTop: '1px dashed #eee', paddingTop: '5px'}}><Text strong>AI Notes:</Text> {aiResponse.issuesOrNotes}</Paragraph>}
            </AntCard>
        );

    } catch (err: any) {
        const errorMessage = err.message || "An error occurred while processing your question.";
        setError(errorMessage);
        addMessage('systemInfo', <Alert message={`Query Error: ${errorMessage}`} type="error" showIcon />);
    } finally {
        setIsAiRespondingToUserQuery(false);
    }
  };

  return (
    <ChatboxContainer>
      <Title level={4} style={{ marginBottom: '10px', textAlign: 'center' }}>AI Analysis</Title>
      {(loadingInitialAnalysis || isAiRespondingToUserQuery) && 
        <div style={{textAlign: 'center', marginBottom: '10px'}}>
            <Spin tip={currentStepMessage || (isAiRespondingToUserQuery ? "AI is thinking..." : "AI is processing...")} />
        </div>
      }
      {error && !loadingInitialAnalysis && !isAiRespondingToUserQuery && <Alert message={`Error: ${error}`} type="error" showIcon style={{marginBottom: '10px'}} />}
      
      <MessagesArea>
        {chatMessages.map(msg => (
            <MessageBubble key={msg.id} sender={msg.sender}>
                {typeof msg.content === 'string' ? <Paragraph style={{margin: 0, color: msg.sender === 'user' ? 'white' : 'inherit'}}>{msg.content}</Paragraph> : msg.content}
            </MessageBubble>
        ))}
        {chatMessages.length === 0 && !loadingInitialAnalysis && !error && (
            <Text type="secondary" style={{textAlign: 'center', marginTop: '20px'}}>
                AI analysis will begin when form and response data are available.
            </Text>
        )}
        <div ref={messagesEndRef} />
      </MessagesArea>

      <InputArea>
        <Input.TextArea
          rows={2}
          placeholder="Ask a follow-up question about the responses..."
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          disabled={loadingInitialAnalysis || isAiRespondingToUserQuery || !initialAnalysisDone.current} 
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              handleUserInputSubmit();
            }
          }}
        />
        <Button 
            type="primary" 
            onClick={handleUserInputSubmit}
            loading={isAiRespondingToUserQuery}
            disabled={loadingInitialAnalysis || isAiRespondingToUserQuery || !initialAnalysisDone.current}
        >
          Ask
        </Button>
      </InputArea>
    </ChatboxContainer>
  );
};