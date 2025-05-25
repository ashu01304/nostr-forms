import { Tag, Field } from '../nostr/types';
import { Event } from 'nostr-tools';
import { ollamaService } from './ollamaService';
import { 
    IDENTIFY_RELEVANT_FIELDS_TOOL_SCHEMA, 
    IDENTIFY_RELEVANT_FIELDS_SYSTEM_PROMPT,
    DEFINE_ANALYSIS_STRATEGY_TOOL_SCHEMA,
    DEFINE_ANALYSIS_STRATEGY_SYSTEM_PROMPT,
    GENERAL_ANALYSIS_OUTPUT_TOOL_SCHEMA,
    EXECUTE_ANALYSIS_SYSTEM_PROMPT
} from '../constants/prompts';
import { getInputsFromResponseEvent, getResponseLabels } from '../utils/ResponseUtils';

export interface FormDetailsForLLM {
  formName: string;
  formDescription?: string;
  fields: { id: string; label: string }[];
}

export interface RelevantFieldInfo {
    id: string;
    label: string;
}

export interface AnalysisStrategy {
    suggestedAnalysisType: string;
    fieldsForAnalysis: string[];
    analysisPromptToUse: string;
    expectedOutputFormatDescription: string;
}

export interface StructuredAnalysisOutput {
    analysisTitle: string;
    analysisResult: string | object; 
    issuesOrNotes?: string;
}

export const extractFormDetails = (currentFormSpec: Tag[]): FormDetailsForLLM => {
    const formName = currentFormSpec.find((tag) => tag[0] === 'name')?.[1] || 'Untitled Form';
    const settingsTag = currentFormSpec.find(tag => tag[0] === 'settings');
    const settingsString = settingsTag ? settingsTag[1] : '{}';
    let formDescription = '';
    try {
      const settings = JSON.parse(settingsString);
      formDescription = settings?.description || '';
    } catch (parseError) {
      console.warn("Error parsing form settings for description:", parseError);
    }
    const fields = currentFormSpec
        .filter((tag): tag is Field => tag[0] === 'field')
        .map(field => ({ id: field[1], label: field[3] || `(No label for ID: ${field[1]})` }))
        .filter(field => !['author', 'submissions', 'createdAt', 'key', 'authorPubkey', 'responsesCount'].includes(field.id) && field.label.trim() !== '');
    return { formName, formDescription, fields };
};

export const generateRelevanceUserPrompt = (formDetails: FormDetailsForLLM): string => {
    const { formName, formDescription, fields } = formDetails;
    if (fields.length === 0) {
        return "The form has no fields to analyze for relevance.";
    }
    let fieldsList = fields.map(f => `- "${f.label}" (ID: ${f.id})`).join('\n');
    return `Form Name: ${formName}\nForm Description: ${formDescription || 'N/A'}\n\nPlease analyze the following form fields and identify which ones are most suitable for qualitative analysis (e.g., sentiment, feedback summarization, suggestions). List their IDs.\nFields:\n${fieldsList}`;
};

// ... (other imports and interfaces) ...

