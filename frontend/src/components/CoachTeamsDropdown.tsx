import React, { useState, useEffect } from "react";
import { navigate } from "../lib/navigation";

interface Team {
  team_id: string;
  team_name: string;
  invite_token?: string;
}

export function CoachTeamsDropdown() {
  const [open, setOpen] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 480);
  const currentTeamId = localStorage.getItem("tmh_current_team_id");
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const selectRef = React.useRef<HTMLSelectElement>(null);
  const [dropdownStyle, setDropdownStyle] = React.useState<React.CSSProperties>({});

  // Track window size
  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 480);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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

  function handleTeamClick(teamId: string, teamName: string, inviteToken?: string) {
    // Store team context
    localStorage.setItem("tmh_current_team_id", teamId);
    localStorage.setItem("team_id", teamId);
    localStorage.setItem("team_name", teamName);
    localStorage.setItem("tmh_last_team_id", teamId);
    
    // UPDATE: Store the admin invite token for this team so API calls use the correct team
    if (inviteToken) {
      localStorage.setItem("tmh_invite_token", inviteToken);
    }

    navigate(`/team/${teamId}`);
    setOpen(false);
  }

  // Position dropdown with collision detection for desktop
  React.useEffect(() => {
    if (open && buttonRef.current && !isMobile && teams.length > 0) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownWidth = 280;
      const viewportWidth = window.innerWidth;
      const padding = 16;

      const style: React.CSSProperties = {
        position: "fixed",
        top: rect.bottom + 4,
        background: "rgba(15, 18, 28, 0.98)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: 8,
        minWidth: 200,
        maxWidth: "min(280px, calc(100vw - 32px))",
        maxHeight: "min(300px, 60vh)",
        overflowY: "auto" as const,
        zIndex: 9999,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
      };

      if (rect.right + dropdownWidth + padding > viewportWidth) {
        // Flip to left side if it would overflow right
        style.left = Math.max(padding, rect.left - dropdownWidth - 8);
      } else {
        // Align to right
        style.right = viewportWidth - rect.right;
      }

      setDropdownStyle(style);
    }
  }, [open, isMobile, teams.length]);

  // Handle native select change on mobile
  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const teamId = e.target.value;
    if (teamId) {
      const team = teams.find(t => t.team_id === teamId);
      if (team) {
        handleTeamClick(team.team_id, team.team_name, team.invite_token);
      }
    }
    // Reset select
    if (selectRef.current) {
      selectRef.current.value = "";
    }
  };

  // Mobile: render native select
  if (isMobile) {
    return (
      <select
        ref={selectRef}
        className="appNavLink"
        onChange={handleSelectChange}
        onClick={() => {
          if (teams.length === 0) {
            fetchTeams();
          }
        }}
        style={{
          appearance: "none",
          WebkitAppearance: "none",
          MozAppearance: "none",
          display: "flex",
          alignItems: "center",
          gap: 4,
          cursor: "pointer",
        }}
        defaultValue=""
      >
        <option value="" disabled>
          Teams {teams.length > 0 ? "▼" : ""}
        </option>
        {teams.map((team) => (
          <option key={team.team_id} value={team.team_id}>
            {team.team_id === currentTeamId ? "✓ " : ""}{team.team_name}
          </option>
        ))}
      </select>
    );
  }

  // Desktop: render custom dropdown with collision detection
  return (
    <div>
      <button
        ref={buttonRef}
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
        <div style={dropdownStyle}>
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
              onClick={() => handleTeamClick(team.team_id, team.team_name, team.invite_token)}
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
