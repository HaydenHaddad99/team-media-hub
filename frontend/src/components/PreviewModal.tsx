import React, { useEffect, useState, useRef } from "react";
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

// Cache for prefetched URLs
const urlCache = new Map<string, string>();

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
  const [isLoading, setIsLoading] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const prefetchingRef = useRef<Set<string>>(new Set());

  const currentItem = items[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;

  // Minimum swipe distance (in px) to trigger navigation
  const minSwipeDistance = 50;

  // Prefetch adjacent items
  useEffect(() => {
    async function prefetchUrl(mediaId: string) {
      if (urlCache.has(mediaId) || prefetchingRef.current.has(mediaId)) return;
      
      prefetchingRef.current.add(mediaId);
      try {
        const { download_url } = await presignDownload(mediaId);
        urlCache.set(mediaId, download_url);
      } catch (ex) {
        console.error("Failed to prefetch", mediaId, ex);
      } finally {
        prefetchingRef.current.delete(mediaId);
      }
    }

    if (open && items.length > 1) {
      // Prefetch next
      if (hasNext) {
        prefetchUrl(items[currentIndex + 1].media_id);
      }
      // Prefetch prev
      if (hasPrev) {
        prefetchUrl(items[currentIndex - 1].media_id);
      }
    }
  }, [open, currentIndex, items, hasNext, hasPrev]);

  useEffect(() => {
    async function loadUrl() {
      if (!currentItem) {
        setUrl("");
        setIsLoading(false);
        setMediaLoaded(false);
        return;
      }
      
      setIsLoading(true);
      setMediaLoaded(false);
      
      // Check cache first
      const cached = urlCache.get(currentItem.media_id);
      if (cached) {
        setUrl(cached);
        setIsLoading(false);
        return;
      }
      
      setUrl(""); // Clear old URL immediately to prevent flash
      
      try {
        const { download_url } = await presignDownload(currentItem.media_id);
        urlCache.set(currentItem.media_id, download_url);
        
        // Optional: Pre-decode image for smoother transition
        if (!isVideo(currentItem.content_type)) {
          const img = new Image();
          img.src = download_url;
          await img.decode().catch(() => {}); // Ignore decode errors
        }
        
        setUrl(download_url);
      } catch (ex) {
        console.error("Failed to load media", ex);
        setUrl("");
      } finally {
        setIsLoading(false);
      }
    }

    if (open && currentItem) {
      loadUrl();
    }
  }, [open, currentItem?.media_id]);

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

  async function handleDownload() {
    if (!currentItem || !url) return;
    
    try {
      setDownloadingId(currentItem.media_id);
      // Open the presigned URL directly - browser will download it
      window.open(url, "_blank");
    } catch (err) {
      console.error("Download failed", err);
    } finally {
      setDownloadingId(null);
    }
  }

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
          {/* Show thumbnail as placeholder while full-res loads */}
          {!isVideo(currentItem.content_type) && currentItem.thumb_url && (url && !mediaLoaded) && (
            <img 
              className="modalMedia modalMedia-placeholder"
              alt={currentItem.filename} 
              src={currentItem.thumb_url}
              style={{
                filter: "blur(8px)",
                transform: "scale(1.05)"
              }}
            />
          )}
          
          {/* Show skeleton only if no thumbnail available */}
          {(isLoading || (url && !mediaLoaded)) && (!currentItem.thumb_url || isVideo(currentItem.content_type)) && (
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              minHeight: 400,
              background: "rgba(0,0,0,0.05)",
              borderRadius: 4,
              position: url ? "absolute" : "relative",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 1
            }}>
              <div className="skeleton-pulse" style={{
                width: "100%",
                height: 400,
                borderRadius: 4
              }} />
            </div>
          )}
          
          {url && (
            isVideo(currentItem.content_type) ? (
              <video 
                key={`video-${currentItem.media_id}`}
                className={`modalMedia ${mediaLoaded ? 'modalMedia-loaded' : ''}`}
                controls 
                playsInline 
                src={url}
                onLoadedData={() => setMediaLoaded(true)}
              />
            ) : (
              <img 
                key={`img-${currentItem.media_id}`}
                className={`modalMedia ${mediaLoaded ? 'modalMedia-loaded' : ''}`}
                alt={currentItem.filename} 
                src={url}
                onLoad={() => setMediaLoaded(true)}
              />
            )
          )}
          
          {!isLoading && !url && (
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              minHeight: 400,
              color: "#666"
            }}>
              Failed to load media
            </div>
          )}
          
          {hasPrev && (
            <button
              className="carouselBtn carouselBtnPrev"
              onClick={(e) => { e.stopPropagation(); onNavigate(-1); }}
              aria-label="Previous"
            >
              ‹
            </button>
          )}
          
          {hasNext && (
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
              <button className="btn btn-danger" onClick={onDelete} disabled={!!deleting || isLoading}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
            ) : null}
            <button 
              className="btn btn-primary" 
              onClick={handleDownload}
              disabled={!url || downloadingId === currentItem.media_id || isLoading}
            >
              {isLoading ? "Loading…" : downloadingId === currentItem.media_id ? "Downloading…" : "Download"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
