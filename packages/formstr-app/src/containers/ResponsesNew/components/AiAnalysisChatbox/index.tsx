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
    type RelevantFieldInfo, 
    type AnalysisStrategy,
    type StructuredAnalysisOutput
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
  // const [isAiResponding, setIsAiResponding] = useState<boolean>(false); // For user queries (currently disabled)

  const [loadingInitialAnalysis, setLoadingInitialAnalysis] = useState(false);
  const [currentStepMessage, setCurrentStepMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const messageIdCounter = useRef(0); // For unique message keys

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [chatMessages]);

  const addMessage = (sender: ChatMessage['sender'], content: ChatMessage['content']) => {
    messageIdCounter.current += 1;
    const newId = `msg-${Date.now()}-${messageIdCounter.current}`;
    setChatMessages(prev => [...prev, {id: newId, sender, content, timestamp: new Date()}]);
  };
    const initialAnalysisDone = useRef(false); // +++ Ref to track if initial analysis has run

  
   useEffect(() => {
    const performFullAutomatedAnalysis = async () => {
        // This check ensures it runs only once after all conditions are met
        if (initialAnalysisDone.current) return; 

        if (!formSpec || formSpec.length === 0) {
            // ... (same initial check logic)
            return;
        }
        if (!responses) {
            // ... (same initial check logic)
            return;
        }
        
        initialAnalysisDone.current = true; // +++ Mark as done right before starting the actual work

        setLoadingInitialAnalysis(true);
        setError(null);
        setChatMessages([{id: `sys-start-${Date.now()}`, sender: 'systemInfo', content: '🚀 AI analysis pipeline initiated...', timestamp: new Date()}]);

        try {
            setCurrentStepMessage("Identifying relevant fields...");
            const formDetails = extractFormDetails(formSpec);
            if (formDetails.fields.length === 0) {
                addMessage('systemInfo', `No actionable fields found in the form to analyze.`);
                return; // No finally block needed here, as setLoading is at the end of try/catch
            }
            const relevanceUserPrompt = generateRelevanceUserPrompt(formDetails);
            // --- Adjusted to expect no reasoning ---
            const { fieldIds: relevantIds /*, reasoning: relevanceReasoning REMOVED */ } = await getRelevantFieldsFromLLMService(relevanceUserPrompt, formDetails.fields);
            
            // --- REMOVED UI display of relevanceReasoning ---
            // console.log("AI Relevance Reasoning:", relevanceReasoning); (Still good for dev console)
            console.log("AI Relevant Field IDs:", relevantIds);

            if (relevantIds.length === 0) {
                addMessage('systemInfo', "AI did not identify any specific fields as particularly relevant for an automated overview.");
                return;
            }
            const currentRelevantFieldsInfo: RelevantFieldInfo[] = relevantIds.map(id => {
                const field = formDetails.fields.find(f => f.id === id);
                return { id, label: field ? field.label : id };
            });

            // --- No longer adding detailed relevance card to chat ---
            // addMessage('systemInfo', <AntCard size="small" title="Field Relevance Analysis"> ... </AntCard>);

            setCurrentStepMessage("Defining an analysis strategy...");
            const strategy: AnalysisStrategy = await determineInitialAnalysisStrategyService(currentRelevantFieldsInfo, formDetails.formName, formDetails.formDescription);
            console.log("AI Determined Strategy:", strategy);
            // --- No longer adding detailed strategy card to chat ---
            // addMessage('systemInfo', <AntCard size="small" title="AI's Analysis Plan"> ... </AntCard>);

            if (responses.length === 0) {
                addMessage('systemInfo', "No response data available to analyze for the automated strategy.");
                return;
            }
            setCurrentStepMessage(`Preparing data for '${strategy.suggestedAnalysisType}'...`);
            const preparedData = prepareDataForAnalysisService(strategy.fieldsForAnalysis, responses, formSpec, editKey);
            
            if (!preparedData.trim()) {
                addMessage('systemInfo', `No data found in the field(s) chosen for analysis: ${strategy.fieldsForAnalysis.map(id => currentRelevantFieldsInfo.find(f=>f.id===id)?.label || id).join(', ')}.`);
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
            addMessage('systemInfo', "✅ Automated analysis complete. User interaction for follow-up questions is currently disabled.");

        } catch (err: any) {
            const errorMessage = err.message || "An error occurred during AI analysis.";
            setError(errorMessage);
            addMessage('systemInfo', <Alert message={`Pipeline Error: ${errorMessage}`} type="error" showIcon />);
        } finally {
            setLoadingInitialAnalysis(false); // Ensure loading is set to false in all paths
            setCurrentStepMessage(null);
        }
    };

    if (formSpec && responses && !initialAnalysisDone.current) { // +++ Check initialAnalysisDone.current
        performFullAutomatedAnalysis();
    } else if (formSpec && !responses && !initialAnalysisDone.current) { // Only show waiting if not already done
        if (chatMessages.length === 0 || !chatMessages.some(msg => typeof msg.content === 'string' && msg.content.includes("Waiting for responses"))) {
             setChatMessages([{id: `sys-wait-${Date.now()}`, sender: 'systemInfo', content: "Form loaded. Waiting for responses to perform analysis...", timestamp: new Date()}]);
        }
    } else if (!formSpec && !initialAnalysisDone.current && chatMessages.length === 0) {
        setChatMessages([{id: `sys-init-${Date.now()}`, sender: 'systemInfo', content: "Initializing AI Analysis module...", timestamp: new Date()}]);
    }
    
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formSpec, responses, editKey]); // Dependencies remain the same.
                                      // The initialAnalysisDone ref controls one-time execution logic internally.
    
  // ... (renderAnalysisResult, handleUserInputSubmit, and return JSX remain the same)
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
    addMessage('systemInfo', 'Follow-up questions are not yet implemented in this phase.');
  };

  return (
    <ChatboxContainer>
      <Title level={4} style={{ marginBottom: '10px', textAlign: 'center' }}>AI Analysis</Title>
      {loadingInitialAnalysis && 
        <div style={{textAlign: 'center', marginBottom: '10px'}}>
            <Spin tip={currentStepMessage || "AI is processing..."} />
        </div>
      }
      {error && !loadingInitialAnalysis && <Alert message={`Error: ${error}`} type="error" showIcon style={{marginBottom: '10px'}} />}
      
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
          placeholder="Follow-up questions (feature coming soon)..."
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          disabled={true} 
        />
        <Button 
            type="primary" 
            onClick={handleUserInputSubmit}
            disabled={true} 
        >
          Ask
        </Button>
      </InputArea>
    </ChatboxContainer>
  );
};