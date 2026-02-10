import React, { useState, useEffect } from "react";
import { navigate } from "../lib/navigation";

interface Team {
  team_id: string;
  team_name: string;
}

export function CoachTeamsDropdown() {
  const [open, setOpen] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentTeamId = localStorage.getItem("tmh_current_team_id");

  function fetchTeams() {
    if (loading) return;
    
    setLoading(true);
    setError(null);

    const userToken = localStorage.getItem("tmh_user_token");
    if (!userToken) {
      setError("No user token found");
      setLoading(false);
      return;
    }

    const apiUrl = `${import.meta.env.VITE_API_BASE_URL || ""}/coach/teams`;
    console.log("[CoachTeamsDropdown] Fetching teams from:", apiUrl);
    console.log("[CoachTeamsDropdown] Token:", userToken?.substring(0, 20) + "...");

    fetch(apiUrl, {
      headers: { "x-user-token": userToken },
    })
      .then((res) => {
        console.log("[CoachTeamsDropdown] Response status:", res.status);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return res.json();
      })
      .then((data) => {
        console.log("[CoachTeamsDropdown] Teams loaded:", data.teams);
        setTeams(data.teams || []);
        if (!data.teams || data.teams.length === 0) {
          setError("No teams found");
        }
      })
      .catch((err) => {
        console.error("[CoachTeamsDropdown] Fetch error:", err);
        setError(err.message || "Failed to load teams");
        setTeams([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }

  function handleTeamClick(teamId: string, teamName: string) {
    localStorage.setItem("tmh_current_team_id", teamId);
    localStorage.setItem("team_id", teamId);
    localStorage.setItem("team_name", teamName);
    localStorage.setItem("tmh_last_team_id", teamId);

    navigate(`/team/${teamId}`);
    setOpen(false);
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        className="appNavLink"
        onClick={() => {
          if (!open && teams.length === 0) {
            fetchTeams();
          }
          setOpen(!open);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        Teams {teams.length > 0 && <span style={{ fontSize: 12 }}>▼</span>}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            background: "rgba(15, 18, 28, 0.98)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: 8,
            minWidth: 200,
            maxWidth: 250,
            maxHeight: 300,
            overflowY: "auto",
            zIndex: 50,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
          }}
        >
          {loading && (
            <div style={{ padding: "12px 16px", fontSize: 12, color: "#888" }}>
              Loading...
            </div>
          )}

          {error && (
            <div style={{ padding: "12px 16px", fontSize: 12, color: "#f88" }}>
              {error}
            </div>
          )}

          {!loading && teams.length === 0 && (
            <div style={{ padding: "12px 16px", fontSize: 12, color: "#888" }}>
              No teams
            </div>
          )}

          {teams.map((team) => (
            <button
              key={team.team_id}
              onClick={() => handleTeamClick(team.team_id, team.team_name)}
              style={{
                display: "block",
                width: "100%",
                padding: "10px 16px",
                background:
                  team.team_id === currentTeamId
                    ? "rgba(0, 170, 255, 0.15)"
                    : "transparent",
                border: "none",
                color: "inherit",
                textAlign: "left",
                fontSize: 14,
                cursor: "pointer",
                borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(0, 170, 255, 0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  team.team_id === currentTeamId
                    ? "rgba(0, 170, 255, 0.15)"
                    : "transparent";
              }}
            >
              {team.team_name}
            </button>
          ))}
        </div>
      )}

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 40,
          }}
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  );
}
