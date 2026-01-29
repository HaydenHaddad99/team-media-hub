import React, { useState } from "react";

export function SetupKeyPrompt({ onSubmit }: { onSubmit: (setupKey: string) => void }) {
  const [setupKey, setSetupKey] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  function handleSubmit() {
    const key = setupKey.trim();
    if (key.length < 10) {
      setError("Setup key must be at least 10 characters");
      return;
    }
    setError("");
    onSubmit(key);
  }

  return (
    <div style={{ marginTop: 16 }}>
      {!showForm ? (
        <button className="btn" onClick={() => setShowForm(true)}>
          Create Team
        </button>
      ) : (
        <div style={{ marginTop: 12, padding: "16px", backgroundColor: "rgba(100,150,255,0.08)", borderRadius: "8px" }}>
          <h3 style={{ marginTop: 0 }}>Enter Setup Key</h3>
          <p className="muted" style={{ fontSize: "0.9rem" }}>
            The setup key is required to create new teams.
          </p>
          <div className="row">
            <input
              className="input"
              placeholder="Enter setup key…"
              type="password"
              value={setupKey}
              onChange={(e) => {
                setSetupKey(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              autoFocus
            />
            <button className="btn primary" onClick={handleSubmit}>
              Continue
            </button>
          </div>
          {error && <div style={{ color: "#ff4444", fontSize: "0.9rem", marginTop: 8 }}>{error}</div>}
          <button className="btn link" onClick={() => setShowForm(false)} style={{ marginTop: 8 }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
