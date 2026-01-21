import React, { useEffect, useState } from "react";
import { getTokenFromUrl, setStoredToken, getCurrentToken, clearStoredToken } from "../lib/api";

export function InviteLanding({ onReady }: { onReady: () => void }) {
  const [token, setToken] = useState<string>("");

  useEffect(() => {
    const urlToken = getTokenFromUrl();
    if (urlToken) {
      setStoredToken(urlToken);

      // Remove token from URL for cleaner sharing and to avoid screenshots leaking it.
      const u = new URL(window.location.href);
      u.searchParams.delete("token");
      window.history.replaceState({}, "", u.toString());

      onReady();
      return;
    }

    const stored = getCurrentToken();
    if (stored) {
      onReady();
    }
  }, [onReady]);

  function saveManual() {
    const t = token.trim();
    if (t.length < 10) return;
    setStoredToken(t);
    onReady();
  }

  return (
    <div className="container">
      <header className="header">
        <div className="brand">Team Media Hub</div>
        <div className="sub">Private, invite-only team photo/video sharing</div>
      </header>

      <div className="panel">
        <h2>Enter invite token</h2>
        <p className="muted">
          You usually won't type this. You'll open a team invite link that includes the token.
        </p>

        <div className="row">
          <input
            className="input"
            placeholder="Paste invite token…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button className="btn primary" onClick={saveManual}>
            Continue
          </button>
        </div>

        <button className="btn link" onClick={() => { clearStoredToken(); setToken(""); }}>
          Clear saved token
        </button>
      </div>

      <footer className="footer muted">
        Privacy-first: media is stored privately and accessed via short-lived signed links.
      </footer>
    </div>
  );
}
