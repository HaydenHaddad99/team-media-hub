import React, { useEffect, useState } from "react";
import { listMedia, MediaItem, clearStoredToken, getMe, MeResponse, presignDownload, deleteMedia } from "../lib/api";
import { UploadButton } from "../components/UploadButton";
import { MediaGrid } from "../components/MediaGrid";
import { AdminInvites } from "../components/AdminInvites";

export function Feed({ onLogout }: { onLogout: () => void }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [albumFilter, setAlbumFilter] = useState<string>("all");
  const [selectMode, setSelectMode] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [me, setMe] = useState<MeResponse | null>(null);
  const [meErr, setMeErr] = useState<string | null>(null);

  const role = me?.invite?.role || "viewer";
  const canUpload = role === "uploader" || role === "admin";
  const isAdmin = role === "admin";
  const teamId = me?.team?.team_id || "";

  // Get unique albums from items
  const albums = Array.from(new Set(items.map(i => i.album_name || "All uploads"))).sort();
  
  // Filter items by selected album
  const filteredItems = albumFilter === "all" 
    ? items 
    : items.filter(i => (i.album_name || "All uploads") === albumFilter);

  // Calculate storage usage (soft limit for pricing story)
  const STORAGE_LIMIT_GB = 5;
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
    } catch (ex: any) {
      setErr(ex?.message || "Failed to load media");
    } finally {
      setLoading(false);
    }
  }

  // Silent refresh used for thumbnail polling to avoid UI flicker
  async function pollRefresh() {
    try {
      const res = await listMedia({ limit: 30 });
      setItems(res.items || []);
    } catch (ex: any) {
      // ignore transient errors during polling
    }
  }

  async function loadMe() {
    try {
      setMeErr(null);
      const res = await getMe();
      setMe(res);
    } catch (ex: any) {
      setMeErr(ex?.message || "Failed to load team info");
    }
  }

  useEffect(() => {
    loadMe();
    refresh();
  }, []);

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
      if (attempts >= 10) {
        window.clearInterval(interval);
      }
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [items, loading]);

  return (
    <div className="container">
      <header className="header rowBetween">
        <div>
          <div className="brand">{me?.team?.team_name || "Team Media Hub"}</div>
          <div className="sub">
            Media feed · role: <b>{role}</b>
          </div>
          {meErr ? <div className="error">{meErr}</div> : null}
        </div>
        <button
          className="btn"
          onClick={() => {
            clearStoredToken();
            onLogout();
          }}
        >
          Leave
        </button>
      </header>

      <div className="panel">
        <div className="rowBetween" style={{ flexWrap: "wrap", gap: 12 }}>
          <h2 style={{ margin: 0 }}>Uploads</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {albums.length > 1 && (
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
          <UploadButton onUploaded={refresh} defaultAlbum={albumFilter === "all" ? "" : albumFilter} />
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
          <div className="muted">No uploads yet. Share the uploader link to start collecting photos from parents.</div>
        ) : (
          <MediaGrid
            items={filteredItems}
            loading={false}
            canDelete={canUpload}
            onDeleted={refresh}
            selectMode={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
        )}

        {isAdmin && teamId ? <AdminInvites teamId={teamId} /> : null}
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
    </div>
  );
}
