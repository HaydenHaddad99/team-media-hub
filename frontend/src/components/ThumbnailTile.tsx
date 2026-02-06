import React, { useState } from "react";
import { MediaItem } from "../lib/api";

function isVideo(contentType: string) {
  return contentType.startsWith("video/");
}

export function ThumbnailTile({
  item,
  onClick,
  selected = false,
  selectMode = false,
  disabled = false,
  title,
}: {
  item: MediaItem;
  onClick: (item: MediaItem) => void;
  selected?: boolean;
  selectMode?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const video = isVideo(item.content_type);
  const [imageError, setImageError] = useState(false);

  // Determine if we should show the placeholder (no thumb_url OR image failed to load)
  const showPlaceholder = !item.thumb_url || imageError;

  return (
    <div 
      className={`thumbCard${selected ? " thumbCardSelected" : ""}${disabled ? " thumbCardDisabled" : ""}`} 
      onClick={() => !disabled && onClick(item)}
      title={title}
      style={{
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div className="thumbMedia">
        {video ? (
          !showPlaceholder && item.thumb_url ? (
            <div className="thumbVideoPlaceholder">
              <img 
                className="thumbImg" 
                src={item.thumb_url} 
                alt={item.filename}
                loading="lazy"
                onError={() => setImageError(true)}
              />
              <div className="playBadge">▶</div>
            </div>
          ) : (
            <div className="thumbVideoPlaceholder">
              <div className="playBadge">▶</div>
            </div>
          )
        ) : !showPlaceholder && item.thumb_url ? (
          <img 
            className="thumbImg" 
            src={item.thumb_url} 
            alt={item.filename}
            loading="lazy"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="thumbSkeleton" style={{ background: "linear-gradient(45deg, rgba(255,255,255,0.05) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.05) 75%, transparent 75%, transparent)", backgroundSize: "20px 20px" }} />
        )}
        {selectMode ? (
          <div className={`selectBadge${selected ? " selected" : ""}`}>{selected ? "✓" : ""}</div>
        ) : null}
      </div>
    </div>
  );
}
