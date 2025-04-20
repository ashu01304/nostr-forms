import React, { createContext, useState, ReactNode, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import TemplateSelectorModal from '../components/TemplateSelectorModal';
import { FormTemplate } from '../templates';
import { createFormSpecFromTemplate } from '../utils/formUtils';
import { FormInitData } from '../containers/CreateFormNew/providers/FormBuilder/typeDefs';
import { ROUTES } from '../constants/routes';

interface TemplateContextType {
  isTemplateModalOpen: boolean;
  openTemplateModal: () => void;
  closeTemplateModal: () => void;
}

const TemplateContext = createContext<TemplateContextType | undefined>(undefined);

export const TemplateProvider = ({ children }: { children: ReactNode }) => {
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const navigate = useNavigate();
  const openTemplateModal = () => setIsTemplateModalOpen(true);
  const closeTemplateModal = () => setIsTemplateModalOpen(false);
  const handleTemplateSelect = (template: FormTemplate) => {
    const { spec, id } = createFormSpecFromTemplate(template);
    const navigationState: FormInitData = { spec, id };
    closeTemplateModal();
    navigate(ROUTES.CREATE_FORMS_NEW, { state: navigationState });
  };

  const value = {
    isTemplateModalOpen,
    openTemplateModal,
    closeTemplateModal,
  };

  return (
    <TemplateContext.Provider value={value}>
      {children}
      <TemplateSelectorModal
        visible={isTemplateModalOpen}
        onClose={closeTemplateModal}
        onTemplateSelect={handleTemplateSelect}
      />
    </TemplateContext.Provider>
  );
};

export const useTemplateContext = (): TemplateContextType => {
  const context = useContext(TemplateContext);
  if (!context) {
    throw new Error('useTemplateContext must be used within a TemplateProvider');
  }
  return context;
};