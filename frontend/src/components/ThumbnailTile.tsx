import React, { useEffect, useRef, useState } from "react";
import { MediaItem } from "../lib/api";
import { getSignedMediaUrl } from "../lib/mediaUrlCache";

function isVideo(contentType: string) {
  return contentType.startsWith("video/");
}

export function ThumbnailTile({
  item,
  onOpen,
}: {
  item: MediaItem;
  onOpen: (item: MediaItem, signedUrl?: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Observe visibility
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setVisible(true);
        }
      },
      { rootMargin: "200px" } // prefetch a bit before visible
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Lazy fetch signed URL for images only (videos show placeholder for now)
  useEffect(() => {
    if (!visible) return;
    if (isVideo(item.content_type)) return;
    if (thumbUrl || loading) return;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const url = await getSignedMediaUrl(item.media_id);
        if (!cancelled) setThumbUrl(url);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, item.media_id, item.content_type, thumbUrl, loading]);

  const video = isVideo(item.content_type);

  return (
    <div ref={ref} className="thumbCard" onClick={() => onOpen(item, thumbUrl || undefined)}>
      <div className="thumbMedia">
        {video ? (
          <div className="thumbVideoPlaceholder">
            <div className="playBadge">▶</div>
          </div>
        ) : thumbUrl ? (
          <img className="thumbImg" src={thumbUrl} alt={item.filename} loading="lazy" />
        ) : (
          <div className="thumbSkeleton" />
        )}
      </div>

      <div className="thumbMeta">
        <div className="thumbTitle" title={item.filename}>
          {item.filename}
        </div>
        <div className="thumbSub muted">{video ? "Video" : "Photo"}</div>
      </div>
    </div>
  );
}