import React, { useEffect, useState, useRef } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { MediaItem, presignDownload } from "../lib/api";
import { saveMediaToDevice } from "../lib/download";
import { isNativePlatform } from "../lib/platform";

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
  const [saveStatus, setSaveStatus] = useState<"saved" | "failed" | null>(null);
  // Immersive = iPhone Photos style: chrome hidden, media edge-to-edge.
  const [immersive, setImmersive] = useState(false);
  const transformRefs = useRef<Record<string, ReactZoomPanPinchRef | null>>({});
  // Distinguishes a chrome-toggling single tap from a zooming double tap.
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [zoomScales, setZoomScales] = useState<Record<string, number>>({});
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
    setImmersive(false);
    swipeStartRef.current = null;
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Escape backs out of immersive first, then closes the modal.
      if (e.key === "Escape") {
        if (immersive) setImmersive(false);
        else onClose();
      }
      if (e.key === "ArrowLeft" && emblaApi) emblaApi.scrollPrev();
      if (e.key === "ArrowRight" && emblaApi) emblaApi.scrollNext();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, emblaApi, immersive]);

  async function handleDownload() {
    if (!currentItem) return;
    const url = mediaUrls[currentItem.media_id] || currentItem.preview_url || "";
    if (!url) return;

    try {
      setDownloadingId(currentItem.media_id);
      setSaveStatus(null);
      await saveMediaToDevice([
        { url, filename: currentItem.filename, contentType: currentItem.content_type },
      ]);
      if (isNativePlatform()) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus(null), 2500);
      }
    } catch (err: any) {
      // Log the message/stack explicitly — Error properties are
      // non-enumerable, so the bare object prints as "{}" in the
      // Xcode/WebView console, which hides the actual cause.
      console.error(
        "Download failed:",
        err?.message || err?.errorMessage || String(err),
        err?.code || "",
        err?.stack || ""
      );
      setSaveStatus("failed");
      setTimeout(() => setSaveStatus(null), 3500);
    } finally {
      setDownloadingId(null);
    }
  }

  if (!open || !currentItem) return null;

  const currentScale = currentItem ? zoomScales[currentItem.media_id] || 1 : 1;

  /**
   * Toggle iPhone-Photos-style immersive mode. Leaving it also resets zoom,
   * so the image returns to its framed size along with the chrome.
   */
  function toggleImmersive(mediaId: string) {
    setImmersive((prev) => {
      if (prev) transformRefs.current[mediaId]?.resetTransform();
      return !prev;
    });
  }

  // A tap only counts if the finger barely moved (otherwise it's a pan) and
  // no second tap follows within the double-tap window (otherwise it's a zoom).
  function handleMediaPointerDown(e: React.PointerEvent) {
    tapStartRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }

  function handleMediaPointerUp(e: React.PointerEvent, mediaId: string) {
    const start = tapStartRef.current;
    tapStartRef.current = null;
    if (!start) return;
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (moved > 10 || Date.now() - start.t > 300) return;

    if (tapTimerRef.current) {
      // Second tap inside the window — let the library handle the zoom.
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
      return;
    }
    tapTimerRef.current = setTimeout(() => {
      tapTimerRef.current = null;
      toggleImmersive(mediaId);
    }, 280);
  }

  function handleSwipeStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) return;
    // While zoomed, vertical drags pan the image — don't also drag the sheet.
    if (currentScale > 1) return;
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
    <div
      className={`modalOverlay${immersive ? " modalOverlay--immersive" : ""}`}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className={`modalCard${immersive ? " modalCard--immersive" : ""}`}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleSwipeStart}
        onTouchMove={handleSwipeMove}
        onTouchEnd={handleSwipeEnd}
        style={{
          transform: dragOffsetY ? `translateY(${dragOffsetY}px)` : undefined,
          transition: dragOffsetY ? "none" : "transform 0.2s ease",
        }}
      >
        <div className="modalHeader" hidden={immersive}>
          {items.length > 1 && (
            <div className="modalCounter">{selectedIndex + 1} / {items.length}</div>
          )}
          <button type="button" className="modalCloseBtn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div
          className={`modalBody${immersive ? " modalBody--immersive" : ""}`}
          style={{
            position: "relative",
            minHeight: immersive ? undefined : 400,
            background: immersive
              ? "#000"
              : "linear-gradient(135deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.6) 100%)",
          }}
        >
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
                    <div
                      className="embla__slide__inner"
                      // Handlers live here, not on the <img>: the zoom library's
                      // own wrapper div sits above the image and swallows the
                      // pointer events. This also lets taps on the letterboxed
                      // area toggle, same as Photos. Videos are excluded so the
                      // playback controls stay usable.
                      {...(!isVideo(item.content_type)
                        ? {
                            onPointerDown: handleMediaPointerDown,
                            onPointerUp: (e: React.PointerEvent) =>
                              handleMediaPointerUp(e, mediaId),
                          }
                        : {})}
                    >
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
                            maxScale={4}
                            doubleClick={{ mode: "toggle", step: 2 }}
                            pinch={{ step: 5 }}
                            wheel={{ step: 0.2 }}
                            panning={{ disabled: (zoomScales[mediaId] || 1) === 1 }}
                            onInit={(ref) => {
                              transformRefs.current[mediaId] = ref;
                            }}
                            onTransformed={(ref) => {
                              setZoomScales((prev) => ({ ...prev, [mediaId]: ref.state.scale }));
                              // Pinching past 1x jumps straight to immersive,
                              // matching Photos' behavior.
                              if (ref.state.scale > 1) setImmersive(true);
                            }}
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

          {/* Arrow buttons removed — swipe left/right to navigate, keyboard arrows also work */}
        </div>

        <div className="modalFooter" hidden={immersive}>
          {saveStatus && (
            <div
              role="status"
              style={{
                position: "absolute",
                bottom: "72px",
                left: "50%",
                transform: "translateX(-50%)",
                background: saveStatus === "saved" ? "rgba(20, 90, 50, 0.95)" : "rgba(120, 30, 30, 0.95)",
                color: "#fff",
                padding: "8px 16px",
                borderRadius: "20px",
                fontSize: "14px",
                whiteSpace: "nowrap",
                zIndex: 10,
              }}
            >
              {saveStatus === "saved" ? "Saved to Photos ✓" : "Save failed — try again"}
            </div>
          )}
          <div className="modalActions">
            <button
              type="button"
              className="modalActionBtn modalActionBtn--download"
              onClick={handleDownload}
              disabled={!mediaUrls[currentItem.media_id] || downloadingId === currentItem.media_id || loadingIds.has(currentItem.media_id)}
              aria-label={loadingIds.has(currentItem.media_id) ? "Loading…" : "Download"}
              title="Download"
            >
              {/* Download arrow — pointing down into a tray */}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v13M7 11l5 5 5-5" />
                <path d="M5 20h14" />
              </svg>
            </button>

            {canDeleteItem && onDelete ? (
              <button
                type="button"
                className="modalActionBtn modalActionBtn--delete"
                onClick={onDelete}
                disabled={!!deleting || isCurrentLoading}
                aria-label={deleting ? "Deleting…" : "Delete"}
                title="Delete"
              >
                {/* Trash bin */}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14H6L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
            ) : canDelete && !canDeleteItem ? (
              <button
                type="button"
                className="modalActionBtn modalActionBtn--delete"
                disabled
                title="You can only delete your own uploads"
                aria-label="Delete (not permitted)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14H6L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
