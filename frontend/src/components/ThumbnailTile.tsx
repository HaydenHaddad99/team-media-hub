import React from "react";
import { MediaItem } from "../lib/api";

function isVideo(contentType: string) {
  return contentType.startsWith("video/");
}

export function ThumbnailTile({
  item,
  onClick,
  selected = false,
  selectMode = false,
}: {
  item: MediaItem;
  onClick: (item: MediaItem) => void;
  selected?: boolean;
  selectMode?: boolean;
}) {
  const video = isVideo(item.content_type);

  return (
    <div className={`thumbCard${selected ? " thumbCardSelected" : ""}`} onClick={() => onClick(item)}>
      <div className="thumbMedia">
        {video ? (
          item.thumb_url ? (
            <div className="thumbVideoPlaceholder">
              <img className="thumbImg" src={item.thumb_url} alt={item.filename} loading="lazy" />
              <div className="playBadge">▶</div>
            </div>
          ) : (
            <div className="thumbVideoPlaceholder">
              <div className="playBadge">▶</div>
            </div>
          )
        ) : item.thumb_url ? (
          <img className="thumbImg" src={item.thumb_url} alt={item.filename} loading="lazy" />
        ) : (
          <div className="thumbSkeleton" />
        )}
        <div className="albumBadge">{item.album_name || "All uploads"}</div>
        {selectMode ? (
          <div className={`selectBadge${selected ? " selected" : ""}`}>{selected ? "✓" : ""}</div>
        ) : null}
      </div>
    </div>
  );
}
