import React, { useState } from "react";

interface RenameTeamModalProps {
  teamId: string;
  currentName: string;
  onClose: () => void;
  onSuccess: (newName: string) => void;
  onError: (error: string) => void;
}

export function RenameTeamModal({
  teamId,
  currentName,
  onClose,
  onSuccess,
  onError,
}: RenameTeamModalProps) {
  const [newName, setNewName] = useState(currentName);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!newName.trim()) {
      setError("Team name cannot be empty");
      return;
    }

    if (newName.trim() === currentName) {
      onClose();
      return;
    }

    setIsLoading(true);
    try {
      const token = localStorage.getItem("invite_token");
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/teams/${teamId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-invite-token": token || "",
          },
          body: JSON.stringify({ team_name: newName.trim() }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || data.message || "Failed to rename team");
      }

      const data = await response.json();
      const updatedName = data?.team_name || newName.trim();
      onSuccess(updatedName);
      onClose();
    } catch (ex: any) {
      const message = ex?.message || "Failed to rename team";
      setError(message);
      onError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#0a0a0a",
          border: "1px solid rgba(0, 174, 255, 0.3)",
          borderRadius: "12px",
          padding: "32px",
          maxWidth: "400px",
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            margin: "0 0 24px 0",
            color: "#00aeff",
            fontSize: "20px",
          }}
        >
          Rename Team
        </h2>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New team name"
            disabled={isLoading}
            autoFocus
            style={{
              width: "100%",
              padding: "12px",
              marginBottom: "20px",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(0, 174, 255, 0.3)",
              borderRadius: "6px",
              color: "#fff",
              fontSize: "14px",
              boxSizing: "border-box",
              opacity: isLoading ? 0.6 : 1,
              cursor: isLoading ? "not-allowed" : "text",
            }}
          />

          {error && (
            <div
              style={{
                color: "#ff8888",
                marginBottom: "20px",
                fontSize: "13px",
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              style={{
                padding: "10px 20px",
                backgroundColor: "rgba(255, 255, 255, 0.05)",
                color: "#999",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "6px",
                cursor: isLoading ? "not-allowed" : "pointer",
                fontSize: "14px",
                opacity: isLoading ? 0.6 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              style={{
                padding: "10px 20px",
                backgroundColor: "#00aeff",
                color: "#000",
                border: "none",
                borderRadius: "6px",
                cursor: isLoading ? "not-allowed" : "pointer",
                fontSize: "14px",
                fontWeight: "600",
                opacity: isLoading ? 0.6 : 1,
              }}
            >
              {isLoading ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
