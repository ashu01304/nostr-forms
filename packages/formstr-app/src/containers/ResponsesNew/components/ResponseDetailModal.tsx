import React, { useState, useEffect } from 'react';
import { Modal, Descriptions, Typography, Button, Space } from 'antd';
import { Event, nip19 } from 'nostr-tools';
import { Tag, Field } from '../../../nostr/types';
import { getInputsFromResponseEvent, processResponseInputTag, DisplayableAnswerDetail,} from '../../../utils/ResponseUtils';

const { Text } = Typography;

type ResponseDetailItem = {
  key: string; 
  question: string;
  answer: string;
};
interface ResponseDetailModalProps {
  isVisible: boolean;
  onClose: () => void;
  responseEvent: Event | null; 
  formSpec: Tag[];
  editKey: string | undefined | null; 
}
export const ResponseDetailModal: React.FC<ResponseDetailModalProps> = ({
  isVisible,
  onClose,
  responseEvent,
  formSpec,
  editKey,
}) => {
  const [processedData, setProcessedData] = useState<ResponseDetailItem[]>([]);
  const [metaData, setMetaData] = useState<{ author?: string, timestamp?: string }>({});


  const processEventForDisplay = (
    currentResponseEvent: Event,
    currentFormSpec: Tag[],
    currentEditKey: string | undefined | null
  ): ResponseDetailItem[] => {
    const inputs = getInputsFromResponseEvent(currentResponseEvent, currentEditKey);
    if (inputs.length === 0) {
      if (currentResponseEvent.content !== "" && !currentEditKey) {
        return [{ key: 'error-decrypt', question: 'Access Denied', answer: 'Cannot decrypt response content without the correct key.' }];
      }
      return [{ key: 'no-inputs', question: 'Info', answer: 'No response data found in this event.' }];
    }
    const details: ResponseDetailItem[] = inputs.map((inputTag) => {
      const { questionLabel, responseLabel, fieldId } = processResponseInputTag(inputTag, currentFormSpec);
      return { key: fieldId, question: questionLabel, answer: responseLabel };
    });
    return details;
  };

  useEffect(() => {
    if (isVisible && responseEvent) {
      const authorNpub = nip19.npubEncode(responseEvent.pubkey);
      const timestamp = new Date(responseEvent.created_at * 1000).toLocaleString();
      setMetaData({ author: authorNpub, timestamp });
      if (formSpec && formSpec.length > 0) {
        const data = processEventForDisplay(responseEvent, formSpec, editKey);
        setProcessedData(data);
      } else {
        setProcessedData([{ key: 'loading-spec', question: 'Status', answer: 'Waiting for form details...' }]);
      }
    } else {
      setProcessedData([]);
      setMetaData({});
    }
  }, [isVisible, responseEvent, formSpec, editKey]); 

  return (
    <Modal
      title={
        <Space direction="vertical" size="small">
          <Text strong>Response Details</Text>
          <Text type="secondary" style={{ fontSize: '0.9em' }}>
            By: <Typography.Link href={`https://njump.me/${metaData.author}`} target="_blank" rel="noopener noreferrer">{metaData.author || 'Unknown'}</Typography.Link>
          </Text>
          <Text type="secondary" style={{ fontSize: '0.8em' }}>
            Submitted: {metaData.timestamp || 'N/A'}
          </Text>
        </Space>
      }
      open={isVisible} 
      onCancel={onClose} 
      footer={[<Button key="close" onClick={onClose}>Close</Button>]} 
      width={600}
      destroyOnClose={true} 
    >
      <Descriptions bordered column={1} size="small">
        {processedData.map(item => (
          <Descriptions.Item key={item.key} label={item.question}>
            <Typography.Text style={{ whiteSpace: 'pre-wrap' }}>
                {item.answer}
            </Typography.Text>
          </Descriptions.Item>
        ))}
        {processedData.length > 0 && (processedData[0]?.key?.startsWith('error-') || processedData[0]?.key === 'no-inputs' || processedData[0]?.key === 'loading-spec') && (
          <Descriptions.Item key="info-state" label={processedData[0].question}>
            {processedData[0].answer}
          </Descriptions.Item>
        )}
      </Descriptions>
    </Modal>
  );
};