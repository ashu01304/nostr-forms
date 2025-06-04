import React, { useState, useEffect } from 'react';
import { Modal, Input, Button, Form, notification, Select, Collapse, Typography, Divider } from 'antd';
import ollamaService from '../../services/ollamaService';
import { AISettingsContainer } from './style';
// CodeBlock import removed

interface AISettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

const AISettingsModal: React.FC<AISettingsModalProps> = ({ visible, onClose }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [fetchModelsLoading, setFetchModelsLoading] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      const currentConfig = ollamaService.getConfig();
      form.setFieldsValue({
        baseURL: currentConfig.baseURL,
        modelName: currentConfig.modelName,
      });
      setAvailableModels([]); // Reset models list on open
    }
  }, [visible, form]);

  const handleSave = async (values: { baseURL: string; modelName: string }) => {
    setLoading(true);
    try {
      await ollamaService.setConfig(values.baseURL, values.modelName);
      notification.success({ message: 'Settings saved successfully!' });
      onClose();
    } catch (error) {
      notification.error({ message: 'Failed to save settings', description: String(error) });
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTestLoading(true);
    try {
      const values = form.getFieldsValue();
      await ollamaService.testConnection(values.baseURL);
      notification.success({ message: 'Connection successful!' });
    } catch (error) {
      notification.error({ message: 'Connection failed', description: String(error) });
    } finally {
      setTestLoading(false);
    }
  };

  const handleFetchModels = async () => {
    setFetchModelsLoading(true);
    setAvailableModels([]);
    try {
      const values = form.getFieldsValue();
      if (!values.baseURL) {
        notification.warn({ message: 'Ollama Base URL is required to fetch models.' });
        setFetchModelsLoading(false);
        return;
      }
      const models = await ollamaService.fetchModels(values.baseURL);
      if (models && models.length > 0) {
        setAvailableModels(models);
        notification.success({ message: 'Models fetched successfully!' });
        if (models.length === 1) {
            form.setFieldsValue({ modelName: models[0] });
        }
      } else {
        notification.info({ message: 'No models found at the specified URL.' });
      }
    } catch (error) {
      notification.error({ message: 'Failed to fetch models', description: String(error) });
    } finally {
      setFetchModelsLoading(false);
    }
  };

const { Panel } = Collapse;
const { Text, Link, Paragraph } = Typography;

// Instructions content (reconstructed and adapted)
const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
const defaultModelExample = "llama3"; // Or any other model you want to suggest

const MacOSInstructions = (
  <>
    <Paragraph>
      1. Download Ollama for macOS: {' '}
      <Link href="https://ollama.com/download/Ollama-darwin.zip" target="_blank">Download Link</Link>
    </Paragraph>
    <Paragraph>2. Unzip and run the application. It will install the `ollama` CLI.</Paragraph>
    <Paragraph>3. Open your terminal and pull a model (e.g., {defaultModelExample}):</Paragraph>
    <pre><code>{`ollama pull ${defaultModelExample}`}</code></pre>
    <Paragraph>
      4. Set the <Text code>OLLAMA_ORIGINS</Text> environment variable to allow this web app to access Ollama.
      You can do this temporarily when running a model:
    </Paragraph>
    <pre><code>{`OLLAMA_ORIGINS=${currentOrigin} ollama run ${defaultModelExample}`}</code></pre>
    <Paragraph>
      Or, for a more permanent solution, set it in your shell profile (e.g., <Text code>.zshrc</Text>, <Text code>.bashrc</Text>):
    </Paragraph>
    <pre><code>{`export OLLAMA_ORIGINS="${currentOrigin}"`}</code></pre>
    <Paragraph>Then restart your terminal or source your profile script. After that, you can run <Text code>ollama serve</Text> or <Text code>ollama run modelname</Text>.</Paragraph>
    <Paragraph>
      For more details, see the Ollama macOS documentation: {' '}
      <Link href="httpsa://github.com/ollama/ollama/blob/main/docs/macos.md" target="_blank">Ollama macOS Docs</Link>
    </Paragraph>
  </>
);

const LinuxInstructions = (
  <>
    <Paragraph>1. Install Ollama using the official script:</Paragraph>
    <pre><code>curl -fsSL https://ollama.com/install.sh | sh</code></pre>
    <Paragraph>2. Pull a model (e.g., {defaultModelExample}):</Paragraph>
    <pre><code>{`ollama pull ${defaultModelExample}`}</code></pre>
    <Paragraph>
      3. To allow this web app to access Ollama, you need to configure <Text code>OLLAMA_ORIGINS</Text>.
      If you are running Ollama as a systemd service (common setup), edit the service unit:
    </Paragraph>
    <pre><code>sudo systemctl edit ollama.service</code></pre>
    <Paragraph>Add the following lines in the editor:</Paragraph>
    <pre><code>{`[Service]\nEnvironment="OLLAMA_ORIGINS=${currentOrigin}"`}</code></pre>
    <Paragraph>Save, exit, then reload the daemon and restart Ollama:</Paragraph>
    <pre><code>sudo systemctl daemon-reload\nsudo systemctl restart ollama</code></pre>
    <Paragraph>
      For other setups or more details, see the Ollama Linux documentation: {' '}
      <Link href="https://github.com/ollama/ollama/blob/main/docs/linux.md" target="_blank">Ollama Linux Docs</Link>
    </Paragraph>
  </>
);

const WindowsInstructions = (
  <>
    <Paragraph>
      1. Download the Ollama installer for Windows: {' '}
      <Link href="https://ollama.com/download/OllamaSetup.exe" target="_blank">Download Link</Link>
    </Paragraph>
    <Paragraph>2. Run the installer. This will also install the `ollama` CLI.</Paragraph>
    <Paragraph>3. Open PowerShell or Command Prompt and pull a model (e.g., {defaultModelExample}):</Paragraph>
    <pre><code>{`ollama pull ${defaultModelExample}`}</code></pre>
    <Paragraph>
      4. To allow this web app to access Ollama, set the <Text code>OLLAMA_ORIGINS</Text> environment variable.
      Open PowerShell and run:
    </Paragraph>
    <pre><code>{`$env:OLLAMA_ORIGINS="${currentOrigin}"`}</code></pre>
    <Paragraph>
      To set it permanently, you can use the System Properties dialog:
      Search for "environment variables", click "Edit the system environment variables", then "Environment Variables...",
      and add/edit <Text code>OLLAMA_ORIGINS</Text> under "User variables" or "System variables".
    </Paragraph>
    <Paragraph>
      After setting the environment variable, you may need to restart Ollama or your terminal.
      Then run <Text code>ollama serve</Text> or <Text code>ollama run modelname</Text>.
    </Paragraph>
     <Paragraph>
      For more details, see the Ollama Windows documentation: {' '}
      <Link href="https://github.com/ollama/ollama/blob/main/docs/windows.md" target="_blank">Ollama Windows Docs</Link>
    </Paragraph>
  </>
);

  return (
    <Modal
      title="AI Settings (Ollama)"
      visible={visible}
      onCancel={onClose}
      footer={null}
      destroyOnClose
      width={800} // Increased width to accommodate instructions
    >
      <AISettingsContainer>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item
            name="baseURL"
            label="Ollama Base URL"
            rules={[{ required: true, message: 'Please input the Ollama Base URL!' }]}
          >
            <Input placeholder="e.g., http://localhost:11434" />
          </Form.Item>
          <Form.Item
            name="modelName"
            label="Ollama Model Name"
            rules={[{ required: true, message: 'Please input the Ollama Model Name!' }]}
          >
            <Input placeholder="e.g., llama3" />
          </Form.Item>

          {availableModels.length > 0 && (
            <Form.Item label="Available Models (select to update)">
              <Select
                onChange={(value) => form.setFieldsValue({ modelName: value })}
                placeholder="Select a model"
              >
                {availableModels.map(model => (
                  <Select.Option key={model} value={model}>{model}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}

          <Form.Item>
            <div className="form-buttons">
              <Button type="primary" htmlType="submit" loading={loading}>
                Save Settings
              </Button>
              <Button onClick={handleTestConnection} loading={testLoading} >
                Test Connection
              </Button>
              <Button onClick={handleFetchModels} loading={fetchModelsLoading} >
                Fetch Models
              </Button>
            </div>
          </Form.Item>
        </Form>
        <Divider />
        <Typography.Title level={5} style={{ marginBottom: '16px' }}>Ollama Setup Guide</Typography.Title>
        <Collapse accordion>
          <Panel header="macOS Setup Instructions" key="1">
            {MacOSInstructions}
          </Panel>
          <Panel header="Linux Setup Instructions" key="2">
            {LinuxInstructions}
          </Panel>
          <Panel header="Windows Setup Instructions" key="3">
            {WindowsInstructions}
          </Panel>
        </Collapse>
      </AISettingsContainer>
    </Modal>
  );
};

export default AISettingsModal;
