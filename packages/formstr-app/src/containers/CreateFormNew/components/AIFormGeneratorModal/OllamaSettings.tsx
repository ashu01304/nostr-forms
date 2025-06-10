import React from 'react';
import { Input, Space, Typography, Tooltip, Collapse, Row, Col, Divider as AntDivider, Button } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { OllamaSettingsProps } from './types';

const { Panel } = Collapse;
const EXTENSION_ID = "djmliheoabooicndndcbgblcpcobjcbc";

const OllamaSettings: React.FC<OllamaSettingsProps> = ({
    ollamaUrl,
    onUrlChange,
    onTestConnection,
    loading
}) => {
    return (
        <div style={{ marginBottom: '20px' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
                <Typography.Text>Ollama Server URL</Typography.Text>
                <Space.Compact style={{ width: '100%' }}>
                <Input
                    value={ollamaUrl}
                    onChange={onUrlChange}
                    placeholder="http://localhost:11434"
                />
                <Button onClick={onTestConnection} loading={loading}>
                    Test Connection
                </Button>
                </Space.Compact>
            </Space>

            <Collapse ghost style={{ marginTop: '16px' }}>
                <Panel header="Connection Help & Instructions" key="1">
                <Typography.Paragraph>
                    For the Formstr extension to communicate with your local Ollama instance, you must configure Ollama to accept requests from the extension's origin.
                </Typography.Paragraph>
                <Typography.Paragraph>
                    You can do this by setting the <Typography.Text code>OLLAMA_ORIGINS</Typography.Text> environment variable.
                </Typography.Paragraph>

                <Typography.Title level={5}>macOS / Linux</Typography.Title>
                <Typography.Paragraph>
                    Open your terminal and run the following command:
                </Typography.Paragraph>
                <pre style={{ background: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
                    <code>{`launchctl setenv OLLAMA_ORIGINS "chrome-extension://${EXTENSION_ID}"`}</code>
                </pre>

                <Typography.Title level={5}>Windows</Typography.Title>
                <Typography.Paragraph>
                    Open PowerShell (as Administrator) and run this command:
                </Typography.Paragraph>
                <pre style={{ background: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
                    <code>{`[System.Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS', 'chrome-extension://${EXTENSION_ID}', 'Machine')`}</code>
                </pre>

                <Typography.Paragraph strong>
                    Important: After setting the environment variable, you must restart your Ollama server for the changes to take effect.
                </Typography.Paragraph>
                </Panel>
            </Collapse>
        </div>
    );
};

export default OllamaSettings;