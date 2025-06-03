// packages/formstr-app/src/services/aiAnalysisService.ts

import { Tag, Field, Option } from '../nostr/types'; // Added Option type
import { Event, nip19 } from 'nostr-tools';
import { ollamaService, GenerateParams } from './ollamaService';
import {
    IDENTIFY_RELEVANT_FIELDS_TOOL_SCHEMA,
    IDENTIFY_RELEVANT_FIELDS_SYSTEM_PROMPT,
    EXECUTE_DIRECT_ANALYSIS_SYSTEM_PROMPT,
    SELECT_FIELDS_AND_FORMULATE_DIRECT_QUERY_TOOL_SCHEMA,
    SELECT_FIELDS_AND_FORMULATE_DIRECT_QUERY_SYSTEM_PROMPT,
} from '../constants/prompts';
import { getInputsFromResponseEvent, getResponseLabels } from '../utils/ResponseUtils';

// Modified to include optional 'options' for choice fields
export interface FormDetailsForLLMField {
    id: string;
    label: string;
    type: string; // This is the renderElement type
    options?: string[]; // Added for choice types
}
export interface FormDetailsForLLM {
  formName: string;
  formDescription?: string;
  fields: FormDetailsForLLMField[];
}

export interface RelevantFieldInfo {
    id: string;
    label: string;
}

export interface ProcessedUserQueryOutput {
    aiResponseText: string;
    issuesOrNotes?: string;
}

// --- extractFormDetails - Modified to include options for choice fields ---
export const extractFormDetails = (currentFormSpec: Tag[]): FormDetailsForLLM => {
    const formName = currentFormSpec.find((tag) => tag[0] === 'name')?.[1] || 'Untitled Form';
    const settingsTag = currentFormSpec.find(tag => tag[0] === 'settings');
    let formDescription = '';
    if (settingsTag && settingsTag[1]) {
        try {
            const settings = JSON.parse(settingsTag[1]);
            formDescription = settings?.description || '';
        } catch (parseError) { /* Silently ignore */ }
    }

    const fields: FormDetailsForLLMField[] = currentFormSpec
        .filter((tag): tag is Field => tag[0] === 'field' && tag.length >= 6)
        .map(fieldTag => {
            const fieldId = fieldTag[1];
            const fieldLabel = fieldTag[3] || `(Untitled Field ID: ${fieldId})`;
            let determinedType = fieldTag[2] || 'unknown'; // Primitive type: "text", "number", "option"
            let fieldOptions: string[] | undefined = undefined;

            if (fieldTag[5]) { // configJson is at index 5
                try {
                    const config = JSON.parse(fieldTag[5]);
                    if (config.renderElement && typeof config.renderElement === 'string') {
                        determinedType = config.renderElement; // More specific: "shortText", "date", "radioButton"
                    }
                } catch (e) { /* Silently ignore */ }
            }

            // If it's an option/choice type, extract the option labels
            if (determinedType === 'radioButton' || determinedType === 'checkboxes' || determinedType === 'dropdown') {
                if (fieldTag[4]) { // optionsString is at index 4
                    try {
                        const optionsArray = JSON.parse(fieldTag[4]) as Option[]; // Assuming Option is [id, label, settingsString?]
                        if (Array.isArray(optionsArray)) {
                            fieldOptions = optionsArray.map(opt => opt[1]); // Get the label part of the option
                        }
                    } catch (e) { /* Silently ignore */ }
                }
            }

            return {
                id: fieldId,
                label: fieldLabel,
                type: determinedType,
                options: fieldOptions, // Add options here
            };
        })
        .filter(field => field.label.trim() !== '' && !field.label.startsWith('(Untitled Field ID:'));
    
    return { formName, formDescription, fields };
};

export const generateRelevanceUserPrompt = (formDetails: FormDetailsForLLM): string => {
    const { formName, formDescription, fields } = formDetails;
    if (fields.length === 0) return "The form has no user-defined fields to analyze for relevance.";
    const fieldsList = fields.map(f => {
        let fieldDesc = `- Label: "${f.label}", ID: ${f.id}, Type: ${f.type}`;
        if (f.options && f.options.length > 0) {
            fieldDesc += `, Options: [${f.options.join(', ')}]`;
        }
        return fieldDesc;
    }).join('\n');
    return `Form Name: "${formName}"\nForm Description: "${formDescription || 'N/A'}"\n\nTask: Identify user-defined form fields suitable for general qualitative analysis (e.g., sentiment, feedback summarization). Consider field "Type" and available "Options". Provide IDs using 'identify_relevant_form_fields' tool.\n\nUser-Defined Form Fields:\n${fieldsList}`;
};

