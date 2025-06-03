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
          type: { type: 'string', description: 'MANDATORY: Field type. Must be one of enum values.', enum: ['ShortText', 'LongText', 'Email', 'Number', 'MultipleChoice', 'SingleChoice', 'Checkbox', 'Dropdown', 'Date', 'Time', 'Label'] },
          label: { type: 'string', description: 'The text label or question for the form field.' },
          required: { type: 'boolean', description: 'Optional: True if field is mandatory. Defaults to false.' },
          options: { type: 'array', description: 'REQUIRED for choice types. Array of strings for choices.', items: { type: 'string' } },
        },
        required: ['type', 'label'],
      },
    },
  },
  required: ['title', 'fields'],
};

const allowedTypesString = CREATE_FORM_TOOL_SCHEMA.properties.fields.items.properties.type.enum.join("', '");
export const CREATE_FORM_SYSTEM_PROMPT = `You are an expert JSON generator using 'create_form_structure' tool for web forms. Respond ONLY with the JSON tool call.
CRITICAL RULES:
1. Structure: Output MUST include 'title' (string) and 'fields' (array of field objects). 'description' (string) is optional. 'fields' array MUST be flat.
2. Field 'type': EVERY field object MUST have a 'type'. Value MUST be EXACTLY one of: '${allowedTypesString}'.
3. Type Selection: Choose MOST SPECIFIC type: 'Email', 'Date'/'Time', 'Number', 'LongText' (paragraphs), 'ShortText' (other single-line).
4. Choice Fields ('MultipleChoice', 'SingleChoice', 'Checkbox', 'Dropdown'): REQUIRE 'options' property (array of min two strings). 'Checkbox' for MULTIPLE selections. 'SingleChoice'/'MultipleChoice' for ONE selection (radio). 'Dropdown' for ONE selection (list).
5. Required Fields: Include 'required: true' only if explicitly requested or clearly implied.
Analyze user prompt carefully and generate complete, valid JSON adhering strictly to these rules and tool schema.`;

// This schema might still be used for an initial broad suggestion of relevant fields for automated analysis.
export const IDENTIFY_RELEVANT_FIELDS_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    relevantFieldIds: {
      type: 'array',
      description: 'An array of field IDs (from the provided list) considered relevant for qualitative analysis.',
      items: { type: 'string', description: 'A field ID.' },
    },
  },
  required: ['relevantFieldIds'],
};

export const IDENTIFY_RELEVANT_FIELDS_SYSTEM_PROMPT = `You are an expert in data analysis. Task: Identify form fields suitable for qualitative analysis (sentiment, feedback summarization, suggestions). Focus on open-ended text. Use 'identify_relevant_form_fields' tool. Respond ONLY with array of relevant field IDs. If none, provide empty array for 'relevantFieldIds'.`;

// --- SCHEMAS AND PROMPTS FOR THE SIMPLIFIED 2-STEP ANALYSIS PIPELINE ---

// Schema for Function 1 (Select Fields & Formulate Direct Analysis Query)
export const SELECT_FIELDS_AND_FORMULATE_DIRECT_QUERY_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    selectedDataPointIDs: {
      type: 'array',
      description: 'Array of essential data point IDs (from Standard Metadata or User-Defined Form Fields) relevant to the input query/task. Can be empty if query is general (e.g. "count all responses") or no specific fields are needed.',
      items: {
        type: 'string',
        description: 'A data point ID (e.g., "METADATA_SUBMITTED_AT" or a user-defined field ID).',
      },
    },
    directAnalysisQuery: {
      type: 'string',
      description: "A direct and concise query or instruction for a subsequent LLM to perform the analysis. This query should guide the next LLM on what to analyze from the data associated with 'selectedDataPointIDs'. Example: 'Summarize the sentiment from the feedback field.' or 'What are the most common issues mentioned in the support requests field?'",
    },
  },
  required: ['selectedDataPointIDs', 'directAnalysisQuery'],
};

// System prompt for Function 1 (Select Fields & Formulate Direct Analysis Query)
export const SELECT_FIELDS_AND_FORMULATE_DIRECT_QUERY_SYSTEM_PROMPT = `You are an expert AI assistant responsible for the first stage of a two-stage data analysis pipeline.
Your task is to:
1. Analyze the input "Contextual Prompt/User Question" and the "Available Data Points" (which include Standard Metadata and User-Defined Form Fields with their Types).
2. Identify the essential "Available Data Points" (by their exact ID) needed to address the input.
3. Generate a 'directAnalysisQuery' for a *second, separate LLM*. This query should be a clear and concise instruction or question, telling the second LLM what specific analysis to perform on data from the selected data points. For instance, if the user asks for sentiment, the 'directAnalysisQuery' might be 'Analyze the sentiment of the provided text data for field X.'

Use the 'select_fields_and_formulate_direct_query' tool for your output, providing the 'selectedDataPointIDs' and the 'directAnalysisQuery'.`;

// System prompt for Function 2 (Execute Analysis directly)
export const EXECUTE_DIRECT_ANALYSIS_SYSTEM_PROMPT = `You are an AI data analyst.
Based on the user's query and the provided data, generate a concise, user-friendly, and natural language analysis.
Focus on extracting insights like sentiment, key themes, summarizing information, or answering specific questions as requested in the query.
Present your findings clearly and directly. If the data is insufficient to answer, please state that.`;

// GENERAL_ANALYSIS_OUTPUT_TOOL_SCHEMA is REMOVED as it's no longer used by Step 2.