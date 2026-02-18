import React, { useEffect, useState, useRef } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { MediaItem, presignDownload } from "../lib/api";

type Props = {
  open: boolean;
  items: MediaItem[];
  currentIndex: number;
  onSelectIndex: (index: number) => void;
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
  onSelectIndex,
  canDelete,
  currentUserId,
  userRole,
  onDelete,
  deleting,
  onClose,
}: Props) {
  const [selectedIndex, setSelectedIndex] = useState<number>(currentIndex);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set());
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const prefetchingRef = useRef<Set<string>>(new Set());
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: "center",
    skipSnaps: false,
    dragFree: false,
    containScroll: "trimSnaps",
  });

  const currentItem = items[selectedIndex] || items[currentIndex];
  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex < items.length - 1;
  const isCurrentLoading = !!currentItem && loadingIds.has(currentItem.media_id);

  // Determine if current user can delete this item
  // Admin/coach can delete anything; parents can only delete their own uploads
  const canDeleteItem = (() => {
    if (!canDelete || !currentItem) return false;
    // Admins can always delete
    if (userRole === "admin") return true;
    // Coaches (identified by having coach_user_id in localStorage) can delete anything
    const isCoach = !!localStorage.getItem("tmh_coach_user_id");
    if (isCoach) return true;
    // Parents can only delete their own uploads
    if (!currentItem.uploader_user_id) return false;
    return currentItem.uploader_user_id === currentUserId;
  })();

  function setLoading(mediaId: string, next: boolean) {
    setLoadingIds((prev) => {
      const updated = new Set(prev);
      if (next) updated.add(mediaId);
      else updated.delete(mediaId);
      return updated;
    });
  }

  function markLoaded(mediaId: string) {
    setLoadedIds((prev) => {
      if (prev.has(mediaId)) return prev;
      const updated = new Set(prev);
      updated.add(mediaId);
      return updated;
    });
  }

  function setUrlFor(mediaId: string, url: string) {
    setMediaUrls((prev) => (prev[mediaId] ? prev : { ...prev, [mediaId]: url }));
  }

  async function resolveUrl(item: MediaItem) {
    const mediaId = item.media_id;
    if (mediaUrls[mediaId]) return;
    if (urlCache.has(mediaId)) {
      setUrlFor(mediaId, urlCache.get(mediaId) as string);
      return;
    }

    if (item.preview_url && !isVideo(item.content_type)) {
      urlCache.set(mediaId, item.preview_url);
      setUrlFor(mediaId, item.preview_url);
      return;
    }

    if (prefetchingRef.current.has(mediaId)) return;

    prefetchingRef.current.add(mediaId);
    setLoading(mediaId, true);
    try {
      const { download_url } = await presignDownload(mediaId);
      urlCache.set(mediaId, download_url);
      setUrlFor(mediaId, download_url);
      if (!isVideo(item.content_type)) {
        const img = new Image();
        img.src = download_url;
        await img.decode().catch(() => {});
      }
    } catch (ex) {
      console.error("Failed to load media", mediaId, ex);
    } finally {
      prefetchingRef.current.delete(mediaId);
      setLoading(mediaId, false);
    }
  }

  useEffect(() => {
    if (!open || !items.length) return;
    if (currentItem) resolveUrl(currentItem);
    if (hasNext) resolveUrl(items[selectedIndex + 1]);
    if (hasPrev) resolveUrl(items[selectedIndex - 1]);
  }, [open, selectedIndex, items, hasNext, hasPrev]);

  useEffect(() => {
    if (!emblaApi || !open) return;
    emblaApi.scrollTo(currentIndex, true);
    setSelectedIndex(currentIndex);
  }, [emblaApi, currentIndex, open]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => {
      const idx = emblaApi.selectedScrollSnap();
      setSelectedIndex(idx);
      onSelectIndex(idx);
    };
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onSelectIndex]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setDragOffsetY(0);
    swipeStartRef.current = null;
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && emblaApi) emblaApi.scrollPrev();
      if (e.key === "ArrowRight" && emblaApi) emblaApi.scrollNext();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, emblaApi]);

  async function handleDownload() {
    if (!currentItem) return;
    const url = mediaUrls[currentItem.media_id] || currentItem.preview_url || "";
    if (!url) return;
    
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

  function handleSwipeStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) return;
    swipeStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }

  function handleSwipeMove(e: React.TouchEvent) {
    if (!swipeStartRef.current) return;
    const dx = e.touches[0].clientX - swipeStartRef.current.x;
    const dy = e.touches[0].clientY - swipeStartRef.current.y;
    if (dy > 0 && Math.abs(dy) > Math.abs(dx)) {
      setDragOffsetY(Math.min(dy, 240));
    }
  }

  function handleSwipeEnd() {
    if (dragOffsetY > 120) {
      onClose();
    }
    setDragOffsetY(0);
    swipeStartRef.current = null;
  }

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="modalCard"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleSwipeStart}
        onTouchMove={handleSwipeMove}
        onTouchEnd={handleSwipeEnd}
        style={{
          transform: dragOffsetY ? `translateY(${dragOffsetY}px)` : undefined,
          transition: dragOffsetY ? "none" : "transform 0.2s ease",
        }}
      >
        <div className="modalHeader">
          <div style={{ display: "flex", gap: 8 }}>
            {items.length > 1 && (
              <div className="muted" style={{ fontSize: 13 }}>
                {selectedIndex + 1} / {items.length}
              </div>
            )}
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="modalBody" style={{ position: "relative", minHeight: 400, background: "linear-gradient(135deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.6) 100%)" }}>
          <div className="embla" ref={emblaRef}>
            <div className="embla__container">
              {items.map((item, idx) => {
                const mediaId = item.media_id;
                const url = mediaUrls[mediaId] || (item.preview_url && !isVideo(item.content_type) ? item.preview_url : "");
                const isCurrent = idx === selectedIndex;
                const isLoading = loadingIds.has(mediaId) && isCurrent;
                const isLoaded = loadedIds.has(mediaId);
                return (
                  <div className={`embla__slide ${idx === selectedIndex ? "embla__slide--selected" : ""}`} key={mediaId}>
                    <div className="embla__slide__inner">
                      {!isVideo(item.content_type) && item.thumb_url && (
                        <img
                          className="modalMedia modalMedia-placeholder"
                          alt=""
                          src={item.thumb_url}
                        />
                      )}

                      {isLoading && (
                        <div className="modalSpinner">
                          <div className="spinner" />
                          <div className="modalSpinnerText">Loading…</div>
                        </div>
                      )}

                      {url ? (
                        isVideo(item.content_type) ? (
                          isCurrent ? (
                            <video
                              className={`modalMedia ${isLoaded ? "modalMedia-loaded" : ""}`}
                              controls
                              playsInline
                              src={url}
                              onLoadedData={() => markLoaded(mediaId)}
                            />
                          ) : (
                            <div className="modalMedia modalMedia-loaded" />
                          )
                        ) : (
                          <TransformWrapper
                            key={mediaId}
                            minScale={1}
                            maxScale={3}
                            doubleClick={{ mode: "toggle", step: 2 }}
                            pinch={{ step: 5 }}
                            wheel={{ step: 0.2 }}
                          >
                            <TransformComponent>
                              <img
                                className={`modalMedia ${isLoaded ? "modalMedia-loaded" : ""}`}
                                alt=""
                                src={url}
                                onLoad={() => markLoaded(mediaId)}
                              />
                            </TransformComponent>
                          </TransformWrapper>
                        )
                      ) : (
                        !isLoading && (
                          <div className="modalError">Failed to load media</div>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {hasPrev && (
            <button
              className="carouselBtn carouselBtnPrev"
              onClick={(e) => { e.stopPropagation(); emblaApi?.scrollPrev(); }}
              aria-label="Previous"
            >
              ‹
            </button>
          )}

          {hasNext && (
            <button
              className="carouselBtn carouselBtnNext"
              onClick={(e) => { e.stopPropagation(); emblaApi?.scrollNext(); }}
              aria-label="Next"
            >
              ›
            </button>
          )}
        </div>

        <div className="modalFooter">
          <div className="row" style={{ gap: 10 }}>
            {canDeleteItem && onDelete ? (
              <button className="btn btn-danger" onClick={onDelete} disabled={!!deleting || isCurrentLoading}>
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
              disabled={!mediaUrls[currentItem.media_id] || downloadingId === currentItem.media_id || loadingIds.has(currentItem.media_id)}
            >
              {loadingIds.has(currentItem.media_id)
                ? "Loading…"
                : downloadingId === currentItem.media_id
                  ? "Downloading…"
                  : "Download"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
