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
      const msg: string = err.message || "";
      const isNetworkError = msg === "Load failed" || msg === "Failed to fetch" || msg === "NetworkError when attempting to fetch resource.";
      setError(isNetworkError ? "Connection error — please try again." : msg || "Failed to send code");
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
      const msg: string = err.message || "";
      const isNetworkError = msg === "Load failed" || msg === "Failed to fetch" || msg === "NetworkError when attempting to fetch resource.";
      setError(isNetworkError ? "Connection error — please try again." : msg || "Invalid code");
    } finally {
      setLoading(false);
    }
  }

  const title = step === "verify" ? "Check Your Email" : "Join Your Team";
  const description =
    step === "verify"
      ? `We sent a 6-digit code to ${email}. Enter it below to open your team feed.`
      : "Use your email and team code to access your team's private photos and videos.";

  const content = step === "verify" ? (
    <section className="joinTeamCard" aria-labelledby="join-team-title">
      <div className="joinTeamCardHeader">
        <span className="joinTeamEyebrow">Secure Access</span>
        <h1 id="join-team-title" className="joinTeamTitle">{title}</h1>
        <p className="joinTeamDescription">{description}</p>
      </div>

      <form className="joinTeamForm" onSubmit={handleVerify}>
        <div className="joinTeamField">
          <label className="joinTeamLabel">Verification Code</label>
          <input
            type="text"
            className="input joinTeamInput"
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
          <div className="joinTeamError">{error}</div>
        )}

        <button type="submit" className="btn btn-primary joinTeamButton" disabled={loading}>
          {loading ? "Verifying..." : `Join ${teamName}`}
        </button>

        <button
          type="button"
          className="btn joinTeamButton joinTeamSecondaryButton"
          onClick={() => setStep("email")}
        >
          Back
        </button>
      </form>
    </section>
  ) : (
    <section className="joinTeamCard" aria-labelledby="join-team-title">
      <div className="joinTeamCardHeader">
        <span className="joinTeamEyebrow">Private Family Feed</span>
        <h1 id="join-team-title" className="joinTeamTitle">{title}</h1>
        <p className="joinTeamDescription">{description}</p>
      </div>

      <form className="joinTeamForm" onSubmit={handleRequestCode}>
        <div className="joinTeamField">
          <label className="joinTeamLabel">Email</label>
          <input
            type="email"
            className="input joinTeamInput"
            placeholder="parent@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="joinTeamField">
          <label className="joinTeamLabel">Team Code</label>
          <input
            type="text"
            className="input joinTeamInput"
            placeholder="DALLAS-11B"
            value={teamCode}
            onChange={(e) => setTeamCode(e.target.value.toUpperCase())}
            required
          />
          <small className="joinTeamHint">
            Ask your coach for the team code
          </small>
        </div>

        {error && (
          <div className="joinTeamError">{error}</div>
        )}

        <button type="submit" className="btn btn-primary joinTeamButton" disabled={loading}>
          {loading ? "Sending..." : "Continue"}
        </button>
      </form>
    </section>
  );

  return (
    <div className="joinTeamPage">
      <PublicNav />
      <div className="joinTeamCenter">
        <div className="joinTeamLayout">
          <section className="joinTeamIntro" aria-label="Join team introduction">
            <span className="joinTeamIntroBadge">Team Media Hub</span>
            <h2 className="joinTeamIntroTitle">Fast access for parents and family members.</h2>
            <p className="joinTeamIntroText">
              Enter your team code, verify your email, and open a private feed built for sharing game-day photos,
              videos, and updates without juggling group texts.
            </p>
            <ul className="joinTeamIntroList">
              <li>One-time verification code sent to your email</li>
              <li>Private access scoped to the team your coach invited you to</li>
              <li>Works on phone, tablet, and desktop</li>
            </ul>
          </section>
          {content}
        </div>
      </div>
    </div>
  );
}
