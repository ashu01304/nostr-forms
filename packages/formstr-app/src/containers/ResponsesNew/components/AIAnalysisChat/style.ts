import styled from 'styled-components';

export const ChatWrapper = styled.div`
  width: 100%;
  margin-top: 24px;
  
  .ant-card {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.09);
    border-radius: 8px;
    border: 1px solid #f0f0f0;
  }

  .ant-card-head {
    background-color: #fafafa;
  }

  /* Button styling for connection status */
  .ai-chat-button-success {
      background-color: #52c41a;
      color: white;
      border-color: #52c41a;
  }

  .ai-chat-button-success:hover {
      background-color: #73d13d;
      color: white !important;
      border-color: #73d13d !important;
  }

  .ai-chat-button-danger {
      background-color: #ff4d4f;
      color: white;
      border-color: #ff4d4f;
  }

  .ai-chat-button-danger:hover {
      background-color: #ff7875;
      color: white !important;
      border-color: #ff7875 !important;
  }
`;

export const MessageList = styled.div`
  height: 300px; /* Set a fixed height for scrolling */
  overflow-y: auto;
  margin-bottom: 16px;
  padding-right: 8px; /* For scrollbar */
`;

export const MessageItem = styled.div<{ sender: 'user' | 'ai' }>`
  margin-bottom: 12px;
  display: flex;
  justify-content: ${props => (props.sender === 'user' ? 'flex-end' : 'flex-start')};

  .message-bubble {
    padding: 8px 12px;
    border-radius: 18px;
    max-width: 80%;
    background-color: ${props => (props.sender === 'user' ? '#FF5733' : '#f0f0f0')};
    color: ${props => (props.sender === 'user' ? 'white' : 'black')};
    word-wrap: break-word;
  }
`;