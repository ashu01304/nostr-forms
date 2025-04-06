import React, { useState } from 'react';
import { generateJsonWithOllama } from '../../../../utils/ollama';

export interface FormFieldData {
    id: string; 
    type: string;
    label: string;
    required?: boolean;
    options?: string[];
}

export interface GeneratedFormData {
    title: string;
    description?: string;
    fields: FormFieldData[];
}

interface LLMFormGeneratorProps {
    onFormGenerated: (formData: GeneratedFormData) => void; 
}


function isValidGeneratedFormData(data: any): data is GeneratedFormData {
    if (!data || typeof data !== 'object') {
        console.error("Validation Error: Response is not an object.", data);
        return false;
    }
    if (typeof data.title !== 'string' || data.title.trim() === '') {
        console.error("Validation Error: Missing or empty 'title'.", data);
        return false;
    }
    if (data.description && typeof data.description !== 'string') {
        console.error("Validation Error: 'description' exists but is not a string.", data);
        return false;
    }
    if (!Array.isArray(data.fields)) {
        console.error("Validation Error: 'fields' is not an array.", data);
        return false;
    }
    for (const field of data.fields) {
        if (!field || typeof field !== 'object' || typeof field.label !== 'string' || typeof field.type !== 'string') {
            console.error("Validation Error: A field is missing required properties (label, type).", field);
        }
        if ((field.type === 'MultipleChoice' || field.type === 'Checkbox' || field.type === 'Dropdown') && !Array.isArray(field.options)) {
             console.warn("Validation Warning: Choice field is missing 'options' array.", field);
        }
    }
    return true; 
}


export const LLMFormGenerator: React.FC<LLMFormGeneratorProps> = ({ onFormGenerated }) => {
    const [description, setDescription] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const handleDescriptionChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        setDescription(event.target.value);
    };

    const handleGenerateClick = () => {
        if (description.trim() === '') {
             setError("Please enter a description for the form.");
             return;
        }

        setError(null); 
        setIsLoading(true); 

        const prompt = `
You are an assistant that generates JSON structures for web forms based on user descriptions.
Analyze the following user description and create a JSON object representing the form.

The JSON object MUST have the following structure:
{
  "title": "string", // The main title of the form
  "description": "string", // Optional: A brief description of the form
  "fields": [ // An array of field objects
    {
      "id": "string", // A unique identifier string (e.g., "field_name", "question_1") - generate based on label if possible
      "type": "string", // The type of the form field. Supported types: ShortText, LongText, Email, Number, MultipleChoice, Checkbox, Dropdown, Date, Time
      "label": "string", // The text label/question for the field
      "required": boolean, // Optional: true if the field must be filled, defaults to false
      "options": ["string", "string", ...] // Optional: An array of strings for MultipleChoice, Checkbox, Dropdown types ONLY
    }
    // ... more field objects
  ]
}

IMPORTANT RULES:
- Respond ONLY with the valid JSON object described above.
- Do NOT include any introductory text, explanations, apologies, or markdown formatting like \`\`\`json before or after the JSON object.
- Ensure all field types are one of the supported types listed. If a type seems unsupported, use 'ShortText' or 'LongText'.
- Infer field types and requirement status from the description where possible. If requirement is unclear, default 'required' to false.
- Provide sensible, unique 'id' strings for each field (e.g., based on the label, lowercased with underscores).
- If the description asks for choice options, include the 'options' array for that field.

User Description:
"${description}"

JSON Output:
`;

        generateJsonWithOllama<GeneratedFormData>(prompt) 
            .then(parsedData => {
                 console.log("Raw data received from Ollama parser:", parsedData);
                 if (isValidGeneratedFormData(parsedData)) {
                     console.log("Validation successful. Calling onFormGenerated.");
                     onFormGenerated(parsedData);
                 } else {
                     throw new Error("Received invalid or incomplete form structure from AI. Please try rephrasing your description or check the Ollama model.");
                 }
                 setIsLoading(false); 
            })
            .catch(err => {
                 console.error("Error during AI form generation:", err);
                 if (err instanceof Error) {
                     setError(err.message); 
                 } else {
                     setError("An unknown error occurred during form generation."); 
                 }
                 setIsLoading(false); 
            });
    };

    const styles: { [key: string]: React.CSSProperties } = {
        container: {
            padding: '15px',
            border: '1px solid #ccc',
            borderRadius: '8px',
            margin: '10px 0',
            backgroundColor: '#f9f9f9',
        },
        label: {
            display: 'block',
            marginBottom: '5px',
            fontWeight: 'bold',
        },
        textarea: {
            width: '95%', 
            minHeight: '80px',
            padding: '8px',
            marginBottom: '10px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            boxSizing: 'border-box', 
        },
        button: {
            padding: '10px 15px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: '#007bff',
            color: 'white',
            cursor: 'pointer',
            opacity: isLoading ? 0.6 : 1,
            transition: 'opacity 0.2s ease-in-out',
        },
        buttonDisabled: {
             backgroundColor: '#cccccc',
             cursor: 'not-allowed',
        },
        loading: {
            marginTop: '10px',
            fontStyle: 'italic',
            color: '#555',
        },
        error: {
            marginTop: '10px',
            color: '#dc3545', 
            fontWeight: 'bold',
            padding: '8px',
            border: '1px solid #f5c6cb',
            borderRadius: '4px',
            backgroundColor: '#f8d7da',
        },
    };

    // --- Render JSX ---
    return (
        <div style={styles.container}>
            <label htmlFor="form-description-ai" style={styles.label}>
                Describe the form you want to create:
            </label>
            <textarea
                id="form-description-ai"
                value={description}
                onChange={handleDescriptionChange}
                placeholder="e.g., A simple contact form with name, email, and message fields. Make email required."
                rows={4}
                style={styles.textarea}
                disabled={isLoading} 
            />
            <button
                onClick={handleGenerateClick}
                disabled={isLoading || description.trim() === ''}
                style={{
                    ...styles.button,
                    ...(isLoading || description.trim() === '' ? styles.buttonDisabled : {}) 
                }}
            >
                {isLoading ? 'Generating...' : 'Generate Form with AI'}
            </button>

            {isLoading && (
                <div style={styles.loading}>Communicating with AI assistant... Please wait.</div>
            )}

            {error && (
                <div style={styles.error}>Error: {error}</div>
            )}
        </div>
    );
};
