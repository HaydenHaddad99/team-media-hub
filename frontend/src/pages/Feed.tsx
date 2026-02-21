import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { listMedia, MediaItem, clearStoredToken, getMe, MeResponse, presignDownload, deleteMedia, getUploaderIdentifier, createBillingCheckoutSession, upgradeBillingSubscription, createBillingPortalSession } from "../lib/api";
import { getHomeRoute, navigate } from "../lib/navigation";
import { UploadButton } from "../components/UploadButton";
import { MediaGrid } from "../components/MediaGrid";

export function Feed({ onLogout }: { onLogout: () => void }) {
  // Get team_id from URL params
  const { team_id: urlTeamId } = useParams<{ team_id?: string }>();
  
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [albumFilter, setAlbumFilter] = useState<string>("all");
  const [selectMode, setSelectMode] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [me, setMe] = useState<MeResponse | null>(null);
  const [meErr, setMeErr] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showLeaveModal, setShowLeaveModal] = useState<boolean>(false);
  const [showBillingModal, setShowBillingModal] = useState<boolean>(false);
  const [billingBusy, setBillingBusy] = useState<boolean>(false);
  const [billingMsg, setBillingMsg] = useState<string | null>(null);

  const role = me?.invite?.role || "viewer";
  const canUpload = role === "uploader" || role === "admin";
  const isAdmin = role === "admin";
  const isCoach = !!localStorage.getItem("tmh_user_token");
  const canManageBilling = isCoach && isAdmin;  // Only coaches with admin role can manage billing
  const teamId = me?.team?.team_id || "";

  // Get unique albums from items
  const albums = Array.from(new Set(items.map(i => i.album_name || "All uploads"))).sort();
  
  // Filter items by selected album
  const filteredItems = albumFilter === "all" 
    ? items 
    : items.filter(i => (i.album_name || "All uploads") === albumFilter);

  // Get storage limit from team data (or default to 10 GB if not available)
  const fallbackLimitBytes = (me?.team?.storage_limit_gb || 10) * 1024 * 1024 * 1024;
  const storageLimitBytes = me?.team?.storage_limit_bytes || fallbackLimitBytes;
  const storageLimitGB = Math.round(storageLimitBytes / (1024 * 1024 * 1024));
  const usedBytes = me?.team?.used_bytes || 0;
  const usagePercent = Math.min(100, (usedBytes / storageLimitBytes) * 100);
  const usedGB = usedBytes / (1024 * 1024 * 1024);
  const usageText = usedGB < 0.01 
    ? `${(usedBytes / (1024 * 1024)).toFixed(1)} MB` 
    : `${usedGB.toFixed(2)} GB`;
  const limitText = `${storageLimitGB} GB`;

  async function refresh() {
    try {
      setErr(null);
      setLoading(true);
      const res = await listMedia({ limit: 30 });
      setItems(res.items || []);
      setNextCursor(res.next_cursor || null);
    } catch (ex: any) {
      setErr(ex?.message || "Failed to load media");
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    try {
      setErr(null);
      setLoadingMore(true);
      const res = await listMedia({ limit: 30, cursor: nextCursor });
      setItems(prev => [...prev, ...(res.items || [])]);
      setNextCursor(res.next_cursor || null);
    } catch (ex: any) {
      setErr(ex?.message || "Failed to load more media");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleUploadComplete() {
    // After upload, switch to "All albums" view so users can see new uploads
    setAlbumFilter("all");
    await refresh();
  }

  // Silent refresh used for thumbnail polling to avoid UI flicker
  async function pollRefresh() {
    try {
      const res = await listMedia({ limit: 30 });
      setItems(res.items || []);
      setNextCursor(res.next_cursor || null);
    } catch (ex: any) {
      // ignore transient errors during polling
    }
  }

  async function loadMe() {
    try {
      setMeErr(null);
      const res = await getMe();
      setMe(res);
      if (res?.team?.team_id) {
        localStorage.setItem("team_id", res.team.team_id);
        localStorage.setItem("tmh_current_team_id", res.team.team_id);
      }
      if (res?.team?.team_name) {
        localStorage.setItem("team_name", res.team.team_name);
      }
      if (res?.invite?.role) {
        localStorage.setItem("tmh_role", res.invite.role);
      }
      // Store user_id if available (for authenticated parents who joined via email/verify)
      if ((res as any)?.user_id) {
        localStorage.setItem("tmh_user_id", (res as any).user_id);
      }
    } catch (ex: any) {
      setMeErr(ex?.message || "Failed to load team info");
    }
  }

  useEffect(() => {
    loadMe();
    refresh();
    // Get current user identifier (token hash for parents, user_id for coaches)
    getUploaderIdentifier().then(setCurrentUserId);
  }, [urlTeamId]);

  // Reset album filter when switching teams
  useEffect(() => {
    setAlbumFilter("all");
    setSelectedIds(new Set());
  }, [urlTeamId]);

  // If selection mode turns off or items change drastically, ensure selections stay valid
  useEffect(() => {
    if (!selectMode && selectedIds.size > 0) {
      setSelectedIds(new Set());
    }
  }, [selectMode]);

  useEffect(() => {
    // prune selections that are no longer in the filtered list
    const validIds = new Set(filteredItems.map(i => i.media_id));
    const next = new Set<string>();
    selectedIds.forEach(id => { if (validIds.has(id)) next.add(id); });
    if (next.size !== selectedIds.size) setSelectedIds(next);
  }, [filteredItems]);

  function handleExitTeam() {
    const isCoach = !!localStorage.getItem("tmh_user_token");
    
    if (isCoach) {
      // Coaches: Exit team view and return to dashboard
      // Clear only team context, keep coach session
      localStorage.removeItem("team_id");
      localStorage.removeItem("tmh_current_team_id");
      localStorage.removeItem("team_name");
      localStorage.removeItem("tmh_role");
      localStorage.removeItem("tmh_invite_token");
      localStorage.removeItem("tmh_coach_user_id");
      
      navigate("/coach/dashboard");
    } else {
      // Parents: Show confirmation modal
      setShowLeaveModal(true);
    }
  }

  function confirmLeaveTeam() {
    // Clear team context but keep parent's invite token for potential other teams
    localStorage.removeItem("team_id");
    localStorage.removeItem("tmh_current_team_id");
    localStorage.removeItem("team_name");
    localStorage.removeItem("tmh_role");
    
    setShowLeaveModal(false);
    navigate(getHomeRoute());
  }

  function toggleSelect(item: MediaItem) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(item.media_id)) next.delete(item.media_id);
      else next.add(item.media_id);
      return next;
    });
  }

  async function downloadSelected() {
    if (selectedIds.size === 0) return;
    try {
      setErr(null);
      // fetch presigned URLs sequentially and open in new tabs
      for (const id of Array.from(selectedIds)) {
        const res = await presignDownload(id);
        // best-effort: open in new tab; browsers may block multiple tabs
        window.open(res.download_url, "_blank");
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (ex: any) {
      setErr(ex?.message || "Failed to download selection");
    }
  }

  async function deleteSelected() {
    if (selectedIds.size === 0 || !canUpload) return;
    const yes = window.confirm(`Delete ${selectedIds.size} selected item(s)? This cannot be undone.`);
    if (!yes) return;
    try {
      setErr(null);
      const ids = Array.from(selectedIds);
      // delete sequentially to reduce load
      for (const id of ids) {
        await deleteMedia(id);
      }
      setSelectedIds(new Set());
      await refresh();
    } catch (ex: any) {
      setErr(ex?.message || "Failed to delete selection");
    }
  }

  async function startCheckout(tier: "plus" | "pro") {
    const teamId = me?.team?.team_id || "";
    if (!teamId) return;

    try {
      setBillingBusy(true);
      setErr(null);
      setBillingMsg(null);

      const res = await createBillingCheckoutSession({ team_id: teamId, tier });
      if (res?.url) {
        window.location.href = res.url;
        return;
      }
      setErr("Checkout session did not return a URL.");
    } catch (ex: any) {
      setErr(ex?.message || "Billing request failed");
    } finally {
      setBillingBusy(false);
    }
  }

  async function upgradeToPro() {
    const teamId = me?.team?.team_id || "";
    if (!teamId) return;

    try {
      setBillingBusy(true);
      setErr(null);
      setBillingMsg("Upgrade requested. You'll see the new plan shortly...");
      await upgradeBillingSubscription({ team_id: teamId, tier: "pro" });

      // Close modal and refresh after webhook has time to apply
      setShowBillingModal(false);
      setTimeout(() => loadMe(), 3000);
      setTimeout(() => loadMe(), 7000);
    } catch (ex: any) {
      setErr(ex?.message || "Upgrade failed");
    } finally {
      setBillingBusy(false);
    }
  }

  async function openBillingPortal() {
    const teamId = me?.team?.team_id || "";
    if (!teamId) return;

    try {
      setBillingBusy(true);
      setErr(null);
      const res = await createBillingPortalSession({ team_id: teamId });
      if (res?.url) {
        window.location.href = res.url;
        return;
      }
      setErr("Portal session did not return a URL.");
    } catch (ex: any) {
      setErr(ex?.message || "Failed to open billing portal");
    } finally {
      setBillingBusy(false);
    }
  }

  // Auto-refresh while any photo lacks a thumbnail, up to a short window
  useEffect(() => {
    if (loading) return;

    const missingThumb = items.some(i => !i.thumb_url && !i.content_type.startsWith("video/"));
    if (!missingThumb) return;

    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      pollRefresh();
      if (attempts >= 6) {  // Reduced from 10 to 6 attempts
        window.clearInterval(interval);
      }
    }, 5000);  // Increased from 3000 to 5000ms (5 seconds)

    return () => {
      window.clearInterval(interval);
    };
  }, [items, loading]);

  return (
    <div className="container">
      <header className="header rowBetween">
        <div>
          <div className="brand">Team Code</div>
          <div className="sub">
            Role: <b>{role}</b>
          </div>
          {me?.team?.team_code ? (
            <div style={{ marginTop: 12, padding: 12, background: "rgba(255,255,255,0.04)", borderRadius: 8, maxWidth: 400 }}>
              <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: 1.5, marginBottom: 6 }}>
                {me.team.team_code}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Parents can join using this code.
              </div>
            </div>
          ) : (
            <div className="muted" style={{ marginTop: 12 }}>
              Team code not available.
            </div>
          )}
          {meErr ? <div className="error">{meErr}</div> : null}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            className="btn"
            onClick={handleExitTeam}
          >
            {isCoach ? "Exit Team" : "Leave Team"}
          </button>
        </div>
      </header>

      <div className="panel">
        <div className="rowBetween" style={{ flexWrap: "wrap", gap: 12 }}>
          <h2 style={{ margin: 0 }}>Uploads</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {(albums.length > 1 || (canUpload && items.length > 0)) && (
              <select 
                className="input" 
                value={albumFilter} 
                onChange={(e) => setAlbumFilter(e.target.value)}
                style={{ minWidth: 120, maxWidth: 150 }}
              >
                <option value="all">All albums</option>
                {albums.map(album => (
                  <option key={album} value={album}>{album}</option>
                ))}
              </select>
            )}
            <button
              className="btn secondary"
              onClick={() => setSelectMode(s => !s)}
            >
              {selectMode ? "Done" : "Select"}
            </button>
            <button className="btn" onClick={refresh} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {canUpload ? (
          <UploadButton onUploaded={handleUploadComplete} defaultAlbum={albumFilter === "all" ? "" : albumFilter} />
        ) : (
          <div className="muted" style={{ marginTop: 10 }}>
            You can view and download media. Ask the team admin for an uploader link if you need to upload.
          </div>
        )}

        {/* Storage limit indicator with plan info */}
        {me?.team && (
          <div style={{ marginTop: 16, padding: 12, background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
            {/* Status Badge */}
            {(() => {
              const plan = me.team.plan || "free";
              const status = me.team.subscription_status;
              const cancelAtPeriodEnd = me.team.cancel_at_period_end;
              const currentPeriodEnd = me.team.current_period_end;
              const pastDueSince = me.team.past_due_since;
              
              let badgeText = "";
              let badgeColor = "rgba(0, 200, 100, 0.8)";  // Green for active
              let badgeBackground = "rgba(0, 200, 100, 0.15)";
              let showWarning = false;
              let warningText = "";
              
              if (plan !== "free" && status === "active" && !cancelAtPeriodEnd) {
                badgeText = "Active";
              } else if (plan !== "free" && status === "active" && cancelAtPeriodEnd && currentPeriodEnd) {
                const endDate = new Date(currentPeriodEnd * 1000).toLocaleDateString();
                badgeText = `Cancels on ${endDate}`;
                badgeColor = "rgba(255, 140, 0, 0.9)";
                badgeBackground = "rgba(255, 140, 0, 0.15)";
                showWarning = true;
                warningText = `Your subscription will end on ${endDate}. You'll be downgraded to Free (10GB).`;
              } else if (status === "past_due") {
                badgeText = "Past due";
                badgeColor = "rgba(255, 60, 60, 0.9)";
                badgeBackground = "rgba(255, 60, 60, 0.15)";
                showWarning = true;
                if (pastDueSince) {
                  const daysPastDue = Math.floor((Date.now() / 1000 - pastDueSince) / 86400);
                  const daysLeft = Math.max(0, 7 - daysPastDue);
                  warningText = `Payment failed. Uploads will be blocked in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} if not resolved.`;
                } else {
                  warningText = "Payment failed. Please update your payment method.";
                }
              } else if (status === "canceled" || plan === "free") {
                badgeText = plan === "free" ? "Free Plan" : "Canceled";
                badgeColor = "rgba(150, 150, 150, 0.8)";
                badgeBackground = "rgba(150, 150, 150, 0.15)";
              } else if (status === "trialing") {
                badgeText = "Trial";
                badgeColor = "rgba(0, 170, 255, 0.9)";
                badgeBackground = "rgba(0, 170, 255, 0.15)";
              }
              
              return (
                <>
                  {badgeText && (
                    <div style={{ marginBottom: 12 }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 10px",
                          fontSize: 11,
                          fontWeight: 600,
                          color: badgeColor,
                          background: badgeBackground,
                          borderRadius: 4,
                          border: `1px solid ${badgeColor.replace('0.9', '0.3')}`,
                        }}
                      >
                        {badgeText}
                      </span>
                    </div>
                  )}
                  {showWarning && warningText && (
                    <div
                      style={{
                        marginBottom: 12,
                        padding: 10,
                        fontSize: 12,
                        color: "rgba(255, 200, 100, 1)",
                        background: "rgba(255, 140, 0, 0.1)",
                        border: "1px solid rgba(255, 140, 0, 0.3)",
                        borderRadius: 6,
                      }}
                    >
                      ⚠️ {warningText}
                    </div>
                  )}
                </>
              );
            })()}
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
                  <span className="muted">Storage used</span>
                  <span style={{ opacity: 0.9 }}>{usageText} / {limitText}</span>
                </div>
                <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
                  <div 
                    style={{ 
                      height: "100%", 
                      width: `${usagePercent}%`, 
                      background: usagePercent > 80 ? "rgba(255, 140, 0, 0.7)" : "rgba(0, 170, 255, 0.6)",
                      transition: "width 0.3s ease"
                    }} 
                  />
                </div>
              </div>
              {canManageBilling && (
                <button
                  onClick={() => {
                    const plan = me?.team?.plan || "free";
                    if (plan === "free") {
                      setShowBillingModal(true);
                    } else {
                      // For paid plans, open billing portal to manage
                      openBillingPortal();
                    }
                  }}
                  disabled={billingBusy}
                  style={{
                    padding: "8px 12px",
                    marginLeft: 12,
                    background: "rgba(0, 170, 255, 0.2)",
                    border: "1px solid rgba(0, 170, 255, 0.4)",
                    borderRadius: 6,
                    color: "rgba(0, 170, 255, 0.9)",
                    fontSize: 12,
                    cursor: billingBusy ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                    opacity: billingBusy ? 0.6 : 1,
                  }}
                >
                  {billingBusy ? "Loading..." : (me.team.plan === "free" || !me.team.plan) ? "Upgrade" : "Manage billing"}
                </button>
              )}
              {!canManageBilling && usagePercent >= 80 && (
                <div style={{
                  marginLeft: 12,
                  padding: "8px 12px",
                  fontSize: 12,
                  color: "rgba(255, 200, 100, 0.9)",
                  background: "rgba(255, 140, 0, 0.1)",
                  border: "1px solid rgba(255, 140, 0, 0.3)",
                  borderRadius: 6,
                  whiteSpace: "nowrap",
                }}>
                  Storage almost full. Notify your coach.
                </div>
              )}
            </div>
            
            {/* Plan details with renewal date */}
            <div className="muted" style={{ fontSize: 11 }}>
              Plan: <strong>{(me.team.plan === "free" || !me.team.plan) ? "Free" : (me.team.plan || "Free").charAt(0).toUpperCase() + (me.team.plan || "").slice(1)}</strong>
              {" · Up to "}{storageLimitGB}GB storage · Unlimited viewers
              
              {/* Show renewal date for active subscriptions */}
              {me.team.current_period_end && me.team.subscription_status === "active" && !me.team.cancel_at_period_end && (
                <span>
                  {" · Renews "}
                  {new Date(me.team.current_period_end * 1000).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        )}

        {err ? <div className="error">{err}</div> : null}

        {loading && items.length === 0 ? (
          <MediaGrid items={[]} loading={true} />
        ) : filteredItems.length === 0 && items.length > 0 ? (
          <div className="muted">No media in this album.</div>
        ) : filteredItems.length === 0 ? (
          <div className="muted">
            {canUpload
              ? "No uploads yet. Start sharing by uploading your first photo or video."
              : "No uploads yet. Share the uploader link to start collecting photos from parents."}
          </div>
        ) : (
          <>
            <MediaGrid
              items={filteredItems}
              loading={false}
              canDelete={canUpload}
              onDeleted={refresh}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              currentUserId={currentUserId}
              userRole={role}
            />
            {nextCursor && albumFilter === "all" ? (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
                <button 
                  className="btn secondary" 
                  onClick={loadMore} 
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {selectMode && selectedIds.size > 0 ? (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            justifyContent: "center",
            padding: 12,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(6px)",
            borderTop: "1px solid rgba(255,255,255,0.15)",
            zIndex: 999,
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div className="muted">Selected: {selectedIds.size}</div>
            <button className="btn primary" onClick={downloadSelected}>Download selected</button>
            {canUpload ? (
              <button className="btn danger" onClick={deleteSelected}>Delete selected</button>
            ) : null}
          </div>
        </div>
      ) : null}

      <footer className="footer muted">
        Team Media Hub: Private, invite-only sharing for youth sports — built for parents, not social networks.
      </footer>

      {/* Billing Upgrade Modal */}
      {showBillingModal && me?.team && canUpload && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => !billingBusy && setShowBillingModal(false)}
        >
          <div
            style={{
              backgroundColor: "#1a1a2e",
              padding: "28px",
              borderRadius: "12px",
              maxWidth: "460px",
              width: "92%",
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 10px 0", color: "#fff" }}>Upgrade storage</h3>

            <p style={{ margin: "0 0 14px 0", color: "#aaa", lineHeight: 1.6 }}>
              You'll be redirected to Stripe Checkout to complete payment.
              <br />
              <span style={{ color: "#8fd3ff" }}>No charge happens here.</span> You can cancel on Stripe before paying.
            </p>

            {billingMsg ? (
              <div style={{ margin: "0 0 14px 0", color: "#8fd3ff", fontSize: 13 }}>
                {billingMsg}
              </div>
            ) : null}

            <div style={{ display: "grid", gap: 10 }}>
              {/* If free -> show both options */}
              {(me.team.plan === "free" || !me.team.plan) && (
                <>
                  <button
                    className="btn primary"
                    disabled={billingBusy}
                    onClick={() => startCheckout("plus")}
                    style={{ justifyContent: "space-between", display: "flex" }}
                  >
                    <span>Upgrade to Plus (50GB)</span>
                    <span style={{ opacity: 0.85 }}>$19/mo</span>
                  </button>

                  <button
                    className="btn"
                    disabled={billingBusy}
                    onClick={() => startCheckout("pro")}
                    style={{
                      justifyContent: "space-between",
                      display: "flex",
                      border: "1px solid rgba(255,255,255,0.18)",
                    }}
                  >
                    <span>Upgrade to Pro (200GB)</span>
                    <span style={{ opacity: 0.85 }}>$39/mo</span>
                  </button>
                </>
              )}

              {/* If plus -> show prorated upgrade */}
              {me.team.plan === "plus" && (
                <button
                  className="btn primary"
                  disabled={billingBusy}
                  onClick={upgradeToPro}
                  style={{ justifyContent: "space-between", display: "flex" }}
                >
                  <span>Upgrade to Pro (200GB)</span>
                  <span style={{ opacity: 0.85 }}>$39/mo</span>
                </button>
              )}

              {/* If pro -> (optional) just close for now */}
              {me.team.plan === "pro" && (
                <div style={{ color: "#aaa", fontSize: 13 }}>
                  You're already on Pro (200GB).
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 18 }}>
              <button className="btn" disabled={billingBusy} onClick={() => setShowBillingModal(false)}>
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Team Confirmation Modal (Parents only) */}
      {showLeaveModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowLeaveModal(false)}
        >
          <div
            style={{
              backgroundColor: "#1a1a2e",
              padding: "32px",
              borderRadius: "12px",
              maxWidth: "400px",
              width: "90%",
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px 0", color: "#fff" }}>Leave Team?</h3>
            <p style={{ margin: "0 0 24px 0", color: "#aaa", lineHeight: 1.6 }}>
              Are you sure you want to leave this team? You will no longer see its media.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                className="btn"
                onClick={() => setShowLeaveModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={confirmLeaveTeam}
              >
                Leave Team
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
