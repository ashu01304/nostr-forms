// packages/formstr-app/src/services/aiAnalysisService.ts

import { Tag, Field } from '../nostr/types';
import { Event, nip19 } from 'nostr-tools'; // Added nip19
import { ollamaService, GenerateParams } from './ollamaService';
import {
    IDENTIFY_RELEVANT_FIELDS_TOOL_SCHEMA,
    IDENTIFY_RELEVANT_FIELDS_SYSTEM_PROMPT,
    DEFINE_ANALYSIS_STRATEGY_TOOL_SCHEMA,
    DEFINE_ANALYSIS_STRATEGY_SYSTEM_PROMPT,
    GENERAL_ANALYSIS_OUTPUT_TOOL_SCHEMA,
    EXECUTE_ANALYSIS_SYSTEM_PROMPT, // Ensure this is the updated version
    SELECT_FIELDS_FOR_USER_QUERY_TOOL_SCHEMA,
    SELECT_FIELDS_FOR_USER_QUERY_SYSTEM_PROMPT,
} from '../constants/prompts';
import { getInputsFromResponseEvent, getResponseLabels } from '../utils/ResponseUtils';
// import { AnswerTypes } from '@formstr/sdk/dist/interfaces'; // Not directly used here, but useful for context

export interface FormDetailsForLLM {
  formName: string;
  formDescription?: string;
  fields: { id: string; label: string; type: string }[]; // Type is important
}

export interface RelevantFieldInfo {
    id: string;
    label: string;
    // type could be added if needed for other parts of the UI, but FormDetailsForLLM.fields has it
}

export interface AnalysisStrategy {
    suggestedAnalysisType: string;
    fieldsForAnalysis: string[]; // IDs of fields or metadata keys
    analysisPromptToUse: string;
    expectedOutputFormatDescription: string;
}

export interface StructuredAnalysisOutput {
    analysisTitle: string;
    analysisResult: string | object;
    issuesOrNotes?: string;
}

// --- UPDATED extractFormDetails to include field type ---
export const extractFormDetails = (currentFormSpec: Tag[]): FormDetailsForLLM => {
    const formName = currentFormSpec.find((tag) => tag[0] === 'name')?.[1] || 'Untitled Form';
    const settingsTag = currentFormSpec.find(tag => tag[0] === 'settings');
    const settingsString = settingsTag ? settingsTag[1] : '{}';
    let formDescription = '';
    try {
      const settings = JSON.parse(settingsString);
      formDescription = settings?.description || '';
    } catch (parseError) {
      // console.warn("Error parsing form settings for description:", parseError);
    }

    const fields = currentFormSpec
        .filter((tag): tag is Field => tag[0] === 'field' && tag.length >= 6)
        .map(fieldTag => {
            // fieldTag is [tagName, id, primitiveType, label, optionsJson, configJson]
            let determinedType = fieldTag[2] || 'unknown'; // Start with primitive type (e.g., "text", "number", "option")
            try {
                const config = JSON.parse(fieldTag[5] || '{}'); // configJson is at index 5
                if (config.renderElement && typeof config.renderElement === 'string') {
                    determinedType = config.renderElement; // More specific: "shortText", "date", "radioButton"
                }
            } catch (e) {
                // console.warn(`Error parsing config for field ID ${fieldTag[1]}: ${e}`);
            }
            return {
                id: fieldTag[1], 
                label: fieldTag[3] || `(Untitled Field ID: ${fieldTag[1]})`, 
                type: determinedType
            };
        })
        .filter(field => field.label.trim() !== '' && !field.label.startsWith('(Untitled Field ID:'));
    
    return { formName, formDescription, fields };
};

// --- UPDATED generateRelevanceUserPrompt (for initial auto-analysis) to show field types ---
export const generateRelevanceUserPrompt = (formDetails: FormDetailsForLLM): string => {
    const { formName, formDescription, fields } = formDetails;
    if (fields.length === 0) {
        return "The form has no user-defined fields to analyze for relevance.";
    }
    const fieldsList = fields.map(f => `- Label: "${f.label}", ID: ${f.id}, Type: ${f.type}`).join('\n');
    return `Form Name: "${formName}"
Form Description: "${formDescription || 'N/A'}"

Task: Identify user-defined form fields suitable for general qualitative analysis (e.g., sentiment, feedback summarization).
Consider field "Type" (e.g., "LongText", "ShortText" are good candidates).
Provide a list of relevant field IDs using the 'identify_relevant_form_fields' tool.

User-Defined Form Fields:
${fieldsList}`;
};

