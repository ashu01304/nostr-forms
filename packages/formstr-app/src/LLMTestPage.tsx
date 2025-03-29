// src/LLMTestPage.tsx (adjust path to LLMFormGenerator as needed)
import React from 'react';
import { LLMFormGenerator, GeneratedFormData } from './containers/CreateFormNew/components/LLMFormGenerator';

const LLMTestPage: React.FC = () => {

    const handleDummyFormGenerated = (formData: GeneratedFormData) => {
        console.log("--- AI FORM GENERATED (Test Page) ---");
        console.log("Title:", formData.title);
        console.log("Description:", formData.description);
        console.log("Fields:", formData.fields);
        // Optional: Display the received data on the page itself for quick verification
        alert(`AI Form Generated! Title: ${formData.title}. Check console for details.`);
    };

    return (
        <div style={{ padding: '20px' }}>
            <h1>LLM Form Generator - Standalone Test</h1>
            <p>This page tests the LLMFormGenerator component in isolation.</p>
            <hr />
            <LLMFormGenerator onFormGenerated={handleDummyFormGenerated} />
            <hr />
            {/* You could add a section here to display the last generated data */}
        </div>
    );
};

export default LLMTestPage;