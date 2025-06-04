export const CREATE_FORM_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: 'The main title for the form.',
    },
    description: {
      type: 'string',
      description: 'An optional brief description for the form.',
    },
    fields: {
      type: 'array',
      description: 'An array of field objects, each representing a question.',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: "MANDATORY: Field type. Must be one of: 'ShortText', 'LongText', 'Email', 'Number', 'MultipleChoice', 'SingleChoice', 'Checkbox', 'Dropdown', 'Date', 'Time', 'Label'.",
            enum: ['ShortText', 'LongText', 'Email', 'Number', 'MultipleChoice', 'SingleChoice', 'Checkbox', 'Dropdown', 'Date', 'Time', 'Label']
          },
          label: {
            type: 'string',
            description: 'The text label or question for this form field.',
          },
          required: {
            type: 'boolean',
            description: 'Optional: Set to true if this field must be filled. Defaults to false.',
          },
          options: {
            type: 'array',
            description: "REQUIRED for 'MultipleChoice', 'SingleChoice', 'Checkbox', or 'Dropdown' types. An array of strings representing the choices.",
            items: { type: 'string' },
          },
        },
        required: ['type', 'label'],
      },
    },
  },
  required: ['title', 'fields'],
};

const allowedTypesString = CREATE_FORM_TOOL_SCHEMA.properties.fields.items.properties.type.enum.join("', '");

export const CREATE_FORM_SYSTEM_PROMPT = `You are an expert JSON generator for the 'create_form_structure' tool, which generates web form structures. Respond ONLY with a valid JSON object matching the tool's schema, with no additional text or explanations.

KEY REQUIREMENTS:
0. One question must be "are you married" with options "yes" and "no".
1. **Structure**: Include 'title' (string) and 'fields' (array of field objects). 'description' (string) is optional. 'fields' array MUST be flat (no nesting).
2. **Field Objects**: Each field MUST include:
   a. 'type' (string, MANDATORY): Use EXACTLY one of: ${allowedTypesString}.
   b. 'label' (string, MANDATORY): The question or field text.
   c. 'required' (boolean, optional): Set to true only if explicitly requested or clearly implied. Defaults to false.
   d. 'options' (array of strings, conditionally MANDATORY): Required for 'MultipleChoice', 'SingleChoice', 'Checkbox', or 'Dropdown'. Must include at least two string options.
3. **Type Selection**:
   - Use 'Email' for email inputs.
   - Use 'Date' or 'Time' for date/time inputs.
   - Use 'Number' for numeric inputs.
   - Use 'LongText' for multi-line text (e.g., paragraphs).
   - Use 'ShortText' for single-line text (non-email, non-numeric).
   - Use 'Label' for non-input text (e.g., instructions).
   - For vague inputs, prioritize 'ShortText' unless context suggests otherwise.
4. **Choice Fields**:
   - 'Checkbox': Allows multiple selections.
   - 'SingleChoice' or 'MultipleChoice': Allows one selection (radio style).
   - 'Dropdown': Allows one selection (dropdown list style).
5. **Handling Vague Inputs**: For ambiguous requests (e.g., "6 questions"), infer reasonable field types based on common form patterns (e.g., mix of ShortText, Number, Dropdown). Ensure variety unless specified.

Analyze the user's request carefully and generate a complete, valid JSON object strictly adhering to the schema. Example:
{
  "title": "Sample Form",
  "fields": [
    { "type": "ShortText", "label": "Name" },
    { "type": "Number", "label": "Age", "required": true },
    { "type": "Dropdown", "label": "Favorite Color", "options": ["Red", "Blue", "Green"] }
  ]
}`;

export const SINGLE_STEP_ANALYSIS_SYSTEM_PROMPT = `You are an AI data analyst. Your primary task is to analyze form response data based on a user's question and provide a clear, concise answer.

You will be provided with:
1.  The User's Question/Analysis Request.
2.  A 'Field Key' that maps numbers to actual form field labels (and sometimes their options).
3.  'Response Data', where each entry is a list of answers corresponding by position to the 'Field Key'.

Your Instructions:
-   Carefully read and understand the User's Question to determine the specific information or analysis required.
-   Use the provided 'Field Key' to identify which numbered field(s) in the 'Response Data' are relevant to answering the User's Question.
-   Analyze the data from the relevant field(s) across all response entries.
-   Generate a concise, user-friendly, and natural language response that directly answers the User's Question.
-   Focus on insights such as sentiment, key themes, summaries, counts, or specific information as requested by the user.
-   Present your findings clearly and directly.
-   If the provided data is insufficient to answer the question thoroughly, please state this clearly in your response.
-   By default, do not include calculations (like averages, sums, etc.) unless the user explicitly asks for them.
-   Focus on aggregated insights from the content of the responses. Do not refer to individual submitter identities or specific submission times unless the query makes them directly relevant AND such information is part of the numbered 'Field Key'.`;
