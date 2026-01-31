import React, { useState, useEffect } from "react";
import { Landing } from "./pages/Landing";
import { Feed } from "./pages/Feed";
import { JoinTeam } from "./pages/JoinTeam";
import { getCurrentToken } from "./lib/api";

export default function App() {
  const [hasToken, setHasToken] = useState<boolean>(() => !!getCurrentToken());
  const [currentPage, setCurrentPage] = useState<string>(() => {
    const path = window.location.pathname;
    if (path === "/join") return "join";
    return "app";
  });

  useEffect(() => {
    // Simple client-side routing
    function handlePopState() {
      const path = window.location.pathname;
      if (path === "/join") {
        setCurrentPage("join");
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

  // App (requires auth)
  return hasToken ? (
    <Feed onLogout={() => setHasToken(false)} />
  ) : (
    <Landing onReady={() => setHasToken(true)} />
  );
}
