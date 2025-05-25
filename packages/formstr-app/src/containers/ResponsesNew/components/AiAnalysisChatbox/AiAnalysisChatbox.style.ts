import styled, { css } from 'styled-components';

export const ChatboxContainer = styled.div`
  margin-top: 20px;
  padding: 20px;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  background-color: #ffffff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.09);
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
`;

export const MessagesArea = styled.div`
  min-height: 200px; 
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #d9d9d9;
  padding: 10px;
  margin-bottom: 10px;
  background-color: #f9f9f9;
  display: flex;
  flex-direction: column;
`;

export const InputArea = styled.div`
  display: flex;
  gap: 10px;
`;

export const MessageBubble = styled.div<{ sender: 'user' | 'ai' | 'systemInfo' }>`
  padding: 8px 12px;
  border-radius: 18px;
  margin-bottom: 8px;
  max-width: 80%;
  word-wrap: break-word;

  ${({ sender }) =>
    sender === 'user' &&
    css`
      background-color: #1890ff;
      color: white;
      align-self: flex-end;
      border-bottom-right-radius: 4px;
    `}

  ${({ sender }) =>
    sender === 'ai' &&
    css`
      background-color: #e6f7ff;
      color: #333;
      align-self: flex-start;
      border-bottom-left-radius: 4px;
    `}

  ${({ sender }) =>
    sender === 'systemInfo' &&
    css`
      background-color: #fafafa;
      color: #555;
      align-self: stretch; 
      border: 1px solid #eee;
      border-radius: 4px;
      padding: 10px;
      font-size: 0.9em;
    `}
`;