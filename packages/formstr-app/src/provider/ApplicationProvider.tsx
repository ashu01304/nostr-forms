import React, { createContext, FC, ReactNode, useRef, useState } from "react";
import { SimplePool } from "nostr-tools";
import { useNavigate } from "react-router-dom";
import TemplateSelectorModal from "../components/TemplateSelectorModal";
import { FormTemplate } from "../templates";
import { createFormSpecFromTemplate } from "../utils/formUtils";
import { FormInitData } from "../containers/CreateFormNew/providers/FormBuilder/typeDefs";
import { ROUTES } from "../constants/routes";

interface ApplicationProviderProps {
  children?: ReactNode;
}

export interface ApplicationContextType {
  poolRef: React.MutableRefObject<SimplePool>;
  isTemplateModalOpen: boolean;
  openTemplateModal: () => void;
  closeTemplateModal: () => void;
}

export const ApplicationContext = createContext<
  ApplicationContextType | undefined
>(undefined);

export const ApplicationProvider: FC<ApplicationProviderProps> = ({
  children,
}) => {
  const poolRef = useRef(new SimplePool());
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const openTemplateModal = () => setIsTemplateModalOpen(true); 
  const closeTemplateModal = () => setIsTemplateModalOpen(false);
  const navigate = useNavigate();
  const handleTemplateSelect = (template: FormTemplate) => {
    const { spec, id } = createFormSpecFromTemplate(template);
    const navigationState: FormInitData = { spec, id };
    closeTemplateModal();
    navigate(ROUTES.CREATE_FORMS_NEW, { state: navigationState });
  };
  const contextValue: ApplicationContextType = {
    poolRef,
    isTemplateModalOpen,
    openTemplateModal,
    closeTemplateModal,
  };

  return (
    <ApplicationContext.Provider value={ contextValue }>
      {children}
      <TemplateSelectorModal
        visible={isTemplateModalOpen}
        onClose={closeTemplateModal}
        onTemplateSelect={handleTemplateSelect}
      />
    </ApplicationContext.Provider>
  );
};
