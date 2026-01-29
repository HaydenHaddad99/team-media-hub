import React, { useState } from "react";

export function CreateTeamForm({ setupKey, onCreated }: { setupKey: string; onCreated: (token: string) => void }) {
  const [teamName, setTeamName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    const name = teamName.trim();
    if (!name) return;

    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ""}/teams`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-setup-key": setupKey,
        },
        body: JSON.stringify({ team_name: name }),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!res.ok) {
        const msg = (json as any)?.error?.message || `Creation failed (${res.status})`;
        setError(msg);
        return;
      }

      onCreated(json.admin_invite_token);
    } catch (err: any) {
      setError(err?.message || "Failed to create team");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 16, padding: "16px", backgroundColor: "rgba(100,150,255,0.08)", borderRadius: "8px" }}>
      <h3 style={{ marginTop: 0 }}>Create a New Team</h3>
      <div className="row" style={{ marginBottom: 8 }}>
        <input
          className="input"
          placeholder="Team name (e.g., U-16 Girls Soccer)"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
        />
        <button className="btn primary" onClick={handleCreate} disabled={loading}>
          {loading ? "Creating…" : "Create"}
        </button>
      </div>
      {error && <div style={{ color: "#ff4444", fontSize: "0.9rem" }}>{error}</div>}
    </div>
  );
}