// --- getRelevantFieldsFromLLMService (for initial auto-analysis) - No structural change, uses updated prompt from above ---
export const getRelevantFieldsFromLLMService = async ( 
    userPrompt: string,
    allFieldDetails: FormDetailsForLLM['fields']
  ): Promise<{ fieldIds: string[]; }> => {
    const params: GenerateParams = {
        prompt: userPrompt,
        systemPrompt: IDENTIFY_RELEVANT_FIELDS_SYSTEM_PROMPT,
        tools: [{type: 'function'as const,function: {name: 'identify_relevant_form_fields',description: 'Identifies relevant fields for analysis.',parameters: IDENTIFY_RELEVANT_FIELDS_TOOL_SCHEMA,},}]
    };
    const ollamaResponse = await ollamaService.generateContent(params);
    if (ollamaResponse.success && ollamaResponse.data) { // Logic for parsing remains same
        const rawData = ollamaResponse.data;
        let parsedRelevantFieldIds: string[] = [];
        if (typeof rawData.relevantFieldIds === 'string') {
            const strVal = rawData.relevantFieldIds.trim();
            if (strVal.toLowerCase() === 'none' || strVal === '') { parsedRelevantFieldIds = []; }
            else if (strVal.startsWith('[') && strVal.endsWith(']')) {
                try {
                    const tempParsed = JSON.parse(strVal);
                    if (Array.isArray(tempParsed) && tempParsed.every(item => typeof item === 'string')) parsedRelevantFieldIds = tempParsed;
                    else parsedRelevantFieldIds = strVal.replace(/^\[|\]$/g, '').split(',').map((s: string) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
                } catch (e) { parsedRelevantFieldIds = strVal.replace(/^\[|\]$/g, '').split(',').map((s: string) => s.trim().replace(/^"|"$/g, '')).filter(Boolean); }
            } else { parsedRelevantFieldIds = strVal.split(',').map((s: string) => s.trim().replace(/^"|"$/g, '')).filter(Boolean); }
        } else if (Array.isArray(rawData.relevantFieldIds)) {
            parsedRelevantFieldIds = rawData.relevantFieldIds.filter((item: any): item is string => typeof item === 'string');
        }
        const validFormIds = new Set(allFieldDetails.map(f => f.id));
        const validatedIds = parsedRelevantFieldIds.filter(id => validFormIds.has(id));
        return { fieldIds: validatedIds };
    } else {
      throw new Error(ollamaResponse.error || "AI failed to identify relevant fields for initial analysis.");
    }
};

// --- UPDATED getRelevantFieldsForUserQueryService (Step 1 for User Query) with metadata and refined prompt ---
const getRelevantFieldsForUserQueryService = async (
    userQuestion: string,
    allUserDefinedFormFields: FormDetailsForLLM['fields'] // Now {id, label, type}[]
): Promise<{ fieldIds: string[]; reasoning: string }> => {
    if (allUserDefinedFormFields.length === 0) { // Check if any user-defined fields exist
        // console.log("[FieldSelectUserQuery] No user-defined fields. Query will rely on metadata if applicable.");
    }

    const userDefinedFieldsListString = allUserDefinedFormFields.map(f => `- ID: ${f.id}, Label: "${f.label}", Type: ${f.type}`).join('\n');

    const promptForFieldSelection = `
User Question: "${userQuestion}"

Analyze the "User Question" to understand its core intent.
Below is a list of available data points for each form response. This includes Standard Metadata and User-Defined Form Fields.

Available Data Points:
1. Standard Metadata (always present for each response):
   - ID: METADATA_AUTHOR_NPUB, Type: NpubString (Submitter's unique public key)
   - ID: METADATA_SUBMITTED_AT, Type: DateTimeString (Timestamp of submission)
   // - ID: METADATA_SUBMISSION_COUNT, Type: Number (Count of submissions for this event, typically 1) // Temporarily comment out if data not ready
2. User-Defined Form Fields (from this form's specific design):
${userDefinedFieldsListString.length > 0 ? userDefinedFieldsListString : "   (No user-defined fields in this form design.)"}

Task: Identify which "Available Data Points" (by their exact ID from the list above) are ESSENTIAL to answer the "User Question".
Consider the "Type" of each data point. For example:
- If asking "when", "on which day", "submission time", prioritize "METADATA_SUBMITTED_AT".
- If asking "who submitted", "list of people", "authors", consider "METADATA_AUTHOR_NPUB" or user-defined fields that might contain names (e.g., Type: ShortText, Label: "Name").
- If asking for quantitative summaries ("how many", "average X"), prefer "Number" type user-fields or situations where counting entries (like METADATA_AUTHOR_NPUB for unique submitters) makes sense.
- If asking about opinions or feedback, prefer "LongText" or "ShortText" user-fields designed for free-form input.

If the question can be answered without specific user-defined fields (e.g., only needs metadata, or is a general count of responses), return an empty array for user-defined field IDs OR select only metadata IDs.
If the question seems unanswerable from ANY of the available data points, reflect this in your reasoning and return an empty 'selectedFieldIds' array.

Use tool 'select_fields_for_user_query'.
'selectedFieldIds': Array of essential data point IDs. Can be empty.
'reasoningForSelection': Concise explanation for your choices or why none were chosen. REQUIRED.`;

    const params: GenerateParams = {
        prompt: promptForFieldSelection,
        systemPrompt: SELECT_FIELDS_FOR_USER_QUERY_SYSTEM_PROMPT,
        tools: [{
            type: 'function' as const,
            function: {
                name: 'select_fields_for_user_query',
                description: 'Selects relevant field IDs and reasoning based on a user question.',
                parameters: SELECT_FIELDS_FOR_USER_QUERY_TOOL_SCHEMA,
            },
        }]
    };

    const ollamaResponse = await ollamaService.generateContent(params);

    if (ollamaResponse.success && ollamaResponse.data) {
        const { selectedFieldIds, reasoningForSelection } = ollamaResponse.data;
        let parsedSelectedFieldIds: string[] = [];

        if (Array.isArray(selectedFieldIds)) {
            parsedSelectedFieldIds = selectedFieldIds.filter((id: any): id is string => typeof id === 'string');
        } else if (typeof selectedFieldIds === 'string' && selectedFieldIds.trim() !== '' && selectedFieldIds.trim().toLowerCase() !== 'none') {
            if (selectedFieldIds.startsWith('[') && selectedFieldIds.endsWith(']')) {
                try { parsedSelectedFieldIds = JSON.parse(selectedFieldIds); } catch { /* ignore */ }
            }
            if (!Array.isArray(parsedSelectedFieldIds) || !parsedSelectedFieldIds.every(item => typeof item === 'string')) {
                 parsedSelectedFieldIds = selectedFieldIds.split(',').map(id => id.trim().replace(/^"|"$/g, '')).filter(Boolean);
            }
        }
        
        // Validate IDs against available user-defined fields AND metadata IDs
        const availableUserDefIdsSet = new Set(allUserDefinedFormFields.map(f => f.id));
        const metadataIdsSet = new Set(['METADATA_AUTHOR_NPUB', 'METADATA_SUBMITTED_AT' /*, 'METADATA_SUBMISSION_COUNT'*/]);
        const validatedIds = parsedSelectedFieldIds.filter(id => availableUserDefIdsSet.has(id) || metadataIdsSet.has(id));
        
        return {
            fieldIds: validatedIds,
            reasoning: typeof reasoningForSelection === 'string' ? reasoningForSelection : "AI did not provide reasoning for field selection."
        };
    } else {
        throw new Error(ollamaResponse.error || "AI failed to select fields for the user query.");
    }
};


// --- UPDATED determineInitialAnalysisStrategyService (Step 2 for User Query) with refined prompt & metadata awareness ---
export const determineInitialAnalysisStrategyService = async (
    currentRelevantDataPoints: RelevantFieldInfo[], // Can include metadata "RelevantFieldInfo"
    formDetails: FormDetailsForLLM, 
    userQuestion?: string
  ): Promise<AnalysisStrategy> => {

    const contextDataPointsString = currentRelevantDataPoints.map(dp => {
        let dpType = 'unknown';
        if (dp.id.startsWith('METADATA_')) {
            if (dp.id === 'METADATA_AUTHOR_NPUB') dpType = 'NpubString (Submitter ID)';
            else if (dp.id === 'METADATA_SUBMITTED_AT') dpType = 'DateTimeString (Submission Time)';
            // else if (dp.id === 'METADATA_SUBMISSION_COUNT') dpType = 'Number (Submission Count)';
        } else {
            const fieldDetail = formDetails.fields.find(fd => fd.id === dp.id);
            dpType = fieldDetail?.type || 'unknown';
        }
        return `- ID: ${dp.id}, Label: "${dp.label}", Type: ${dpType}`;
    }).join('\n');

    let userPromptForStrategy = `Task: Define a precise analysis strategy ${userQuestion ? `to answer the User Question` : `for a general overview`}.
Use ONLY the "Context Data Points" provided below.

${userQuestion ? `User Question: "${userQuestion}"\n` : ''}
Context Data Points (ID, Label, Type) selected as relevant for this task:
${contextDataPointsString || (userQuestion ? 'No specific data points were pre-selected; the User Question might be general or require inference based on overall response patterns if possible.' : 'No specific data points identified; define a general summary strategy if form has data.')}

Instructions for 'define_analysis_strategy' tool output:
1. 'suggestedAnalysisType': A very concise title for the analysis (e.g., "Count of Submissions by Date", "List of Phone Numbers", "Sentiment for Feedback Field", "Answer to: ${userQuestion ? userQuestion.substring(0,25)+'...' : 'Overall Form Summary'}").
2. 'fieldsForAnalysis': Array of essential field IDs from "Context Data Points" that will contain the RAW DATA needed for the analysis. This might be a subset of "Context Data Points". If "Context Data Points" is empty or none are suitable for direct data extraction for the question (e.g., user asks "how many total responses?"), this array can be empty, and the 'analysisPromptToUse' should reflect how to answer (e.g., by counting response entries).
3. 'analysisPromptToUse': Construct the EXACT prompt for the final LLM. This prompt MUST:
    a. Clearly state the User Question (if provided) or the general analysis goal.
    b. Instruct the LLM to use ONLY the data provided to it (which will be from 'fieldsForAnalysis', or imply general response counting if 'fieldsForAnalysis' is empty but question is about counts).
    c. Specify the desired format/type of answer (e.g., a number, a list, a summary paragraph, a JSON object).
    d. CRITICALLY: Instruct the LLM to use the 'perform_data_analysis' tool for its final, complete response, placing the answer in 'analysisResult' and a title in 'analysisTitle'. Example: "...Based on the data, list the phone numbers. Use 'perform_data_analysis' tool to output this list in 'analysisResult' under the title 'Extracted Phone Numbers'."
    e. If the "Context Data Points" are insufficient to answer the User Question, the 'analysisPromptToUse' should instruct the final LLM to state this clearly in its 'analysisResult' or 'issuesOrNotes'.
4. 'expectedOutputFormatDescription': Briefly describe the expected content of 'analysisResult' from the final LLM (e.g., "A JSON array of phone numbers.", "A sentence stating the peak submission day and count.", "A paragraph explaining why the question cannot be answered from the data.").

Focus on creating a highly effective and specific 'analysisPromptToUse'. If 'Context Data Points' is empty, the strategy should reflect an attempt to answer generally or state inability if specific data is required by the 'User Question'.`;

    const params: GenerateParams = {
        prompt: userPromptForStrategy,
        systemPrompt: DEFINE_ANALYSIS_STRATEGY_SYSTEM_PROMPT,
        tools: [{type: 'function' as const,function: {name: 'define_analysis_strategy',description: 'Defines an analysis strategy.',parameters: DEFINE_ANALYSIS_STRATEGY_TOOL_SCHEMA,},}]
    };
    const ollamaResponse = await ollamaService.generateContent(params);

    if (ollamaResponse.success && ollamaResponse.data) {
        const rawStrategyData = ollamaResponse.data;
        let parsedFieldsForAnalysis: string[] = []; // Same parsing logic as before

        if (typeof rawStrategyData.fieldsForAnalysis === 'string') {
            const strVal = rawStrategyData.fieldsForAnalysis.trim();
             if (strVal.toLowerCase() === 'none' || strVal === '') { parsedFieldsForAnalysis = [];}
             else if (strVal.startsWith('[') && strVal.endsWith(']')) {
                try {
                    const tempParsed = JSON.parse(strVal);
                    if (Array.isArray(tempParsed) && tempParsed.every(item => typeof item === 'string')) parsedFieldsForAnalysis = tempParsed;
                    else parsedFieldsForAnalysis = strVal.replace(/^\[|\]$/g, '').split(',').map((s: string) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
                } catch (e) { parsedFieldsForAnalysis = strVal.replace(/^\[|\]$/g, '').split(',').map((s: string) => s.trim().replace(/^"|"$/g, '')).filter(Boolean); }
            } else { parsedFieldsForAnalysis = strVal.split(',').map((s: string) => s.trim().replace(/^"|"$/g, '')).filter(Boolean); }
        } else if (Array.isArray(rawStrategyData.fieldsForAnalysis) && rawStrategyData.fieldsForAnalysis.every((item: any) => typeof item === 'string')) {
            parsedFieldsForAnalysis = rawStrategyData.fieldsForAnalysis;
        }

        const strategy: AnalysisStrategy = {
            suggestedAnalysisType: rawStrategyData.suggestedAnalysisType || (userQuestion ? `Response to: ${userQuestion.substring(0,20)}...` : "General Analysis"),
            fieldsForAnalysis: parsedFieldsForAnalysis,
            analysisPromptToUse: rawStrategyData.analysisPromptToUse,
            expectedOutputFormatDescription: rawStrategyData.expectedOutputFormatDescription,
        };
        
        // Validate that fieldsForAnalysis are a subset of currentRelevantDataPoints if currentRelevantDataPoints is not empty
        if (currentRelevantDataPoints.length > 0) {
            const relevantIdsSet = new Set(currentRelevantDataPoints.map(f => f.id));
            strategy.fieldsForAnalysis = strategy.fieldsForAnalysis.filter(id => relevantIdsSet.has(id));
        }
        // If after all this, fieldsForAnalysis is empty BUT currentRelevantDataPoints was not, and it's a user question,
        // it's possible the AI decided none of the selected points are useful for the *analysis step itself*. This is fine.
        // The `analysisPromptToUse` should then reflect this (e.g., state inability or use general counts).
        return strategy;
    } else {
      throw new Error(ollamaResponse.error || "AI failed to define analysis strategy.");
    }
};

// --- UPDATED prepareDataForAnalysisService with metadata handling ---
export const prepareDataForAnalysisService = (
    fieldIdsToAnalyze: string[], // Can now include METADATA_ IDs
    allResponses: Event[],
    currentFormSpec: Tag[], 
    currentEditKey?: string | null
  ): string => {
    let combinedData = "";
    if (!allResponses || allResponses.length === 0) {
        // console.log("[PrepareData] No responses to prepare. Returning empty data.");
        return "";
    }
    // No need to check fieldIdsToAnalyze here, as an empty array might be intentional
    // for prompts that do general counting or summarization without specific field data.

    // console.log(`[PrepareData] Preparing data for IDs: [${fieldIdsToAnalyze.join(', ')}] from ${allResponses.length} responses.`);
    
    allResponses.forEach((responseEvent: Event, index: number) => { 
        const userDefinedInputs = getInputsFromResponseEvent(responseEvent, currentEditKey);
        let responseEntry = `--- Response Entry ${index + 1} (Submitter ID: ${nip19.npubEncode(responseEvent.pubkey).substring(0,15)}...) ---\n`;
        let hasDataForThisResponseEntry = false; // Tracks if *any* data (meta or user) is added for this entry

        // Always include fixed metadata if requested or implicitly useful
        const submissionTime = new Date(responseEvent.created_at * 1000).toISOString();
        responseEntry += `  Field: "Submission Time"\n  Answer: ${submissionTime}\n`;
        hasDataForThisResponseEntry = true; // Submission time is always data

        // Only process fieldIdsToAnalyze if it's not empty
        if (fieldIdsToAnalyze.length > 0) {
            let specificFieldDataAdded = false;
            fieldIdsToAnalyze.forEach((fieldId: string) => { 
                let fieldLabel = `Field ID ${fieldId}`;
                let answerValue: string | null = null;

                if (fieldId === 'METADATA_AUTHOR_NPUB') {
                    fieldLabel = "Author Npub"; // Consistent label
                    answerValue = nip19.npubEncode(responseEvent.pubkey);
                } else if (fieldId === 'METADATA_SUBMITTED_AT') {
                    fieldLabel = "Submitted At"; // Consistent label
                    answerValue = submissionTime; // Already have it
                }
                // else if (fieldId === 'METADATA_SUBMISSION_COUNT') { ... } // Still tricky, omit for now
                else { // User-defined field
                    const fieldSpecTag = currentFormSpec.find((tag: Tag) => tag[0] === 'field' && tag[1] === fieldId) as Field | undefined;
                    if (fieldSpecTag && fieldSpecTag[3]) {
                       fieldLabel = fieldSpecTag[3];
                    }
                    const relevantInput = userDefinedInputs.find(input => input[1] === fieldId);
                    if (relevantInput) {
                        const { responseLabel } = getResponseLabels(relevantInput, currentFormSpec);
                        if (responseLabel && responseLabel.trim().toLowerCase() !== "n/a" && responseLabel.trim() !== "") {
                            answerValue = responseLabel;
                        }
                    }
                }

                if (answerValue !== null) {
                    // Avoid duplicating submission time if it was explicitly requested
                    if (fieldId !== 'METADATA_SUBMITTED_AT') { // since it's already added above unconditionally
                        responseEntry += `  Field: "${fieldLabel}"\n  Answer: ${answerValue}\n`;
                    }
                    specificFieldDataAdded = true;
                }
            });
            if(specificFieldDataAdded) hasDataForThisResponseEntry = true;
        }
        
        responseEntry += "\n"; // Add a blank line after each entry's fields or just after metadata

        if (hasDataForThisResponseEntry) { // Only add entry if it has at least metadata
            combinedData += responseEntry;
        }
    });
    // console.log(`[PrepareData] Combined data length for LLM: ${combinedData.length}`);
    return combinedData;
};

// --- executeAutomatedAnalysisService - No changes needed, relies on EXECUTE_ANALYSIS_SYSTEM_PROMPT ---
// packages/formstr-app/src/services/aiAnalysisService.ts
// ... (imports and other functions as previously provided) ...

// --- executeAutomatedAnalysisService - Check this function ---
export const executeAutomatedAnalysisService = async (
    strategy: AnalysisStrategy, // strategy IS a parameter here
    preparedData: string
  ): Promise<StructuredAnalysisOutput> => {
    const fullUserPromptForExecution = `${strategy.analysisPromptToUse}\n\nHere is the data to analyze:\n${preparedData}`;
    const params: GenerateParams = {
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
        if (strategy.expectedOutputFormatDescription && strategy.expectedOutputFormatDescription.toLowerCase().includes("json") && typeof toolOutput.analysisResult === 'string') {
            try {
                const jsonMatch = toolOutput.analysisResult.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*}|\[[\s\S]*\])/);
                if (jsonMatch) {
                    const jsonString = jsonMatch[1] || jsonMatch[2]; 
                    finalResult = JSON.parse(jsonString);
                } else {
                    finalResult = JSON.parse(toolOutput.analysisResult);
                }
            } catch (e) {
                // console.warn(`'analysisResult' was expected to be JSON based on description, but failed to parse. Content: "${toolOutput.analysisResult}". Error: ${e}`);
            }
        }
        return {
            analysisTitle: toolOutput.analysisTitle,
            analysisResult: finalResult,
            issuesOrNotes: toolOutput.issuesOrNotes
        };
    } else {
        throw new Error(ollamaResponse.error || "AI failed to execute the analysis strategy.");
    }
};

