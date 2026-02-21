import React, { useState } from "react";
import { navigate } from "../lib/navigation";

export function ParentSwitchTeamMenu() {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 480);
  const currentTeamId = localStorage.getItem("tmh_current_team_id");
  const teamName = localStorage.getItem("team_name");
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const selectRef = React.useRef<HTMLSelectElement>(null);
  const [dropdownStyle, setDropdownStyle] = React.useState<React.CSSProperties>({});

  // Track window size to switch between mobile/desktop
  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 480);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Position dropdown with collision detection
  React.useEffect(() => {
    if (open && buttonRef.current && !isMobile) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownWidth = 220;
      const viewportWidth = window.innerWidth;
      const padding = 16;

      const style: React.CSSProperties = {
        position: "fixed",
        top: rect.bottom + 4,
        background: "rgba(15, 18, 28, 0.98)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: 8,
        minWidth: 180,
        maxWidth: "min(220px, calc(100vw - 32px))",
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
  }, [open, isMobile]);

  // Handle native select change on mobile
  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === "current") {
      navigate(`/team/${currentTeamId}`);
    } else if (value === "join") {
      navigate("/join");
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
          Switch ▼
        </option>
        {currentTeamId && (
          <option value="current">✓ {teamName || "Current Team"}</option>
        )}
        <option value="join">
          {currentTeamId ? "Join Another Team" : "Join Team"}
        </option>
      </select>
    );
  }

  // Desktop: render custom dropdown with collision detection
  return (
    <div>
      <button
        ref={buttonRef}
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
        <div style={dropdownStyle}>
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
            zIndex: 9998,
          }}
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  );
}
