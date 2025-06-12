import React from 'react';
import { Typography, Collapse, Button } from 'antd';
import { OllamaSettingsProps } from './types';

const { Panel } = Collapse;
const EXTENSION_ID = "nopcdaggijpnmjppjojpeoelfdjodkjd";

const OllamaSettings: React.FC<OllamaSettingsProps> = ({
    onTestConnection,
    loading
}) => {
    return (
        <div style={{ marginBottom: '20px' }}>
            <Button onClick={onTestConnection} loading={loading} style={{ width: '100%' }}>
                Test Connection to Ollama Extension
            </Button>
            <Collapse ghost style={{ marginTop: '16px' }}>
                <Panel header="Connection Help & Instructions" key="1">
                <Typography.Paragraph>
                    The Formstr Companion extension handles the connection to your Ollama instance. You can set the Ollama server URL in the extension's popup.
                </Typography.Paragraph>
                <Typography.Paragraph>
                    For the extension to communicate with your local Ollama instance, you must configure Ollama to accept requests from the extension's origin.
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