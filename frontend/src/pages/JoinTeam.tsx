import React, { useState } from "react";
import { request } from "../lib/api";
import { navigate, rememberLastTeam } from "../lib/navigation";
import { PublicNav } from "../components/PublicNav";

export function JoinTeam() {
  const [step, setStep] = useState<"email" | "verify">("email");
  const [email, setEmail] = useState("");
  const [teamCode, setTeamCode] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await request<{team_name: string}>("/auth/join-team", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          team_code: teamCode.trim().toUpperCase(),
        }),
      });

      setTeamName(res.team_name || "Team");
      setStep("verify");
    } catch (err: any) {
      setError(err.message || "Failed to send code");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await request<{session_token: string; team_id: string; user_id: string; team_name?: string}>("/auth/verify", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: verificationCode.trim(),
          team_code: teamCode.trim().toUpperCase(),
        }),
      });

      // Store session and team context
      localStorage.setItem("tmh_invite_token", res.session_token);
      localStorage.setItem("team_id", res.team_id);
      localStorage.setItem("tmh_current_team_id", res.team_id);
      localStorage.setItem("tmh_user_id", res.user_id);
      if (res.team_name) {
        localStorage.setItem("team_name", res.team_name);
      }
      rememberLastTeam(res.team_id);

      // Redirect to team feed (client-side navigation)
      navigate(`/team/${res.team_id}`);
    } catch (err: any) {
      setError(err.message || "Invalid code");
    } finally {
      setLoading(false);
    }
  }

  const content = step === "verify" ? (
    <div className="container" style={{ maxWidth: 480, margin: "80px auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>Check Your Email</h1>
      <p style={{ color: "#888", marginBottom: 32 }}>
        We sent a 6-digit code to <strong>{email}</strong>
      </p>

      <form onSubmit={handleVerify}>
        <div className="form-group">
          <label>Verification Code</label>
          <input
            type="text"
            className="input"
            placeholder="123456"
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value)}
            maxLength={6}
            pattern="[0-9]{6}"
            autoFocus
            required
          />
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: "100%", marginBottom: 12 }}>
          {loading ? "Verifying..." : `Join ${teamName}`}
        </button>

        <button
          type="button"
          className="btn"
          onClick={() => setStep("email")}
          style={{ width: "100%" }}
        >
          Back
        </button>
      </form>
    </div>
  ) : (
    <div className="container" style={{ maxWidth: 480, margin: "80px auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>Join Team</h1>
      <p style={{ color: "#888", marginBottom: 32 }}>
        Enter your email and team code to get started
      </p>

      <form onSubmit={handleRequestCode}>
        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            className="input"
            placeholder="parent@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label>Team Code</label>
          <input
            type="text"
            className="input"
            placeholder="DALLAS-11B"
            value={teamCode}
            onChange={(e) => setTeamCode(e.target.value.toUpperCase())}
            required
          />
          <small style={{ color: "#666", fontSize: 13 }}>
            Ask your coach for the team code
          </small>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Sending..." : "Continue"}
        </button>
      </form>
    </div>
  );

  return (
    <div>
      <PublicNav />
      {content}
    </div>
  );
}
