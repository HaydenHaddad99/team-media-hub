import { useState, useEffect } from "react";

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
    } catch (err: any) {
      setError(err.message || "Failed to load teams");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenTeam(team: Team) {
    // Store the invite token and team context
    localStorage.setItem("tmh_invite_token", team.invite_token);
    localStorage.setItem("team_id", team.team_id);
    // Keep user_id available so Feed can track uploads properly
    const userToken = localStorage.getItem("tmh_user_token");
    if (userToken) {
      const userId = localStorage.getItem("tmh_user_id");
      if (userId) {
        localStorage.setItem("tmh_coach_user_id", userId);
      }
    }
    
    // Navigate to app
    window.history.pushState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  function handleSignOut() {
    localStorage.removeItem("tmh_user_token");
    localStorage.removeItem("tmh_user_id");
    localStorage.removeItem("coach_signin_email");
    
    window.history.pushState({}, "", "/");
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
          <button
            onClick={handleSignOut}
            style={{
              padding: "8px 16px",
              backgroundColor: "#333",
              color: "#aaa",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "500",
              transition: "all 0.3s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#444";
              e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#333";
              e.currentTarget.style.color = "#aaa";
            }}
          >
            Sign Out
          </button>
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
            {teams.map((team) => (
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
                }}>
                  {team.team_name}
                </h3>

                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px",
                }}>
                  <span style={{
                    fontSize: "13px",
                    color: "#666",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}>
                    Role: {team.role}
                  </span>
                </div>

                <button
                  onClick={() => handleOpenTeam(team)}
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
