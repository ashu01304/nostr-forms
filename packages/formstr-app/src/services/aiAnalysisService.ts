import { Tag, Field, Option } from '../nostr/types';
import { Event } from 'nostr-tools';
import { ollamaService, GenerateParams } from './ollamaService';
import {
    SINGLE_STEP_ANALYSIS_SYSTEM_PROMPT,
} from '../constants/prompts';
import { getInputsFromResponseEvent, getResponseLabels } from '../utils/ResponseUtils';

export interface FormDetailsForLLMField {
    id: string;
    label: string;
    type: string;
    options?: string[];
}
export interface FormDetailsForLLM {
  formName: string;
  formDescription?: string;
  fields: FormDetailsForLLMField[];
}

export interface ProcessedUserQueryOutput {
    aiResponseText: string;
    issuesOrNotes?: string;
}

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
            let determinedType = fieldTag[2] || 'unknown';
            let fieldOptions: string[] | undefined = undefined;

            if (fieldTag[5]) {
                try {
                    const config = JSON.parse(fieldTag[5]);
                    if (config.renderElement && typeof config.renderElement === 'string') {
                        determinedType = config.renderElement;
                    }
                } catch (e) { /* Silently ignore */ }
            }
            if (determinedType === 'radioButton' || determinedType === 'checkboxes' || determinedType === 'dropdown') {
                if (fieldTag[4]) {
                    try {
                        const optionsArray = JSON.parse(fieldTag[4]) as Option[];
                        if (Array.isArray(optionsArray)) {
                            fieldOptions = optionsArray.map(opt => opt[1]);
                        }
                    } catch (e) { /* Silently ignore */ }
                }
            }
            return { id: fieldId, label: fieldLabel, type: determinedType, options: fieldOptions };
        })
        .filter(field => field.label.trim() !== '' && !field.label.startsWith('(Untitled Field ID:'));
    
    return { formName, formDescription, fields };
};

const prepareAllDataWithFieldKey = (
    formDetails: FormDetailsForLLM,
    allResponses: Event[],
    currentFormSpec: Tag[],
    currentEditKey?: string | null
  ): string => {
    if (!allResponses || allResponses.length === 0) {
        return "Field Key (maps numbers to question labels):\n" + 
               (formDetails.fields.filter(f => f.id !== 'METADATA_AUTHOR_NPUB' && f.id !== 'METADATA_SUBMITTED_AT').map((field, index) => {
                    let keyEntry = `${index + 1}: "${field.label}"`;
                    if (field.options && field.options.length > 0) {
                        keyEntry += ` (Options: [${field.options.join(', ')}])`;
                    }
                    return keyEntry;
                }).join("\n") || "(The form has no user-defined fields to analyze.)") +
               "\n\nResponse Data:\n(No responses have been submitted to this form yet.)";
    }

    const activeFieldsForKey = formDetails.fields.filter(
        f => f.id !== 'METADATA_AUTHOR_NPUB' && f.id !== 'METADATA_SUBMITTED_AT'
    );

    if (activeFieldsForKey.length === 0) {
        return "Field Key (maps numbers to question labels):\n(The form has no user-defined fields to analyze after filtering.)" +
               "\n\nResponse Data:\n(No responses to process for these fields.)";
    }

    let fieldKeyString = "Field Key (maps numbers to question labels):\n";
    activeFieldsForKey.forEach((field, index) => {
        let keyEntry = `${index + 1}: "${field.label}"`;
        if (field.options && field.options.length > 0) {
            keyEntry += ` (Options: [${field.options.join(', ')}])`;
        }
        fieldKeyString += keyEntry + "\n";
    });

    const responseDataStrings: string[] = [];
    allResponses.forEach((responseEvent: Event, entryIndex: number) => {
        const userDefinedInputs = getInputsFromResponseEvent(responseEvent, currentEditKey);
        const responseAnswers: (string | null)[] = [];
        let hasMeaningfulDataForThisResponse = false;

        activeFieldsForKey.forEach(mappedField => {
            let answer: string | null = "N/A";
            const relevantInput = userDefinedInputs.find(input => input[1] === mappedField.id);
            if (relevantInput) {
                const { responseLabel: rawResponseLabel } = getResponseLabels(relevantInput, currentFormSpec);
                const responseLabelAsString = String(rawResponseLabel ?? '');
                if (responseLabelAsString && responseLabelAsString.trim().toLowerCase() !== "n/a" && responseLabelAsString.trim() !== "") {
                    answer = responseLabelAsString;
                    hasMeaningfulDataForThisResponse = true;
                }
            }
            responseAnswers.push(answer);
        });
        
        if(hasMeaningfulDataForThisResponse){
             responseDataStrings.push(`- Entry ${entryIndex + 1}: ${JSON.stringify(responseAnswers)}`);
        }
    });

    if (responseDataStrings.length === 0) {
        return `${fieldKeyString}\n\nResponse Data:\n(No responses contained reportable data for the user-defined fields.)`;
    }

    const finalDataString = fieldKeyString + "\nResponse Data:\n" + responseDataStrings.join("\n");
    
    return finalDataString;
};

