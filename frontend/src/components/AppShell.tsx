import React, { ReactNode } from "react";
import { getHomeRoute, navigate } from "../lib/navigation";
import { CoachTeamsDropdown } from "./CoachTeamsDropdown";
import { ParentSwitchTeamMenu } from "./ParentSwitchTeamMenu";

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
  const teamName = localStorage.getItem("team_name");
  const roleLabel = hasCoach ? "Coach" : (localStorage.getItem("tmh_role") || "Parent");

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
            <CoachTeamsDropdown />
          )}
          {hasParent && !hasCoach && (
            <ParentSwitchTeamMenu />
          )}
          <button className="appNavLink danger" onClick={onSignOut}>Sign Out</button>
        </div>
      </nav>
      <main className="appShellMain">{children}</main>
    </div>
  );
}
