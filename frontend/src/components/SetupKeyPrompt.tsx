import React, { useState } from "react";

export function SetupKeyPrompt({ onSubmit }: { onSubmit: (setupKey: string) => void }) {
  const [setupKey, setSetupKey] = useState("");
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
    <div style={{ 
      padding: "32px", 
      backgroundColor: "rgba(100,150,255,0.08)", 
      borderRadius: "12px",
      maxWidth: "500px",
      width: "100%"
    }}>
      <h3 style={{ marginTop: 0, color: "#fff", fontSize: "24px" }}>Enter Setup Key</h3>
      <p style={{ color: "#aaa", fontSize: "0.95rem", marginBottom: "24px" }}>
        The setup key is required to create new teams.
      </p>
      <div style={{ display: "flex", gap: "12px" }}>
        <input
          style={{
            flex: 1,
            padding: "12px 16px",
            backgroundColor: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "6px",
            color: "#fff",
            fontSize: "14px",
          }}
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
        <button 
          onClick={handleSubmit}
          style={{
            padding: "12px 24px",
            backgroundColor: "#00aeff",
            color: "#000",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "600",
          }}
        >
          Continue
        </button>
      </div>
      {error && <div style={{ color: "#ff4444", fontSize: "0.9rem", marginTop: 12 }}>{error}</div>}
      <button 
        onClick={() => {
          window.history.pushState({}, "", "/coach/dashboard");
          window.dispatchEvent(new PopStateEvent("popstate"));
        }}
        style={{
          marginTop: "16px",
          background: "none",
          border: "none",
          color: "#aaa",
          cursor: "pointer",
          fontSize: "14px",
          textDecoration: "underline",
        }}
      >
        Cancel
      </button>
    </div>
  );
}
