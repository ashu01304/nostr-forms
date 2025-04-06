import { Divider, Switch, Tooltip, Typography, Input, message } from "antd";
import StyleWrapper from "./style";
import useFormBuilderContext from "../../hooks/useFormBuilderContext";
import TitleImage from "./TitleImage";
import { Sharing } from "./Sharing";
import { RelayList } from "./RelayList";
import FormIdentifier from "./FormIdentifier";
import { Notifications } from "./Notifications";
import { isMobile } from "../../../../utils/utility";
import React, { useState, useEffect } from "react";
import { getItem, setItem, LOCAL_STORAGE_KEYS } from "../../../../utils/localStorage";

const { Text } = Typography;

function FormSettings() {
  const { formSettings, updateFormSetting } = useFormBuilderContext();

  const handleAnonymousToggle = (checked: boolean) => {
    updateFormSetting({
      disallowAnonymous: checked,
    });
  };

  const handlePublicForm = (checked: boolean) => {
    updateFormSetting({
      encryptForm: !checked,
    });
  };

  const [ollamaUrlInput, setOllamaUrlInput] = useState<string>('');
  const [ollamaModelInput, setOllamaModelInput] = useState<string>('');

  useEffect(() => {
    const storedUrl = getItem<string>(LOCAL_STORAGE_KEYS.OLLAMA_URL, { parseAsJson: false });
    setOllamaUrlInput(storedUrl || 'http://localhost:11434');

    const storedModel = getItem<string>(LOCAL_STORAGE_KEYS.OLLAMA_MODEL, { parseAsJson: false });
    setOllamaModelInput(storedModel || 'llama3');    

  }, []); 

  const handleOllamaUrlSave = () => {
    const urlToSave = ollamaUrlInput.trim();
    if (urlToSave === '' || urlToSave.startsWith('http://') || urlToSave.startsWith('https://')) {
         setItem(LOCAL_STORAGE_KEYS.OLLAMA_URL, urlToSave, { parseAsJson: false });
         message.success("LLM Server URL saved!");
    } else {
         message.error("Invalid URL format. Please include http:// or https://, or leave empty to use default.");
    }
  };

  const handleOllamaModelSave = () => {
    const modelToSave = ollamaModelInput.trim();
    if (modelToSave) {
        setItem(LOCAL_STORAGE_KEYS.OLLAMA_MODEL, modelToSave, { parseAsJson: false });
        message.success("LLM Model Name saved!");
    } else {
        message.warning("Model name cannot be empty. Reverted to previous or default.");
        const storedModel = getItem<string>(LOCAL_STORAGE_KEYS.OLLAMA_MODEL, { parseAsJson: false });
        setOllamaModelInput(storedModel || 'llama3');
    }
};

  return (
    <StyleWrapper>
      <div className="form-setting">
        <Text className="property-name">Form Identifier</Text>
        <FormIdentifier />
      </div>
      <div className="form-setting">
        <TitleImage titleImageUrl={formSettings.titleImageUrl} />
      </div>
      <Divider className="divider" />
      <div className="form-setting">
        <Text className="property-name">Form Access Settings</Text>
        <Tooltip
          title="This toggle will leave the form un-encrypted and allow anyone to view the form."
          trigger={isMobile() ? "click" : "hover"}
        >
          <div className="property-setting">
            <Text className="property-text">Make Form Public</Text>
            <Switch
              defaultChecked={!formSettings.encryptForm}
              onChange={handlePublicForm}
            />
          </div>
        </Tooltip>
        <Sharing />
      </div>

      <Divider className="divider" />
      <div className="form-setting">
        <Text className="property-name">Notifications</Text>
        <Notifications />
        {formSettings.notifyNpubs?.length ? (
          <Text className="warning-text">
            *These npubs will receive
            <a
              href="https://github.com/nostr-protocol/nips/blob/master/04.md"
              target="_blank"
              rel="noreferrer"
            >
              {" "}
              nip-04{" "}
            </a>
            encrypted notifications.
          </Text>
        ) : null}
      </div>
      <Divider className="divider" />
      <div className="form-setting">
        <div className="property-setting">
          <Text className="property-text">Disallow Anonymous Submissions</Text>
          <Switch
            defaultChecked={formSettings.disallowAnonymous}
            onChange={handleAnonymousToggle}
          />
        </div>
        {formSettings.disallowAnonymous && (
          <Text className="warning-text">
            *This will require participants to have a nostr profile with a
            <a
              href="https://nostrcheck.me/register/browser-extension.php"
              target="_blank"
              rel="noreferrer"
            >
              {" "}
              nip-07 extension
            </a>
          </Text>
        )}
      </div>
      <Divider className="divider" />
      <div className="form-setting">
        <RelayList />
      </div>
      <Divider className="divider" />
      <div className="form-setting">
          <Text className="property-name">AI Settings</Text>
          <div className="property-setting" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '5px' }}>
              <Text className="property-text">LLM Server URL</Text>
              <Input
                  placeholder="http://localhost:11434"
                  value={ollamaUrlInput}
                  onChange={(e) => setOllamaUrlInput(e.target.value)}
                  onBlur={handleOllamaUrlSave} 
              />
              <Text type="secondary" style={{ fontSize: '0.8em', marginTop: '3px' }}>default : http://localhost:11434</Text>
          </div>
          <div className="property-setting" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '5px' }}>
              <Text className="property-text">LLM Model Name (e.g. llama3)</Text>
              <Input
                  placeholder="llama3"
                  value={ollamaModelInput}
                  onChange={(e) => setOllamaModelInput(e.target.value)}
                  onBlur={handleOllamaModelSave}
              />
               <Text type="secondary" style={{ fontSize: '0.8em', marginTop: '3px' }}>Specify the model Ollama should use.</Text>
          </div>
      </div>
      
    </StyleWrapper>
  );
}

export default FormSettings;
