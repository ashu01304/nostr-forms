import React, {ChangeEvent,useState,useRef} from "react";
import QuestionCard from "../QuestionCard";
import { Button, Input, message } from "antd";
import FormTitle from "../FormTitle";
import StyleWrapper from "./style";
import DescriptionStyle from "./description.style";
import useFormBuilderContext from "../../hooks/useFormBuilderContext";
import { Reorder, motion, useDragControls } from "framer-motion";
import { Field } from "../../../../nostr/types";
import { makeTag } from "../../../../utils/utility"; 
import { AnswerTypes } from "@formstr/sdk/dist/interfaces";
import { IAnswerSettings } from "../AnswerSettings/types";
import {LLMFormGenerator,GeneratedFormData,FormFieldData} from "../LLMFormGenerator"; 

interface FloatingButtonProps {
  onClick: () => void;
  containerRef: React.RefObject<HTMLDivElement>;
}
const FloatingButton = ({ onClick, containerRef }: FloatingButtonProps) => {
  const dragControls = useDragControls();
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  return (
      <motion.div
        drag
        dragControls={dragControls}
        dragMomentum={false}
        dragElastic={0}
        dragConstraints={containerRef}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={() => {
          setIsDragging(false);
        }}
        animate={position}
        whileDrag={{ scale: 1.1 }}
        whileHover={{ scale: 1.05 }}
      >
        <Button
          type="primary"
          size="large"
          onClick={() => {
            if (!isDragging) onClick();
          }}
        >
          +
        </Button>
      </motion.div>
    );
};

export const QuestionsList = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  const {
      formSettings,
      questionsList,
      editQuestion,
      setQuestionIdInFocus,
      updateFormSetting,
      updateQuestionsList,
      setIsLeftMenuOpen,
      bottomElementRef,
      updateFormName,
  } = useFormBuilderContext();

  const [showAIGenerator, setShowAIGenerator] = useState(false);

  const handleDescriptionChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
      updateFormSetting({ description: e.target.value });
  };

  const onReorderKey = (keyType: "UP" | "DOWN", tempId: string) => {
     const questions = [...questionsList];
     const selectedQuestionIndex = questions.findIndex(
       (question: Field) => question[1] === tempId
     );
     if (
       (selectedQuestionIndex === 0 && keyType === "UP") ||
       (selectedQuestionIndex === questions.length - 1 && keyType === "DOWN")
     ) {
       return;
     }
     const order = keyType === "UP" ? -1 : +1;
     if (selectedQuestionIndex !== -1) {
       const replaceQuestion = questions[selectedQuestionIndex + order];
       questions[selectedQuestionIndex + order] =
         questions[selectedQuestionIndex];
       questions[selectedQuestionIndex] = replaceQuestion;
     }
     updateQuestionsList(questions);
  };

  const onPlusButtonClick = () => {
      setIsLeftMenuOpen(true);
  };

