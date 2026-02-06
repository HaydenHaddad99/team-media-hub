import React, { useState } from "react";

interface DeleteTeamModalProps {
  teamId: string;
  teamName: string;
  onClose: () => void;
  onSuccess: () => void;
  onError: (error: string) => void;
}

export function DeleteTeamModal({
  teamId,
  teamName,
  onClose,
  onSuccess,
  onError,
}: DeleteTeamModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  async function handleDelete() {
    if (confirmText !== "DELETE") {
      setError('Please type "DELETE" to confirm');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem("invite_token");
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/teams/${teamId}`,
        {
          method: "DELETE",
          headers: {
            "x-invite-token": token || "",
          },
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete team");
      }

      onSuccess();
      onClose();
    } catch (ex: any) {
      const message = ex?.message || "Failed to delete team";
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
          border: "1px solid rgba(255, 136, 136, 0.3)",
          borderRadius: "12px",
          padding: "32px",
          maxWidth: "400px",
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            margin: "0 0 16px 0",
            color: "#ff8888",
            fontSize: "20px",
          }}
        >
          Delete Team
        </h2>

        <p
          style={{
            margin: "0 0 16px 0",
            color: "#ccc",
            fontSize: "14px",
            lineHeight: "1.5",
          }}
        >
          Are you sure you want to delete <strong>{teamName}</strong>? This
          action cannot be undone. All team members will lose access to this
          team's media.
        </p>

        <div
          style={{
            marginBottom: "20px",
          }}
        >
          <label
            style={{
              display: "block",
              marginBottom: "8px",
              color: "#999",
              fontSize: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Type "DELETE" to confirm:
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            disabled={isLoading}
            autoFocus
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 136, 136, 0.3)",
              borderRadius: "6px",
              color: "#fff",
              fontSize: "14px",
              boxSizing: "border-box",
              opacity: isLoading ? 0.6 : 1,
              cursor: isLoading ? "not-allowed" : "text",
            }}
          />
        </div>

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
            onClick={handleDelete}
            disabled={isLoading || confirmText !== "DELETE"}
            style={{
              padding: "10px 20px",
              backgroundColor: "#ff8888",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor:
                isLoading || confirmText !== "DELETE"
                  ? "not-allowed"
                  : "pointer",
              fontSize: "14px",
              fontWeight: "600",
              opacity: isLoading || confirmText !== "DELETE" ? 0.6 : 1,
            }}
          >
            {isLoading ? "Deleting..." : "Delete Team"}
          </button>
        </div>
      </div>
    </div>
  );
}