export const getRelevantFieldsFromLLMService = async ( 
    userPrompt: string,
    allFieldDetails: {id: string, label: string}[]
  ): Promise<{ fieldIds: string[]; /* reasoning: string | null; REMOVED */ }> => { // --- REMOVED reasoning from return type ---
    const params = {
        prompt: userPrompt,
        systemPrompt: IDENTIFY_RELEVANT_FIELDS_SYSTEM_PROMPT,
        tools: [{type: 'function'as const,function: {name: 'identify_relevant_form_fields',description: 'Identifies relevant fields for analysis.',parameters: IDENTIFY_RELEVANT_FIELDS_TOOL_SCHEMA,},}]
    };
    const ollamaResponse = await ollamaService.generateContent(params);

    if (ollamaResponse.success && ollamaResponse.data) {
        console.log("[AI Service] Raw Tool Call Args for Relevant Fields:", JSON.stringify(ollamaResponse.data, null, 2));

        const rawData = ollamaResponse.data;
        let parsedRelevantFieldIds: string[] = [];
        // --- REMOVED const reasoning = typeof rawData.reasoning === 'string' ? rawData.reasoning : null; ---

        if (typeof rawData.relevantFieldIds === 'string') {
            const strVal = rawData.relevantFieldIds.trim();
            if (strVal.toLowerCase() === 'none' || strVal === '') { // Handle "none" or empty string
                parsedRelevantFieldIds = [];
            } else if (strVal.startsWith('[') && strVal.endsWith(']')) {
                try {
                    const tempParsed = JSON.parse(strVal);
                    if (Array.isArray(tempParsed) && tempParsed.every(item => typeof item === 'string')) {
                        parsedRelevantFieldIds = tempParsed;
                    }
                } catch (e) {
                    console.warn("Failed to parse stringified array for relevantFieldIds, trying comma split:", e);
                    parsedRelevantFieldIds = strVal.split(',').map((s: string) => s.trim()).filter(Boolean);
                }
            } else {
                parsedRelevantFieldIds = strVal.split(',').map((s: string) => s.trim()).filter(Boolean);
            }
        } else if (Array.isArray(rawData.relevantFieldIds)) {
            parsedRelevantFieldIds = rawData.relevantFieldIds.filter((item: any): item is string => typeof item === 'string');
        } else {
            console.warn("'relevantFieldIds' from AI was not a string or array. Raw data:", rawData.relevantFieldIds);
        }
        
        const validFormIds = new Set(allFieldDetails.map(f => f.id));
        const validatedIds = parsedRelevantFieldIds.filter(id => validFormIds.has(id));

        // --- REMOVED reasoning from console.warn ---
        // if (parsedRelevantFieldIds.length > 0 && validatedIds.length === 0) {
        //      console.warn("AI provided relevantFieldIds, but none matched actual form field IDs.");
        // }

        return { fieldIds: validatedIds /*, reasoning: null REMOVED */ };
    } else {
      throw new Error(ollamaResponse.error || "Failed to get relevant fields from AI (service). AI Response or data missing.");
    }
};

// ... (rest of aiAnalysisService.ts remains the same) ...
export const determineInitialAnalysisStrategyService = async (
    currentRelevantFields: RelevantFieldInfo[],
    formName: string,
    formDescription?: string
  ): Promise<AnalysisStrategy> => {
    const relevantFieldsString = currentRelevantFields.map(f => `- "${f.label}" (ID: ${f.id})`).join('\n');
    if (currentRelevantFields.length === 0) {
        throw new Error("Cannot define analysis strategy without relevant fields (service).");
    }
    const userPromptForStrategy = `
Form Name: ${formName}
Form Description: ${formDescription || 'N/A'}

Identified relevant fields for qualitative analysis:
${relevantFieldsString}

Based on these fields, please define a strategy for an initial automated analysis.
Your strategy should include:
1. 'suggestedAnalysisType': A concise name for the analysis (e.g., "Overall Sentiment", "Key Themes").
2. 'fieldsForAnalysis': The specific field ID(s) from the list above most critical for this analysis.
3. 'analysisPromptToUse': A precise prompt to give to another LLM. THIS PROMPT MUST INSTRUCT THE SUBSEQUENT LLM TO USE THE 'perform_data_analysis' TOOL to structure its final output. For example, the prompt might end with: "...Now, use the 'perform_data_analysis' tool to provide your findings, placing the main summary in 'analysisResult' and a title in 'analysisTitle'."
4. 'expectedOutputFormatDescription': A description of the *content* expected in the 'analysisResult' field of the 'perform_data_analysis' tool (e.g., "A JSON string with keys: summary, sentimentScore", or "A short paragraph summarizing themes.").
`;
    const params = {
        prompt: userPromptForStrategy,
        systemPrompt: DEFINE_ANALYSIS_STRATEGY_SYSTEM_PROMPT,
        tools: [{type: 'function' as const,function: {name: 'define_analysis_strategy',description: 'Defines an initial analysis strategy.',parameters: DEFINE_ANALYSIS_STRATEGY_TOOL_SCHEMA,},}]
    };
    const ollamaResponse = await ollamaService.generateContent(params);
    if (ollamaResponse.success && ollamaResponse.data) {
        const rawStrategyData = ollamaResponse.data;
        let parsedFieldsForAnalysis: string[];
        if (typeof rawStrategyData.fieldsForAnalysis === 'string') {
            try {
                parsedFieldsForAnalysis = JSON.parse(rawStrategyData.fieldsForAnalysis);
                if (!Array.isArray(parsedFieldsForAnalysis) || !parsedFieldsForAnalysis.every((item:any) => typeof item === 'string')) {
                    parsedFieldsForAnalysis = [];
                }
            } catch (e) { parsedFieldsForAnalysis = []; }
        } else if (Array.isArray(rawStrategyData.fieldsForAnalysis) && rawStrategyData.fieldsForAnalysis.every((item: any) => typeof item === 'string')) {
            parsedFieldsForAnalysis = rawStrategyData.fieldsForAnalysis;
        } else { parsedFieldsForAnalysis = []; }

        const strategy: AnalysisStrategy = {
            suggestedAnalysisType: rawStrategyData.suggestedAnalysisType,
            fieldsForAnalysis: parsedFieldsForAnalysis,
            analysisPromptToUse: rawStrategyData.analysisPromptToUse,
            expectedOutputFormatDescription: rawStrategyData.expectedOutputFormatDescription,
        };
        const relevantIdsSet = new Set(currentRelevantFields.map(f => f.id));
        strategy.fieldsForAnalysis = strategy.fieldsForAnalysis.filter(id => relevantIdsSet.has(id));
        if (strategy.fieldsForAnalysis.length === 0 && currentRelevantFields.length > 0) {
            strategy.fieldsForAnalysis = [currentRelevantFields[0].id];
        }
        return strategy;
    } else {
      throw new Error(ollamaResponse.error || "Failed to define analysis strategy with AI (service).");
    }
};

