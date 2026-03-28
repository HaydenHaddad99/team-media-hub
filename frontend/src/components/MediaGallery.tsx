import { useEffect, useRef, useState } from "react";
import { listMedia, MediaItem } from "../lib/api";
import { MediaGrid } from "./MediaGrid";

const FIRST_PAGE_SIZE = 12;
const SUBSEQUENT_PAGE_SIZE = 30;

export function MediaGallery({ refresh }: { refresh: number }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  useEffect(() => {
    load();
  }, [refresh]);

  async function load() {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      setLoading(true);
      setErr(null);
      setItems([]);

      // First page — small batch so skeletons disappear fast
      const first = await listMedia({ limit: FIRST_PAGE_SIZE });
      const firstItems = first.items || [];
      setItems(firstItems);
      setLoading(false);

      // Load remaining pages in background — items append as they arrive
      let cursor = first.next_cursor;
      while (cursor) {
        const next = await listMedia({ limit: SUBSEQUENT_PAGE_SIZE, cursor });
        const nextItems = next.items || [];
        if (nextItems.length === 0) break;
        setItems((prev) => [...prev, ...nextItems]);
        cursor = next.next_cursor;
      }
    } catch (ex: any) {
      setErr(ex?.message || "Failed to load media");
      setLoading(false);
    } finally {
      fetchingRef.current = false;
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
