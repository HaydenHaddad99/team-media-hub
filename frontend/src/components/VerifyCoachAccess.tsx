import React, { useState } from "react";

interface VerifyCoachAccessProps {
  onVerified: () => void;
}

export function VerifyCoachAccess({ onVerified }: VerifyCoachAccessProps) {
  const [setupKey, setSetupKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!setupKey.trim()) {
      setError("Setup key is required");
      return;
    }

    setIsLoading(true);
    try {
      const userToken = localStorage.getItem("tmh_user_token");
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/coach/verify-access`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-token": userToken || "",
          },
          body: JSON.stringify({ setup_key: setupKey.trim() }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || data.message || "Failed to verify access");
      }

      // Success - call onVerified callback
      onVerified();
    } catch (ex: any) {
      const message = ex?.message || "Failed to verify access";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      style={{
        padding: "32px",
        backgroundColor: "rgba(255, 255, 255, 0.03)",
        border: "2px solid rgba(255, 152, 0, 0.3)",
        borderRadius: "8px",
        marginBottom: "24px",
      }}
    >
      <h2
        style={{
          margin: "0 0 12px 0",
          color: "#ff9800",
          fontSize: "20px",
        }}
      >
        Verify Coach Access
      </h2>
      <p
        style={{
          margin: "0 0 20px 0",
          color: "#ccc",
          fontSize: "14px",
          lineHeight: "1.6",
        }}
      >
        To create teams and manage your dashboard, please verify your coach access
        by entering the setup key. You only need to do this once.
      </p>

      <form onSubmit={handleSubmit}>
        <input
          type="password"
          value={setupKey}
          onChange={(e) => setSetupKey(e.target.value)}
          placeholder="Enter setup key"
          disabled={isLoading}
          autoFocus
          style={{
            width: "100%",
            padding: "12px",
            marginBottom: "16px",
            backgroundColor: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(255, 152, 0, 0.3)",
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
              marginBottom: "16px",
              fontSize: "13px",
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          style={{
            padding: "12px 24px",
            backgroundColor: "#ff9800",
            color: "#000",
            border: "none",
            borderRadius: "6px",
            cursor: isLoading ? "not-allowed" : "pointer",
            fontSize: "14px",
            fontWeight: "600",
            opacity: isLoading ? 0.6 : 1,
          }}
        >
          {isLoading ? "Verifying..." : "Verify Access"}
        </button>
      </form>
    </div>
  );
}
