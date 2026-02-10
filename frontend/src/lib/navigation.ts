/**
 * Determines the "home" destination for authenticated users based on their role and context.
 * This ensures users never get dumped to "/" inappropriately.
 */
export function getHomeRoute(): string {
  const hasCoachToken = !!localStorage.getItem("tmh_user_token");
  const hasInviteToken = !!localStorage.getItem("tmh_invite_token");
  const lastTeamId = localStorage.getItem("tmh_last_team_id");
  const currentTeamId = localStorage.getItem("tmh_current_team_id") || localStorage.getItem("team_id");

  // Priority 1: Coach always goes to dashboard (even if they also have team access)
  if (hasCoachToken) {
    return "/coach/dashboard";
  }

  // Priority 2: Parent with active team context goes to that team
  if (hasInviteToken && currentTeamId) {
    return `/team/${currentTeamId}`;
  }

  // Priority 3: Parent with session but no team goes to join flow
  if (hasInviteToken) {
    return "/join";
  }

  // Default: Public landing page
  return "/";
}

/**
 * Navigate to a route using client-side navigation (no reload).
 */
export function navigate(path: string) {
  // Check if already on this path to avoid unnecessary navigation
  if (window.location.pathname === path) {
    return;
  }
  
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/**
 * Store the last visited team ID for returning later.
 */
export function rememberLastTeam(teamId: string) {
  localStorage.setItem("tmh_last_team_id", teamId);
  localStorage.setItem("tmh_current_team_id", teamId);
}

/**
 * Check if user should be redirected from public landing (/).
 * Returns the redirect path or null if no redirect needed.
 */
export function getRedirectFromLanding(): string | null {
  const path = window.location.pathname;
  
  // Only redirect if currently on "/"
  if (path !== "/") {
    return null;
  }

  const hasCoachToken = !!localStorage.getItem("tmh_user_token");
  const hasInviteToken = !!localStorage.getItem("tmh_invite_token");

  // If authenticated, redirect to home
  if (hasCoachToken || hasInviteToken) {
    return getHomeRoute();
  }

  return null;
}
