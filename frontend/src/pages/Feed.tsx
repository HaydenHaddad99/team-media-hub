import React, { useEffect, useState } from "react";
import { listMedia, MediaItem, clearStoredToken, getMe, MeResponse } from "../lib/api";
import { UploadButton } from "../components/UploadButton";
import { MediaGrid } from "../components/MediaGrid";
import { AdminInvites } from "../components/AdminInvites";

export function Feed({ onLogout }: { onLogout: () => void }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [meErr, setMeErr] = useState<string | null>(null);

  const role = me?.invite?.role || "viewer";
  const canUpload = role === "uploader" || role === "admin";
  const isAdmin = role === "admin";
  const teamId = me?.team?.team_id || "";

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
        <div className="rowBetween">
          <h2>Uploads</h2>
          <button className="btn" onClick={refresh} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {canUpload ? (
          <UploadButton onUploaded={refresh} />
        ) : (
          <div className="muted" style={{ marginTop: 10 }}>
            You can view and download media. Ask the team admin for an uploader link if you need to upload.
          </div>
        )}

        {err ? <div className="error">{err}</div> : null}

        {loading ? (
          <div className="muted">Loading…</div>
        ) : items.length === 0 ? (
          <div className="muted">No media yet.</div>
        ) : (
          <MediaGrid items={items} />
        )}

        {isAdmin && teamId ? <AdminInvites teamId={teamId} /> : null}
      </div>

      <footer className="footer muted">
        Privacy-first: media stored privately and accessed via short-lived signed links.
      </footer>
    </div>
  );
}
