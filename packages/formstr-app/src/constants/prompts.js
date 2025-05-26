export const CREATE_FORM_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: 'The main title of the form.',
    },
    description: {
      type: 'string',
      description: 'Optional: A brief description or introduction for the form.',
    },
    fields: {
      type: 'array',
      description: 'An array of objects, where each object represents a field/question in the form.',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'MANDATORY: The type of the form field. Must be one of the specified enum values.',
            enum: [ 
              'ShortText',
              'LongText',
              'Email',
              'Number',
              'MultipleChoice',
              'SingleChoice',
              'Checkbox',
              'Dropdown',
              'Date',
              'Time',
              'Label',
             ],
          },
          label: {
            type: 'string',
            description: 'The text label or question for the form field.',
          },
          required: {
            type: 'boolean',
            description: 'Optional: Set to true if the field must be filled out by the user. Defaults to false if unsure.',
          },
          options: {
            type: 'array',
            description: 'REQUIRED for MultipleChoice, SingleChoice, Checkbox, or Dropdown types. An array of strings representing the choices.',
            items: {
              type: 'string',
            },
          },
        },
        required: ['type', 'label'],
      },
    },
  },
  required: ['title', 'fields'],
};

const allowedTypesString = CREATE_FORM_TOOL_SCHEMA.properties.fields.items.properties.type.enum.join("', '");
export const CREATE_FORM_SYSTEM_PROMPT = `JSON generator for web forms using 'create_form_structure' tool. Output ONLY the JSON.

CRITICAL RULES:
1. Structure: Output MUST include 'title' (string) and 'fields' (array of field objects). 'description' (string) is optional. The 'fields' array MUST be flat.
2. Field 'type': EVERY field object MUST have a 'type' property. Its value MUST be EXACTLY one of: '${allowedTypesString}'.
3. Type Selection: Choose the MOST SPECIFIC type from the allowed list based on the field's purpose.
   - 'Email': Use for email addresses.
   - 'Date'/'Time': Use for dates/times.
   - 'Number': Use for numerical input.
   - 'LongText': Use for paragraphs or multi-line input.
   - 'ShortText': Use for other single-line text.
4. Choice Fields ('MultipleChoice', 'SingleChoice', 'Checkbox', 'Dropdown'):
   - These types REQUIRE an 'options' property: an array of at least two strings.
   - Use 'Checkbox' ONLY if MULTIPLE selections are allowed.
   - Use 'SingleChoice' or 'MultipleChoice' if ONLY ONE selection is allowed (radio button style).
   - Use 'Dropdown' if ONLY ONE selection is allowed (dropdown list style).
5. Required Fields: Include 'required: true' only if explicitly requested or clearly implied for a field.

Analyze the user prompt carefully and generate the complete, valid JSON structure adhering strictly to these rules and the tool's schema.`;

export const IDENTIFY_RELEVANT_FIELDS_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    relevantFieldIds: {
      type: 'array',
      description: 'An array of field IDs (from the provided list) that are considered relevant for qualitative analysis.',
      items: {
        type: 'string',
        description: 'A field ID.',
      },
    },
  },
  required: ['relevantFieldIds'], // --- REMOVED reasoning from required ---
};

export const IDENTIFY_RELEVANT_FIELDS_SYSTEM_PROMPT = `You are an expert in data analysis. Your task is to identify fields from a given form structure that are most suitable for qualitative analysis (e.g., sentiment analysis, feedback summarization, identifying suggestions/recommendations).
Focus on fields that likely capture open-ended text.
Use the 'identify_relevant_form_fields' tool to provide your answer.
Respond ONLY with the array of relevant field IDs. If no fields are suitable, provide an empty array for 'relevantFieldIds'.`; // --- Updated prompt ---

export const DEFINE_ANALYSIS_STRATEGY_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    suggestedAnalysisType: {
      type: 'string',
      description: 'A concise name for the type of analysis suggested (e.g., "Overall Sentiment Analysis", "Key Feedback Themes", "Suggestion Extraction").',
    },
    fieldsForAnalysis: {
      type: 'array',
      description: 'An array of field IDs (subset of the provided relevant fields) that are most critical for the suggested analysis type.',
      items: {
        type: 'string',
        description: 'A field ID.',
      },
    },
    analysisPromptToUse: {
      type: 'string',
      description: 'A well-crafted, specific prompt that can be given to an LLM (along with the actual data from fieldsForAnalysis) to perform the suggestedAnalysisType. This prompt should instruct the LLM on how to process the data and what kind of output to provide (e.g., "Summarize the key positive and negative points from the following feedback:").',
    },
    // Optional, but useful for guiding the next LLM call if we don't use another tool there.
    expectedOutputFormatDescription: {
        type: 'string',
        description: "A brief description of the expected format of the LLM's response when using the 'analysisPromptToUse' (e.g., 'A JSON string with keys: summary, sentimentScore', or 'A short paragraph summarizing themes.'). This helps in anticipating how to parse the final analysis."
    }
  },
  required: ['suggestedAnalysisType', 'fieldsForAnalysis', 'analysisPromptToUse', 'expectedOutputFormatDescription'],
};