export const processUserQuery = async (
  userQuestion: string,
  formDetails: FormDetailsForLLM,
  currentFormSpec: Tag[],
  allResponses: Event[],
  editKey?: string | null
): Promise<ProcessedUserQueryOutput> => {
  
  if (!userQuestion.trim()) {
      return { aiResponseText: "", issuesOrNotes: "Query was empty." };
  }
  if (!formDetails || !formDetails.fields || formDetails.fields.length === 0) {
      return { aiResponseText: "Form structure details are missing or the form has no fields to analyze.", issuesOrNotes: "formDetails not provided or incomplete." };
  }
  if (!currentFormSpec || currentFormSpec.length === 0) {
      return { aiResponseText: "Internal error with form specification.", issuesOrNotes: "currentFormSpec not provided." };
  }

  try {
    const preparedDataString = prepareAllDataWithFieldKey(
        formDetails,
        allResponses,
        currentFormSpec,
        editKey
    );

    const fullPromptForLLM = `User's Question/Analysis Request: "${userQuestion}"\n\n${preparedDataString}`;

    const params: GenerateParams = {
        prompt: fullPromptForLLM,
        systemPrompt: SINGLE_STEP_ANALYSIS_SYSTEM_PROMPT,
    };

    console.log("DEBUG: AIAnalysisService - Single-Step Input to LLM:", JSON.stringify(params, null, 2));
    const ollamaResponse = await ollamaService.generateContent(params);
    console.log("DEBUG: AIAnalysisService - Single-Step Raw LLM Output Data:", 
        (ollamaResponse.data && ollamaResponse.data.message && ollamaResponse.data.message.content) || ollamaResponse.data || ollamaResponse.rawResponse || "N/A");
    
    let aiResponseText = "";
    let issuesOrNotes: string | undefined = undefined;

    if (ollamaResponse.success) {
        if (ollamaResponse.data && ollamaResponse.data.message && typeof ollamaResponse.data.message.content === 'string') {
             aiResponseText = ollamaResponse.data.message.content;
        } else if (typeof ollamaResponse.data === 'string') {
            aiResponseText = ollamaResponse.data;
        } else if (ollamaResponse.rawResponse && typeof ollamaResponse.rawResponse === 'string') {
            aiResponseText = ollamaResponse.rawResponse;
        } else {
            console.warn("DEBUG: AIAnalysisService - Single-Step LLM response successful but direct text not found. Response:", ollamaResponse);
            aiResponseText = "AI provided a response, but its content could not be directly extracted in the expected string format.";
            issuesOrNotes = "AI response format issue.";
        }
        
        if (preparedDataString.includes("(No responses have been submitted") && !aiResponseText.toLowerCase().includes("no responses")) {
            issuesOrNotes = (issuesOrNotes ? issuesOrNotes + " " : "") + "Note: No responses have been submitted to this form yet.";
        } else if (preparedDataString.includes("(No responses contained reportable data") && !aiResponseText.toLowerCase().includes("no reportable data")) {
            issuesOrNotes = (issuesOrNotes ? issuesOrNotes + " " : "") + "Note: No responses contained reportable data for the fields.";
        }

    } else {
        throw new Error(ollamaResponse.error || "AI failed to execute the analysis task.");
    }
    
    return {
        aiResponseText: aiResponseText.trim(),
        issuesOrNotes: issuesOrNotes
    };

  } catch (error: any) {
    console.error("Error during single-step processUserQuery:", error);
    return {
      aiResponseText: "An unexpected error occurred while the AI was processing your question.",
      issuesOrNotes: error.message || "Unknown AI processing error."
    };
  }
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