import React, { useEffect, useState } from "react";
import { listMedia, MediaItem } from "../lib/api";
import { MediaGrid } from "./MediaGrid";

export function MediaGallery({ refresh }: { refresh: number }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [refresh]);

  async function load() {
    try {
      setLoading(true);
      setErr(null);
      const res = await listMedia({ limit: 50 });
      setItems(res.items || []);
    } catch (ex: any) {
      setErr(ex?.message || "Failed to load media");
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="gallery loading">Loading...</div>;
  if (err) return <div className="gallery error">{err}</div>;

  if (items.length === 0) {
    return <div className="gallery empty">No media yet</div>;
  }

  return (
    <div className="gallery">
      <h2>Media ({items.length})</h2>
      <MediaGrid items={items} />
    </div>
  );
}