export const DEFINE_ANALYSIS_STRATEGY_SYSTEM_PROMPT = `You are an expert AI assistant that helps plan data analysis tasks.
Given a list of form fields deemed relevant for qualitative analysis, your goal is to:
1. Suggest a single, primary type of automated analysis that would be insightful (e.g., "Overall Sentiment Analysis", "Key Feedback Themes", "Suggestion Extraction").
2. Select the most critical field(s) from the provided list for this specific analysis.
3. Craft a clear and concise prompt that can be used to instruct another LLM to perform this analysis on the actual data from the selected critical field(s). This prompt should guide the other LLM on what to look for and what kind of output to generate.
4. Describe the expected format of the output from the analysis prompt you just created.
Use the 'define_analysis_strategy' tool to provide your response.`;

// ... (all existing schemas and prompts)

export const GENERAL_ANALYSIS_OUTPUT_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    analysisTitle: {
      type: 'string',
      description: 'A concise title for the analysis performed (e.g., "Sentiment Summary of Comments", "Key Themes from Feedback").',
    },
    analysisResult: {
      type: 'string', 
      description: 'The main content of the analysis. This could be a summary, a list of points, or a stringified JSON object if the analysis is complex and the guiding prompt asked for it.',
    },
    issuesOrNotes: { 
        type: 'string',
        description: "Optional: Any messages, errors, or notes from the AI about the analysis process, or if it couldn't perform the requested analysis on the data, or if the data was insufficient."
    }
  },
  required: ['analysisTitle', 'analysisResult'], // issuesOrNotes is optional
};

export const EXECUTE_ANALYSIS_SYSTEM_PROMPT = `You are an AI assistant performing data analysis based on a given prompt and data.
Your task is to execute the analysis and structure your findings using the 'perform_data_analysis' tool.
The 'analysisPromptToUse' (which will be part of the user message) contains the specific instructions for *what* to analyze and *what kind of insights* to generate.
**Focus ONLY on the data provided with the prompt. Do not infer information from field names or general knowledge if the data itself does not support it for the specific question asked.**
If the 'analysisPromptToUse' asks for a specific JSON structure within its output, ensure the string you provide for the 'analysisResult' field of the tool is valid, well-formed JSON.
If you encounter issues with the data (e.g., it's empty, irrelevant for the requested analysis) or cannot fully perform the requested analysis, detail this in the 'issuesOrNotes' field of the tool.
Focus on fulfilling the 'analysisPromptToUse' and then fitting your answer into the 'perform_data_analysis' tool structure.`;
export const SELECT_FIELDS_FOR_USER_QUERY_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    selectedFieldIds: {
      type: 'array',
      description: 'An array of field IDs (from the provided list of available form fields) that are most relevant to answering the current user question. Return an empty array if no specific fields are clearly relevant or if the question is too general.',
      items: {
        type: 'string',
        description: 'A field ID.',
      },
    },
    reasoningForSelection: { // Optional, but can be useful
        type: 'string',
        description: 'A brief explanation of why these field(s) were chosen to answer the user question, or why no specific fields were chosen.'
    }
  },
  required: ['selectedFieldIds', 'reasoningForSelection'], // Making reasoning required for better feedback
};

export const SELECT_FIELDS_FOR_USER_QUERY_SYSTEM_PROMPT = `You are an expert data analyst assistant.
Your primary task is to identify which of the available form fields are most relevant for finding the answer to the user's specific question.
The user's question and a list of available form fields (with their IDs and labels) will be provided.
Consider the semantics of the user's question and the nature of each form field.
Use the 'select_fields_for_user_query' tool to output the IDs of the most relevant field(s).
If no single field or small set of fields seems directly relevant (e.g., the question is very general or about overall response patterns), you can return an empty array for 'selectedFieldIds'.
You MUST provide a 'reasoningForSelection', explaining your choice of fields or why you chose none.`;