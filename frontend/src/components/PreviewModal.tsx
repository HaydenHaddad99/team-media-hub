import React, { useEffect, useState } from "react";
import { MediaItem, presignDownload } from "../lib/api";

type Props = {
  open: boolean;
  items: MediaItem[];
  currentIndex: number;
  onNavigate: (direction: 1 | -1) => void;
  canDelete?: boolean;
  onDelete?: () => void;
  deleting?: boolean;
  onClose: () => void;
};

function isVideo(contentType: string) {
  return contentType.startsWith("video/");
}

export function PreviewModal({
  open,
  items,
  currentIndex,
  onNavigate,
  canDelete,
  onDelete,
  deleting,
  onClose,
}: Props) {
  const [url, setUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const currentItem = items[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;

  // Minimum swipe distance (in px) to trigger navigation
  const minSwipeDistance = 50;

  useEffect(() => {
    async function loadUrl() {
      if (!currentItem) {
        setUrl("");
        return;
      }
      
      try {
        setLoading(true);
        const { download_url } = await presignDownload(currentItem.media_id);
        setUrl(download_url);
      } catch (ex) {
        console.error("Failed to load media", ex);
        setUrl("");
      } finally {
        setLoading(false);
      }
    }

    if (open && currentItem) {
      loadUrl();
    }
  }, [open, currentItem]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onNavigate(-1);
      if (e.key === "ArrowRight" && hasNext) onNavigate(1);
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, hasPrev, hasNext, onNavigate]);

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    if (isLeftSwipe && hasNext) {
      onNavigate(1);
    }
    if (isRightSwipe && hasPrev) {
      onNavigate(-1);
    }
  };

  if (!open || !currentItem) return null;

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div 
        className="modalCard" 
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="modalHeader">
          <div className="modalTitle" title={currentItem.filename}>{currentItem.filename}</div>
          <div style={{ display: "flex", gap: 8 }}>
            {items.length > 1 && (
              <div className="muted" style={{ fontSize: 13 }}>
                {currentIndex + 1} / {items.length}
              </div>
            )}
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="modalBody" style={{ position: "relative" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center" }}>Loading…</div>
          ) : isVideo(currentItem.content_type) ? (
            <video className="modalMedia" controls playsInline src={url} />
          ) : (
            <img className="modalMedia" alt={currentItem.filename} src={url} />
          )}
          
          {!loading && hasPrev && (
            <button
              className="carouselBtn carouselBtnPrev"
              onClick={(e) => { e.stopPropagation(); onNavigate(-1); }}
              aria-label="Previous"
            >
              ‹
            </button>
          )}
          
          {!loading && hasNext && (
            <button
              className="carouselBtn carouselBtnNext"
              onClick={(e) => { e.stopPropagation(); onNavigate(1); }}
              aria-label="Next"
            >
              ›
            </button>
          )}
        </div>

        <div className="modalFooter">
          <div className="muted" style={{ fontSize: 12 }}>{currentItem.content_type}</div>
          <div className="row" style={{ gap: 10 }}>
            {canDelete && onDelete ? (
              <button className="btn danger" onClick={onDelete} disabled={!!deleting}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
            ) : null}
            <a className="btn primary" href={url} download>
              Download
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