export const prepareDataForAnalysisService = (
    fieldIdsToAnalyze: string[],
    allResponses: Event[],
    currentFormSpec: Tag[], 
    currentEditKey?: string | null
  ): string => {
    let combinedData = "";
    if (!allResponses || allResponses.length === 0 || fieldIdsToAnalyze.length === 0) {
        return "";
    }
    allResponses.forEach((responseEvent: Event, index: number) => { // Typed responseEvent and index
        const inputs = getInputsFromResponseEvent(responseEvent, currentEditKey);
        let responseEntry = `Response ${index + 1}:\n`;
        let hasDataForThisResponse = false;
        fieldIdsToAnalyze.forEach((fieldId: string) => { // Typed fieldId
            const fieldSpec = currentFormSpec.find((tag: Tag) => tag[0] === 'field' && tag[1] === fieldId) as Field | undefined; // Typed tag
            const fieldLabel = fieldSpec ? fieldSpec[3] : fieldId;
            const relevantInput = inputs.find(input => input[1] === fieldId);
            if (relevantInput) {
                const { responseLabel } = getResponseLabels(relevantInput, currentFormSpec);
                if (responseLabel && responseLabel.trim() !== "N/A" && responseLabel.trim() !== "") {
                    responseEntry += `  ${fieldLabel}: ${responseLabel}\n`;
                    hasDataForThisResponse = true;
                }
            }
        });
        if (hasDataForThisResponse) {
            combinedData += responseEntry + "---\n";
        }
    });
    return combinedData;
};

export const executeAutomatedAnalysisService = async (
    strategy: AnalysisStrategy,
    preparedData: string
  ): Promise<StructuredAnalysisOutput> => {
    const fullUserPromptForExecution = `${strategy.analysisPromptToUse}\n\nHere is the data to analyze:\n${preparedData}`;
    const params = {
        prompt: fullUserPromptForExecution,
        systemPrompt: EXECUTE_ANALYSIS_SYSTEM_PROMPT,
        tools: [{
            type: 'function' as const,
            function: {
                name: 'perform_data_analysis',
                description: 'Structures the output of a data analysis task.',
                parameters: GENERAL_ANALYSIS_OUTPUT_TOOL_SCHEMA,
            },
        }]
    };
    const ollamaResponse = await ollamaService.generateContent(params);
    if (ollamaResponse.success && ollamaResponse.data) {
        const toolOutput = ollamaResponse.data as { analysisTitle: string; analysisResult: string; issuesOrNotes?: string };
        let finalResult: string | object = toolOutput.analysisResult;
        if (strategy.expectedOutputFormatDescription.toLowerCase().includes("json") && typeof toolOutput.analysisResult === 'string') {
            try {
                const jsonMatch = toolOutput.analysisResult.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*}|\[[\s\S]*\])/);
                if (jsonMatch) {
                    const jsonString = jsonMatch[1] || jsonMatch[2];
                    finalResult = JSON.parse(jsonString);
                } else {
                    finalResult = JSON.parse(toolOutput.analysisResult);
                }
            } catch (e) {
                console.warn(`'analysisResult' was expected to be JSON but failed to parse. Content: "${toolOutput.analysisResult}". Error: ${e}`);
            }
        }
        return {
            analysisTitle: toolOutput.analysisTitle,
            analysisResult: finalResult,
            issuesOrNotes: toolOutput.issuesOrNotes
        };
    } else {
        throw new Error(ollamaResponse.error || "Failed to execute automated analysis with AI (service tool call failed).");
    }
};