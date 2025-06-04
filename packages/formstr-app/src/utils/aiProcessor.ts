import { AnswerTypes } from '@formstr/sdk/dist/interfaces'; 
import { Field, Option } from '../nostr/types'; 
import { makeTag } from './utility'; 

export interface OllamaFormData {
    title: string;
    description?: string;
    fields: OllamaFormField[];
}
interface OllamaFormField {
    type: string; 
    label: string;
    required?: boolean;
    options?: string[]; 
}
export interface ProcessedFormData {
    fields: Field[];
    formName?: string;
    description?: string;
}

const AI_TYPE_TO_INTERNAL_MAP: { [key: string]: { primitive: string; renderElement: AnswerTypes } } = {
    ShortText: { primitive: 'text', renderElement: AnswerTypes.shortText },
    LongText: { primitive: 'text', renderElement: AnswerTypes.paragraph },
    Paragraph: { primitive: 'text', renderElement: AnswerTypes.paragraph }, 
    Email: { primitive: 'text', renderElement: AnswerTypes.shortText }, 
    Number: { primitive: 'number', renderElement: AnswerTypes.number },
    MultipleChoice: { primitive: 'option', renderElement: AnswerTypes.checkboxes }, 
    SingleChoice: { primitive: 'option', renderElement: AnswerTypes.radioButton }, 
    Checkbox: { primitive: 'option', renderElement: AnswerTypes.checkboxes }, 
    Dropdown: { primitive: 'option', renderElement: AnswerTypes.dropdown },
    Date: { primitive: 'text', renderElement: AnswerTypes.date }, 
    Time: { primitive: 'text', renderElement: AnswerTypes.time },
    Label: { primitive: 'label', renderElement: AnswerTypes.label },
    default: { primitive: 'text', renderElement: AnswerTypes.shortText }
};

const EMAIL_REGEX_PATTERN = "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$";
export function processOllamaFormData(ollamaData: OllamaFormData): ProcessedFormData {
    if (!ollamaData || !Array.isArray(ollamaData.fields)) {
        console.error("Invalid ollamaData received in processor:", ollamaData);
        
        return { fields: [], formName: 'Error Processing Form', description: 'Received invalid data from AI.' };
    }
    const formName = ollamaData.title || 'Untitled AI Form';
    const description = ollamaData.description || '';
    const sourceFields = ollamaData.fields;
    const processedFields: Field[] = []; 

    for (let i = 0; i < sourceFields.length; i++) {
        const aiField = sourceFields[i];
        const uniqueId = makeTag(6); 
        const aiFieldType = aiField.type; // Prioritize AI provided type
        let label = aiField.label || `Untitled ${uniqueId}`;
        const labelLower = label.toLowerCase(); // Keep for email validation fallback if needed
        const hasOptions = Array.isArray(aiField.options) && aiField.options.length > 0;

        // Use AI provided type if valid, otherwise default
        const typeMappingLookup = aiFieldType ? AI_TYPE_TO_INTERNAL_MAP[aiFieldType] : undefined;
        let typeMapping = typeMappingLookup || AI_TYPE_TO_INTERNAL_MAP.default;

        let primitiveType = typeMapping.primitive;
        let renderElement = typeMapping.renderElement;

        // If AI suggested MultipleChoice/Checkbox/Dropdown but didn't provide options,
        // and the original type was not specific enough, default to ShortText.
        // This handles cases where AI might say "MultipleChoice" but gives no options.
        if ((renderElement === AnswerTypes.checkboxes || renderElement === AnswerTypes.radioButton || renderElement === AnswerTypes.dropdown) && !hasOptions) {
            typeMapping = AI_TYPE_TO_INTERNAL_MAP.default;
            primitiveType = typeMapping.primitive;
            renderElement = typeMapping.renderElement;
        }

        const config: any = {
            renderElement: renderElement,
            required: aiField.required || false,
            validationRules: {}
        };

        // Handle email validation: if AI specified 'Email' type, it maps to shortText with email validation.
        // Also, keep the label check as a secondary measure if type is not 'Email' but label suggests it.
        if (renderElement === AnswerTypes.shortText && (aiFieldType === 'Email' || labelLower.includes('email') || labelLower.includes('e-mail'))) {
             config.validationRules.regex = { pattern: EMAIL_REGEX_PATTERN, errorMessage: "Please enter a valid email address." };
        }
        const configJson = JSON.stringify(config);
        let optionsJson = '[]';
        let optionsSource = hasOptions ? aiField.options : null; 
        let fieldLabelToUse = label;
        
        if (primitiveType === 'option' && !hasOptions && i + 1 < sourceFields.length) {
            const nextAiField = sourceFields[i + 1];
            const nextLabel = nextAiField.label || '';
            const nextHasOptions = Array.isArray(nextAiField.options) && nextAiField.options.length > 0; 
            if (nextHasOptions && (nextLabel.startsWith('Untitled') || nextLabel === '')) {
                console.warn(`Merging options from next field (index ${i + 1}) into current field "${label}" (index ${i})`);
                optionsSource = nextAiField.options; 
                
                fieldLabelToUse = label;
                i++; 
            }
        }
        if (optionsSource && Array.isArray(optionsSource) && optionsSource.length > 0 && (
            renderElement === AnswerTypes.radioButton ||
            renderElement === AnswerTypes.checkboxes ||
            renderElement === AnswerTypes.dropdown
        )) {
            const mappedOptions: Option[] = optionsSource.map((optionLabel: string) => [
                makeTag(6),
                optionLabel,
                JSON.stringify({})
            ]);
            optionsJson = JSON.stringify(mappedOptions);
        } else if (optionsSource && Array.isArray(optionsSource) && optionsSource.length > 0) {
             console.warn(`AI provided options for "${fieldLabelToUse}", but final type "${renderElement}" doesn't use them.`);
        }
        const newField: Field = [
            'field', 
            uniqueId,
            primitiveType,
            fieldLabelToUse, 
            optionsJson,
            configJson
        ];
        processedFields.push(newField);
    } 
    console.log("DEBUG: Final mappedFields array after processing:", processedFields);
    return { fields: processedFields, formName, description };
}
