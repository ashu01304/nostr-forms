import React, { useState } from 'react';
import { Modal, Input, Button, Spin, Alert } from 'antd';
import { BunkerSigner, parseBunkerInput, BunkerPointer } from 'nostr-tools/nip46';

interface Nip46LoginProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (signer: BunkerSigner, bunkerPointer: BunkerPointer) => void;
}

const Nip46Login: React.FC<Nip46LoginProps> = ({ isOpen, onClose, onLogin }) => {
  const [bunkerInput, setBunkerInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = async () => {
    if (!bunkerInput) {
      setError('Please enter a bunker URL or NIP-05 identifier.');
      return;
    }
    setLoading(true);
    setError('');
    console.log('[NIP46] Starting connection process...');

    try {
      console.log(`[NIP46] Parsing input: ${bunkerInput}`);
      const bunkerPointer = await parseBunkerInput(bunkerInput);
      if (!bunkerPointer) {
        throw new Error('Invalid bunker URL or NIP-05 identifier.');
      }
      console.log('[NIP46] Bunker pointer parsed:', bunkerPointer);

      const clientSecretKey = new Uint8Array(32);
      window.crypto.getRandomValues(clientSecretKey);
      console.log('[NIP46] Client secret key generated.');

      const signer = new BunkerSigner(clientSecretKey, bunkerPointer, {
        onauth: (url: string) => {
          // Log for debugging, but take no UI action.
          console.log('[NIP46] Auth URL received (user must approve manually in their signer):', url);
        },
      });
      console.log('[NIP46] BunkerSigner created. Attempting to connect to bunker...');

      await signer.connect();
      
      console.log('[NIP46] Connection successful.');
      onLogin(signer, bunkerPointer);

    } catch (err: any) {
      console.error('[NIP46] Connection failed:', err);
      setError(err.message || 'Failed to connect to the bunker.');
    } finally {
      setLoading(false);
    }
  };
  
  const handleCancel = () => {
    setLoading(false);
    setError('');
    onClose();
  }

  return (
    <Modal
      title="Connect with Remote Signer (NIP-46)"
      open={isOpen}
      onCancel={handleCancel}
      footer={[
        <Button key="back" onClick={handleCancel}>
          Cancel
        </Button>,
        <Button key="submit" type="primary" loading={loading} onClick={handleConnect}>
          {loading ? 'Awaiting Approval...' : 'Connect'}
        </Button>,
      ]}
    >
      <p>Enter your bunker URL (bunker://...) or NIP-05 identifier (name@domain.com).</p>
      <p>After clicking "Connect", please approve the request in your signing application.</p>
      <Input
        placeholder="bunker://... or name@domain.com"
        value={bunkerInput}
        onChange={(e) => setBunkerInput(e.target.value)}
        onPressEnter={handleConnect}
        disabled={loading}
      />
      {error && <Alert message={error} type="error" showIcon style={{ marginTop: '10px' }} />}
    </Modal>
  );
};

export default Nip46Login;