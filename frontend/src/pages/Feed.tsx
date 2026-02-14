import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { listMedia, MediaItem, clearStoredToken, getMe, MeResponse, presignDownload, deleteMedia, getUploaderIdentifier } from "../lib/api";
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

  const role = me?.invite?.role || "viewer";
  const canUpload = role === "uploader" || role === "admin";
  const isAdmin = role === "admin";
  const isCoach = !!localStorage.getItem("tmh_user_token");
  const teamId = me?.team?.team_id || "";

  // Get unique albums from items
  const albums = Array.from(new Set(items.map(i => i.album_name || "All uploads"))).sort();
  
  // Filter items by selected album
  const filteredItems = albumFilter === "all" 
    ? items 
    : items.filter(i => (i.album_name || "All uploads") === albumFilter);

  // Calculate storage usage (soft limit for pricing story)
  const STORAGE_LIMIT_GB = 20;
  const totalBytes = items.reduce((sum, item) => sum + (item.size_bytes || 0), 0);
  const usedGB = totalBytes / (1024 * 1024 * 1024);
  const usagePercent = Math.min(100, (usedGB / STORAGE_LIMIT_GB) * 100);
  const usageText = usedGB < 0.01 
    ? `${(totalBytes / (1024 * 1024)).toFixed(1)} MB` 
    : `${usedGB.toFixed(2)} GB`;
  const limitText = `${STORAGE_LIMIT_GB} GB`;

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

        {/* Storage limit indicator (soft limit for pricing story) */}
        {items.length > 0 && (
          <div style={{ marginTop: 16, padding: 12, background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
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
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
              Team plan: Up to {STORAGE_LIMIT_GB}GB storage · Unlimited viewers
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