const handleAIFormGenerated = (formData: GeneratedFormData) => {
  console.log("AI Generated Data Received in QuestionsList:", formData);

  try {
      // 1. Update Title and Description
      updateFormName(formData.title);
      updateFormSetting({ description: formData.description || "" });

      // 2. Map AI fields to the internal 'Field' tuple structure
      const mappedFields: Field[] = formData.fields.map((aiField): Field => { // Explicitly type return as Field
          const uniqueId = makeTag(6);
          const fieldType = aiField.type;
          const label = aiField.label;
          const options = aiField.options || [];

          // *** Create a more complete default config ***
          // Start with a default structure similar to generateQuestion's default
            // Start with a default structure based on IAnswerSettings
            const defaultSettings: IAnswerSettings = {
              // Map AI types to the *correct* AnswerTypes enum members
              renderElement: // Default to shortText if mapping fails
                  fieldType === 'ShortText' ? AnswerTypes.shortText :
                  fieldType === 'LongText' ? AnswerTypes.shortText : // Assuming 'textarea' exists for long text
                  fieldType === 'Number' ? AnswerTypes.number :
                  fieldType === 'Email' ? AnswerTypes.shortText : // Often email is just shortText + validation
                  fieldType === 'Date' ? AnswerTypes.date :
                  fieldType === 'Time' ? AnswerTypes.time :
                  fieldType === 'MultipleChoice' ? AnswerTypes.radioButton :
                  fieldType === 'Checkbox' ? AnswerTypes.checkboxes : // Corrected: checkboxes
                  fieldType === 'Dropdown' ? AnswerTypes.dropdown : // Corrected: dropdown
                  AnswerTypes.shortText, // Fallback default

              required: aiField.required || false, // Merge 'required' from AI

              // Initialize validationRules as an empty object to match IAnswerSettings
              validationRules: {},

              // Initialize numberConstraints if needed for number types (check Validation component)
              // numberConstraints: fieldType === 'Number' ? {} : undefined, // Example: Provide default if type is Number

              // Initialize any other properties from IAnswerSettings if they are expected by consuming components
         };

         // Construct the tuple matching the 'Field' type definition
         const newField: Field = [
              "field",
              uniqueId,
              fieldType, // Keep the original string type here? Or map to renderElement? Let's keep original for now.
              label,
              JSON.stringify(options),        // Element 4 (index 4)
              JSON.stringify(defaultSettings), // Element 5 (index 5) - Use the corrected default object
         ];
         return newField;
      });

      console.log("Mapped Fields with Default Config:", mappedFields);

      // 3. Update the questions list state
      updateQuestionsList(mappedFields);

      // 4. Clear focus and hide generator
      setQuestionIdInFocus(undefined);
      setShowAIGenerator(false);

      // 5. Provide user feedback
      message.success("Form generated successfully from description!");

  } catch (error) {
      console.error("Error processing AI generated form data:", error);
      message.error("Failed to process the generated form data.");
  }
};

  return (
      <StyleWrapper
          className="main-content"
          onClick={() => setQuestionIdInFocus()}
          ref={containerRef}
          style={{ position: "relative" }}
      >
          {/* --- Button to toggle AI Generator --- */}
          <div style={{ padding: '10px 0', textAlign: 'center' }}> {/* Basic styling */}
              <Button
                  onClick={() => setShowAIGenerator(prev => !prev)} // Toggle visibility
                  icon={<span>✨</span>} // Optional icon
              >
                  {showAIGenerator ? 'Cancel AI Generation' : 'Create with AI'}
              </Button>
          </div>

          {/* --- Conditionally render AI Generator --- */}
          {showAIGenerator && (
              <div style={{ marginBottom: '20px' }}> {/* Add some spacing */}
                  <LLMFormGenerator onFormGenerated={handleAIFormGenerated} />
              </div>
          )}

          {/* --- Existing Form Title and Description --- */}
          {!showAIGenerator && ( // Optionally hide title/desc when generator is active? Or keep visible? Your choice.
               <>
                  <div>
                      <FormTitle className="form-title" />
                      <DescriptionStyle>
                      <div className="form-description">
                          <Input.TextArea
                              key="description"
                              value={formSettings.description}
                              onChange={handleDescriptionChange}
                              autoSize
                          />
                      </div>
                      </DescriptionStyle>
                  </div>
               </>
          )}


          {/* --- Existing Questions List using Reorder.Group --- */}
          <Reorder.Group
              values={questionsList}
              onReorder={updateQuestionsList}
              className="reorder-group"
          >
              <div>
                  {questionsList.map((question, idx) => (
                      <Reorder.Item
                          value={question}
                          key={question[1]}
                          dragListener={true}
                      >
                          <QuestionCard
                              question={question}
                              onEdit={editQuestion}
                              onReorderKey={onReorderKey}
                              firstQuestion={idx === 0}
                              lastQuestion={idx === questionsList.length - 1}
                          />
                      </Reorder.Item>
                  ))}
                  <div ref={bottomElementRef}></div> {/* Keep bottom ref */}
              </div>
          </Reorder.Group>

          {/* --- Existing Mobile Add Button --- */}
          <div className="mobile-add-btn">
              <FloatingButton
                  onClick={onPlusButtonClick}
                  containerRef={containerRef}
              />
          </div>
      </StyleWrapper>
  );
};
