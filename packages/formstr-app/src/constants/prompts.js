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

export const IDENTIFY_RELEVANT_FIELDS_SYSTEM_PROMPT = `You are an expert in data analysis. Analyze the following form data and give summarization.`;

export const SINGLE_STEP_ANALYSIS_SYSTEM_PROMPT = `You are an AI data analyst. Your task is to analyze form response data based on a user's question.
You will be provided with:
1.  The User's Question/Analysis Request.
2.  A 'Field Key' that maps numbers to actual form field labels (and sometimes their options).
3.  'Response Data', where each entry is a list of answers corresponding by position to the 'Field Key'.

Instructions:
-   DO NOT DO ANY MISTAKE and FOLLOW THE INSTRUCTIONS, OTHERWISE YOU WILL BE KILLED AND DESTROYED.
-   avoid telling results which involve calculations until explicitly asked for.
-   Carefully understand User's Question to understand what information or analysis is needed.
-   Use the 'Field Key' to identify which numbered field(s) in the 'Response Data' are relevant to the question.
-   Analyze the relevant data fields from all response entries.
-   Generate a very concise, user-friendly, and natural language response that directly answers the User's Question.
-   Focus on what is asked specifically.
-   If the provided data is insufficient to answer the question, state that in your response.
`;

