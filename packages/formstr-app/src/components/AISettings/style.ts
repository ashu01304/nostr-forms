import styled from 'styled-components';

export const AISettingsContainer = styled.div`
  .form-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px; // For spacing between buttons if they wrap or for general spacing
    margin-top: 20px;

    // Ensure buttons are spaced out if they are grouped differently or for specific layouts
    button {
      // margin-left: 8px; // Use gap on the container instead for better flexbox spacing
    }
  }

  // Add some spacing below the model selection dropdown if it's visible
  .ant-form-item:has(>.ant-select) {
    margin-bottom: 16px;
  }
`;
