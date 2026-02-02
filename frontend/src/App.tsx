import React, { useState, useEffect } from "react";
import { LandingPageNew } from "./pages/LandingPageNew";
import { Feed } from "./pages/Feed";
import { JoinTeam } from "./pages/JoinTeam";
import { CreateTeamForm } from "./components/CreateTeamForm";
import { SetupKeyPrompt } from "./components/SetupKeyPrompt";
import { getCurrentToken } from "./lib/api";

export default function App() {
  const [hasToken, setHasToken] = useState<boolean>(() => !!getCurrentToken());
  const [currentPage, setCurrentPage] = useState<string>(() => {
    const path = window.location.pathname;
    if (path === "/join") return "join";
    if (path === "/create-team") return "create-team";
    return "app";
  });
  const [setupKey, setSetupKey] = useState<string>("");

  useEffect(() => {
    // Simple client-side routing
    function handlePopState() {
      const path = window.location.pathname;
      if (path === "/join") {
        setCurrentPage("join");
      } else if (path === "/create-team") {
        setCurrentPage("create-team");
      } else {
        setCurrentPage("app");
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Join page (no auth required)
  if (currentPage === "join") {
    return <JoinTeam />;
  }

  // Create team page (needs setup key)
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
    <Feed onLogout={() => setHasToken(false)} />
  ) : (
    <LandingPageNew onReady={() => setHasToken(true)} />
  );
}
