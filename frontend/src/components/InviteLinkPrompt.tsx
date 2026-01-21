import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import '../styles/InviteLinkPrompt.css';

export const InviteLinkPrompt: React.FC = () => {
  const { setToken } = useAuth();
  const [tokenInput, setTokenInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setError('Please enter an invite token');
      return;
    }

    // For now, we'll use a placeholder team ID
    // In a real app, this would come from decoding the token or an API call
    setToken(tokenInput, 'team-' + Date.now());
  };

  const handleUrlPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const params = new URLSearchParams(new URL(text).search);
      const token = params.get('token');
      if (token) {
        setTokenInput(token);
        setError(null);
      } else {
        setError('No token found in URL');
      }
    } catch {
      setError('Could not read clipboard');
    }
  };

  return (
    <div className="invite-prompt">
      <div className="invite-card">
        <h1>Team Media Hub</h1>
        <p>Enter your invite token to get started</p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={tokenInput}
            onChange={(e) => {
              setTokenInput(e.target.value);
              setError(null);
            }}
            placeholder="Paste invite token or URL"
            className="token-input"
          />

          {error && <div className="error">{error}</div>}

          <button type="submit" className="submit-btn">
            Join
          </button>

          <button
            type="button"
            className="paste-btn"
            onClick={handleUrlPaste}
          >
            Paste from URL
          </button>
        </form>
      </div>
    </div>
  );
};
