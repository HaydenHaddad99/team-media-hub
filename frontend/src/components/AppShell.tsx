import React, { ReactNode } from "react";
import { getHomeRoute, navigate } from "../lib/navigation";

function getContextTitle(hasCoach: boolean, hasParent: boolean, teamName: string | null) {
  if (hasParent && teamName) return teamName;
  if (hasCoach) return "Coach Dashboard";
  return "Team Media Hub";
}

export function AppShell({
  children,
  currentPage,
  onSignOut,
}: {
  children: ReactNode;
  currentPage: string;
  onSignOut: () => void;
}) {
  const hasCoach = !!localStorage.getItem("tmh_user_token");
  const hasParent = !!localStorage.getItem("tmh_invite_token");
  const teamId = localStorage.getItem("team_id");
  const teamName = localStorage.getItem("team_name");
  const roleLabel = hasCoach ? "Coach" : (localStorage.getItem("tmh_role") || "Parent");

  const showTeamLink = hasParent && !!teamId;
  const isCoachPage = currentPage.startsWith("coach-");
  const contextTitle = getContextTitle(hasCoach, hasParent, teamName);

  return (
    <div className="appShell">
      <nav className="appNav">
        <button className="appNavBrand" onClick={() => navigate(getHomeRoute())}>TMH</button>
        <div className="appNavContext">
          <div className="appNavTitle">{contextTitle}</div>
          <div className="appNavBadge">{roleLabel}</div>
        </div>
        <div className="appNavLinks">
          {hasCoach && (
            <button
              className={`appNavLink ${isCoachPage ? "active" : ""}`}
              onClick={() => navigate("/coach/dashboard")}
            >
              Dashboard
            </button>
          )}
          {showTeamLink && teamId && (
            <button
              className={`appNavLink ${currentPage === "app" ? "active" : ""}`}
              onClick={() => navigate(`/team/${teamId}`)}
            >
              Current Team
            </button>
          )}
          <button className="appNavLink danger" onClick={onSignOut}>Sign Out</button>
        </div>
      </nav>
      <main className="appShellMain">{children}</main>
    </div>
  );
}
