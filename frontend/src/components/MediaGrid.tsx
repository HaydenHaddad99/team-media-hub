import React, { useState } from "react";
import { MediaItem, presignDownload, deleteMedia } from "../lib/api";
import { PreviewModal } from "./PreviewModal";
import { ThumbnailTile } from "./ThumbnailTile";
import { SkeletonCard } from "./SkeletonCard";

export function MediaGrid({
  items,
  loading = false,
  canDelete,
  onDeleted,
  selectMode = false,
  selectedIds,
  onToggleSelect,
  currentUserId,
  userRole,
}: {
  items: MediaItem[];
  loading?: boolean;
  canDelete?: boolean;
  onDeleted?: () => void;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (item: MediaItem) => void;
  currentUserId?: string | null;
  userRole?: string;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [preview, setPreview] = useState<{
    open: boolean;
    currentIndex: number;
  }>({ open: false, currentIndex: -1 });

  async function openItem(item: MediaItem) {
    const index = items.findIndex(i => i.media_id === item.media_id);
    if (index === -1) return;
    
    setPreview({
      open: true,
      currentIndex: index,
    });
  }

  function navigateCarousel(direction: 1 | -1) {
    setPreview(prev => {
      const newIndex = prev.currentIndex + direction;
      if (newIndex < 0 || newIndex >= items.length) return prev;
      return { ...prev, currentIndex: newIndex };
    });
  }

  // Determine if a user can delete an item
  function canDeleteItem(item: MediaItem): boolean {
    if (!canDelete) return false;
    // Admins can always delete
    if (userRole === "admin") return true;
    // Coaches (identified by having coach_user_id in localStorage) can delete anything
    const isCoach = !!localStorage.getItem("tmh_coach_user_id");
    if (isCoach) return true;
    // Parents can only delete their own uploads
    if (!item.uploader_user_id) return false;
    return item.uploader_user_id === currentUserId;
  }

  async function handleDelete() {
    if (preview.currentIndex === -1) return;

    const currentItem = items[preview.currentIndex];
    if (!currentItem || !canDeleteItem(currentItem)) return;

    const yes = window.confirm("Delete this media? This cannot be undone.");
    if (!yes) return;

    try {
      setErr(null);
      setDeleting(true);
      await deleteMedia(currentItem.media_id);
      setPreview({ open: false, currentIndex: -1 });
      onDeleted?.();
    } catch (ex: any) {
      setErr(ex?.message || "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      {err ? <div className="error">{err}</div> : null}
      {busyId ? <div className="muted" style={{ marginBottom: 8 }}>Loading…</div> : null}

      <div className="thumbGrid">
        {loading ? (
          // Show 8 skeleton placeholders while loading
          Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={`skeleton-${i}`} />)
        ) : (
          items.map((item) => {
            const isDeletable = canDeleteItem(item);
            const isSelectDisabled = selectMode && !isDeletable;
            return (
              <ThumbnailTile
                key={item.media_id}
                item={item}
                onClick={(it) => {
                  if (selectMode) {
                    if (!isSelectDisabled) {
                      onToggleSelect?.(it);
                    }
                  } else {
                    openItem(it);
                  }
                }}
                selected={selectedIds?.has(item.media_id) || false}
                selectMode={selectMode}
                disabled={isSelectDisabled}
                title={isSelectDisabled ? "You can only select your own uploads" : undefined}
              />
            );
          })
        )}
      </div>

      <PreviewModal
        open={preview.open}
        items={items}
        currentIndex={preview.currentIndex}
        onNavigate={navigateCarousel}
        canDelete={!!canDelete}
        deleting={deleting}
        onDelete={handleDelete}
        onClose={() => setPreview({ open: false, currentIndex: -1 })}
        currentUserId={currentUserId}
        userRole={userRole}
      />
    </div>
  );
}