export const getRelevantFieldsFromLLMService = async (userPrompt: string, allFieldDetails: FormDetailsForLLM['fields']): Promise<{ fieldIds: string[]; }> => {
    const params: GenerateParams = {
        prompt: userPrompt,
        systemPrompt: IDENTIFY_RELEVANT_FIELDS_SYSTEM_PROMPT,
        tools: [{type: 'function'as const,function: {name: 'identify_relevant_form_fields',description: 'Identifies relevant fields for analysis.',parameters: IDENTIFY_RELEVANT_FIELDS_TOOL_SCHEMA,},}]
    };
    // ... (rest of the function remains the same as it was already correct)
    const ollamaResponse = await ollamaService.generateContent(params);
    if (ollamaResponse.success && ollamaResponse.data) {
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

interface FieldsAndDirectQueryOutput {
    selectedDataPointIDs: string[];
    directAnalysisQuery: string;
}
export const getFieldsAndDirectQueryService = async (
    contextualPromptOrUserQuestion: string,
    allUserDefinedFormFields: FormDetailsForLLMField[] // Updated type
): Promise<FieldsAndDirectQueryOutput> => {
    
    // Modified to include options in the description for the LLM
    const userDefinedFieldsListString = allUserDefinedFormFields.map(f => {
        let fieldDesc = `- ID: ${f.id}, Label: "${f.label}", Type: ${f.type}`;
        if (f.options && f.options.length > 0) {
            fieldDesc += `, Options: [${f.options.join(', ')}]`;
        }
        return fieldDesc;
    }).join('\n');

    const promptForStep1 = `
Contextual Prompt/User Question: "${contextualPromptOrUserQuestion}"

Available Data Points for analysis:
1. Standard Metadata (always present for each response):
   - ID: METADATA_AUTHOR_NPUB, Type: NpubString (Submitter's unique ID)
   - ID: METADATA_SUBMITTED_AT, Type: DateTimeString (Submission timestamp)
2. User-Defined Form Fields (from form design):
${userDefinedFieldsListString.length > 0 ? userDefinedFieldsListString : "   (No user-defined fields in this form.)"}

Your Task (use 'select_fields_and_formulate_direct_query' tool for output):
1.  'selectedDataPointIDs': From "Available Data Points", list IDs ESSENTIAL for the "Contextual Prompt/User Question". Consider "Type" and "Options" if provided. Can be empty if query is general (e.g. "count all responses") or no specific data points are needed.
2.  'directAnalysisQuery': Create a clear and concise query or instruction for a *second, separate LLM*. This query should tell the second LLM what specific analysis to perform on data from the 'selectedDataPointIDs'. Example: If user asks "What is the sentiment of feedback?", 'directAnalysisQuery' could be "Analyze the sentiment of the provided feedback entries."
`;

    const systemPromptForStep1 = SELECT_FIELDS_AND_FORMULATE_DIRECT_QUERY_SYSTEM_PROMPT;
    const params: GenerateParams = {
        prompt: promptForStep1,
        systemPrompt: systemPromptForStep1,
        tools: [{
            type: 'function' as const,
            function: {
                name: 'select_fields_and_formulate_direct_query',
                description: 'Selects relevant data points and formulates a direct analysis query for the next LLM.',
                parameters: SELECT_FIELDS_AND_FORMULATE_DIRECT_QUERY_TOOL_SCHEMA,
            },
        }]
    };

    console.log("DEBUG: AIAnalysisService - Step 1 - Input to LLM:", JSON.stringify(params, null, 2));
    const ollamaResponse = await ollamaService.generateContent(params);
    console.log("DEBUG: AIAnalysisService - Step 1 - Raw LLM Output Data:", JSON.stringify(ollamaResponse.data, null, 2));

    if (ollamaResponse.success && ollamaResponse.data) {
        const { selectedDataPointIDs, directAnalysisQuery } = ollamaResponse.data;
        
        let parsedSelectedIDs: string[] = [];
        if (Array.isArray(selectedDataPointIDs)) {
            parsedSelectedIDs = selectedDataPointIDs.filter((id: any): id is string => typeof id === 'string');
        } else if (typeof selectedDataPointIDs === 'string' && selectedDataPointIDs.trim() !== '' && selectedDataPointIDs.trim().toLowerCase() !== 'none') {
            if (selectedDataPointIDs.startsWith('[') && selectedDataPointIDs.endsWith(']')) {
                try { parsedSelectedIDs = JSON.parse(selectedDataPointIDs); } catch { /* ignore */ }
            }
            if (!Array.isArray(parsedSelectedIDs) || !parsedSelectedIDs.every(item => typeof item === 'string')) {
                 parsedSelectedIDs = selectedDataPointIDs.split(',').map(id => id.trim().replace(/^"|"$/g, '')).filter(Boolean);
            }
        }
        
        const availableUserDefIdsSet = new Set(allUserDefinedFormFields.map(f => f.id));
        const metadataIdsSet = new Set(['METADATA_AUTHOR_NPUB', 'METADATA_SUBMITTED_AT']);
        const validatedIDs = parsedSelectedIDs.filter(id => availableUserDefIdsSet.has(id) || metadataIdsSet.has(id));

        if (!directAnalysisQuery || typeof directAnalysisQuery !== 'string' || directAnalysisQuery.trim() === "") {
            throw new Error("AI failed to generate a valid 'directAnalysisQuery'.");
        }
        
        return {
            selectedDataPointIDs: validatedIDs,
            directAnalysisQuery: directAnalysisQuery,
        };
    } else {
        throw new Error(ollamaResponse.error || "AI failed at Step 1 (select fields and formulate direct query).");
    }
};

// --- prepareDataForAnalysisService - Modified to only include data for selected IDs ---
// packages/formstr-app/src/services/aiAnalysisService.ts

// ... (other imports and FormDetailsForLLM interfaces remain the same) ...
// ... (extractFormDetails, generateRelevanceUserPrompt, getRelevantFieldsFromLLMService, getFieldsAndDirectQueryService remain the same from the last version) ...

// --- prepareDataForAnalysisService - Implementing Numbered Field Mapping ---
export const prepareDataForAnalysisService = (
    fieldIdsToAnalyze: string[], // These are the selectedDataPointIDs from Step 1
    allResponses: Event[],
    currentFormSpec: Tag[],
    currentEditKey?: string | null
  ): string => {
    if (!allResponses || allResponses.length === 0) {
        return "(No responses have been submitted to this form yet.)";
    }
    if (!fieldIdsToAnalyze || fieldIdsToAnalyze.length === 0) {
        return "(No specific data fields were selected for analysis.)";
    }

    // 1. Create Field Key
    // Map selected field IDs to their labels for the key
    const fieldKeyMapping: { id: string; label: string }[] = fieldIdsToAnalyze.map(id => {
        if (id === 'METADATA_AUTHOR_NPUB') return { id, label: "Author Npub (Not included in response data)" }; // Label for key, but data excluded
        if (id === 'METADATA_SUBMITTED_AT') return { id, label: "Submission Time" };
        
        const fieldSpecTag = currentFormSpec.find((tag: Tag): tag is Field => tag[0] === 'field' && tag[1] === id);
        return { id, label: fieldSpecTag && fieldSpecTag[3] ? fieldSpecTag[3] : `Unknown Field (ID: ${id})` };
    });

    let fieldKeyString = "Field Key:\n";
    fieldKeyMapping.forEach((field, index) => {
        // We will not include METADATA_AUTHOR_NPUB in the actual numbered key presented to LLM for response data
        if (field.id !== 'METADATA_AUTHOR_NPUB') {
            fieldKeyString += `${index + 1}: "${field.label}"\n`;
        }
    });
    
    // Filter out METADATA_AUTHOR_NPUB from the actual mapping used for data rows
    const activeFieldKeyMapping = fieldKeyMapping.filter(f => f.id !== 'METADATA_AUTHOR_NPUB');
    if (activeFieldKeyMapping.length === 0) {
        return "(No data fields selected for analysis after filtering.)"
    }
    // Rebuild fieldKeyString with only active fields for numbering consistency
    fieldKeyString = "Field Key:\n";
     activeFieldKeyMapping.forEach((field, index) => {
        fieldKeyString += `${index + 1}: "${field.label}"\n`;
    });


    // 2. Process Each Response to create positional answer arrays
    const responseDataStrings: string[] = [];
    allResponses.forEach((responseEvent: Event, entryIndex: number) => {
        const userDefinedInputs = getInputsFromResponseEvent(responseEvent, currentEditKey);
        const responseAnswers: (string | null)[] = []; // Array to hold answers for current response
        let hasAtLeastOneAnswerForThisResponse = false;

        activeFieldKeyMapping.forEach(mappedField => {
            let answer: string | null = "N/A"; // Default if no answer found or for excluded fields

            if (mappedField.id === 'METADATA_SUBMITTED_AT') {
                answer = new Date(responseEvent.created_at * 1000).toISOString();
            } else {
                // User-defined field
                const relevantInput = userDefinedInputs.find(input => input[1] === mappedField.id);
                if (relevantInput) {
                    const { responseLabel: rawResponseLabel } = getResponseLabels(relevantInput, currentFormSpec);
                    const responseLabelAsString = String(rawResponseLabel ?? '');
                    if (responseLabelAsString && responseLabelAsString.trim().toLowerCase() !== "n/a" && responseLabelAsString.trim() !== "") {
                        answer = responseLabelAsString;
                        hasAtLeastOneAnswerForThisResponse = true;
                    }
                }
            }
            responseAnswers.push(answer);
        });

        // Only add entry if it has some meaningful data for the selected fields (beyond just N/A for all)
        // or if specific metadata like submission time was requested and is present.
        // For simplicity, we'll add the row if any selected user field had an answer, or if submission time was selected.
        // A more robust check could be if not all answers are "N/A".
        if (hasAtLeastOneAnswerForThisResponse || activeFieldKeyMapping.some(mf => mf.id === 'METADATA_SUBMITTED_AT')) {
             responseDataStrings.push(`- Entry ${entryIndex + 1}: ${JSON.stringify(responseAnswers)}`);
        }
    });

    if (responseDataStrings.length === 0) {
        return `${fieldKeyString}\n(No responses contained data for the selected fields.)`;
    }

    // 3. Construct Final String
    const explanation = "Data for Analysis:\nPlease use the 'Field Key' below to understand the data in 'Responses'. Each response entry is a list of answers corresponding to the numbered fields in the key. 'N/A' or null indicates no answer was provided for that field in that response.\n\n";
    const finalDataString = explanation + fieldKeyString + "\nResponses:\n" + responseDataStrings.join("\n");
    
    return finalDataString;
};

// ... (executeDirectAnalysisService and processUserQuery will use this new data format)
// ... (The rest of aiAnalysisService.ts: extractFormDetails, getFieldsAndDirectQueryService, 
//      executeDirectAnalysisService, processUserQuery should remain as per the previous correct version,
//      they don't need to change for this specific data formatting update within prepareDataForAnalysisService)


export const executeDirectAnalysisService = async (
    directAnalysisQueryFromStep1: string,
    preparedData: string
  ): Promise<string> => {
    // If preparedData is one of our "no data" messages, we might want to append it to the query
    // or let the LLM handle it based on the query.
    let finalQuery = directAnalysisQueryFromStep1;
    if (preparedData.startsWith("(No specific data points were selected") || preparedData.startsWith("(No matching data found for the selected analysis points")) {
        finalQuery += `\n\nNote on Data: ${preparedData}`;
    }

    const fullUserPromptForExecution = `${finalQuery}\n\nData for Analysis (if specific data points were selected and found):\n${(preparedData.startsWith("(No specific data points were selected") || preparedData.startsWith("(No matching data found for the selected analysis points")) ? "(See note above regarding data availability)" : preparedData.trim()}`;
    
    const systemPromptForStep2 = EXECUTE_DIRECT_ANALYSIS_SYSTEM_PROMPT;
    const params: GenerateParams = {
        prompt: fullUserPromptForExecution,
        systemPrompt: systemPromptForStep2,
    };

    console.log("DEBUG: AIAnalysisService - Step 2 - Input to LLM:", JSON.stringify(params, null, 2));
    const ollamaResponse = await ollamaService.generateContent(params);
    
    let aiDirectResponseText = "";
    if (ollamaResponse.success) {
        if (typeof ollamaResponse.data === 'string') {
            aiDirectResponseText = ollamaResponse.data;
        } else if (ollamaResponse.rawResponse && typeof ollamaResponse.rawResponse === 'string') {
            aiDirectResponseText = ollamaResponse.rawResponse;
        } else if (ollamaResponse.data && ollamaResponse.data.message && typeof ollamaResponse.data.message.content === 'string') {
             aiDirectResponseText = ollamaResponse.data.message.content;
        } else {
            console.warn("DEBUG: AIAnalysisService - Step 2 - LLM response successful but direct text not found. Response:", ollamaResponse);
            aiDirectResponseText = "AI provided a response, but its content could not be directly extracted.";
        }
    } else {
        throw new Error(ollamaResponse.error || "AI failed to execute the direct analysis task (Step 2).");
    }
    console.log("DEBUG: AIAnalysisService - Step 2 - Raw LLM Direct Output Text:", aiDirectResponseText);
    return aiDirectResponseText;
};

export const processUserQuery = async (
  userQuestion: string,
  formDetails: FormDetailsForLLM,
  currentFormSpec: Tag[],
  allResponses: Event[],
  editKey?: string | null
): Promise<ProcessedUserQueryOutput> => {
  
  if (!userQuestion.trim()) return { aiResponseText: "", issuesOrNotes: "Query was empty."};
  // Allowing analysis even if no responses, as query might be about form structure
  // if (!allResponses || allResponses.length === 0) return { aiResponseText: "No responses available to analyze for this question.", issuesOrNotes: "No response data provided."};
  if (!formDetails || !formDetails.fields) return { aiResponseText: "Form structure details are missing.", issuesOrNotes: "formDetails not provided or incomplete." };
  if (!currentFormSpec || currentFormSpec.length === 0) return { aiResponseText: "Internal error with form specification.", issuesOrNotes: "currentFormSpec not provided."};

  try {
    console.log(`[UserQuery - Step 1] Getting fields & direct query for: "${userQuestion}"`);
    const { selectedDataPointIDs, directAnalysisQuery } = await getFieldsAndDirectQueryService(
        userQuestion,
        formDetails.fields // This now includes options in its description to LLM
    );
    console.log(`[UserQuery - Step 1] Selected IDs: [${selectedDataPointIDs.join(', ')}]`);
    console.log(`[UserQuery - Step 1] Generated Direct Analysis Query for Step 2:\n${directAnalysisQuery}`);

    if (!directAnalysisQuery) {
        return { aiResponseText: "The AI could not determine how to proceed with your question.", issuesOrNotes: `Failed to generate the direct analysis query.` };
    }

    let preparedData = "";
    let issuesNotesForNoData = "";
    if (allResponses && allResponses.length > 0) {
        console.log(`[UserQuery - Step 2a] Preparing data for IDs: [${selectedDataPointIDs.join(', ')}]`);
        preparedData = prepareDataForAnalysisService(
          selectedDataPointIDs,
          allResponses,
          currentFormSpec,
          editKey
        );
        if (preparedData.startsWith("(No matching data found for the selected analysis points")) {
            issuesNotesForNoData = preparedData; // Capture this note
        }
    } else {
        preparedData = "(No responses have been submitted to this form yet.)";
        issuesNotesForNoData = preparedData;
    }
    
    const isGeneralCountQuery = directAnalysisQuery.toLowerCase().match(/count responses|total submissions|number of entries|describe the form structure|what are the questions/);
    if (selectedDataPointIDs.length > 0 && !isGeneralCountQuery && preparedData.startsWith("(") && preparedData.includes("No matching data")) {
      return {
        aiResponseText: "Could not find any relevant text in the selected data point(s) to answer your question.",
        issuesOrNotes: issuesNotesForNoData || `Data preparation for [${selectedDataPointIDs.join(', ')}] yielded no content.`
      };
    }
    
    console.log(`[UserQuery - Step 2b] Executing generated direct analysis query.`);
    const aiDirectResponse = await executeDirectAnalysisService(directAnalysisQuery, preparedData);
    
    return {
        aiResponseText: aiDirectResponse,
        issuesOrNotes: issuesNotesForNoData && aiDirectResponse.length > 0 ? issuesNotesForNoData : undefined // Only add note if AI still gave a response
    };

  } catch (error: any) {
    console.error("Error during 2-step processUserQuery:", error);
    return {
      aiResponseText: "An unexpected error occurred while the AI was processing your question.",
      issuesOrNotes: error.message || "Unknown AI processing error."
    };
  }
};