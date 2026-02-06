import React, { useEffect, useState, useRef } from "react";
import { MediaItem, presignDownload } from "../lib/api";

type Props = {
  open: boolean;
  items: MediaItem[];
  currentIndex: number;
  onNavigate: (direction: 1 | -1) => void;
  canDelete?: boolean;
  currentUserId?: string | null;
  userRole?: string;
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
  currentUserId,
  userRole,
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

  // Determine if current user can delete this item
  // Admin/coach can delete anything; parents can only delete their own uploads
  const canDeleteItem = (() => {
    if (!canDelete || !currentItem) return false;
    if (userRole === "admin" || userRole === "coach") return true; // Admins/coaches can delete anything
    if (!currentItem.uploader_user_id) return false; // Old uploads without owner info - cannot delete
    return currentItem.uploader_user_id === currentUserId; // Can only delete own uploads
  })();

  // Minimum swipe distance (in px) to trigger navigation
  const minSwipeDistance = 50;

  // Prefetch adjacent items
  useEffect(() => {
    async function prefetchUrl(item: MediaItem) {
      const mediaId = item.media_id;
      if (urlCache.has(mediaId) || prefetchingRef.current.has(mediaId)) return;
      
      // If preview_url already available, cache it immediately
      if (item.preview_url && !isVideo(item.content_type)) {
        urlCache.set(mediaId, item.preview_url);
        return;
      }
      
      // Otherwise fetch presigned URL
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
        prefetchUrl(items[currentIndex + 1]);
      }
      // Prefetch prev
      if (hasPrev) {
        prefetchUrl(items[currentIndex - 1]);
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
      
      // Use preview_url if available (images only, already presigned from list)
      if (currentItem.preview_url && !isVideo(currentItem.content_type)) {
        urlCache.set(currentItem.media_id, currentItem.preview_url);
        setUrl(currentItem.preview_url);
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
          <div style={{ display: "flex", gap: 8 }}>
            {items.length > 1 && (
              <div className="muted" style={{ fontSize: 13 }}>
                {currentIndex + 1} / {items.length}
              </div>
            )}
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="modalBody" style={{ position: "relative", minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.6) 100%)" }}>
          {/* Base layer: Always show thumbnail immediately for images */}
          {!isVideo(currentItem.content_type) && currentItem.thumb_url && (
            <img 
              className="modalMedia modalMedia-placeholder"
              alt="" 
              src={currentItem.thumb_url}
              style={{
                position: "absolute",
                filter: "blur(10px)",
                transform: "scale(1.1)",
                opacity: 0.7
              }}
            />
          )}
          
          {/* Loading spinner (subtle, centered) */}
          {(isLoading || (url && !mediaLoaded)) && (
            <div style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 2,
              textAlign: "center"
            }}>
              <div className="spinner" />
              <div style={{ marginTop: 12, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                Loading…
              </div>
            </div>
          )}
          
          {/* Full-res media (fades in when loaded) */}
          {url && (
            isVideo(currentItem.content_type) ? (
              <video 
                key={`video-${currentItem.media_id}`}
                className={`modalMedia ${mediaLoaded ? 'modalMedia-loaded' : ''}`}
                controls 
                playsInline 
                src={url}
                onLoadedData={() => setMediaLoaded(true)}
                style={{ position: "relative", zIndex: 1 }}
              />
            ) : (
              <img 
                key={`img-${currentItem.media_id}`}
                className={`modalMedia ${mediaLoaded ? 'modalMedia-loaded' : ''}`}
                alt="" 
                src={url}
                onLoad={() => setMediaLoaded(true)}
                style={{ position: "relative", zIndex: 1 }}
              />
            )
          )}
          
          {/* Error state */}
          {!isLoading && !url && (
            <div style={{ 
              color: "rgba(255,255,255,0.6)",
              fontSize: 14
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
          <div className="row" style={{ gap: 10 }}>
            {canDeleteItem && onDelete ? (
              <button className="btn btn-danger" onClick={onDelete} disabled={!!deleting || isLoading}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
            ) : canDelete && !canDeleteItem ? (
              <button className="btn btn-danger" disabled title="You can only delete your own uploads">
                Delete
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