// --- processUserQuery - Check calls here ---
export const processUserQuery = async (
  userQuestion: string,
  formDetails: FormDetailsForLLM,
  currentFormSpec: Tag[],
  allResponses: Event[],
  editKey?: string | null
): Promise<StructuredAnalysisOutput> => {
  // ... (initial checks for userQuestion, allResponses, formDetails.fields, currentFormSpec) ...
  // Ensure these checks are present as in the previous full code block

  try {
    console.log(`[UserQuery Step 1] Identifying relevant data points for question: "${userQuestion}"`);
    const { fieldIds: relevantDataPointIds, reasoning: fieldSelectionReasoning } = await getRelevantFieldsForUserQueryService(userQuestion, formDetails.fields);
    console.log(`[UserQuery Step 1] AI selected data point IDs: [${relevantDataPointIds.join(', ')}]. Reasoning: ${fieldSelectionReasoning}`);

    const relevantDataPointsForStrategy: RelevantFieldInfo[] = relevantDataPointIds.map(id => {
        if (id === 'METADATA_AUTHOR_NPUB') return { id, label: 'Author Npub' };
        if (id === 'METADATA_SUBMITTED_AT') return { id, label: 'Submission Time' };
        const field = formDetails.fields.find(f => f.id === id);
        return { id, label: field ? field.label : id };
    });
    
    if (relevantDataPointIds.length === 0 && !userQuestion.toLowerCase().match(/how many responses|total submissions|count responses/)) {
      console.warn(`[UserQuery Step 1] AI selected no specific data points. Reasoning: ${fieldSelectionReasoning}. Question might be too general or unanswerable from form fields.`);
    }
    
    console.log(`[UserQuery Step 2] Defining analysis strategy for question: "${userQuestion}" using ${relevantDataPointsForStrategy.length} context point(s).`);
    // Calling determineInitialAnalysisStrategyService with 3 arguments
    const strategyForUserQuery: AnalysisStrategy = await determineInitialAnalysisStrategyService(
      relevantDataPointsForStrategy,
      formDetails, 
      userQuestion
    );
    console.log(`[UserQuery Step 2] Strategy: ${strategyForUserQuery.suggestedAnalysisType}. Fields for analysis step: [${strategyForUserQuery.fieldsForAnalysis.join(', ')}]`);

    if (strategyForUserQuery.fieldsForAnalysis.length === 0 && relevantDataPointIds.length > 0) {
        // This case: AI selected relevant points for the question (step 1), but then the strategy (step 2)
        // decided that for the *actual data extraction and analysis*, no fields are needed from that selection.
        // This can be valid if the question is answerable by just counting responses or general context
        // that prepareDataForAnalysisService might still provide (like submission times).
        console.warn(`[UserQuery Step 2] Strategy decided no specific fields needed for data extraction from those AI selected as relevant. This might be okay for general queries.`)
    } else if (strategyForUserQuery.fieldsForAnalysis.length === 0 && relevantDataPointIds.length === 0) {
         // AI selected no relevant fields, and strategy also selected no fields for analysis.
         // It is highly likely the question cannot be answered with specific data.
         // The final LLM call (Step 3) should be instructed to state this.
         console.warn(`[UserQuery Step 2] No relevant fields identified by AI, and strategy confirms no specific fields for analysis. Final LLM will be prompted accordingly.`);
    }


    console.log(`[UserQuery Step 3] Preparing data based on strategy fields: [${strategyForUserQuery.fieldsForAnalysis.join(', ')}]`);
    // Calling prepareDataForAnalysisService with 4 arguments
    const preparedData: string = prepareDataForAnalysisService(
      strategyForUserQuery.fieldsForAnalysis, 
      allResponses,
      currentFormSpec,
      editKey
    );

    if (strategyForUserQuery.fieldsForAnalysis.length > 0 && !preparedData.trim()) {
      return {
        analysisTitle: strategyForUserQuery.suggestedAnalysisType || `Response to: "${userQuestion.substring(0, 30)}..."`,
        analysisResult: "Could not find any relevant text in the selected field(s) to answer your question based on the chosen strategy.",
        issuesOrNotes: `Data preparation for fields [${strategyForUserQuery.fieldsForAnalysis.join(', ')}] yielded no content. Field selection reasoning for this query: ${fieldSelectionReasoning}`
      };
    }
    
    console.log(`[UserQuery Step 3] Executing analysis: ${strategyForUserQuery.suggestedAnalysisType}`);
    // Calling executeAutomatedAnalysisService with 2 arguments
    const finalOutput: StructuredAnalysisOutput = await executeAutomatedAnalysisService(strategyForUserQuery, preparedData); // strategyForUserQuery is the 'strategy'
    
    // ... (rest of the logging and return logic for finalOutput) ...
    if (fieldSelectionReasoning && fieldSelectionReasoning.length > 30 && !fieldSelectionReasoning.toLowerCase().includes("obvious") && !fieldSelectionReasoning.toLowerCase().includes("as requested")) {
        finalOutput.issuesOrNotes = `Field Selection Insight: ${fieldSelectionReasoning}${finalOutput.issuesOrNotes ? ` | ${finalOutput.issuesOrNotes}` : ''}`;
    } else {
        console.log(`[UserQuery Field Selection Reasoning (not shown to user)]: ${fieldSelectionReasoning}`);
    }
    return finalOutput;

  } catch (error: any) {
    console.error("Error during processUserQuery:", error);
    return {
      analysisTitle: "Error Processing Question",
      analysisResult: "An unexpected error occurred.",
      issuesOrNotes: error.message || "Unknown AI processing error."
    };
  }
};