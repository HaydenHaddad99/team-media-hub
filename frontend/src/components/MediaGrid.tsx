import React, { useState } from "react";
import { MediaItem, presignDownload } from "../lib/api";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

export function MediaGrid({ items }: { items: MediaItem[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleDownload(media_id: string) {
    try {
      setErr(null);
      setBusyId(media_id);
      const { download_url } = await presignDownload(media_id);
      window.open(download_url, "_blank", "noopener,noreferrer");
    } catch (ex: any) {
      setErr(ex?.message || "Download failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {err ? <div className="error">{err}</div> : null}

      <div className="grid">
        {items.map((m) => (
          <div key={m.media_id} className="card">
            <div className="cardTitle">{m.filename}</div>
            <div className="cardMeta">
              <span>{m.content_type}</span>
              <span>{formatBytes(m.size_bytes)}</span>
            </div>
            <button
              className="btn"
              disabled={busyId === m.media_id}
              onClick={() => handleDownload(m.media_id)}
            >
              {busyId === m.media_id ? "Preparing..." : "Download"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
