import React, { useState } from "react";
import { request, lookupTeams, TeamSummary } from "../lib/api";
import { navigate, rememberLastTeam } from "../lib/navigation";
import { PublicNav } from "../components/PublicNav";

type Step = "email" | "verify";

export function JoinTeam() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [teamCode, setTeamCode] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [teamName, setTeamName] = useState("");
  const [foundTeams, setFoundTeams] = useState<TeamSummary[] | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<TeamSummary | null>(null);
  const [showManualCode, setShowManualCode] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Resolve which team code to use for the request
  const resolvedTeamCode = selectedTeam?.team_code ?? teamCode;

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // First time on email step: look up known teams for this email
      if (foundTeams === null) {
        const teams = await lookupTeams(email.trim().toLowerCase());
        setFoundTeams(teams);

        if (teams.length === 1) {
          // Auto-select the single team — skip picker
          setSelectedTeam(teams[0]);
          await sendCode(email.trim().toLowerCase(), teams[0].team_code);
          return;
        }

        if (teams.length > 1) {
          // Show picker — user picks, then clicks Continue again
          setLoading(false);
          return;
        }

        // No known teams — show manual code entry
        setShowManualCode(true);
        setLoading(false);
        return;
      }

      // User already saw the picker or manual entry — proceed to send code
      const code = resolvedTeamCode.trim().toUpperCase();
      if (!code) {
        setError("Please enter your team code.");
        setLoading(false);
        return;
      }
      await sendCode(email.trim().toLowerCase(), code);
    } catch (err: any) {
      setError(networkAwareMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function sendCode(emailVal: string, code: string) {
    const res = await request<{ team_name: string }>("/auth/join-team", {
      method: "POST",
      body: JSON.stringify({ email: emailVal, team_code: code }),
    });
    setTeamName(res.team_name || "Team");
    setStep("verify");
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await request<{
        session_token: string;
        team_id: string;
        user_id: string;
        team_name?: string;
      }>("/auth/verify", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: verificationCode.trim(),
          team_code: resolvedTeamCode.trim().toUpperCase(),
        }),
      });

      localStorage.setItem("tmh_invite_token", res.session_token);
      localStorage.setItem("team_id", res.team_id);
      localStorage.setItem("tmh_current_team_id", res.team_id);
      localStorage.setItem("tmh_user_id", res.user_id);
      if (res.team_name) {
        localStorage.setItem("team_name", res.team_name);
      }
      rememberLastTeam(res.team_id);
      navigate(`/team/${res.team_id}`);
    } catch (err: any) {
      setError(networkAwareMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function networkAwareMessage(err: any): string {
    const msg: string = err?.message || "";
    const isNetwork =
      msg === "Load failed" ||
      msg === "Failed to fetch" ||
      msg === "NetworkError when attempting to fetch resource.";
    return isNetwork ? "Connection error — please try again." : msg || "Something went wrong";
  }

  const title = step === "verify" ? "Check Your Email" : "Access Your Team";
  const description =
    step === "verify"
      ? `We sent a 6-digit code to ${email}.`
      : "Enter your email to get a one-time sign-in code.";

  const emailStepContent = (
    <section className="joinTeamCard" aria-labelledby="join-team-title">
      <div className="joinTeamCardHeader">
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
            onChange={(e) => {
              setEmail(e.target.value);
              // Reset lookup state if they change their email
              setFoundTeams(null);
              setSelectedTeam(null);
              setShowManualCode(false);
            }}
            required
          />
        </div>

        {/* Multi-team picker */}
        {foundTeams && foundTeams.length > 1 && (
          <div className="joinTeamField">
            <label className="joinTeamLabel">Select your team</label>
            <div className="joinTeamTeamPicker">
              {foundTeams.map((team) => (
                <button
                  key={team.team_id}
                  type="button"
                  className={`btn${selectedTeam?.team_id === team.team_id ? " primary" : ""}`}
                  onClick={() => setSelectedTeam(team)}
                >
                  {team.team_name}
                  {selectedTeam?.team_id === team.team_id && " ✓"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Single team found — show confirmation */}
        {foundTeams && foundTeams.length === 1 && !loading && (
          <div className="joinTeamField">
            <p className="muted joinTeamFoundTeam">
              We found your team: <strong>{foundTeams[0].team_name}</strong>
            </p>
          </div>
        )}

        {/* Manual team code entry for new users */}
        {showManualCode && (
          <div className="joinTeamField">
            <label className="joinTeamLabel">Team Code</label>
            <input
              type="text"
              className="input joinTeamInput"
              placeholder="DALLAS-11B"
              value={teamCode}
              onChange={(e) => setTeamCode(e.target.value.toUpperCase())}
              required
              autoFocus
            />
            <small className="joinTeamHint">Ask your coach for the team code</small>
          </div>
        )}

        {error && <div className="joinTeamError">{error}</div>}

        <button
          type="submit"
          className="btn btn-primary joinTeamButton"
          disabled={loading || (foundTeams !== null && foundTeams.length > 1 && !selectedTeam)}
        >
          {loading ? "Please wait..." : "Continue"}
        </button>
      </form>
    </section>
  );

  const verifyStepContent = (
    <section className="joinTeamCard" aria-labelledby="join-team-title">
      <div className="joinTeamCardHeader">
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

        {error && <div className="joinTeamError">{error}</div>}

        <button type="submit" className="btn btn-primary joinTeamButton" disabled={loading}>
          {loading ? "Verifying..." : `Join ${teamName}`}
        </button>

        <button
          type="button"
          className="btn joinTeamButton joinTeamSecondaryButton"
          onClick={() => {
            setStep("email");
            setVerificationCode("");
            setError("");
          }}
        >
          Back
        </button>
      </form>
    </section>
  );

  return (
    <div className="joinTeamPage">
      <PublicNav />
      <div className="joinTeamCenter">
        {step === "verify" ? verifyStepContent : emailStepContent}
      </div>
    </div>
  );
}
