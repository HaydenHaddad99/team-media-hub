import React, { useEffect, useState } from "react";
import { listMedia, MediaItem, clearStoredToken } from "../lib/api";
import { UploadButton } from "../components/UploadButton";
import { MediaGrid } from "../components/MediaGrid";

export function Feed({ onLogout }: { onLogout: () => void }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

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

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="container">
      <header className="header rowBetween">
        <div>
          <div className="brand">Team Media Hub</div>
          <div className="sub">Media feed</div>
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

        <UploadButton onUploaded={refresh} />

        {err ? <div className="error">{err}</div> : null}
        {loading ? (
          <div className="muted">Loading…</div>
        ) : items.length === 0 ? (
          <div className="muted">No media yet. Upload the first photo/video.</div>
        ) : (
          <MediaGrid items={items} />
        )}
      </div>

      <footer className="footer muted">
        Tip: share the invite link in your team app. Anyone with the link can access based on the token role.
      </footer>
    </div>
  );
}
