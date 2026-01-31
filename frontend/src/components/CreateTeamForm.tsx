import React, { useState } from "react";

export function CreateTeamForm({ setupKey, onCreated }: { setupKey: string; onCreated: (token: string) => void }) {
  const [teamName, setTeamName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdTeam, setCreatedTeam] = useState<{token: string, teamCode: string, teamName: string} | null>(null);

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

      setCreatedTeam({
        token: json.admin_invite_token,
        teamCode: json.team_code,
        teamName: json.team_name
      });
    } catch (err: any) {
      setError(err?.message || "Failed to create team");
    } finally {
      setLoading(false);
    }
  }
  
  if (createdTeam) {
    return (
      <div style={{ marginTop: 16, padding: "20px", backgroundColor: "rgba(0,200,100,0.08)", borderRadius: "8px", border: "1px solid rgba(0,200,100,0.3)" }}>
        <h3 style={{ marginTop: 0, color: "#0a8" }}>✓ Team Created!</h3>
        
        <div style={{ marginBottom: 20 }}>
          <strong>Team Name:</strong> {createdTeam.teamName}
        </div>
        
        <div style={{ marginBottom: 20, padding: 16, background: "rgba(0,0,0,0.3)", borderRadius: 8 }}>
          <div style={{ marginBottom: 8, fontSize: 14, color: "#aaa" }}>
            <strong>Team Code</strong> (share with parents):
          </div>
          <div style={{ fontSize: 24, fontFamily: "monospace", letterSpacing: 2, fontWeight: "bold" }}>
            {createdTeam.teamCode}
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: "#888" }}>
            Parents use this code at <strong>/join</strong> to create accounts
          </div>
        </div>
        
        <button 
          className="btn primary" 
          onClick={() => onCreated(createdTeam.token)}
          style={{ width: "100%" }}
        >
          Continue as Admin
        </button>
      </div>
    );
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
