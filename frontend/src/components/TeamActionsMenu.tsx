import React, { useState } from "react";

interface TeamActionsMenuProps {
  onRename: () => void;
  onDelete: () => void;
}

export function TeamActionsMenu({ onRename, onDelete }: TeamActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          backgroundColor: "transparent",
          border: "none",
          color: "#666",
          cursor: "pointer",
          fontSize: "20px",
          padding: "0",
          width: "32px",
          height: "32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "4px",
          transition: "background-color 0.2s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "rgba(0, 174, 255, 0.1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
        title="Team actions"
      >
        ⋯
      </button>

      {isOpen && (
        <>
          {/* Backdrop to close menu */}
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999,
            }}
            onClick={() => setIsOpen(false)}
          />
          
          {/* Menu dropdown */}
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: "8px",
              backgroundColor: "#1a1a1a",
              border: "1px solid rgba(0, 174, 255, 0.3)",
              borderRadius: "6px",
              minWidth: "150px",
              zIndex: 1000,
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
            }}
          >
            <button
              onClick={() => {
                setIsOpen(false);
                onRename();
              }}
              style={{
                display: "block",
                width: "100%",
                padding: "12px 16px",
                backgroundColor: "transparent",
                border: "none",
                color: "#00aeff",
                cursor: "pointer",
                fontSize: "14px",
                textAlign: "left",
                borderBottom: "1px solid rgba(0, 174, 255, 0.1)",
                transition: "background-color 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(0, 174, 255, 0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              Rename Team
            </button>
            <button
              onClick={() => {
                setIsOpen(false);
                onDelete();
              }}
              style={{
                display: "block",
                width: "100%",
                padding: "12px 16px",
                backgroundColor: "transparent",
                border: "none",
                color: "#ff8888",
                cursor: "pointer",
                fontSize: "14px",
                textAlign: "left",
                transition: "background-color 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255, 136, 136, 0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              Delete Team
            </button>
          </div>
        </>
      )}
    </div>
  );
}
