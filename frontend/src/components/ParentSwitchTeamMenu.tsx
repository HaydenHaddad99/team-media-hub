import React, { useState } from "react";
import { navigate } from "../lib/navigation";

export function ParentSwitchTeamMenu() {
  const [open, setOpen] = useState(false);
  const currentTeamId = localStorage.getItem("tmh_current_team_id");
  const teamName = localStorage.getItem("team_name");

  return (
    <div style={{ position: "relative" }}>
      <button
        className="appNavLink"
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        Switch ▼
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
            minWidth: 180,
            zIndex: 50,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
          }}
        >
          {currentTeamId && (
            <>
              <button
                onClick={() => {
                  navigate(`/team/${currentTeamId}`);
                  setOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "10px 16px",
                  background: "rgba(0, 170, 255, 0.15)",
                  border: "none",
                  color: "inherit",
                  textAlign: "left",
                  fontSize: 14,
                  cursor: "pointer",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                }}
              >
                ✓ {teamName || "Current Team"}
              </button>
            </>
          )}

          <button
            onClick={() => {
              navigate("/join");
              setOpen(false);
            }}
            style={{
              display: "block",
              width: "100%",
              padding: "10px 16px",
              background: "transparent",
              border: "none",
              color: "inherit",
              textAlign: "left",
              fontSize: 14,
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(0, 170, 255, 0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            {currentTeamId ? "Join Another Team" : "Join Team"}
          </button>
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
