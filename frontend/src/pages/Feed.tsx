import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { listMedia, MediaItem, clearStoredToken, getMe, MeResponse, presignDownload, deleteMedia, getUploaderIdentifier, createBillingCheckoutSession, upgradeBillingSubscription, createBillingPortalSession } from "../lib/api";
import { getHomeRoute, navigate } from "../lib/navigation";
import { UploadButton } from "../components/UploadButton";
import { MediaGrid } from "../components/MediaGrid";
import { AlbumGrid, AlbumData } from "../components/AlbumGrid";
import "../styles/pages.css";

export function Feed({ onLogout }: { onLogout: () => void }) {
  // Get team_id from URL params
  const { team_id: urlTeamId } = useParams<{ team_id?: string }>();
  
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [albumFilter, setAlbumFilter] = useState<string>("all");
  const [albumView, setAlbumView] = useState<boolean>(true); // true = album browser, false = media grid
  const [showNewAlbumModal, setShowNewAlbumModal] = useState<boolean>(false);
  const [newAlbumName, setNewAlbumName] = useState<string>("");
  const [selectMode, setSelectMode] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [me, setMe] = useState<MeResponse | null>(null);
  const [meErr, setMeErr] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showLeaveModal, setShowLeaveModal] = useState<boolean>(false);
  const [showBillingModal, setShowBillingModal] = useState<boolean>(false);
  const [billingBusy, setBillingBusy] = useState<boolean>(false);
  const [billingMsg, setBillingMsg] = useState<string | null>(null);

  const role = me?.invite?.role || localStorage.getItem("tmh_role") || "viewer";
  const canUpload = role === "uploader" || role === "admin" || role === "coach";
  const isAdmin = role === "admin" || role === "coach";
  const isCoach = !!localStorage.getItem("tmh_user_token");
  const canManageBilling = isCoach && isAdmin;
  const teamId = me?.team?.team_id || "";

  // Get unique albums from items
  const albums = Array.from(new Set(items.map(i => i.album_name || "All uploads"))).sort();

  // Build album data for the album browser (cover = most recent item's thumb)
  const albumData: AlbumData[] = albums
    .filter(name => name !== "All uploads")
    .map(name => {
      const albumItems = items
        .filter(i => (i.album_name || "All uploads") === name)
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      return {
        name,
        cover: albumItems.find(i => i.thumb_url)?.thumb_url || null,
        count: albumItems.length,
        lastUpdated: albumItems[0]?.created_at || 0,
      };
    })
    .sort((a, b) => b.lastUpdated - a.lastUpdated);

  // Also include "All uploads" as the first tile if there are items
  const allAlbumsData: AlbumData[] = items.length > 0 ? [
    {
      name: "All uploads",
      cover: [...items].sort((a, b) => (b.created_at || 0) - (a.created_at || 0)).find(i => i.thumb_url)?.thumb_url || null,
      count: items.length,
      lastUpdated: items.reduce((max, i) => Math.max(max, i.created_at || 0), 0),
    },
    ...albumData,
  ] : albumData;

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

  const refreshingRef = useRef(false);

  async function refresh() {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      setErr(null);
      setLoading(true);
      setItems([]);

      // First page — small batch so skeleton disappears fast
      const first = await listMedia({ limit: 12 });
      const firstItems = first.items || [];
      setItems(firstItems);
      setLoading(false);

      // Background-fetch remaining pages and append as they arrive
      let cursor = first.next_cursor;
      while (cursor) {
        const next = await listMedia({ limit: 30, cursor });
        const nextItems = next.items || [];
        if (nextItems.length === 0) break;
        setItems(prev => [...prev, ...nextItems]);
        cursor = next.next_cursor;
      }
      setNextCursor(null); // all pages loaded automatically
    } catch (ex: any) {
      setErr(ex?.message || "Failed to load media");
      setLoading(false);
    } finally {
      refreshingRef.current = false;
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
    // After upload, go back to album browser so users see updated album covers
    setAlbumFilter("all");
    setAlbumView(true);
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
    setAlbumView(true);
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

  // Compute featured album (most recently uploaded media's album)
  const featuredAlbum = (() => {
    if (items.length === 0) return null;
    // Find albums with names (exclude "All uploads")
    const namedAlbums = items
      .filter(i => i.album_name && i.album_name !== "All uploads")
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    
    if (namedAlbums.length === 0) return null;
    
    const latestAlbumName = namedAlbums[0].album_name!;
    const albumItems = items.filter(i => i.album_name === latestAlbumName);
    const latestTimestamp = Math.max(...albumItems.map(i => i.created_at || 0));
    
    return {
      name: latestAlbumName,
      count: albumItems.length,
      lastUpdated: latestTimestamp,
    };
  })();

  function formatTimeAgo(timestamp: number) {
    if (!timestamp) return "";
    const seconds = Math.floor(Date.now() / 1000 - timestamp);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  async function handleCopyTeamCode() {
    if (!me?.team?.team_code) return;
    try {
      await navigator.clipboard.writeText(me.team.team_code);
      alert("Team code copied to clipboard!");
    } catch (err) {
      alert("Failed to copy team code");
    }
  }

  async function handleShareTeam() {
    if (!me?.team?.team_code) return;
    const shareText = `Join our team on Team Media Hub. Team code: ${me.team.team_code}. Join here: https://app.teammediahub.co/join`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${me.team.team_name || "our team"}`,
          text: shareText,
        });
      } catch (err) {
        // User cancelled or error - fallback to copy
        if ((err as Error).name !== "AbortError") {
          await navigator.clipboard.writeText(shareText);
          alert("Share message copied to clipboard!");
        }
      }
    } else {
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(shareText);
      alert("Share message copied to clipboard!");
    }
  }

  return (
    <div className="feed-v2-container">
      {/* Compact Team Identity Header */}
      <div className="feed-v2-header">
        <div className="feed-v2-header-identity">
          <h1 className="feed-v2-team-name">{me?.team?.team_name || "Team"}</h1>
          <p className="feed-v2-welcome">Welcome back{role && <span className="feed-v2-role-muted"> · {role}</span>}</p>
        </div>
        <div className="feed-v2-header-actions">
          <button
            className="feed-v2-btn-ghost"
            onClick={handleExitTeam}
          >
            {isCoach ? "Switch Team" : "Leave"}
          </button>
        </div>
      </div>

      {meErr && <div className="error" style={{ maxWidth: 1200, margin: "0 auto 16px" }}>{meErr}</div>}

      <div className="feed-v2-content">
        {albumView ? (
          /* ── Album Browser ── */
          <div className="feed-v2-grid-section">
            <div className="feed-v2-toolbar">
              <div className="feed-v2-toolbar-left">
                <h2 className="feed-v2-album-title">
                  Team Albums
                </h2>
              </div>
              <div className="feed-v2-toolbar-right">
                <button type="button" className="feed-v2-btn-toolbar" onClick={refresh} disabled={loading}>
                  {loading ? "Loading..." : "Refresh"}
                </button>
                {canUpload && (
                  <button
                    type="button"
                    className="feed-v2-btn-new-album"
                    onClick={() => { setNewAlbumName(""); setShowNewAlbumModal(true); }}
                    title="New album"
                  >
                    +
                  </button>
                )}
              </div>
            </div>

            {err && <div className="error feed-v2-section-error">{err}</div>}

            {loading && items.length === 0 ? (
              /* skeleton tiles */
              <div className="album-grid-static">
                {[1, 2, 3, 4].map(n => (
                  <div key={n} className="album-tile album-tile--skeleton" />
                ))}
              </div>
            ) : allAlbumsData.length === 0 ? (
              <div className="feed-v2-empty">
                {canUpload
                  ? "No uploads yet. Start sharing by uploading your first photo or video."
                  : "No uploads yet. Ask your admin to start sharing photos."}
              </div>
            ) : (
              <AlbumGrid
                albums={allAlbumsData}
                onSelect={(name) => {
                  setAlbumFilter(name === "All uploads" ? "all" : name);
                  setAlbumView(false);
                }}
              />
            )}
          </div>
        ) : (
          /* ── Media Grid (inside an album) ── */
          <div className="feed-v2-grid-section">
            <div className="feed-v2-toolbar">
              <div className="feed-v2-toolbar-left feed-v2-toolbar-left--album">
                <button
                  type="button"
                  className="feed-v2-album-back"
                  onClick={() => { setAlbumView(true); setAlbumFilter("all"); setSelectMode(false); }}
                >
                  ← Albums
                </button>
                <h2 className="feed-v2-album-title">
                  {albumFilter === "all" ? "All uploads" : albumFilter}
                </h2>
              </div>
              <div className="feed-v2-toolbar-right">
                <button type="button" className="feed-v2-btn-toolbar" onClick={() => setSelectMode(s => !s)}>
                  {selectMode ? "Done" : "Select"}
                </button>
                <button type="button" className="feed-v2-btn-toolbar" onClick={refresh} disabled={loading}>
                  {loading ? "Loading..." : "Refresh"}
                </button>
                {canUpload && (
                  <div className="feed-v2-upload-desktop">
                    <UploadButton onUploaded={handleUploadComplete} defaultAlbum={albumFilter === "all" ? "" : albumFilter} />
                  </div>
                )}
              </div>
            </div>

            {err && <div className="error feed-v2-section-error">{err}</div>}

            {loading && items.length === 0 ? (
              <MediaGrid items={[]} loading={true} />
            ) : filteredItems.length === 0 && items.length > 0 ? (
              <div className="feed-v2-empty">No media in this album.</div>
            ) : filteredItems.length === 0 ? (
              <div className="feed-v2-empty">
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
                {nextCursor && albumFilter === "all" && (
                  <div className="feed-v2-load-more-row">
                    <button type="button" className="feed-v2-btn-toolbar" onClick={loadMore} disabled={loadingMore}>
                      {loadingMore ? "Loading..." : "Load more"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Storage Slim Bar (below grid) */}
        {me?.team && (
          <div className="feed-v2-storage-bar">
            {(() => {
              const plan = me.team.plan || "free";
              const status = me.team.subscription_status;
              const cancelAtPeriodEnd = me.team.cancel_at_period_end;
              const currentPeriodEnd = me.team.current_period_end;
              const pastDueSince = me.team.past_due_since;
              
              let badgeText = "";
              let badgeColor = "rgba(0, 200, 100, 0.8)";
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
                  {showWarning && warningText && (
                    <div className="feed-v2-storage-warning">
                      ⚠️ {warningText}
                    </div>
                  )}
                  
                  <div className="feed-v2-storage-header">
                    <div className="feed-v2-storage-plan">
                      {badgeText && (
                        <span
                          className="feed-v2-storage-badge"
                          style={{
                            color: badgeColor,
                            background: badgeBackground,
                            borderColor: badgeColor.replace('0.9', '0.3').replace('0.8', '0.3'),
                          }}
                        >
                          {badgeText}
                        </span>
                      )}
                      <span className="feed-v2-storage-plan-text">
                        {(me.team.plan === "free" || !me.team.plan) ? "Free" : (me.team.plan || "Free").charAt(0).toUpperCase() + (me.team.plan || "").slice(1)}
                      </span>
                    </div>
                    <div className="feed-v2-storage-usage-text">
                      {usageText} of {limitText}
                    </div>
                  </div>
                  
                  <div className="feed-v2-storage-progress">
                    <div 
                      className="feed-v2-storage-progress-bar"
                      style={{ 
                        width: `${usagePercent}%`, 
                        background: usagePercent > 80 ? "rgba(255, 140, 0, 0.7)" : "rgba(0, 170, 255, 0.6)",
                      }} 
                    />
                  </div>

                  {canManageBilling && (
                    <button
                      className="feed-v2-btn-manage-billing"
                      onClick={() => {
                        const plan = me?.team?.plan || "free";
                        if (plan === "free") {
                          setShowBillingModal(true);
                        } else {
                          openBillingPortal();
                        }
                      }}
                      disabled={billingBusy}
                    >
                      {billingBusy ? "Loading..." : (me.team.plan === "free" || !me.team.plan) ? "Upgrade" : "Manage billing"}
                    </button>
                  )}

                  {!canManageBilling && usagePercent >= 80 && (
                    <div className="feed-v2-storage-parent-warning">
                      Storage is getting full — please notify your admin to upgrade.
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Invite Share Card */}
        {me?.team?.team_code && (
          <div className="feed-v2-invite-card">
            <h3 className="feed-v2-invite-title">Invite other parents</h3>
            <div className="feed-v2-invite-code">{me.team.team_code}</div>
            <div className="feed-v2-invite-actions">
              <button className="feed-v2-btn-invite" onClick={handleCopyTeamCode}>
                Copy Code
              </button>
              <button className="feed-v2-btn-invite" onClick={handleShareTeam}>
                Share
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Upload FAB */}
      {canUpload && (
        <div className="feed-v2-fab">
          <UploadButton onUploaded={handleUploadComplete} defaultAlbum={albumFilter === "all" ? "" : albumFilter} />
        </div>
      )}

      {/* Selection Toolbar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="feed-v2-selection-bar">
          <div className="feed-v2-selection-content">
            <div className="feed-v2-selection-count">Selected: {selectedIds.size}</div>
            <button className="feed-v2-btn-selection" onClick={downloadSelected}>Download selected</button>
            {canUpload && (
              <button className="feed-v2-btn-selection-danger" onClick={deleteSelected}>Delete selected</button>
            )}
          </div>
        </div>
      )}

      <footer className="feed-v2-footer">
        Team Media Hub: Private, invite-only sharing for youth sports — built for parents, not social networks.
      </footer>

      {/* New Album Modal */}
      {showNewAlbumModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowNewAlbumModal(false)}
        >
          <div
            className="modal-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="modal-sheet-title">New Album</h3>
            <input
              className="modal-sheet-input"
              type="text"
              placeholder="Album name"
              value={newAlbumName}
              onChange={(e) => setNewAlbumName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newAlbumName.trim()) {
                  setAlbumFilter(newAlbumName.trim());
                  setAlbumView(false);
                  setShowNewAlbumModal(false);
                }
                if (e.key === "Escape") setShowNewAlbumModal(false);
              }}
              autoFocus
            />
            <div className="modal-sheet-actions">
              <button
                type="button"
                className="feed-v2-btn-ghost"
                onClick={() => setShowNewAlbumModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="feed-v2-btn-view-album"
                disabled={!newAlbumName.trim()}
                onClick={() => {
                  setAlbumFilter(newAlbumName.trim());
                  setAlbumView(false);
                  setShowNewAlbumModal(false);
                }}
              >
                Create Album
              </button>
            </div>
          </div>
        </div>
      )}

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
