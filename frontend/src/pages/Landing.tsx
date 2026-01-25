import React, { useEffect, useState } from "react";
import {
  getTokenFromUrl,
  setStoredToken,
  getCurrentToken,
  clearStoredToken,
  getDemoInvite,
} from "../lib/api";

export function Landing({ onReady }: { onReady: () => void }) {
  const [token, setToken] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoErr, setDemoErr] = useState("");

  useEffect(() => {
    const urlToken = getTokenFromUrl();
    if (urlToken) {
      setStoredToken(urlToken);

      // Remove token from URL to reduce accidental leakage.
      const u = new URL(window.location.href);
      u.searchParams.delete("token");
      window.history.replaceState({}, "", u.toString());

      onReady();
      return;
    }

    const stored = getCurrentToken();
    if (stored) onReady();
  }, [onReady]);

  function saveManual() {
    const t = token.trim();
    if (t.length < 10) return;
    setStoredToken(t);
    onReady();
  }

  async function tryDemo() {
    setDemoBusy(true);
    setDemoErr("");
    try {
      const data = await getDemoInvite();
      setStoredToken(data.invite_token);
      onReady();
    } catch (err: any) {
      setDemoErr(err?.message || "Demo unavailable");
    } finally {
      setDemoBusy(false);
    }
  }

  return (
    <div className="container">
      <header className="header">
        <div className="brand">Team Media Hub</div>
        <div className="sub">Private, invite-only team photo/video sharing</div>
      </header>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>A private place for your team's photos & videos</h2>

        <ul className="muted" style={{ marginTop: 8 }}>
          <li>Invite-only access</li>
          <li>Uploads stored privately (no public buckets)</li>
          <li>Short-lived signed links for viewing/downloading</li>
        </ul>

        <div style={{ marginTop: 18 }}>
          <button 
            className="btn primary" 
            onClick={tryDemo} 
            disabled={demoBusy}
            style={{ fontSize: "1.05rem", padding: "0.7rem 1.5rem" }}
          >
            {demoBusy ? "Loading..." : "Try Demo"}
          </button>
          {demoErr && <div style={{ color: "#ff4444", marginTop: 8 }}>{demoErr}</div>}
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="muted">
            To join a team, open the invite link your coach or team admin shared.
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <button className="btn" onClick={() => setShowManual(!showManual)}>
            {showManual ? "Hide" : "Have a token? Paste it"}
          </button>
        </div>

        {showManual ? (
          <div style={{ marginTop: 12 }}>
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

            <button
              className="btn link"
              onClick={() => {
                clearStoredToken();
                setToken("");
              }}
            >
              Clear saved token
            </button>
          </div>
        ) : null}
      </div>

      <footer className="footer muted">
        For demos: share a single invite link in TeamSnap/SportsEngine chat.
      </footer>
    </div>
  );
}
