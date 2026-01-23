import React, { useState } from "react";
import { MediaItem } from "../lib/api";
import { PreviewModal } from "./PreviewModal";
import { ThumbnailTile } from "./ThumbnailTile";
import { getSignedMediaUrl } from "../lib/mediaUrlCache";

export function MediaGrid({ items }: { items: MediaItem[] }) {
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [preview, setPreview] = useState<{
    open: boolean;
    title: string;
    contentType: string;
    url: string;
  }>({ open: false, title: "", contentType: "", url: "" });

  async function openItem(item: MediaItem, maybeUrl?: string) {
    try {
      setErr(null);
      setBusyId(item.media_id);

      const url = maybeUrl || (await getSignedMediaUrl(item.media_id));
      setPreview({ open: true, title: item.filename, contentType: item.content_type, url });
    } catch (ex: any) {
      setErr(ex?.message || "Failed to open media");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {err ? <div className="error">{err}</div> : null}
      {busyId ? <div className="muted" style={{ marginBottom: 8 }}>Loading…</div> : null}

      <div className="thumbGrid">
        {items.map((item) => (
          <ThumbnailTile key={item.media_id} item={item} onOpen={openItem} />
        ))}
      </div>

      <PreviewModal
        open={preview.open}
        title={preview.title}
        contentType={preview.contentType}
        url={preview.url}
        onClose={() => setPreview((p) => ({ ...p, open: false }))}
      />
    </div>
  );
}

