import { useState, useEffect } from "react";
import { TeamActionsMenu } from "../components/TeamActionsMenu";
import { RenameTeamModal } from "../components/RenameTeamModal";
import { DeleteTeamModal } from "../components/DeleteTeamModal";
import { VerifyCoachAccess } from "../components/VerifyCoachAccess";
import { rememberLastTeam } from "../lib/navigation";

interface Team {
  team_id: string;
  team_name: string;
  role: string;
  invite_token: string;
}

export function CoachDashboard() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [coachVerified, setCoachVerified] = useState(false);
  
  // Modal states
  const [renameModal, setRenameModal] = useState<{ teamId: string; teamName: string } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ teamId: string; teamName: string } | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
      const email = localStorage.getItem("coach_signin_email") || "";
      setUserEmail(email);
    fetchTeams();
  }, []);

  async function fetchTeams() {
    try {
      const userToken = localStorage.getItem("tmh_user_token");
      if (!userToken) {
        window.history.pushState({}, "", "/coach/signin");
        window.dispatchEvent(new PopStateEvent("popstate"));
        return;
      }

      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ""}/coach/teams`, {
        headers: {
          "x-user-token": userToken,
        },
      });

      if (!res.ok) {
        throw new Error("Failed to fetch teams");
      }

      const data = await res.json();
      setTeams(data.teams || []);
      setCoachVerified(data.coach_verified || false);
    } catch (err: any) {
      setError(err.message || "Failed to load teams");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenTeam(team: Team) {
    console.log("[CoachDashboard] Opening team:", {
      team_id: team.team_id,
      team_name: team.team_name,
      invite_token: team.invite_token?.substring(0, 20) + "...",
    });
    
    // Store the invite token and team context
    localStorage.setItem("tmh_invite_token", team.invite_token);
    localStorage.setItem("team_id", team.team_id);
    localStorage.setItem("team_name", team.team_name);
    localStorage.setItem("tmh_role", team.role);
    rememberLastTeam(team.team_id);
    console.log("[CoachDashboard] Stored invite_token and team_id in localStorage");
    
    // Keep user_id available so Feed can track uploads properly
    const userToken = localStorage.getItem("tmh_user_token");
    if (userToken) {
      const userId = localStorage.getItem("tmh_user_id");
      if (userId) {
        localStorage.setItem("tmh_coach_user_id", userId);
        console.log("[CoachDashboard] Stored coach_user_id for upload tracking");
      }
    }
    
    // Navigate to team URL
    console.log(`[CoachDashboard] Navigating to /team/${team.team_id}`);
    window.history.pushState({}, "", `/team/${team.team_id}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        backgroundColor: "#0f0f1e",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <p>Loading your teams...</p>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#0f0f1e",
      color: "#fff",
      padding: "40px 20px",
    }}>
      <div style={{ maxWidth: "600px", margin: "0 auto" }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "40px",
        }}>
          <div>
            <h1 style={{ margin: 0, color: "#00aeff" }}>Your Teams</h1>
            {userEmail && (
              <p style={{
                margin: "8px 0 0 0",
                fontSize: "14px",
                color: "#888",
              }}>
                Signed in as {userEmail}
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              onClick={() => {
                window.history.pushState({}, "", "/coach/setup-key");
                window.dispatchEvent(new PopStateEvent("popstate"));
              }}
              disabled={!coachVerified}
              style={{
                padding: "8px 16px",
                backgroundColor: coachVerified ? "#00aeff" : "#555",
                color: coachVerified ? "#000" : "#888",
                border: "none",
                borderRadius: "6px",
                cursor: coachVerified ? "pointer" : "not-allowed",
                fontSize: "14px",
                fontWeight: "600",
                transition: "all 0.3s ease",
                opacity: coachVerified ? 1 : 0.6,
              }}
              onMouseEnter={(e) => {
                if (coachVerified) {
                  e.currentTarget.style.backgroundColor = "#33beff";
                }
              }}
              onMouseLeave={(e) => {
                if (coachVerified) {
                  e.currentTarget.style.backgroundColor = "#00aeff";
                }
              }}
            >
              Create Team
            </button>
          </div>
        </div>

        {error && (
          <div style={{
            padding: "16px",
            backgroundColor: "rgba(255, 100, 100, 0.1)",
            border: "1px solid #ff6464",
            borderRadius: "8px",
            color: "#ff8888",
            marginBottom: "30px",
          }}>
            {error}
          </div>
        )}

        {!coachVerified && (
          <VerifyCoachAccess onVerified={() => {
            setCoachVerified(true);
            fetchTeams();
          }} />
        )}

        {teams.length === 0 ? (
          <div style={{
            padding: "40px",
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(0, 174, 255, 0.1)",
            borderRadius: "8px",
            textAlign: "center",
          }}>
            <p style={{ color: "#aaa", marginBottom: "20px" }}>
              You don't manage any teams yet.
            </p>
            <button
              onClick={() => {
                window.history.pushState({}, "", "/coach/setup-key");
                window.dispatchEvent(new PopStateEvent("popstate"));
              }}
              style={{
                padding: "12px 24px",
                backgroundColor: "#00aeff",
                color: "#000",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "600",
              }}
            >
              Create a Team
            </button>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "20px",
          }}>
            {/* Check if roles differ across teams */}
            {(() => {
              const uniqueRoles = new Set(teams.map(t => t.role));
              const hasMultipleRoles = uniqueRoles.size > 1;
              
              return teams.map((team) => (
              <div
                key={team.team_id}
                style={{
                  padding: "24px",
                  backgroundColor: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(0, 174, 255, 0.2)",
                  borderRadius: "8px",
                  transition: "all 0.3s ease",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "rgba(0, 174, 255, 0.6)";
                  e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.06)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(0, 174, 255, 0.2)";
                  e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.03)";
                }}
              >
                <h3 style={{
                  margin: "0 0 12px 0",
                  color: "#00aeff",
                  fontSize: "18px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {team.team_name}
                    {hasMultipleRoles && (
                      <span style={{
                        fontSize: "10px",
                        padding: "2px 6px",
                        backgroundColor: "rgba(0, 174, 255, 0.15)",
                        color: "#00aeff",
                        borderRadius: "4px",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        fontWeight: "600",
                      }}>
                        {team.role}
                      </span>
                    )}
                  </span>
                  {coachVerified && (
                    <TeamActionsMenu
                      onRename={() => setRenameModal({ teamId: team.team_id, teamName: team.team_name })}
                      onDelete={() => setDeleteModal({ teamId: team.team_id, teamName: team.team_name })}
                    />
                  )}
                </h3>

                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleOpenTeam(team);
                  }}
                  style={{
                    width: "100%",
                    padding: "12px",
                    backgroundColor: "rgba(0, 174, 255, 0.2)",
                    color: "#00aeff",
                    border: "1px solid rgba(0, 174, 255, 0.4)",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "600",
                    transition: "all 0.3s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(0, 174, 255, 0.3)";
                    e.currentTarget.style.borderColor = "rgba(0, 174, 255, 0.6)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(0, 174, 255, 0.2)";
                    e.currentTarget.style.borderColor = "rgba(0, 174, 255, 0.4)";
                  }}
                >
                  Open Team
                </button>
              </div>
              ));
            })()}
          </div>
        )}

        {renameModal && (
          <RenameTeamModal
            teamId={renameModal.teamId}
            currentName={renameModal.teamName}
            onClose={() => setRenameModal(null)}
            onSuccess={(newName) => {
              const updatedTeams = teams.map((t) =>
                t.team_id === renameModal.teamId ? { ...t, team_name: newName } : t
              );
              setTeams(updatedTeams);
            }}
            onError={(err) => setModalError(err)}
          />
        )}

        {deleteModal && (
          <DeleteTeamModal
            teamId={deleteModal.teamId}
            teamName={deleteModal.teamName}
            onClose={() => setDeleteModal(null)}
            onSuccess={() => {
              const updatedTeams = teams.filter((t) => t.team_id !== deleteModal.teamId);
              setTeams(updatedTeams);
            }}
            onError={(err) => setModalError(err)}
          />
        )}
      </div>
    </div>
  );
}
