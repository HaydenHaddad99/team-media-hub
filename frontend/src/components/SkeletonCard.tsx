import React from "react";

export function SkeletonCard() {
  return (
    <div className="thumbCard">
      <div className="thumbMedia">
        <div className="thumbSkeleton skeleton-pulse" />
      </div>
      <div className="thumbMeta">
        <div className="thumbTitle skeleton-pulse" style={{ height: 16, marginBottom: 6 }} />
        <div className="thumbSub skeleton-pulse" style={{ height: 12, width: "70%" }} />
      </div>
    </div>
  );
}
