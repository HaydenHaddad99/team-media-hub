import React, { useEffect } from "react";

type Props = {
  open: boolean;
  title: string;
  contentType: string;
  url: string;
  onClose: () => void;
};

function isVideo(contentType: string) {
  return contentType.startsWith("video/");
}

export function PreviewModal({ open, title, contentType, url, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitle" title={title}>{title}</div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        <div className="modalBody">
          {isVideo(contentType) ? (
            <video className="modalMedia" controls playsInline src={url} />
          ) : (
            <img className="modalMedia" alt={title} src={url} />
          )}
        </div>

        <div className="modalFooter">
          <div className="muted" style={{ fontSize: 12 }}>
            {contentType}
          </div>
          <a className="btn primary" href={url} target="_blank" rel="noopener noreferrer">
            Download
          </a>
        </div>
      </div>
    </div>
  );
}
