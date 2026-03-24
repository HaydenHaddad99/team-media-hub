import React, { useState } from "react";

interface VerifyCoachAccessProps {
  onVerified: () => void;
}

export function VerifyCoachAccess({ onVerified }: VerifyCoachAccessProps) {
  const [setupKey, setSetupKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [sportLevel, setSportLevel] = useState("");
  const [organization, setOrganization] = useState("");
  const [phone, setPhone] = useState("");
  const [requestError, setRequestError] = useState<string | null>(null);

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

  function handleRequestAccess(e: React.FormEvent) {
    e.preventDefault();
    setRequestError(null);

    if (!fullName.trim() || !teamName.trim() || !sportLevel.trim() || !organization.trim()) {
      setRequestError("Please fill out your name, team name, sport/level, and organization.");
      return;
    }

    const email = localStorage.getItem("coach_signin_email") || "";
    const subject = `Coach setup key request - ${teamName.trim()}`;
    const body = [
      "Hello Team Media Hub Support,",
      "",
      "I am requesting coach verification and a setup key.",
      "",
      `Name: ${fullName.trim()}`,
      `Email: ${email || "(not provided)"}`,
      `Team Name: ${teamName.trim()}`,
      `Sport / Level: ${sportLevel.trim()}`,
      `Organization / League / School: ${organization.trim()}`,
      `Phone (optional): ${phone.trim() || "(not provided)"}`,
      "",
      "Thank you,",
      fullName.trim(),
    ].join("\n");

    const mailto = `mailto:support@teammediahub.co?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
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

        <button
          type="button"
          onClick={() => {
            setShowRequestForm((prev) => !prev);
            setRequestError(null);
          }}
          style={{
            marginLeft: "12px",
            padding: "12px 20px",
            backgroundColor: "transparent",
            color: "#ffd18a",
            border: "1px solid rgba(255, 209, 138, 0.45)",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "600",
          }}
        >
          {showRequestForm ? "Hide Request Form" : "Request Setup Key"}
        </button>
      </form>

      {showRequestForm && (
        <form
          onSubmit={handleRequestAccess}
          style={{
            marginTop: "20px",
            paddingTop: "20px",
            borderTop: "1px solid rgba(255, 152, 0, 0.25)",
            display: "grid",
            gap: "12px",
          }}
        >
          <p
            style={{
              margin: 0,
              color: "#bbb",
              fontSize: "13px",
              lineHeight: "1.6",
            }}
          >
            Don&apos;t have a setup key yet? Submit this form and we&apos;ll open an email draft to support with your details.
          </p>

          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your full name"
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 152, 0, 0.3)",
              borderRadius: "6px",
              color: "#fff",
              fontSize: "14px",
              boxSizing: "border-box",
            }}
          />

          <input
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="Team name"
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 152, 0, 0.3)",
              borderRadius: "6px",
              color: "#fff",
              fontSize: "14px",
              boxSizing: "border-box",
            }}
          />

          <input
            type="text"
            value={sportLevel}
            onChange={(e) => setSportLevel(e.target.value)}
            placeholder="Sport and level (example: Baseball U12)"
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 152, 0, 0.3)",
              borderRadius: "6px",
              color: "#fff",
              fontSize: "14px",
              boxSizing: "border-box",
            }}
          />

          <input
            type="text"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            placeholder="League, school, or organization"
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 152, 0, 0.3)",
              borderRadius: "6px",
              color: "#fff",
              fontSize: "14px",
              boxSizing: "border-box",
            }}
          />

          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone number (optional)"
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 152, 0, 0.3)",
              borderRadius: "6px",
              color: "#fff",
              fontSize: "14px",
              boxSizing: "border-box",
            }}
          />

          {requestError && (
            <div
              style={{
                color: "#ff8888",
                fontSize: "13px",
              }}
            >
              {requestError}
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <button
              type="submit"
              style={{
                padding: "11px 18px",
                backgroundColor: "#ffd18a",
                color: "#1d1d1d",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "700",
              }}
            >
              Email Support Request
            </button>
            <a
              href="mailto:support@teammediahub.co"
              style={{
                padding: "11px 18px",
                backgroundColor: "transparent",
                color: "#9fdcff",
                border: "1px solid rgba(159, 220, 255, 0.4)",
                borderRadius: "6px",
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: "600",
              }}
            >
              Open Support Email
            </a>
          </div>
        </form>
      )}
    </div>
  );
}
