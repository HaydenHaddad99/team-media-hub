import React, { useEffect, useState } from "react";
import { getTokenFromUrl, setStoredToken } from "../lib/api";

export function TokenPrompt({ onToken }: { onToken: (token: string) => void }) {
  const [input, setInput] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const urlToken = getTokenFromUrl();
    if (urlToken) {
      setStoredToken(urlToken);
      onToken(urlToken);
      // Clean up URL
      window.history.replaceState({}, "", "/");
    }
  }, [onToken]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = input.trim();

    if (!token || token.length < 10) {
      setErr("Token must be at least 10 characters");
      return;
    }

    setErr(null);
    setStoredToken(token);
    onToken(token);
  }

  return (
    <div className="promptOverlay">
      <div className="promptBox">
        <h1>Team Media Hub</h1>
        <p>Enter your invite token to join</p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setErr(null);
            }}
            placeholder="Paste invite token"
            autoFocus
          />
          {err && <div className="error">{err}</div>}
          <button type="submit" className="btn primary">
            Join
          </button>
        </form>
      </div>
    </div>
  );
}
