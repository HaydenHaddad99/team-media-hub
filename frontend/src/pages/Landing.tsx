import React, { useEffect, useState } from "react";
import {
  getTokenFromUrl,
  setStoredToken,
  getCurrentToken,
  clearStoredToken,
  getDemoInvite,
} from "../lib/api";
import { SetupKeyPrompt } from "../components/SetupKeyPrompt";
import { CreateTeamForm } from "../components/CreateTeamForm";

export function Landing({ onReady }: { onReady: () => void }) {
  const [token, setToken] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoErr, setDemoErr] = useState("");
  const [setupKey, setSetupKey] = useState<string>(() => localStorage.getItem("tmh_setup_key") || "");
  const [showCreateTeam, setShowCreateTeam] = useState(false);

  // Token detection for "Continue where you left off"
  const hasCoach = !!localStorage.getItem("tmh_user_token");
  const hasParent = !!localStorage.getItem("tmh_invite_token");
  const teamId = localStorage.getItem("team_id");

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

  // If user has tokens, show "Continue" view instead of marketing landing
  if (hasCoach || hasParent) {
    return (
      <div className="container">
        <header className="header">
          <div className="brand">Team Media Hub</div>
          <div className="sub">Private, invite-only team photo/video sharing</div>
        </header>

        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Welcome back!</h2>
          <p className="muted" style={{ marginBottom: 24 }}>Continue where you left off</p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {hasCoach && (
              <button
                className="btn primary"
                onClick={() => {
                  window.history.pushState({}, "", "/coach/dashboard");
                  window.dispatchEvent(new PopStateEvent("popstate"));
                }}
                style={{ fontSize: "1.05rem", padding: "0.7rem 1.5rem" }}
              >
                → Go to Coach Dashboard
              </button>
            )}
            {hasParent && teamId && (
              <button
                className="btn primary"
                onClick={() => {
                  window.history.pushState({}, "", `/team/${teamId}`);
                  window.dispatchEvent(new PopStateEvent("popstate"));
                }}
                style={{ fontSize: "1.05rem", padding: "0.7rem 1.5rem" }}
              >
                → Open Team Gallery
              </button>
            )}
          </div>

          <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid #333" }}>
            <p className="muted" style={{ fontSize: "0.9rem" }}>Or continue signing in below...</p>
          </div>
        </div>

        <footer className="footer muted">
          For demos: share a single invite link in TeamSnap/SportsEngine chat.
        </footer>
      </div>
    );
  }

  // Anonymous user - show marketing landing

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
        <h2 style={{ marginTop: 0 }}>A private place for your team&apos;s photos &amp; videos</h2>

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
          <button 
            className="btn secondary" 
            onClick={() => {
              window.history.pushState({}, "", "/join");
              window.dispatchEvent(new PopStateEvent("popstate"));
            }}
            style={{ marginRight: 8 }}
          >
            Join with Team Code
          </button>
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

        {setupKey ? (
          <>
            {showCreateTeam && <CreateTeamForm setupKey={setupKey} onCreated={(inviteToken) => {
              setStoredToken(inviteToken);
              onReady();
            }} />}
            {!showCreateTeam && (
              <button className="btn" onClick={() => setShowCreateTeam(true)} style={{ marginTop: 14 }}>
                Create Team
              </button>
            )}
          </>
        ) : (
          <SetupKeyPrompt onSubmit={(key) => {
            localStorage.setItem("tmh_setup_key", key);
            setSetupKey(key);
          }} />
        )}
      </div>

      <footer className="footer muted">
        For demos: share a single invite link in TeamSnap/SportsEngine chat.
      </footer>
    </div>
  );
}
