import React, { useState, useEffect } from "react";
import { LandingPageNew } from "./pages/LandingPageNew";
import { Feed } from "./pages/Feed";
import { JoinTeam } from "./pages/JoinTeam";
import { CoachSignIn } from "./pages/CoachSignIn";
import { CoachVerify } from "./pages/CoachVerify";
import { CoachDashboard } from "./pages/CoachDashboard";
import { CreateTeamForm } from "./components/CreateTeamForm";
import { SetupKeyPrompt } from "./components/SetupKeyPrompt";
import { AppShell } from "./components/AppShell";
import { getCurrentToken } from "./lib/api";
import { getRedirectFromLanding, rememberLastTeam } from "./lib/navigation";

export default function App() {
  const [hasToken, setHasToken] = useState<boolean>(() => !!getCurrentToken());
  const [hasUserToken, setHasUserToken] = useState<boolean>(() => !!localStorage.getItem("tmh_user_token"));
  const [currentTeamId, setCurrentTeamId] = useState<string>(() => 
    localStorage.getItem("tmh_current_team_id") || localStorage.getItem("team_id") || ""
  );
  const [currentPage, setCurrentPage] = useState<string>(() => {
    const path = window.location.pathname;
    if (path === "/join") return "join";
    if (path === "/create-team") return "create-team";
    if (path === "/coach/setup-key") return "coach-setup-key";
    if (path === "/coach/signin") return "coach-signin";
    if (path === "/coach/verify") return "coach-verify";
    if (path === "/coach/dashboard") return "coach-dashboard";
    // If opening a team (has invite token + team_id), go to app even if coach is logged in
    const inviteToken = localStorage.getItem("tmh_invite_token");
    const teamId = localStorage.getItem("team_id");
    if (inviteToken && teamId) return "app";
    // Check if path is /team/:teamId
    if (path.startsWith("/team/")) return "app";
    // If coach is logged in but path is /, redirect to dashboard
    if (localStorage.getItem("tmh_user_token") && path === "/") return "coach-dashboard";
    return "app";
  });
  const [setupKey, setSetupKey] = useState<string>("");

  useEffect(() => {
    // Redirect authenticated users from "/" to their home
    const redirectPath = getRedirectFromLanding();
    if (redirectPath && redirectPath !== "/") {
      window.history.replaceState({}, "", redirectPath);
      // Will be handled by popstate below
    }
  }, []);

  useEffect(() => {
    // Simple client-side routing
    function handlePopState() {
      const path = window.location.pathname;
      const userToken = localStorage.getItem("tmh_user_token");
      const inviteToken = localStorage.getItem("tmh_invite_token");
      const teamId = localStorage.getItem("team_id");
      setHasUserToken(!!userToken);
      setHasToken(!!getCurrentToken()); // Re-check invite token when navigating
      
      if (path === "/join") {
        setCurrentPage("join");
      } else if (path === "/create-team") {
        setCurrentPage("create-team");
        setSetupKey(""); // Reset setup key when navigating to create-team
      } else if (path === "/coach/setup-key") {
        setCurrentPage("coach-setup-key");
        setSetupKey(""); // Reset setup key when navigating to coach-setup-key
      } else if (path === "/coach/signin") {
        setCurrentPage("coach-signin");
      } else if (path === "/coach/verify") {
        setCurrentPage("coach-verify");
      } else if (path === "/coach/dashboard") {
        setCurrentPage("coach-dashboard");
      } else if (path.startsWith("/team/")) {
        // Extract team ID from URL
        const teamIdFromUrl = path.split("/")[2];
        if (teamIdFromUrl) {
          localStorage.setItem("team_id", teamIdFromUrl);
          localStorage.setItem("tmh_current_team_id", teamIdFromUrl);
          rememberLastTeam(teamIdFromUrl);
          setCurrentTeamId(teamIdFromUrl); // Update state to trigger Feed remount
          console.log("[App] Restored team_id from URL:", teamIdFromUrl);
        }
        setCurrentPage("app");
      } else if (path === "/") {
        // Check if authenticated user should be redirected
        const redirectPath = getRedirectFromLanding();
        if (redirectPath && redirectPath !== "/") {
          window.history.replaceState({}, "", redirectPath);
          // Trigger another popstate to handle the redirect
          window.dispatchEvent(new PopStateEvent("popstate"));
          return;
        }
        // Not authenticated, show landing
        setCurrentPage("app");
      } else {
        // Default path: prioritize opening a team over dashboard
        if (inviteToken && teamId) {
          setCurrentPage("app");
        } else {
          // If coach is logged in without a team open, go to dashboard
          setCurrentPage(userToken ? "coach-dashboard" : "app");
        }
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function handleGlobalSignOut() {
    const hasInviteToken = !!localStorage.getItem("tmh_invite_token");
    if (hasInviteToken) {
      localStorage.removeItem("tmh_invite_token");
      localStorage.removeItem("team_id");
      localStorage.removeItem("tmh_current_team_id");
      localStorage.removeItem("tmh_role");
      localStorage.removeItem("team_name");
      localStorage.removeItem("tmh_coach_user_id");
      localStorage.removeItem("tmh_last_team_id");
    }
    if (localStorage.getItem("tmh_user_token")) {
      localStorage.removeItem("tmh_user_token");
      localStorage.removeItem("tmh_user_id");
      localStorage.removeItem("coach_signin_email");
      localStorage.removeItem("tmh_last_team_id");
    }
    window.history.pushState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
    setHasToken(false);
    setHasUserToken(false);
  }

  // Join page (no auth required)
  if (currentPage === "join") {
    return <JoinTeam />;
  }

  // Coach sign-in flow
  if (currentPage === "coach-signin") {
    return (
      <div style={{
        minHeight: "100vh",
        backgroundColor: "#0f0f1e",
        color: "#fff",
      }}>
        <CoachSignIn />
      </div>
    );
  }

  // Coach verify code
  if (currentPage === "coach-verify") {
    return (
      <div style={{
        minHeight: "100vh",
        backgroundColor: "#0f0f1e",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}>
        <CoachVerify />
      </div>
    );
  }

  // Coach dashboard
  if (currentPage === "coach-dashboard") {
    return (
      <AppShell currentPage={currentPage} onSignOut={handleGlobalSignOut}>
        <CoachDashboard />
      </AppShell>
    );
  }

  // Coach setup-key flow (authenticated coaches create teams here)
  if (currentPage === "coach-setup-key") {    // For coaches, skip setup key prompt if already verified
    // The backend will check coach_verified flag when creating team
    const userToken = localStorage.getItem("tmh_user_token");
    if (userToken) {
      // Coach is authenticated, skip setup key prompt
      return (
        <AppShell currentPage={currentPage} onSignOut={handleGlobalSignOut}>
          <div style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "calc(100vh - 64px)",
            padding: "20px",
          }}>
            <CreateTeamForm
              setupKey=""  // Empty setup key - backend skips validation for verified coaches
              onCreated={(token) => {
                localStorage.setItem("tmh_invite_token", token);
                setHasToken(true);
                window.history.pushState({}, "", "/");
                window.dispatchEvent(new PopStateEvent("popstate"));
                setCurrentPage("app");
              }}
              onCancel={() => {
                window.history.pushState({}, "", "/coach/dashboard");
                window.dispatchEvent(new PopStateEvent("popstate"));
                setCurrentPage("coach-dashboard");
              }}
            />
          </div>
        </AppShell>
      );
    }
    // Not a coach, show setup key prompt
    if (!setupKey) {
      return (
        <AppShell currentPage={currentPage} onSignOut={handleGlobalSignOut}>
          <div style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "calc(100vh - 64px)",
            padding: "20px",
          }}>
            <SetupKeyPrompt onSubmit={(key) => setSetupKey(key)} />
          </div>
        </AppShell>
      );
    }
    return (
      <AppShell currentPage={currentPage} onSignOut={handleGlobalSignOut}>
        <div style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "calc(100vh - 64px)",
          padding: "20px",
        }}>
          <CreateTeamForm
            setupKey={setupKey}
            onCreated={(token) => {
              localStorage.setItem("tmh_invite_token", token);
              setHasToken(true);
              window.history.pushState({}, "", "/");
              window.dispatchEvent(new PopStateEvent("popstate"));
              setCurrentPage("app");
            }}
          />
        </div>
      </AppShell>
    );
  }

  // Create team page (for parents, not authenticated)
  if (currentPage === "create-team") {
    if (!setupKey) {
      return (
        <div style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          backgroundColor: "#0f0f1e",
          color: "#fff",
        }}>
          <SetupKeyPrompt onSubmit={(key) => setSetupKey(key)} />
        </div>
      );
    }
    return (
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        backgroundColor: "#0f0f1e",
        color: "#fff",
        padding: "20px",
      }}>
        <CreateTeamForm
          setupKey={setupKey}
          onCreated={(token) => {
            localStorage.setItem("tmh_invite_token", token);
            window.history.pushState({}, "", "/");
            window.dispatchEvent(new PopStateEvent("popstate"));
            setCurrentPage("app");
            setHasToken(true);
          }}
        />
      </div>
    );
  }

  // App (requires auth)
  return hasToken ? (
    <AppShell currentPage={currentPage} onSignOut={handleGlobalSignOut}>
      <Feed key={currentTeamId} onLogout={() => setHasToken(false)} />
    </AppShell>
  ) : (
    <LandingPageNew onReady={() => setHasToken(true)} />
  );
}
